#!/usr/bin/env -S npx tsx
/**
 * validate-design-system.ts — the acceptance gate
 *
 * ⚠️  STUB — TO BE VENDORED alongside emit-design-system.ts (BUILD-PLAN Milestone 1).
 *
 *   cp ../ai-website-cloner-template/scripts/validate-design-system.ts scripts/
 *
 * Provenance: juansilvadesign/ai-website-cloner-template @ 651f549 (Milestone C).
 *
 * ── What it does ──────────────────────────────────────────────────────────────
 * Runs OpenDesign's OWN exported guard checks against a single package via
 * `npx tsx` — manifest shape + semantics, derived-file parity, and the
 * package-quality minimums — WITHOUT a full monorepo install. (Node 22 + tsx
 * imports OpenDesign's pure-TS contracts fine; OpenDesign itself wants Node 24
 * only for its full app / better-sqlite3.)
 *
 * Passing this is equivalent to dropping design-systems/<slug>/ into the
 * OpenDesign repo and running `pnpm guard` + `pnpm typecheck`.
 *
 * ── Usage ─────────────────────────────────────────────────────────────────────
 *   npx tsx scripts/validate-design-system.ts --brand <slug> \
 *     [--od-root ../../../skills/open-design]
 *
 * ── Why this is the definition of done ────────────────────────────────────────
 * "Looks right" is not an acceptance criterion for a design system — the guard
 * catches the failures that matter and are invisible by eye: an undeclared
 * var() in components.html, a derived cache that drifted from tokens.css, a
 * missing A1 slot, a source citation pointing at the wrong line. Every milestone
 * in BUILD-PLAN.md ends here.
 */

throw new Error(
  "validate-design-system: NOT VENDORED YET — see BUILD-PLAN.md Milestone 1.\n" +
    "Copy scripts/validate-design-system.ts from ../ai-website-cloner-template/ (@651f549) verbatim.",
);

export {};
