#!/usr/bin/env -S npx tsx
/**
 * Vendored from juansilvadesign/ai-website-cloner-template
 * @ b7b4dda5ffc9cfa279f9269b567c073f22a25860 on 2026-07-31.
 * Functional delta from that commit: none (provenance comment only).
 *
 * emit-design-system.ts — the design-system emitter (FORK-PLAN Milestone C).
 *
 * Serializes a clone-website extraction artifact (`tokens.source.json`) into an
 * OpenDesign v1 rich design-system package under `design-systems/<slug>/`.
 *
 * Keystone rules from the fork plan:
 *   - Read OpenDesign's TOKEN_SCHEMA at build time — never hardcode a slot list.
 *   - Generate the derived caches (`design-tokens.json`, `tailwind-v4.css`) with
 *     OpenDesign's OWN exported renderers so they provably agree with tokens.css.
 *   - The prose files (DESIGN.md, USAGE.md, components.html, preview/*.html,
 *     source/evidence.md) are authored by the /clone-website emit phase, not here.
 *   - `components.manifest.json` is derived separately by OpenDesign's
 *     `extract-components-manifest.ts` from the authored components.html.
 *
 * Value resolution per schema token (light theme):
 *   source value  →  A2 `fallback`  →  B-slot `aliasTo`  →  error (A1 with no source).
 *
 * Usage:
 *   npx tsx scripts/emit-design-system.ts --brand psiativa \
 *     [--source design-systems/psiativa/source/tokens.source.json] \
 *     [--out design-systems/psiativa] \
 *     [--od-root /absolute/path/to/open-design] \
 *     [--name "PsiAtiva"] [--category "Health & Wellness"] [--description "..."]
 *
 * OpenDesign lookup order: `--od-root`, `OPEN_DESIGN_ROOT`, then the sibling
 * checkout used by the notes workspace (`knowledge/skills/open-design`).
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const FORK_ROOT = path.resolve(SCRIPT_DIR, "..");

// ── args ────────────────────────────────────────────────────────────────────
function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i !== -1 && i + 1 < process.argv.length) return process.argv[i + 1];
  return fallback;
}

type TokenLayer = "A1-identity" | "A1-structure" | "A2" | "B-slot";
type TokenSpec = { name: string; layer: TokenLayer; description: string; fallback?: string; aliasTo?: string };
type Binding = { name: string; layer: string; value: string; confidence: string; reason: string; sources: string[]; sourceName?: string };
type SourceEntry = { value: string; confidence?: string; reason?: string; source?: string };
type SourceDoc = {
  name?: string;
  themes: { light: Record<string, SourceEntry>; dark?: Record<string, SourceEntry> };
  extraction?: { sourcePath?: string };
};

function groupOf(name: string): string {
  if (["--bg", "--surface", "--surface-warm"].includes(name)) return "Surface";
  if (["--fg", "--fg-2", "--muted", "--meta"].includes(name)) return "Foreground";
  if (name.startsWith("--border")) return "Border";
  if (name.startsWith("--accent")) return "Accent";
  if (["--success", "--warn", "--danger"].includes(name)) return "Semantic";
  if (name.startsWith("--font-")) return "Typography — fonts";
  if (name.startsWith("--text-")) return "Typography — scale";
  if (name.startsWith("--leading-") || name.startsWith("--tracking-")) return "Typography — leading & tracking";
  if (name.startsWith("--space-")) return "Spacing";
  if (name.startsWith("--section-y-")) return "Section rhythm";
  if (name.startsWith("--radius-")) return "Radius";
  if (name.startsWith("--elev-")) return "Elevation";
  if (name === "--focus-ring") return "Focus";
  if (name.startsWith("--motion-") || name === "--ease-standard") return "Motion";
  if (name.startsWith("--container-")) return "Layout";
  return "Other";
}

async function main(): Promise<void> {
  const brand = arg("brand");
  if (!brand || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(brand)) {
    console.error("emit-design-system: --brand <slug> is required (lowercase-kebab).");
    process.exit(1);
  }
  const outDir = path.resolve(FORK_ROOT, arg("out", `design-systems/${brand}`)!);
  const sourcePath = path.resolve(FORK_ROOT, arg("source", `design-systems/${brand}/source/tokens.source.json`)!);
  const odRoot = path.resolve(
    SCRIPT_DIR,
    arg("od-root") ?? process.env.OPEN_DESIGN_ROOT ?? "../../../skills/open-design",
  );
  const displayName = arg("name", brand[0].toUpperCase() + brand.slice(1))!;
  const category = arg("category", "Uncategorized")!;
  const description = arg("description", `Design system extracted from ${displayName} by the clone-website tool.`)!;

  // ── load OpenDesign contracts (read the schema at build time) ──────────────
  async function loadOd<T>(rel: string): Promise<T> {
    return (await import(pathToFileURL(path.join(odRoot, rel)).href)) as T;
  }
  const { TOKEN_SCHEMA } = await loadOd<{ TOKEN_SCHEMA: readonly TokenSpec[] }>(
    "packages/contracts/src/design-systems/token-schema.ts",
  );
  const { renderDesignTokensJson, renderTailwindV4Css } = await loadOd<{
    renderDesignTokensJson: (i: { bindings: readonly Binding[]; report: { generatedAt: string; summary: unknown } }) => string;
    renderTailwindV4Css: (b: readonly { name: string }[]) => string;
  }>("packages/contracts/src/design-systems/derived-token-outputs.ts");
  const { extractComponentsManifest } = await loadOd<{
    extractComponentsManifest: (i: { brandId: string; fixtureHtml: string; tokensCss?: string }) => unknown;
  }>("packages/contracts/src/design-systems/components-manifest.ts");

  // ── read the extraction artifact ──────────────────────────────────────────
  const src = JSON.parse(await readFile(sourcePath, "utf8")) as SourceDoc;
  const light = src.themes.light ?? {};
  const dark = src.themes.dark ?? {};

  // ── resolve every schema token for the light (:root) contract ─────────────
  const bindings: Binding[] = [];
  const missing: string[] = [];
  for (const spec of TOKEN_SCHEMA) {
    const hit = light[spec.name];
    if (hit) {
      bindings.push({
        name: spec.name,
        layer: spec.layer,
        value: hit.value,
        confidence: hit.confidence ?? "high",
        reason: hit.reason ?? spec.description,
        sources: hit.source ? [hit.source] : ["tokens.source.json"],
      });
    } else if (spec.layer === "A2" && spec.fallback !== undefined) {
      bindings.push({
        name: spec.name,
        layer: spec.layer,
        value: spec.fallback,
        confidence: "fallback",
        reason: `OpenDesign A2 default (${spec.description})`,
        sources: ["_schema/defaults.css"],
      });
    } else if (spec.layer === "B-slot" && spec.aliasTo !== undefined) {
      bindings.push({
        name: spec.name,
        layer: spec.layer,
        value: spec.aliasTo,
        confidence: "alias",
        reason: `B-slot aliased to sibling (${spec.description})`,
        sources: ["token-schema.ts"],
      });
    } else {
      missing.push(spec.name);
    }
  }

  if (missing.length > 0) {
    console.error(
      `emit-design-system: ${missing.length} required token(s) have no value in ${path.relative(FORK_ROOT, sourcePath)} and no schema fallback:\n  ${missing.join("\n  ")}`,
    );
    process.exit(1);
  }

  // ── render tokens.css (:root grouped by intent, + [data-theme="dark"]) ────
  const pad = Math.max(...bindings.map((b) => b.name.length));
  const rootLines: string[] = [":root {"];
  let group = "";
  for (const b of bindings) {
    const g = groupOf(b.name);
    if (g !== group) {
      if (group !== "") rootLines.push("");
      rootLines.push(`  /* ─── ${g} ${"─".repeat(Math.max(2, 58 - g.length))} */`);
      group = g;
    }
    rootLines.push(`  ${b.name}:${" ".repeat(pad - b.name.length + 1)}${b.value};`);
  }
  rootLines.push("}");

  const knownNames = new Set(TOKEN_SCHEMA.map((t) => t.name));
  const darkRows = Object.entries(dark).filter(([name]) => knownNames.has(name));
  const darkLines: string[] = [];
  if (darkRows.length > 0) {
    const dpad = Math.max(...darkRows.map(([name]) => name.length));
    darkLines.push(
      "",
      "",
      "/* Dark theme — overrides only. The full :root contract above still applies;",
      '   these slots re-point when [data-theme="dark"] is set on a root ancestor. */',
      '[data-theme="dark"] {',
    );
    for (const [name, entry] of darkRows) {
      darkLines.push(`  ${name}:${" ".repeat(dpad - name.length + 1)}${entry.value};`);
    }
    darkLines.push("}");
  }

  const tokensCss = [
    `/* ${displayName} — tokens.css`,
    ` * Emitted by scripts/emit-design-system.ts from source/tokens.source.json.`,
    ` * Declares every OpenDesign TOKEN_SCHEMA slot (${bindings.length}). Edit the`,
    ` * source artifact and re-emit; do not hand-edit derived files. */`,
    "",
    rootLines.join("\n"),
    darkLines.join("\n"),
    "",
  ].join("\n");

  // ── cite each token's :root line in tokens.css (guard requires a
  //    `tokens.css:<line>` source per binding, matching the declared line) ──
  const fileLines = tokensCss.split("\n");
  const lineOf = new Map<string, number>();
  let inRoot = false;
  for (let i = 0; i < fileLines.length; i += 1) {
    const L = fileLines[i];
    if (!inRoot) {
      if (/^:root\s*\{/.test(L)) inRoot = true;
      continue;
    }
    if (/^\}/.test(L)) break; // end of the :root block (dark block comes after)
    const m = L.match(/^\s*(--[A-Za-z0-9_-]+)\s*:/);
    if (m) lineOf.set(m[1], i + 1);
  }
  for (const b of bindings) {
    const ln = lineOf.get(b.name);
    if (ln === undefined) {
      console.error(`emit-design-system: could not locate ${b.name} in emitted tokens.css :root`);
      process.exit(1);
    }
    b.sources = [...b.sources, `tokens.css:${ln}`];
  }

  // ── derived caches via OpenDesign's OWN renderers (guaranteed parity) ─────
  const generatedAt = new Date().toISOString();
  const byConfidence: Record<string, number> = {};
  const byLayer: Record<string, number> = {};
  for (const b of bindings) {
    byConfidence[b.confidence] = (byConfidence[b.confidence] ?? 0) + 1;
    byLayer[b.layer] = (byLayer[b.layer] ?? 0) + 1;
  }
  const reportSummary = { total: bindings.length, byConfidence, byLayer };
  const designTokensJson = renderDesignTokensJson({ bindings, report: { generatedAt, summary: reportSummary } });
  const tailwindCss = renderTailwindV4Css(bindings);

  // ── manifest.json ─────────────────────────────────────────────────────────
  const manifest = {
    schemaVersion: "od-design-system-project/v1",
    id: brand,
    name: displayName,
    category,
    description,
    source: { type: "local", path: src.extraction?.sourcePath ?? "unknown", importedAt: generatedAt },
    files: {
      design: "DESIGN.md",
      tokens: "tokens.css",
      designTokens: "design-tokens.json",
      tailwind: "tailwind-v4.css",
      components: "components.html",
    },
    usage: "USAGE.md",
    componentsManifest: "components.manifest.json",
    importMode: "normalized",
    craft: { applies: [], suggested: ["color", "accessibility-baseline"], exemptions: [] },
    preview: {
      dir: "preview",
      pages: [
        { path: "preview/colors.html", role: "colors", title: "Colors" },
        { path: "preview/typography.html", role: "typography", title: "Typography" },
        { path: "preview/spacing.html", role: "spacing", title: "Spacing" },
      ],
    },
    sourceFiles: {
      evidence: "source/evidence.md",
      tokens: "source/tokens.source.json",
      report: "source/token-contract.report.json",
    },
  };

  // ── write outputs (never overwrite the hand-authored source artifact) ─────
  await mkdir(path.join(outDir, "source"), { recursive: true });
  await mkdir(path.join(outDir, "preview"), { recursive: true });
  await writeFile(path.join(outDir, "tokens.css"), tokensCss, "utf8");
  await writeFile(path.join(outDir, "design-tokens.json"), designTokensJson, "utf8");
  await writeFile(path.join(outDir, "tailwind-v4.css"), tailwindCss, "utf8");
  await writeFile(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");
  // The report carries the FULL bindings (`tokens`) so the guard can re-derive
  // design-tokens.json from it and diff — not just a summary.
  await writeFile(
    path.join(outDir, "source", "token-contract.report.json"),
    JSON.stringify(
      { schemaVersion: 1, format: "od-token-contract-report/v1", generatedAt, summary: reportSummary, tokens: bindings },
      null,
      2,
    ) + "\n",
    "utf8",
  );

  // ── components.manifest.json — derived from the authored components.html via
  //    OpenDesign's OWN extractor (only when the fixture has been authored) ──
  let componentsNote = "components.manifest.json  (skipped — author components.html first, then re-emit)";
  const componentsHtmlPath = path.join(outDir, "components.html");
  let componentsHtml: string | undefined;
  try {
    componentsHtml = await readFile(componentsHtmlPath, "utf8");
  } catch {
    componentsHtml = undefined;
  }
  if (componentsHtml !== undefined) {
    const componentsManifest = extractComponentsManifest({ brandId: brand, fixtureHtml: componentsHtml, tokensCss });
    await writeFile(path.join(outDir, "components.manifest.json"), JSON.stringify(componentsManifest, null, 2) + "\n", "utf8");
    const undeclared = (componentsManifest as { tokens: { undeclaredReferenced: string[] } }).tokens.undeclaredReferenced;
    componentsNote =
      undeclared.length === 0
        ? "components.manifest.json  (derived via OpenDesign extractor)"
        : `components.manifest.json  ⚠ references undeclared token(s): ${undeclared.join(", ")}`;
  }

  console.log(`emit-design-system: wrote design-systems/${brand}/`);
  console.log(`  tokens.css            ${bindings.length} slots  (${JSON.stringify(byConfidence)})`);
  console.log(`  design-tokens.json    od-design-tokens/v1 (via OpenDesign renderer)`);
  console.log(`  tailwind-v4.css       @theme (via OpenDesign renderer)`);
  console.log(`  manifest.json         od-design-system-project/v1  source.type=local`);
  console.log(`  source/token-contract.report.json  (${bindings.length} bindings)`);
  console.log(`  ${componentsNote}`);
  console.log(`\nStill authored by the emit phase: DESIGN.md, USAGE.md, components.html, preview/*.html, source/evidence.md`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
