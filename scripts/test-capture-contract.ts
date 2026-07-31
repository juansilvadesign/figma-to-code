#!/usr/bin/env -S node --import tsx

import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  type CaptureArtifact,
  type CaptureManifest,
  computeCapabilityFingerprint,
  computeJsonSha256,
  loadCaptureBundle,
  parseCaptureManifest,
  sanitizeNodeId,
  sha256,
} from "./lib/capture-contract.js";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, "..");
const SCHEMA_ROOT = path.join(PROJECT_ROOT, "schemas");
const FIXTURE_ROOT = path.join(
  PROJECT_ROOT,
  "tests",
  "fixtures",
  "captures",
  "synthetic-valid",
);
const FIXTURE_MANIFEST = path.join(FIXTURE_ROOT, "capture-manifest.json");

let passed = 0;

async function check(
  name: string,
  action: () => void | Promise<void>,
): Promise<void> {
  await action();
  passed += 1;
  console.log(`✅ ${name}`);
}

async function expectFailure(
  name: string,
  action: () => void | Promise<void>,
  expected: RegExp,
): Promise<void> {
  let thrown: unknown;
  try {
    await action();
  } catch (error) {
    thrown = error;
  }
  assert.ok(thrown instanceof Error, `${name}: expected an Error`);
  assert.match(thrown.message, expected, `${name}: unexpected failure`);
  passed += 1;
  console.log(`✅ ${name}`);
}

async function readBaseManifest(): Promise<CaptureManifest> {
  return parseCaptureManifest(
    JSON.parse(await readFile(FIXTURE_MANIFEST, "utf8")) as unknown,
  );
}

async function withTempBundle(
  action: (
    bundleRoot: string,
    manifest: CaptureManifest,
  ) => void | Promise<void>,
): Promise<void> {
  const tempRoot = await mkdtemp(
    path.join(tmpdir(), "figma-to-code-capture-contract-"),
  );
  const bundleRoot = path.join(tempRoot, "bundle");
  try {
    await cp(FIXTURE_ROOT, bundleRoot, { recursive: true });
    const manifest = parseCaptureManifest(
      JSON.parse(
        await readFile(path.join(bundleRoot, "capture-manifest.json"), "utf8"),
      ) as unknown,
    );
    await action(bundleRoot, manifest);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

async function writeManifest(
  bundleRoot: string,
  manifest: CaptureManifest,
): Promise<void> {
  await writeFile(
    path.join(bundleRoot, "capture-manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
}

function artifactById(
  manifest: CaptureManifest,
  artifactId: string,
): CaptureArtifact {
  const artifact = manifest.artifacts.find(
    (candidate) => candidate.id === artifactId,
  );
  assert.ok(artifact, `missing fixture artifact ${artifactId}`);
  return artifact;
}

async function rewriteJsonArtifact(
  bundleRoot: string,
  manifest: CaptureManifest,
  artifactId: string,
  mutate: (value: Record<string, unknown>) => void,
): Promise<void> {
  const artifact = artifactById(manifest, artifactId);
  const artifactPath = path.join(bundleRoot, artifact.path);
  const value = JSON.parse(
    await readFile(artifactPath, "utf8"),
  ) as Record<string, unknown>;
  mutate(value);
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
  await writeFile(artifactPath, bytes);
  artifact.bytes = bytes.length;
  artifact.sha256 = sha256(bytes);
  await writeManifest(bundleRoot, manifest);
}

async function rewriteScreenshot(
  bundleRoot: string,
  manifest: CaptureManifest,
  artifactId: string,
  contents: string,
): Promise<void> {
  const artifact = artifactById(manifest, artifactId);
  const bytes = Buffer.from(contents, "utf8");
  await writeFile(path.join(bundleRoot, artifact.path), bytes);
  artifact.bytes = bytes.length;
  artifact.sha256 = sha256(bytes);
  await writeManifest(bundleRoot, manifest);
}

async function main(): Promise<void> {
  const base = await readBaseManifest();

  await check("valid synthetic bundle loads fully offline", async () => {
    const bundle = await loadCaptureBundle(FIXTURE_MANIFEST);
    assert.equal(bundle.manifest.captureId, "synthetic-r1-contract");
    assert.equal(bundle.payloads.size, 12);
    assert.equal(bundle.screenshots.size, 2);
    assert.equal(bundle.overrides.schemaVersion, "figma-to-code/slot-overrides/v1");
  });

  await check("checked-in JSON Schemas parse and the fixture resolves its schema", async () => {
    const manifestSchemaPath = path.join(
      SCHEMA_ROOT,
      "capture-manifest.schema.json",
    );
    const manifestSchema = JSON.parse(
      await readFile(manifestSchemaPath, "utf8"),
    ) as { properties?: { schemaVersion?: { const?: string } } };
    const overridesSchema = JSON.parse(
      await readFile(
        path.join(SCHEMA_ROOT, "slot-overrides.schema.json"),
        "utf8",
      ),
    ) as { properties?: { schemaVersion?: { const?: string } } };
    assert.equal(
      manifestSchema.properties?.schemaVersion?.const,
      "figma-to-code/capture-manifest/v1",
    );
    assert.equal(
      overridesSchema.properties?.schemaVersion?.const,
      "figma-to-code/slot-overrides/v1",
    );
    assert.equal(
      path.resolve(FIXTURE_ROOT, base.$schema),
      manifestSchemaPath,
    );
  });

  await check("unknown additive fork payload fields remain accepted", async () => {
    const bundle = await loadCaptureBundle(FIXTURE_MANIFEST);
    const pages = bundle.payloads.get("pages");
    assert.ok(pages && typeof pages.value === "object");
    assert.equal(
      pages.value.additiveFixtureField,
      "unknown fork fields remain allowed",
    );
  });

  await check("node filenames replace colons only", () => {
    assert.equal(
      sanitizeNodeId("I7448:39456;12:25308"),
      "I7448_39456;12_25308",
    );
  });

  await expectFailure(
    "unknown manifest versions fail closed",
    () => {
      const manifest = structuredClone(base) as unknown as Record<
        string,
        unknown
      >;
      manifest.schemaVersion = "figma-to-code/capture-manifest/v2";
      parseCaptureManifest(manifest);
    },
    /schemaVersion.*capture-manifest\/v1/s,
  );

  await expectFailure(
    "runtime commit mismatches fail before payload reads",
    () => {
      const manifest = structuredClone(base);
      manifest.runtime.forkCommit = "0".repeat(40);
      parseCaptureManifest(manifest);
    },
    /runtime\.forkCommit.*3546719/s,
  );

  await expectFailure(
    "capability fingerprint mismatches fail closed",
    () => {
      const manifest = structuredClone(base);
      manifest.runtime.capabilityFingerprint.value = "0".repeat(64);
      parseCaptureManifest(manifest);
    },
    /capability fingerprint: expected/,
  );

  await expectFailure(
    "required-read fingerprint scope rejects write tools",
    () => {
      const manifest = structuredClone(base);
      manifest.runtime.capabilityFingerprint.tools.push({
        name: "create_rectangle",
        inputSchemaSha256: "0".repeat(64),
      });
      manifest.runtime.capabilityFingerprint.value =
        computeCapabilityFingerprint(
          manifest.runtime.capabilityFingerprint.tools,
        );
      parseCaptureManifest(manifest);
    },
    /unexpected tool create_rectangle/,
  );

  await check("capability fingerprint is order-independent", () => {
    const reversed = [
      ...base.runtime.capabilityFingerprint.tools,
    ].reverse();
    assert.equal(
      computeCapabilityFingerprint(reversed),
      base.runtime.capabilityFingerprint.value,
    );
  });

  await check("input-schema hashes are JSON-key-order independent", () => {
    assert.equal(
      computeJsonSha256({
        type: "object",
        properties: {
          nodeId: { type: "string" },
          depth: { type: "number" },
        },
      }),
      computeJsonSha256({
        properties: {
          depth: { type: "number" },
          nodeId: { type: "string" },
        },
        type: "object",
      }),
    );
  });

  await expectFailure(
    "missing singleton payload declarations fail clearly",
    () => {
      const manifest = structuredClone(base);
      manifest.artifacts = manifest.artifacts.filter(
        (artifact) => artifact.role !== "styles",
      );
      parseCaptureManifest(manifest);
    },
    /expected exactly one styles/,
  );

  await expectFailure(
    "selected nodes require their evidence set",
    () => {
      const manifest = structuredClone(base);
      manifest.artifacts = manifest.artifacts.filter(
        (artifact) => artifact.id !== "node-variables-1-20",
      );
      parseCaptureManifest(manifest);
    },
    /selected node 1:20: missing node-variables artifact/,
  );

  await expectFailure(
    "each selected page requires its own document artifact",
    () => {
      const manifest = structuredClone(base);
      artifactById(manifest, "document").pageId = "9:9";
      parseCaptureManifest(manifest);
    },
    /selected page 1:1: expected exactly one document artifact/,
  );

  await expectFailure(
    "tool-role mismatches fail clearly",
    () => {
      const manifest = structuredClone(base);
      const pages = artifactById(manifest, "pages");
      assert.ok(pages.toolCall);
      pages.toolCall.name = "get_styles";
      parseCaptureManifest(manifest);
    },
    /role pages requires get_pages/,
  );

  await expectFailure(
    "node artifact paths must use sanitized original ids",
    () => {
      const manifest = structuredClone(base);
      artifactById(manifest, "node-1-10").path = "raw/nodes/1:10.json";
      parseCaptureManifest(manifest);
    },
    /expected path raw\/nodes\/1_10\.json/,
  );

  await expectFailure(
    "path traversal is rejected",
    () => {
      const manifest = structuredClone(base);
      artifactById(manifest, "pages").path = "../pages.json";
      parseCaptureManifest(manifest);
    },
    /normalized relative POSIX path/,
  );

  await expectFailure(
    "private content cannot masquerade as a sanitized fixture",
    () => {
      const manifest = structuredClone(base);
      manifest.authorization.containsPrivateContent = true;
      parseCaptureManifest(manifest);
    },
    /sanitized fixtures cannot contain private content/,
  );

  await expectFailure(
    "payload byte tampering is detected by SHA-256",
    () =>
      withTempBundle(async (bundleRoot) => {
        const pagesPath = path.join(bundleRoot, "raw", "pages.json");
        const bytes = await readFile(pagesPath);
        await writeFile(pagesPath, Buffer.concat([bytes, Buffer.from("\n")]));
        await loadCaptureBundle(
          path.join(bundleRoot, "capture-manifest.json"),
        );
      }),
    /artifact pages:.*expected .* bytes/s,
  );

  await expectFailure(
    "complete:false variable evidence is rejected even with valid hashes",
    () =>
      withTempBundle(async (bundleRoot, manifest) => {
        const variables = artifactById(manifest, "variables");
        assert.ok(variables.coverage);
        variables.coverage.complete = false;
        await rewriteJsonArtifact(
          bundleRoot,
          manifest,
          "variables",
          (value) => {
            value.complete = false;
          },
        );
        await loadCaptureBundle(
          path.join(bundleRoot, "capture-manifest.json"),
        );
      }),
    /required capture payload is incomplete/,
  );

  await expectFailure(
    "supported:false variable evidence is rejected even with valid hashes",
    () =>
      withTempBundle(async (bundleRoot, manifest) => {
        const variables = artifactById(manifest, "variables");
        assert.ok(variables.coverage);
        variables.coverage.supported = false;
        await rewriteJsonArtifact(
          bundleRoot,
          manifest,
          "variables",
          (value) => {
            value.supported = false;
          },
        );
        await loadCaptureBundle(
          path.join(bundleRoot, "capture-manifest.json"),
        );
      }),
    /required variable payload is unsupported/,
  );

  await expectFailure(
    "payload limitations must match manifest coverage",
    () =>
      withTempBundle(async (bundleRoot, manifest) => {
        await rewriteJsonArtifact(
          bundleRoot,
          manifest,
          "reactions-1-10",
          (value) => {
            value.limitations = ["Different limitation"];
          },
        );
        await loadCaptureBundle(
          path.join(bundleRoot, "capture-manifest.json"),
        );
      }),
    /payload limitations do not match manifest coverage/,
  );

  await expectFailure(
    "document payload page identity must match the manifest",
    () =>
      withTempBundle(async (bundleRoot, manifest) => {
        await rewriteJsonArtifact(
          bundleRoot,
          manifest,
          "document",
          (value) => {
            const currentPage = value.currentPage;
            assert.ok(
              currentPage !== null &&
                typeof currentPage === "object" &&
                !Array.isArray(currentPage),
            );
            (currentPage as Record<string, unknown>).id = "1:99";
          },
        );
        await loadCaptureBundle(
          path.join(bundleRoot, "capture-manifest.json"),
        );
      }),
    /payload page id 1:99 does not match manifest 1:1/,
  );

  await expectFailure(
    "malformed payload counts fail at the fork-adapter boundary",
    () =>
      withTempBundle(async (bundleRoot, manifest) => {
        await rewriteJsonArtifact(
          bundleRoot,
          manifest,
          "styles",
          (value) => {
            value.count = 999;
          },
        );
        await loadCaptureBundle(
          path.join(bundleRoot, "capture-manifest.json"),
        );
      }),
    /get_styles\.count.*styles\.length/s,
  );

  await expectFailure(
    "materialized screenshot bytes must match the raw export",
    () =>
      withTempBundle(async (bundleRoot, manifest) => {
        await rewriteScreenshot(
          bundleRoot,
          manifest,
          "screenshot-1-10",
          '<svg xmlns="http://www.w3.org/2000/svg"><rect fill="#000"/></svg>\n',
        );
        await loadCaptureBundle(
          path.join(bundleRoot, "capture-manifest.json"),
        );
      }),
    /decoded bytes differ from image-export-1-10/,
  );

  await expectFailure(
    "invalid slot-override keys fail after integrity verification",
    () =>
      withTempBundle(async (bundleRoot, manifest) => {
        const overridesPath = path.join(bundleRoot, "slot-overrides.json");
        const value = JSON.parse(
          await readFile(overridesPath, "utf8"),
        ) as Record<string, unknown>;
        value.slots = { accent: { value: "#000" } };
        const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
        await writeFile(overridesPath, bytes);
        manifest.overrides.bytes = bytes.length;
        manifest.overrides.sha256 = sha256(bytes);
        await writeManifest(bundleRoot, manifest);
        await loadCaptureBundle(
          path.join(bundleRoot, "capture-manifest.json"),
        );
      }),
    /slot override keys must be CSS custom properties/,
  );

  console.log(`\n${passed} capture-contract checks passed.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
