# Build Plan — Figma → OpenDesign design system

> Direction for `knowledge/projects/figma-to-code/`. Turns a **Figma file** into a portable
> [OpenDesign](../../../skills/open-design/) v1 rich design-system package — the Figma-source
> twin of [`ai-website-cloner-template`](../../ai-website-cloner-template/docs/FORK-PLAN.md),
> which does the same job from a **URL**.

## Locked decisions (interview, 2026-07-24)

| Axis | Decision | Why |
| --- | --- | --- |
| **Home** | **New sibling project** (`knowledge/projects/figma-to-code/`), not a second front-end inside the cloner fork | Keeps the fork's public identity as a *website* cloner; this is tracked directly by the notes repo (no submodule) |
| **v1 output** | **Design-system package only** — `design-systems/<slug>/`, guard-green | Unblocked today: the cloner's Milestone C emitter already ships. Page-building is Milestone D over there, shared once it lands |
| **Shared contract** | `source/tokens.source.json` — the same intermediate the cloner writes | Makes "two sources, one emitter" real instead of aspirational |
| **Emitter** | **Vendored** from the cloner, not imported | Cross-submodule imports don't survive extraction to a standalone repo. Drift is bounded because both copies read OpenDesign's schema at build time |
| **Scaffold depth** | Plans + contracts + stubs; no working code | Committed 2026-07-24 |

## The insight this rests on

The cloner's own plan already found the seam: **extraction is stack-specific, emission is not.**
`emit-design-system.ts` consumes `tokens.source.json` and knows nothing about browsers — no DOM,
no `getComputedStyle`, no URL. It is *already* source-agnostic. So a Figma importer is not a new
pipeline; it is **a second extractor on an existing spine**.

```
  Figma file ──▶ ┌──────────────────────────────┐
                 │  EXTRACT  (Figma MCP)         │  ← the only genuinely new work
                 │  variables · styles · type    │
                 │  ramp · spacing · components  │
                 └───────────────┬──────────────┘
                                 │
                                 ▼
                 ┌──────────────────────────────┐
                 │  source/tokens.source.json    │  ← THE SHARED CONTRACT
                 │  slot → {value, confidence,   │     (identical for URL + Figma)
                 │          reason, source}      │
                 └───────────────┬──────────────┘
                                 ▼
                 ┌──────────────────────────────┐
                 │  EMIT  (vendored, unchanged)  │  reads OD TOKEN_SCHEMA at build time
                 │  tokens.css + derived caches  │  via OD's OWN renderers
                 │  + manifest + report          │
                 └───────────────┬──────────────┘
                                 ▼
                 ┌──────────────────────────────┐
                 │  VALIDATE  (vendored)         │  == pnpm guard + pnpm typecheck
                 └──────────────────────────────┘
```

## What is actually different from the URL cloner

This is where the work is. Five real divergences, not cosmetic ones:

### 1. Figma *declares* tokens; a website only *exhibits* them

The cloner reads `getComputedStyle()` and must **cluster** thousands of computed values into a
plausible scale — lossy, inferential. Figma hands over `get_variable_defs`: named variables with
real semantics (`color/brand/primary`, `spacing/md`, `radius/lg`).

**Better input, different problem.** The cloner's hard part is *value clustering*. Ours is
**name → slot resolution**: mapping an arbitrary, per-file naming convention onto OpenDesign's
fixed 56-slot vocabulary. `color/brand/primary` → `--accent`. `text/heading` → `--fg-2`.
No two Figma files name things alike. See [`EXTRACTION-GUIDE.md`](EXTRACTION-GUIDE.md) § Slot mapping.

### 2. Modes ≠ themes

Figma variable **modes** are an n-dimensional feature: a collection can carry `Light`/`Dark`, and
another `Desktop`/`Tablet`/`Mobile`, and another `Brand A`/`Brand B`. OpenDesign's contract is
exactly two theme scopes: `:root` and `[data-theme="dark"]`.

So the extractor needs an explicit **mode → theme map**, and a rule for non-theme mode axes.
Working proposal: responsive mode axes collapse into the responsive *slots* OpenDesign already
has (`--section-y-desktop|tablet|phone`, `--container-gutter-*`); brand axes mean **one design
system per brand mode**, not one package with extra scopes. Confirm against a real multi-mode file.

### 3. Not every file has variables

Plenty of real files predate variables and use **paint/text styles**, or nothing at all. The
extractor needs a **three-tier fallback**, recording which tier produced each value:

| Tier | Source | `confidence` |
| --- | --- | --- |
| 1 | Variables (`get_variable_defs` / `export-tokens-figma`) | `high` |
| 2 | Published paint + text styles | `high` |
| 3 | Computed values off representative frames (`get_design_context`) | `derived` |
| — | OpenDesign schema fallback / B-slot alias | `fallback` (emitter fills; do not author) |

### 4. `components.html` gets *better* source material

The guard demands a token-wired fixture: ≥10 selectors, ≥8 `var(--…)` refs, ≥4 component groups,
and **only** tokens declared in `tokens.css`. The cloner reverse-engineers this from DOM scraping.
Figma has real **component sets with variants** — `analyze-component-set-figma` and
`component-properties-figma` enumerate them directly. Button/variant/state coverage should come
out materially more faithful here than in the URL lane.

### 5. Rate limits are a first-class design constraint

The browser MCP is effectively unmetered; the official Figma MCP is **not** (see Risk 1). The
extractor's call budget shapes its architecture — one metadata pass, one variables pass, targeted
reads only. This has no analogue in the cloner.

## The shared contract — `source/tokens.source.json`

Authored by extraction, consumed by the emitter. Real shape, copied from the cloner's
proven `design-systems/psiativa/source/tokens.source.json`:

```jsonc
{
  "$schema": "figma-to-code extraction artifact — consumed by scripts/emit-design-system.ts",
  "brand": "<slug>",
  "name": "<Display Name>",
  "extraction": {
    "target": "<Figma file name>",
    "sourcePath": "<figma file key / URL>",
    "method": "figma-variables | figma-styles | figma-computed",
    "evidence": "<collection names, mode names, how the ramp was read>",
    "note": "Only slots with a real or derived value are listed. The emitter fills unspecified A2 slots from the OpenDesign schema fallback and B-slot slots from their aliasTo sibling.",
    "extractedAt": "YYYY-MM-DD"
  },
  "themes": {
    "light": {
      "--bg":     { "value": "#FAFFFF", "confidence": "high", "reason": "Primitives/background/default", "source": "variable: color/bg/default (mode Light)" },
      "--accent": { "value": "#00FA8F", "confidence": "high", "reason": "brand action color", "source": "variable: color/brand/accent (mode Light)" }
    },
    "dark": { }
  }
}
```

**Rules:** list only slots you have real evidence for — the emitter resolves the rest
(source value → A2 `fallback` → B-slot `aliasTo`). Every **A1** slot must have a value; A1 has no
fallback and the emit errors without it. `source` must name real evidence (variable path + mode,
style name, or node id), never a guess.

## Milestones

Sequence **1 → 2 → 3 → 4 → 5**. Milestone 1 is deliberately trivial and comes first because it
converts the whole downstream half from "hopefully compatible" to "proven."

### Milestone 1 — Vendor the emitter, prove the loop end-to-end

Before touching Figma at all, prove this project can produce a guard-green package.

- Copy `scripts/emit-design-system.ts` + `scripts/validate-design-system.ts` from
  [`../../ai-website-cloner-template/scripts/`](../../ai-website-cloner-template/scripts/) **verbatim**.
  They are source-agnostic; expect zero edits beyond the header comment.
- Hand-author a throwaway `tokens.source.json` (or copy `design-systems/psiativa/source/` from
  the cloner) and run emit → validate.
- **Acceptance:** `validate-design-system.ts` passes in *this* repo. Confirms `--od-root`'s default
  (`../../../skills/open-design`) resolves at this depth and that Node/tsx behave the same here.
- Record the vendored files' provenance (source commit) in a header comment — the only defense
  against silent drift.

### Milestone 2 — Extraction recon on ONE real file (probe, not build)

The workspace's own hard-won lesson (`instagram-figma-moodboard` gotchas #11–#14): **guessing
costs commits.** Probe before designing the extractor.

Answer against the **SYD landing-page Figma file** first (decided 2026-07-28). It has an owned,
human-designed desktop/mobile source plus the existing human-authored Next.js implementation
(`zokuWebDesign/SYD-Next`), giving this project a rare end-to-end comparison target: Figma is the
visual-intent source and the Next.js page is an independent implementation/behavior reference.
Do not feed that code into extraction; compare against it only after emission.

- [ ] Does the file use variables at all? How many collections, and what modes per collection?
- [ ] What exactly does `get_variable_defs` return — resolved values, or aliases needing a second hop?
- [ ] Are type styles expressible as the `--text-xs…4xl` ramp, or free-form per-node?
- [ ] Is there a spacing scale, or is spacing just auto-layout gaps?
- [ ] How many MCP calls did the whole probe cost? (Sets the budget for Milestone 3.)
- [ ] Does `export-tokens-figma` work on this plan without burning the codegen rate limit? (Resolves the open TODO in [`../../../skills/CONTEXT.md`](../../../skills/CONTEXT.md) § 5.)

Write the answers into `docs/research/` — that file *is* the Milestone 3 spec.

### Milestone 3 — The extractor (`scripts/extract-figma-tokens.ts`)

The only substantially new code in the project.

- **Ingest** the Milestone 2 artifacts (MCP output captured to `docs/research/`), rather than
  calling the MCP from inside the script. Keeps the script pure/testable and the MCP calls
  agent-driven and budgeted. *(Revisit if a non-rate-limited path exists.)*
- **Name → slot resolver:** a declarative match table (exact → prefix → regex → heuristic), plus a
  per-file override map for names it can't infer. Emits `confidence` honestly per tier.
- **Mode → theme mapper** per § 2 above.
- **Three-tier fallback** per § 3 above.
- **Never** fill A2 slots itself — leave them absent so the emitter's schema fallback owns them.
- **Acceptance:** produces a `tokens.source.json` that emits + validates green, and every binding
  traces to real evidence.

### Milestone 4 — The prose + fixture phase

The guard's non-token half, authored (not generated) — mirrors the cloner's SKILL Phase 6:

- `DESIGN.md` — ≥7 `##` sections (personality, color roles, typography, spacing/layout,
  components + states, motion, accessibility, anti-patterns).
- `USAGE.md` — must contain `## Read Order`, `## Design Highlights`, `## Do`, `## Avoid`.
- `components.html` — ≥10 selectors, ≥8 `var(--…)`, ≥4 groups, **only declared tokens**.
  Source it from the file's real component sets (§ 4 above).
- `preview/{colors,typography,spacing}.html` + `source/evidence.md`.

### Milestone 5 — Acceptance, docs, second file

- Run the full loop on a **second, unrelated** Figma file — the only real test of the name→slot
  resolver's generality.
- Fold the findings back into `EXTRACTION-GUIDE.md`.
- Update the routing row in [`../../../skills/CONTEXT.md`](../../../skills/CONTEXT.md) § 1 from
  *scaffolded* to *built*, and the idea note + board.

## Risks

1. **Which Figma MCP, and can we afford it? (highest)** The official `figma-mcp` is rate-limited —
   reportedly ~6 calls/month on Starter. That is not enough to extract a design system, let alone
   iterate. Options: (a) the un-gated `talk-to-figma` **fork** (44 tools, local plugin + socket,
   already running in this workspace) to read variables/styles; (b) `skills-for-figma`'s
   `export-tokens-figma` if it genuinely uses Plugin-API reads; (c) accept the limit and cache
   every MCP response into `docs/research/` so re-runs cost zero calls. **Resolve in Milestone 2 —
   it determines the extractor's whole shape.** Caching (c) is worth doing regardless.
2. **Name → slot resolution is the real difficulty**, and it is per-file. Budget for an override
   map from day one; do not expect the heuristics to generalize. Milestone 5's second file is the
   honesty check.
3. **Vendored-emitter drift.** Two copies of `emit-design-system.ts` will diverge. Bounded by both
   reading OpenDesign's schema at build time, but not eliminated — record provenance, and diff
   against the cloner before any release.
4. **A1 slots with no Figma source.** A file may simply not define, say, a mono font. A1 has no
   fallback, so the emit *errors*. Need a documented, explicit "author this A1 slot by hand with
   `confidence: derived`" escape hatch — recorded in `evidence.md`, never silently invented.
5. **Modes may not map cleanly** (§ 2). A file with three orthogonal mode axes may not be
   expressible as one OpenDesign package. Acceptable answer: emit one package per brand mode.
6. **Legal / ToS.** Same boundary as the cloner: an extracted design system is aesthetic
   inspiration, not an official asset. Fine for files you own or are authorized on.

## Recommended first bite

**Milestone 1 in full, then the Milestone 2 probe.** Milestone 1 is close to free — the emitter is
already source-agnostic and proven — and it converts the risky-looking half of this project into a
solved one. After that, every remaining unknown is a *Figma* question, which is exactly where the
probe points.

## Related

- [`../../ai-website-cloner-template/docs/FORK-PLAN.md`](../../ai-website-cloner-template/docs/FORK-PLAN.md) — the URL twin; Milestone C shipped the emitter, D is the shared Astro builder.
- [`../../../skills/open-design/`](../../../skills/open-design/) — `TOKEN_SCHEMA` + derived renderers.
- [`../../../skills/CONTEXT.md`](../../../skills/CONTEXT.md) — Figma tool routing.
- [`../../../skills/figma-to-astro/`](../../../skills/figma-to-astro/) — today's hand-driven frame → `.astro` path.
- [`../../../ideas/figma-to-code-local-generator.md`](../../../ideas/figma-to-code-local-generator.md) — origin idea.
