#!/usr/bin/env -S npx tsx
/**
 * Vendored from juansilvadesign/ai-website-cloner-template
 * @ b7b4dda5ffc9cfa279f9269b567c073f22a25860 on 2026-07-31.
 * Functional delta from that commit: R2.3 exports an in-process validation API.
 *
 * validate-design-system.ts — run OpenDesign's OWN design-system guard checks
 * against a single emitted package, without a full monorepo `pnpm install`.
 *
 * This is the FORK-PLAN Milestone C "targeted validation" path: it imports the
 * exported check functions from OpenDesign's guard scripts and points them at
 * `design-systems/<slug>/` here, reproducing what `pnpm guard` would assert for
 * this package (manifest shape + semantics, design-tokens.json / tailwind-v4.css
 * / components.manifest.json parity, and the package-quality minimums).
 *
 * Usage:
 *   npx tsx scripts/validate-design-system.ts --brand psiativa \
 *     [--od-root /absolute/path/to/open-design]
 *
 * OpenDesign lookup order: `--od-root`, `OPEN_DESIGN_ROOT`, then the sibling
 * checkout used by the notes workspace (`knowledge/skills/open-design`).
 */

import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const FORK_ROOT = path.resolve(SCRIPT_DIR, "..");

export type DesignSystemPackageQuality = {
  migrated: boolean;
  score: number;
  checks: string[];
  violations: string[];
};

export type DesignSystemValidation = {
  brand: string;
  label: string;
  ok: boolean;
  quality: DesignSystemPackageQuality | null;
  violations: string[];
};

export type ValidateDesignSystemOptions = {
  brand: string;
  brandRoot?: string;
  odRoot?: string;
};

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i !== -1 && i + 1 < process.argv.length) return process.argv[i + 1];
  return fallback;
}

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

export async function validateDesignSystem(
  options: ValidateDesignSystemOptions,
): Promise<DesignSystemValidation> {
  const { brand } = options;
  const odRoot = path.resolve(
    SCRIPT_DIR,
    options.odRoot ?? process.env.OPEN_DESIGN_ROOT ?? "../../../skills/open-design",
  );
  const brandRoot = path.resolve(
    FORK_ROOT,
    options.brandRoot ?? `design-systems/${brand}`,
  );
  const label = `design-systems/${brand}/manifest.json`;

  async function loadOd<T>(rel: string): Promise<T> {
    return (await import(pathToFileURL(path.join(odRoot, rel)).href)) as T;
  }
  const { parseDesignSystemProjectManifest } = await loadOd<{
    parseDesignSystemProjectManifest: (raw: string) => { ok: true; manifest: any } | { ok: false; errors: string[] };
  }>("design-systems/_schema/manifest.schema.ts");
  const manifests = await loadOd<{
    validateManifestSemantics: (v: string[], label: string, m: any, craft: ReadonlySet<string>) => void;
    validateDesignTokensJson: (v: string[], label: string, root: string, tokens: string, dt: string | undefined, report: string | undefined) => Promise<void>;
    validateTailwindV4Css: (v: string[], label: string, root: string, tokens: string, tw: string | undefined) => Promise<void>;
    validateComponentsManifestCache: (v: string[], label: string, root: string, slug: string, cm: string | undefined) => Promise<void>;
  }>("scripts/check-design-system-manifests.ts");
  const { evaluateDesignSystemPackageQuality } = await loadOd<{
    evaluateDesignSystemPackageQuality: (i: any) => { migrated: boolean; score: number; checks: string[]; violations: string[] };
  }>("scripts/check-design-system-package-quality.ts");

  // craft slugs available in OpenDesign (mirror of the guard's discoverCraftSlugs)
  const craftSlugs = new Set<string>();
  try {
    for (const e of await readdir(path.join(odRoot, "craft"), { withFileTypes: true })) {
      if (e.isFile() && e.name.endsWith(".md") && e.name !== "README.md") craftSlugs.add(e.name.slice(0, -3));
    }
  } catch { /* no craft dir */ }

  const violations: string[] = [];

  const manifestPath = path.join(brandRoot, "manifest.json");
  if (!(await exists(manifestPath))) {
    violations.push(
      `validate-design-system: ${label} not found — run the emitter first.`,
    );
    return validationResult(brand, label, violations, null);
  }
  const parsed = parseDesignSystemProjectManifest(await readFile(manifestPath, "utf8"));
  if (!parsed.ok) {
    for (const e of parsed.errors) violations.push(`${label}: ${e}`);
    return validationResult(brand, label, violations, null);
  }
  const manifest = parsed.manifest;

  if (manifest.id !== brand) violations.push(`${label}: $.id must match folder slug "${brand}"`);
  manifests.validateManifestSemantics(violations, label, manifest, craftSlugs);

  // declared files must exist
  const declared = [
    manifest.files.design,
    manifest.files.tokens,
    manifest.files.designTokens,
    manifest.files.tailwind,
    manifest.files.components,
    manifest.usage,
    manifest.componentsManifest,
    ...(manifest.preview?.pages ?? []).map((p: any) => p.path),
    ...Object.values(manifest.sourceFiles ?? {}),
  ].filter((f): f is string => typeof f === "string");
  for (const f of declared) {
    if (!(await exists(path.join(brandRoot, f)))) violations.push(`${label}: ${f} is declared but does not exist`);
  }

  // derived-file parity (the hard part) + components cache parity
  await manifests.validateDesignTokensJson(violations, label, brandRoot, manifest.files.tokens, manifest.files.designTokens, manifest.sourceFiles?.report);
  await manifests.validateTailwindV4Css(violations, label, brandRoot, manifest.files.tokens, manifest.files.tailwind);
  await manifests.validateComponentsManifestCache(violations, label, brandRoot, brand, manifest.componentsManifest);

  // package-quality minimums (DESIGN.md H2s, tokens coverage, USAGE headings,
  // component fixture bars, preview pages, source evidence)
  let quality: DesignSystemPackageQuality | null = null;
  const need = async (f?: string): Promise<string | undefined> =>
    f && (await exists(path.join(brandRoot, f))) ? readFile(path.join(brandRoot, f), "utf8") : undefined;
  try {
    const [designMd, tokensCss, componentsHtml, usageMd] = await Promise.all([
      readFile(path.join(brandRoot, manifest.files.design), "utf8").catch(() => ""),
      readFile(path.join(brandRoot, manifest.files.tokens), "utf8").catch(() => ""),
      need(manifest.files.components),
      need(manifest.usage),
    ]);
    quality = evaluateDesignSystemPackageQuality({ id: manifest.id, manifest, designMd, tokensCss, componentsHtml, usageMd });
    for (const v of quality.violations) violations.push(`${label}: quality — ${v}`);
  } catch (e) {
    violations.push(`${label}: quality check failed to run: ${e instanceof Error ? e.message : String(e)}`);
  }

  return validationResult(brand, label, violations, quality);
}

function validationResult(
  brand: string,
  label: string,
  violations: string[],
  quality: DesignSystemPackageQuality | null,
): DesignSystemValidation {
  return { brand, label, ok: violations.length === 0, quality, violations };
}

export function printValidationResult(result: DesignSystemValidation): void {
  if (result.quality) {
    console.log(`Package quality: migrated=${result.quality.migrated} score=${result.quality.score} (${result.quality.checks.length} checks, ${result.quality.violations.length} failing)`);
  }
  if (result.ok) {
    console.log("\n✅ VALIDATION PASSED — package satisfies OpenDesign's design-system guard checks.");
    return;
  }
  console.error(`\n❌ VALIDATION FAILED — ${result.violations.length} violation(s):`);
  for (const violation of result.violations) console.error(`  - ${violation}`);
}

async function main(): Promise<void> {
  const brand = arg("brand", "psiativa")!;
  const result = await validateDesignSystem({
    brand,
    brandRoot: arg("out", `design-systems/${brand}`),
    odRoot: arg("od-root"),
  });
  printValidationResult(result);
  if (!result.ok) process.exitCode = 1;
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
