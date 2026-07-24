#!/usr/bin/env -S npx tsx
/**
 * emit-design-system.ts — tokens.source.json → OpenDesign v1 rich package
 *
 * ⚠️  STUB — TO BE VENDORED. Scaffolded 2026-07-24 (BUILD-PLAN Milestone 1).
 *
 * This file is NOT new work. The cloner's emitter is already source-agnostic —
 * it consumes `tokens.source.json` and knows nothing about browsers, DOM, or
 * URLs — so it drops in here unchanged. That is the whole thesis of this
 * project: two extractors, one emitter, one shared contract.
 *
 * ── Milestone 1: copy it in ───────────────────────────────────────────────────
 *
 *   cp ../ai-website-cloner-template/scripts/emit-design-system.ts       scripts/
 *   cp ../ai-website-cloner-template/scripts/validate-design-system.ts   scripts/
 *
 * Provenance to record in the copied header (defence against silent drift):
 *   source: juansilvadesign/ai-website-cloner-template @ 651f549 (Milestone C)
 *   copied: <date>
 *
 * Expect ZERO functional edits. The relative default `--od-root`
 * (`../../../skills/open-design`) resolves identically from this path, since
 * scripts/ sits at the same depth under knowledge/projects/<project>/.
 *
 * ── What the vendored script does ─────────────────────────────────────────────
 *   - Reads OpenDesign's TOKEN_SCHEMA at build time (never a hardcoded slot list).
 *   - Resolves each of the 56 slots: source value → A2 `fallback` → B-slot
 *     `aliasTo` → error (A1 with no source).
 *   - Writes tokens.css (grouped, + [data-theme="dark"]) and generates the
 *     derived caches with OpenDesign's OWN renderers (renderDesignTokensJson,
 *     renderTailwindV4Css, extractComponentsManifest) so they provably agree.
 *   - Writes manifest.json and source/token-contract.report.json — the report
 *     must carry the full `tokens` bindings, each citing `tokens.css:<line>`.
 *   - Does NOT author prose (DESIGN.md, USAGE.md, components.html, preview/*,
 *     evidence.md) — that is the skill's Phase 4.
 *
 * ── Verify Milestone 1 ────────────────────────────────────────────────────────
 *   npx tsx scripts/emit-design-system.ts --brand <slug> --name "<Name>"
 *   npx tsx scripts/validate-design-system.ts --brand <slug>     # must pass
 *
 * Prove the loop with a KNOWN-GOOD input first: copy
 * ../ai-website-cloner-template/design-systems/psiativa/source/ in and re-emit.
 * If it validates here, the entire downstream half of this project is done and
 * every remaining unknown is a Figma question.
 *
 * ⚠️  Never hand-edit the derived files. Edit tokens.source.json or
 *     components.html, then re-run this.
 */

throw new Error(
  "emit-design-system: NOT VENDORED YET — see BUILD-PLAN.md Milestone 1.\n" +
    "Copy scripts/emit-design-system.ts from ../ai-website-cloner-template/ (@651f549) verbatim.",
);

export {};
