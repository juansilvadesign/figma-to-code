---
name: figma-to-design-system
description: Turn a Figma file into a portable OpenDesign design-system package (design-systems/<slug>/) — extracts variables, styles, the type ramp, spacing, and component sets, serializes them to tokens.source.json, emits tokens.css plus the derived caches, and validates against OpenDesign's real guard checks. Use when the user wants to extract a design system from Figma, turn a Figma file into design tokens, or produce tokens.css from a design. Do NOT use to build a page or component from a frame (that is figma-to-astro) or to clone a live website (that is clone-website).
argument-hint: "<figma-url-or-file-key> [--brand <slug>] [--build none|astro]"
user-invocable: true
---

# Figma → Design System

Extract a Figma file's design language into an **OpenDesign v1 rich package** that passes
OpenDesign's own guard checks.

> **Importer MVP shipped.** Capture, offline extraction, emission, and validation
> are implemented. `--build none` is the default package-only route;
> `--build astro` additionally selects the validated package and builds the root
> Astro target. It does not generate page sections by itself.

## Pre-flight

- [ ] Read [`docs/BUILD-PLAN.md`](../../../docs/BUILD-PLAN.md) (current milestone) and
      [`docs/EXTRACTION-GUIDE.md`](../../../docs/EXTRACTION-GUIDE.md) (what to capture).
- [ ] Confirm which Figma MCP is available and **what the call budget is** — the official one is
      rate-limited. Cache every response to `docs/research/`.
- [ ] Confirm `knowledge/skills/open-design/` is reachable (supplies `TOKEN_SCHEMA`).
- [ ] Resolve `<slug>` — lowercase-kebab, defaults to a normalized file name.

## Guiding principles

1. **Never invent a token value.** Every binding carries real evidence in `source`. Absent beats
   guessed — the emitter has schema fallbacks for A2 and B slots.
2. **Honest confidence.** `high` = declared in the file. `derived` = interpolated or measured.
   Never label a derivation `high`.
3. **Omit A2/B, never A1.** All **26 A1 slots are mandatory** and have no fallback; a missing one
   is a hard emit error. Everything else should be omitted unless evidenced.
4. **Never hardcode the slot list.** The emitter reads OpenDesign's `TOKEN_SCHEMA` at build time.
5. **Never hand-edit derived files.** Re-emit instead.
6. **Cache, then work.** MCP calls are the scarce resource; all iteration reads `docs/research/`.

## Phase 1 — Recon

Establish the token tier (variables → styles → measured) and the mode layout per
[`EXTRACTION-GUIDE.md`](../../../docs/EXTRACTION-GUIDE.md) Phases 1–2. Write findings and every raw
MCP response into `docs/research/`.

Report the tier and the mode → theme mapping **before** extracting, and stop if the file has three
orthogonal mode axes (that means one package per brand mode — a scoping decision for the user).

## Phase 2 — Extract

Per [`EXTRACTION-GUIDE.md`](../../../docs/EXTRACTION-GUIDE.md) Phase 3:

- Identity colors + fonts (the easy half).
- **The type ramp** — project the file's semantic text styles onto `--text-xs…4xl`, interpolating
  where rungs are missing.
- **Section rhythm + container** — measure off real frames at each breakpoint. Never declared;
  always mandatory.
- Optional slots (spacing, radius, elevation, motion) only where evidenced.

## Phase 3 — Serialize

Write `design-systems/<slug>/source/tokens.source.json` per the contract in
[`BUILD-PLAN.md`](../../../docs/BUILD-PLAN.md) § The shared contract. Run the self-check at the end
of the extraction guide before moving on — especially the 26/26 A1 count.

## Phase 4 — Author the prose + fixture

The emitter does **not** write these:

- `DESIGN.md` — ≥7 `##` sections (personality, color roles, typography, spacing/layout,
  components + states, motion, accessibility, anti-patterns).
- `USAGE.md` — must contain `## Read Order`, `## Design Highlights`, `## Do`, `## Avoid`.
- `components.html` — ≥10 selectors, ≥8 `var(--…)`, ≥4 groups, **referencing only declared
  tokens** (an undeclared `var()` fails the guard). Build it from the file's real component sets.
- `preview/{colors,typography,spacing}.html` and `source/evidence.md` (provenance + per-token
  confidence notes).

## Phase 5 — Emit + validate

```bash
npx tsx scripts/emit-design-system.ts --brand <slug> --name "<Name>" --category "<Category>"
npx tsx scripts/validate-design-system.ts --brand <slug>
```

For the optional Astro target, let the emitter own validation and the brand seam:

```bash
npx tsx scripts/emit-design-system.ts --brand <slug> --name "<Name>" \
  --category "<Category>" --build astro
```

Do not run the standalone validator first and treat that as a receipt. The Astro
path deliberately re-runs the same validator in-process immediately before it
retargets `src/styles/global.css`.

**Acceptance:** the validator passes — equivalent to `pnpm guard` + `pnpm typecheck` inside the
OpenDesign repo. That is the definition of done; a package that doesn't validate isn't delivered.

## Report

- The token tier used and the mode → theme mapping.
- A1 coverage (must be 26/26) and the confidence split (`high` / `derived`).
- Any slot that needed derivation, and from what.
- The validator's verdict.
- MCP calls spent.

## Anti-scope

- **Not** a page/component builder — that's [`figma-to-astro`](../../../../../skills/figma-to-astro/).
- **Not** a website cloner — that's [`clone-website`](../../../../ai-website-cloner-template/).
- **Not** a Figma authoring tool — nothing here writes back into Figma.
- **Not** a replacement for OpenDesign's guard — it targets it.
