#!/usr/bin/env -S node --import tsx

import assert from "node:assert/strict";

import { computeCapabilityFingerprint } from "./lib/capture-contract.js";
import {
  NODE_EXPORT_CAPABILITY_SCOPE,
  NODE_EXPORT_FORK,
  NODE_EXPORT_REQUIRED_TOOLS,
  assertNodeExportManifest,
  validateNodeExportManifest,
  type NodeExportAsset,
  type NodeExportManifest,
} from "./lib/node-export-contract.js";

let passed = 0;

function check(name: string, action: () => void): void {
  action();
  passed += 1;
  console.log(`✅ ${name}`);
}

function expectFailure(name: string, action: () => void, pattern: RegExp): void {
  assert.throws(action, pattern, name);
  passed += 1;
  console.log(`✅ ${name}`);
}

const hash = (character: string): string => character.repeat(64);
const capabilityTools = NODE_EXPORT_REQUIRED_TOOLS.map((name, index) => ({
  name,
  inputSchemaSha256: hash(`${index + 1}`),
}));

function baseManifest(assets: NodeExportAsset[]): NodeExportManifest {
  return {
    $schema: "https://figma-to-code.local/schemas/node-export-manifest.schema.json",
    schemaVersion: "figma-to-code/node-export-manifest/v1",
    exportId: "synthetic-node-export-pass",
    capturedAt: "2026-09-26T12:00:00.000Z",
    sourceCapture: { manifestSha256: hash("a"), bytes: 42 },
    authorization: {
      status: "authorized",
      basis: "synthetic",
      capturedBy: "contract test",
      containsPrivateContent: true,
      commitPolicy: "private-local",
      notes: "Synthetic private-local shape only; no source asset is present.",
    },
    provenance: {
      captureMethod: "read-only-local-mcp",
      operator: "scripts/export-figma-nodes.ts",
      notes: ["Synthetic contract fixture."],
    },
    runtime: {
      provider: "talk-to-figma-fork",
      forkCommit: NODE_EXPORT_FORK.commit,
      packageVersion: NODE_EXPORT_FORK.packageVersion,
      serverBundleSha256: NODE_EXPORT_FORK.serverBundleSha256,
      connection: { relay: "local-websocket", channel: "synthetic-channel" },
      plugin: { ...NODE_EXPORT_FORK.plugin },
      capabilityFingerprint: {
        algorithm: "sha256",
        scope: NODE_EXPORT_CAPABILITY_SCOPE,
        value: computeCapabilityFingerprint(capabilityTools),
        // A fresh copy per manifest: a test that mutates its own tools array
        // (e.g. pushing a rogue tool) must never leak into another test's
        // fixture — `capabilityTools` itself stays pristine.
        tools: capabilityTools.map((tool) => ({ ...tool })),
      },
    },
    assets,
  };
}

function exportedAsset(): NodeExportAsset {
  return {
    id: "synthetic-logo",
    capturedAt: "2026-09-26T12:00:01.000Z",
    nodeId: "1:2",
    format: "SVG",
    scale: 1,
    outcome: "exported",
    file: { path: "assets/synthetic-logo.svg", sha256: hash("b"), bytes: 24 },
    mimeType: "image/svg+xml",
    toolCall: {
      name: "export_node_as_image",
      arguments: { nodeId: "1:2", format: "SVG", scale: 1 },
    },
    before: { path: "node-observations/synthetic-logo.before.json", sha256: hash("c"), bytes: 120 },
    after: { path: "node-observations/synthetic-logo.after.json", sha256: hash("d"), bytes: 120 },
  };
}

function rejectedAsset(): NodeExportAsset {
  return {
    id: "synthetic-illustration",
    capturedAt: "2026-09-26T12:00:02.000Z",
    nodeId: "1:3",
    format: "SVG",
    scale: 1,
    outcome: "rejected",
    rejection: "Error: This node type cannot be exported as SVG.",
    toolCall: {
      name: "export_node_as_image",
      arguments: { nodeId: "1:3", format: "SVG", scale: 1 },
    },
    before: { path: "node-observations/synthetic-illustration.before.json", sha256: hash("e"), bytes: 130 },
    after: { path: "node-observations/synthetic-illustration.after.json", sha256: hash("f"), bytes: 130 },
  };
}

check("a valid manifest with an exported asset passes", () => {
  const manifest = baseManifest([exportedAsset()]);
  assert.deepEqual(validateNodeExportManifest(manifest), []);
  assertNodeExportManifest(manifest);
});

check("a valid manifest mixing exported and rejected assets passes", () => {
  const manifest = baseManifest([exportedAsset(), rejectedAsset()]);
  assert.deepEqual(validateNodeExportManifest(manifest), []);
  assertNodeExportManifest(manifest);
});

check("a rejected asset carries Figma's verbatim text and no file/mimeType", () => {
  const manifest = baseManifest([rejectedAsset()]);
  assert.deepEqual(validateNodeExportManifest(manifest), []);
  assert.equal(manifest.assets[0].file, undefined);
  assert.equal(manifest.assets[0].mimeType, undefined);
  assert.match(manifest.assets[0].rejection ?? "", /cannot be exported as SVG/);
});

expectFailure(
  "an exported asset cannot also carry a rejection",
  () => {
    const manifest = baseManifest([exportedAsset()]);
    (manifest.assets[0] as { rejection?: string }).rejection = "Error: should not be here";
    assertNodeExportManifest(manifest);
  },
  /rejection: must be absent when outcome is exported/,
);

expectFailure(
  "a rejected asset cannot also carry a file",
  () => {
    const manifest = baseManifest([rejectedAsset()]);
    (manifest.assets[0] as { file?: unknown }).file = { path: "assets/x.svg", sha256: hash("0"), bytes: 1 };
    assertNodeExportManifest(manifest);
  },
  /file\/mimeType: must be absent when outcome is rejected/,
);

expectFailure(
  "an unrecognized format is refused",
  () => {
    const manifest = baseManifest([exportedAsset()]);
    (manifest.assets[0] as { format: string }).format = "GIF";
    assertNodeExportManifest(manifest);
  },
  /format: expected SVG or PNG/,
);

check("a fractional pixel-budget scale (e.g. 1.8) is accepted", () => {
  const manifest = baseManifest([exportedAsset()]);
  manifest.assets[0].scale = 1.8;
  manifest.assets[0].toolCall.arguments.scale = 1.8;
  assert.deepEqual(validateNodeExportManifest(manifest), []);
  assertNodeExportManifest(manifest);
});

expectFailure(
  "a zero or negative scale is refused even though decimals are allowed",
  () => {
    const manifest = baseManifest([exportedAsset()]);
    manifest.assets[0].scale = 0;
    manifest.assets[0].toolCall.arguments.scale = 0;
    assertNodeExportManifest(manifest);
  },
  /scale: expected a positive finite number/,
);

expectFailure(
  "a runtime from the historical full-capture pin cannot masquerade as an R2.5 node-export pass",
  () => {
    const manifest = baseManifest([exportedAsset()]);
    manifest.runtime.forkCommit = "0".repeat(40);
    assertNodeExportManifest(manifest);
  },
  /runtime\.forkCommit/,
);

expectFailure(
  "the scoped fingerprint refuses a tool that is outside the narrow read lane",
  () => {
    const manifest = baseManifest([exportedAsset()]);
    manifest.runtime.capabilityFingerprint.tools.push({
      name: "set_fill",
      inputSchemaSha256: hash("f"),
    });
    manifest.runtime.capabilityFingerprint.value = computeCapabilityFingerprint(
      manifest.runtime.capabilityFingerprint.tools,
    );
    assertNodeExportManifest(manifest);
  },
  /must contain exactly the R2\.5 read tools/,
);

expectFailure(
  "a tampered fingerprint value fails even with the right tool set",
  () => {
    const manifest = baseManifest([exportedAsset()]);
    manifest.runtime.capabilityFingerprint.value = "0".repeat(64);
    assertNodeExportManifest(manifest);
  },
  /capabilityFingerprint\.value: does not match/,
);

expectFailure(
  "two evidence roles cannot alias the same path",
  () => {
    const manifest = baseManifest([exportedAsset()]);
    manifest.assets[0].after.path = manifest.assets[0].before.path;
    assertNodeExportManifest(manifest);
  },
  /evidence file paths must be unique/,
);

expectFailure(
  "evidence paths must stay unique across different assets too",
  () => {
    const manifest = baseManifest([exportedAsset(), rejectedAsset()]);
    manifest.assets[1].before.path = manifest.assets[0].before.path;
    assertNodeExportManifest(manifest);
  },
  /evidence file paths must be unique/,
);

console.log(`\n${passed} node export contract checks passed.`);
