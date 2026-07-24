#!/usr/bin/env -S npx tsx
/**
 * extract-figma-tokens.ts — Figma extraction artifacts → tokens.source.json
 *
 * ⚠️  STUB — NOT IMPLEMENTED. Scaffolded 2026-07-24 (BUILD-PLAN Milestone 3).
 *
 * This is the ONLY substantially new code in this project. Everything downstream
 * (emit + validate) is vendored from ai-website-cloner-template and already works,
 * because `tokens.source.json` is a shared, source-agnostic contract.
 *
 * ── Design decisions already made (docs/BUILD-PLAN.md § Milestone 3) ──────────
 *
 * 1. This script does NOT call the Figma MCP itself. The agent captures MCP
 *    responses into docs/research/ (they are rate-limited and worth caching);
 *    this script is a pure, testable transform over those files.
 *
 * 2. Three-tier resolution, recorded per binding as `confidence`:
 *        variables            → "high"
 *        published styles     → "high"
 *        measured off frames  → "derived"
 *    Never emit a value without evidence in `source`.
 *
 * 3. NEVER fill A2 / B-slot tokens here. Omit them and let the emitter apply
 *    OpenDesign's schema `fallback` / `aliasTo`. Only the 26 A1 slots are
 *    mandatory — and 18 of those are STRUCTURAL (type ramp, section rhythm,
 *    container gutters), which Figma files essentially never declare. Deriving
 *    those off real frames is the hard part of this script.
 *
 * 4. Never hardcode the slot list — read OpenDesign's TOKEN_SCHEMA at build time
 *    (see emit-design-system.ts for the loader pattern), so a schema change here
 *    surfaces as a validation error rather than silent drift.
 *
 * ── Usage (once implemented) ──────────────────────────────────────────────────
 *   npx tsx scripts/extract-figma-tokens.ts --brand <slug> \
 *     [--research docs/research/<slug>]        # cached MCP responses (input)
 *     [--out design-systems/<slug>/source/tokens.source.json]
 *     [--overrides docs/research/<slug>/slot-overrides.json]
 *     [--od-root ../../../skills/open-design]
 *
 * ── TODO (Milestone 3) ────────────────────────────────────────────────────────
 * [ ] Define the docs/research/ input shape — settle it in the Milestone 2 probe
 *     against a REAL file. Do not design this from imagination; the workspace's
 *     own instagram-figma-moodboard gotchas #11-#14 are exactly this lesson.
 * [ ] Name → slot resolver: exact match → prefix → regex → heuristic → override map.
 *     Per-file overrides are expected, not a failure; no heuristic generalizes
 *     across naming conventions.
 * [ ] Mode → theme mapper (BUILD-PLAN § 2): light/dark → scopes; responsive →
 *     the responsive slots; brand axes → one package per mode.
 * [ ] Type-ramp projection: semantic text styles → --text-xs…4xl, interpolating
 *     missing rungs with confidence "derived" and a reason naming the neighbours.
 * [ ] Structural derivation: --section-y-*, --container-max, --container-gutter-*
 *     measured off representative frames per breakpoint.
 * [ ] A1 completeness check: fail loudly listing every missing A1 slot, rather
 *     than emitting a file the emitter will reject with a less useful message.
 * [ ] Tests against the Milestone 2 fixtures.
 */

throw new Error(
  "extract-figma-tokens: NOT IMPLEMENTED — this project is scaffolded, not built.\n" +
    "Start at docs/BUILD-PLAN.md Milestone 1 (vendor + prove the emitter loop),\n" +
    "then Milestone 2 (probe a real Figma file) before implementing this script.",
);

export {};
