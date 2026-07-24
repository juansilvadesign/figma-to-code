# Figma Extraction Guide

What to capture from a Figma file, and how it maps onto OpenDesign's slot vocabulary. The twin of
the cloner's [`INSPECTION_GUIDE.md`](../../ai-website-cloner-template/docs/research/INSPECTION_GUIDE.md),
which does the same job for a live URL.

> **The one thing to internalize first:** OpenDesign has **56 slots**, of which **26 are A1 —
> mandatory, with no schema fallback. An A1 slot with no value is a hard emit error.** And **18 of
> those 26 are *structural*** (type ramp, section rhythm, container gutters) — precisely the things
> a Figma file almost never declares as variables. Extracting the brand colors is the easy half;
> **deriving the structural half off real frames is where the work is.**

---

## Call budget (read before touching the MCP)

The official Figma MCP is rate-limited — reportedly ~6 calls/month on Starter. Treat every call as
expensive:

1. **Cache everything.** Write every raw MCP response into `docs/research/` immediately. Re-runs
   and all iteration must read the cache, never the MCP.
2. **Metadata before context.** `get_metadata` on a large node before `get_design_context`, so you
   don't spend a big call on a truncated answer.
3. **Batch by intent, not by node.** One variables pass, one styles pass, one representative-frame
   pass. Never loop the MCP over nodes.
4. **Prefer the un-gated path where it exists** — the `talk-to-figma` fork (local plugin + socket)
   is free and can read. Confirm which reads it covers before designing around it.

---

## Phase 1 — Does this file even have a token system?

Establish the tier before extracting anything (drives `extraction.method` and every `confidence`):

- [ ] **Variable collections** — how many, and what are they named?
- [ ] **Modes per collection** — `Light`/`Dark`? `Desktop`/`Tablet`/`Mobile`? Brand axes?
- [ ] Do variables resolve to **values** or to **aliases** needing another hop?
- [ ] **Published styles** — paint styles, text styles (tier 2 if there are no variables)
- [ ] If neither: which 2–3 **representative frames** stand in for the design language (tier 3)?

| Tier | Source | `confidence` | `extraction.method` |
| --- | --- | --- | --- |
| 1 | Variables | `high` | `figma-variables` |
| 2 | Published paint + text styles | `high` | `figma-styles` |
| 3 | Measured off representative frames | `derived` | `figma-computed` |

## Phase 2 — Modes → themes

OpenDesign has exactly two scopes: `:root` and `[data-theme="dark"]`.

- A `Light`/`Dark` mode axis → the two theme scopes. Straightforward.
- A **responsive** mode axis (`Desktop`/`Tablet`/`Phone`) → does *not* become a scope. It feeds the
  responsive **slots** OpenDesign already has: `--section-y-desktop|tablet|phone`,
  `--container-gutter-desktop|tablet|phone`.
- A **brand** mode axis → **one design system per brand mode**. Do not try to express two brands in
  one package.
- Only `dark` overrides that genuinely differ need listing under `themes.dark` (the proven psiativa
  artifact overrides just 11 of 41).

## Phase 3 — The slot map

All 56 slots. **A1 = mandatory** (bold); A2 and B fill themselves from the schema if you omit them —
so **omit rather than guess**.

### Color — identity (A1, 6 of the 8 identity slots)

| Slot | What it is | Typical Figma origin |
| --- | --- | --- |
| **`--bg`** | Page canvas | `bg/default`, `background/base`, page frame fill |
| **`--surface`** | Card / section surface | `bg/subtle`, `surface/1`, card component fill |
| **`--fg`** | Body ink | `text/primary`, `content/default` |
| **`--muted`** | Secondary copy | `text/secondary`, `content/muted` |
| **`--border`** | Default hairline | `border/default`, `stroke/base` |
| **`--accent`** | Brand action color | `brand/primary`, `accent/default`, the primary button fill |

### Color — optional (A2 / B — omit if absent)

`--accent-on` (text on accent) · `--accent-hover` · `--accent-active` · `--success` · `--warn` ·
`--danger` · `--surface-warm` (B→`--surface`) · `--fg-2` (B→`--fg`, headings) · `--meta`
(B→`--muted`) · `--border-soft` (B→`--border`).

> B-slots alias to their sibling when omitted. Only list one when the file **really** distinguishes
> it — e.g. a distinct heading color for `--fg-2`.

### Typography — fonts (A1 ×2 + A2 ×1)

| Slot | Origin |
| --- | --- |
| **`--font-display`** | Heading text style's family |
| **`--font-body`** | Body text style's family |
| `--font-mono` | A2 — omit unless the file really uses one |

### Typography — the ramp (A1 ×11 — the first hard part)

**`--text-xs` `--text-sm` `--text-base` `--text-lg` `--text-xl` `--text-2xl` `--text-3xl`
`--text-4xl` `--leading-body` `--leading-tight` `--tracking-display`**

Figma text styles are usually **semantic** (`Heading/H1`, `Body/Large`), not a t-shirt ramp. You
must **project** them onto these 8 sizes:

1. List every text style with its size, line-height, letter-spacing.
2. Sort by size; map the body style to `--text-base`; fan out from there.
3. Where the file has no style at a rung, **interpolate** and mark `confidence: "derived"` with a
   reason naming the two styles it sits between.
4. `--leading-body` from the body style, `--leading-tight` from headings, `--tracking-display` from
   the largest display style (often negative).

### Spacing (A2 ×8 — omit freely)

`--space-1 … --space-6`, `--space-8`, `--space-12`. From a spacing variable collection if one
exists; otherwise from recurring auto-layout gaps and padding. All A2 — **omit the ones you can't
evidence** rather than inventing a scale.

### Section rhythm + container (A1 ×7 — the second hard part)

**`--section-y-desktop` `--section-y-tablet` `--section-y-phone` `--container-max`
`--container-gutter-desktop` `--container-gutter-tablet` `--container-gutter-phone`**

Mandatory, and essentially **never** declared as variables. Measure them:

- `--section-y-*` — vertical padding on section frames at each breakpoint's frame width.
- `--container-max` — the content column's max width (frame width minus both gutters).
- `--container-gutter-*` — horizontal padding between the page frame edge and content, per breakpoint.

If the file has only a desktop frame, derive tablet/phone from the desktop value and record
`confidence: "derived"` with the reasoning. **Do not omit — omission is an emit error.**

### Radius, elevation, focus, motion (A2 ×13 — omit freely)

`--radius-sm|md|lg|pill` · `--elev-flat|ring|raised` · `--focus-ring` ·
`--motion-fast|base` · `--ease-standard`.

Radius from component corner radii. Elevation from Figma effect styles (drop shadows) — translate
to CSS `box-shadow`. Motion is rarely in a static file; **omit and take the schema fallback**.

---

## Phase 4 — Component inventory (feeds `components.html`)

The guard requires a fixture with **≥10 selectors, ≥8 `var(--…)` references, ≥4 component groups,
and only tokens declared in `tokens.css`**.

Figma is unusually good source material here — enumerate real component sets rather than guessing:

- `analyze-component-set-figma` / `component-properties-figma` → variants and their properties.
- `deep-component-figma` → one component's full structure.
- `design-system-inventory-figma` → the file-wide sweep.

Capture per component: name, variants, states (default/hover/active/disabled/focus), and which
**token** each visual property should reference — not the raw value. Groups to cover: buttons,
cards, badges, links, typography, inputs, layout, icons.

## Phase 5 — Output

Everything above lands in `docs/research/` first (raw MCP responses + notes), then is serialized
into `design-systems/<slug>/source/tokens.source.json` per the contract in
[`BUILD-PLAN.md`](BUILD-PLAN.md) § The shared contract.

**Self-check before emitting:**

- [ ] All **26 A1 slots** present (6 identity colors + 2 fonts + 11 ramp + 7 rhythm/container).
- [ ] Every entry has a `source` naming real evidence — variable path + mode, style name, or node id.
- [ ] `confidence` is honest: `high` only for declared values; `derived` for anything interpolated
      or measured.
- [ ] No A2/B slot listed on a guess — omitted instead.
- [ ] `themes.dark` lists only genuine overrides.
