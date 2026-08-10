#!/usr/bin/env -S node --import tsx
/**
 * R2.3 acceptance checks for the validated package → Astro brand seam.
 *
 * The mutation checks run in /tmp. The only repository-backed assertion calls
 * the real validator API against the committed PsiAtiva package, proving the
 * build gate does not rely on a subprocess or a persisted receipt.
 */

import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  BuildTargetError,
  parseBuildTarget,
  retargetBrandImport,
  runBuildTarget,
} from "./lib/build-target.js";
import {
  validateDesignSystem,
  type DesignSystemValidation,
} from "./validate-design-system.js";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, "..");
const OD_ROOT = path.resolve(SCRIPT_DIR, "../../../skills/open-design");

const SOURCE = `/** brand seam fixture */

@import "../../design-systems/psiativa/tokens.css";

html { color: var(--fg); }
`;

let passed = 0;

async function check(name: string, action: () => void | Promise<void>): Promise<void> {
  await action();
  passed += 1;
  console.log(`✅ ${name}`);
}

function validation(
  brand: string,
  violations: string[] = [],
): DesignSystemValidation {
  return {
    brand,
    label: `design-systems/${brand}/manifest.json`,
    ok: violations.length === 0,
    quality: null,
    violations,
  };
}

async function main(): Promise<void> {
  await check("--build defaults to none and accepts both public values", () => {
    assert.equal(parseBuildTarget(undefined), "none");
    assert.equal(parseBuildTarget("none"), "none");
    assert.equal(parseBuildTarget("astro"), "astro");
    assert.throws(() => parseBuildTarget(undefined, true), BuildTargetError);
    assert.throws(() => parseBuildTarget("nextjs"), BuildTargetError);
  });

  await check("brand seam replacement is exact and rejects a displaced seam", () => {
    const result = retargetBrandImport(SOURCE, "syd");
    assert.equal(result.previousBrand, "psiativa");
    assert.equal(result.changed, true);
    assert.match(result.source, /design-systems\/syd\/tokens\.css/);
    assert.doesNotMatch(result.source, /design-systems\/psiativa\/tokens\.css/);
    assert.throws(
      () =>
        retargetBrandImport(
          `@import "https://example.test/font.css";\n${SOURCE}`,
          "syd",
        ),
      /first @import.*not the.*brand seam/,
    );
  });

  await check("the committed package passes through the exported validator API", async () => {
    const result = await validateDesignSystem({
      brand: "psiativa",
      brandRoot: path.join(PROJECT_ROOT, "design-systems", "psiativa"),
      odRoot: OD_ROOT,
    });
    assert.equal(result.ok, true, result.violations.join("\n"));
    assert.equal(result.quality?.score, 100);
  });

  const tempRoot = await mkdtemp(path.join(tmpdir(), "figma-to-code-r2-build-"));
  const stylesPath = path.join(tempRoot, "src", "styles", "global.css");
  const packageRoot = path.join(tempRoot, "design-systems", "syd");
  await mkdir(path.dirname(stylesPath), { recursive: true });
  await mkdir(packageRoot, { recursive: true });
  await writeFile(stylesPath, SOURCE, "utf8");

  try {
    await check("--build none preserves importer-only behavior", async () => {
      let called = false;
      const result = await runBuildTarget(
        {
          target: "none",
          brand: "syd",
          odRoot: OD_ROOT,
          packageRoot,
          projectRoot: tempRoot,
        },
        {
          validate: async () => {
            called = true;
            return validation("syd");
          },
          buildAstro: async () => {
            called = true;
          },
        },
      );
      assert.equal(called, false);
      assert.equal(result.seamChanged, false);
      assert.equal(await readFile(stylesPath, "utf8"), SOURCE);
    });

    await check("failed validation cannot mutate the seam or start Astro", async () => {
      let buildCalled = false;
      await assert.rejects(
        runBuildTarget(
          {
            target: "astro",
            brand: "syd",
            odRoot: OD_ROOT,
            packageRoot,
            projectRoot: tempRoot,
          },
          {
            validate: async () =>
              validation("syd", ["fixture package is invalid"]),
            buildAstro: async () => {
              buildCalled = true;
            },
          },
        ),
        /refusing to retarget the brand seam/,
      );
      assert.equal(buildCalled, false);
      assert.equal(await readFile(stylesPath, "utf8"), SOURCE);
    });

    await check("Astro sees the selected brand only after validation passes", async () => {
      const events: string[] = [];
      const result = await runBuildTarget(
        {
          target: "astro",
          brand: "syd",
          odRoot: OD_ROOT,
          packageRoot,
          projectRoot: tempRoot,
        },
        {
          validate: async () => {
            events.push("validate");
            return validation("syd");
          },
          buildAstro: async () => {
            events.push("build");
            assert.match(
              await readFile(stylesPath, "utf8"),
              /design-systems\/syd\/tokens\.css/,
            );
          },
        },
      );
      assert.deepEqual(events, ["validate", "build"]);
      assert.equal(result.previousBrand, "psiativa");
      assert.equal(result.seamChanged, true);
    });

  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }

  console.log(`\nR2.3 BUILD TARGET PASS (${passed} checks)`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
