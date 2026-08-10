# R1.5 build note — first Figma-derived rich package

**Date:** 2026-08-10  
**Release:** R1 — Importer MVP  
**Verdict:** passed

## Outcome

The authorized SYD capture now replays offline into a complete OpenDesign rich
package at `design-systems/syd/`. The package contains the authored prose,
component fixture, previews, and evidence ledger plus all emitted caches. It passes
OpenDesign's package guard at quality 100.

No MCP call was made during R1.5. The capture and emitted package remain
`private-local` and gitignored; this note records the non-private acceptance result.

## Pre-emission adjudication

R1.4 intentionally left three ambiguous semantic roles for a human decision. All
final values already existed in the Figma evidence; the overrides change role
assignment only.

| Slot | Automatic choice | R1.5 choice | Why |
| --- | --- | --- | --- |
| `--accent` | `primaria` / `#95cf9a` by name | `secundaria` / `#6460be` | Violet fills every primary CTA and dominates headings; green is predominantly structural/decorative. |
| `--border` | `#f8f8f8` by stroke frequency | `primaria` / `#95cf9a` | The frequency winner is an invisible profile-card/image stroke equal to `--bg`; green visibly divides navbar, sections, FAQ rows, and footer. |
| `--fg` | `texto` / `#000000` by name | `texto-lp` / `#141414` | `texto-lp` is the repeated landing-page ink; black is isolated mainly inside profile-card internals. |

`slot-overrides.json` is integrity-bound by the capture manifest. The post-override
extractor reports `override=3 exact=1 role-map=6 heuristic=18` and preserves each
displaced stage in `extraction-report.json`.

## Authored package

The emit-phase artifacts were authored from captured evidence before the first
emission:

- `DESIGN.md` — nine sections covering roles, typography, layout, components,
  responsive behavior, motion limits, accessibility, and anti-patterns.
- `USAGE.md` — required read order, highlights, do, and avoid guidance.
- `components.html` — Navbar, primary/secondary/icon buttons, Timeline Item,
  pricing card, professional card, fields, and Accordion Item.
- `preview/colors.html`, `preview/typography.html`, and `preview/spacing.html`.
- `source/evidence.md` — runtime/capture hashes, every emitted token's source and
  confidence, all transformations/fallbacks, component node evidence, overrides,
  and limitations.

The component manifest extracted from the authored fixture reports:

| Metric | Result |
| --- | ---: |
| CSS selectors | 65 |
| HTML classes | 33 |
| Referenced tokens | 39 |
| Undeclared token references | 0 |
| Detected groups | 7 (`buttons`, `inputs`, `cards`, `links`, `icons`, `typography`, `layout`) |
| Hard-coded color expressions | 0 |

## Emission and validation

Runtime: Node `v24.18.0`, npm `11.16.0`.

```bash
npm run extract -- --capture docs/research/syd/capture-manifest.json
npm run emit -- --brand syd --name "SYD (SaveYourDay)" \
  --category "Mental Health" \
  --description "Evidence-backed design system extracted from the authorized SYD Figma source."
npm run validate -- --brand syd
npm run check:r1:contract
npm run check:r1:extract
```

Results:

- A1 coverage: **26/26**.
- Emitted schema slots: **56**.
- Confidence: **10 high / 18 derived / 24 OpenDesign fallback / 4 alias**.
- Package quality: **100 / 100** (15 checks, 0 failing).
- Capture contract: **31 checks passed**.
- Extractor suite: **17 checks passed**.
- TypeScript scripts: strict typecheck passed twice through the two check targets.
- Fresh validation: **passed** — no guard violations.
- Determinism after overrides: `tokens.source.json` remained
  `ef04f1ec2d6d770bb371c73baacf89e12518a1a3ac3a26c96c989bf70047bf14`
  and `extraction-report.json` remained
  `3d4ff9642d9cb1c23e4185d561bc02d57599f4d719758c31583f390794722fbb`
  across a second extraction.

The first sandboxed `tsx` CLI emission could not create its local IPC socket
(`listen EPERM` under `/tmp/tsx-1000`). Re-running the same local command with the
required sandbox approval succeeded; this was an execution-environment constraint,
not a package failure.

## Independent `SYD-Next` oracle

Only after emission, the human-authored implementation at
`workspace/spaceapps/projects/syd/website/` was inspected. It was not used as an
extractor input.

### Confirmed matches

| Concern | Figma-derived package | `SYD-Next` evidence | Verdict |
| --- | --- | --- | --- |
| Action color | `--accent: #6460be` | `--secondary: 243 42% 56%` → `#6460be`; used for CTAs and most headings | Override confirmed |
| Body ink | `--fg: #141414` | `--black: 0 0% 8%` → `#141414`; used for page copy | Override confirmed |
| Connective green | `--border: #95cf9a` | `--primary: 125 38% 70%` → approximately `#95d09a`; used on header, sections, pricing rules, and FAQ | Override confirmed; HSL rounding accounts for one-channel drift |
| Font roles | Lato display + body | `--heading` and `--body` both Lato | Exact semantic match |
| Desktop content | 1168px column + 56px gutters | `max-w-7xl` (1280px) with `lg:px-14` (56px) | Exact geometry match |
| Phone gutter | 16px | `px-4` | Exact geometry match |
| Section rhythm | 112px desktop / 64px phone | repeated `lg:py-28` / `py-16` | Exact geometry match |
| CTA shape | violet, 16px radius, 48–52px high | `bg-secondary`, `rounded-2xl`, explicit 48px or content-derived 52px controls | Match |
| FAQ role | green row dividers, violet affordances | `border-primary`, secondary action styling | Match |

### Findings, not automatic failures

1. **Canvas compression.** The package keeps declared paint style `bg` at
   `#f8f8f8`; the implementation sets the page/root background to white and uses
   `#f8f8f8` explicitly only on the footer. The Figma frames also contain many raw
   white sections but no separate declared white surface style. A later schema or
   per-file decision may need two light canvas roles; R1 does not invent one.
2. **Second green has no safe slot.** Figma style `apoio` (`#72ad77`) corresponds
   closely to the implementation's `--support` (`#72ac78`) and appears on pricing
   emphasis. Mapping it to `--success` would misstate its semantics, so it remains
   documented unmapped evidence rather than a forced token.
3. **Type maximum differs.** `SYD-Next` defines a 56px global `h1`; the selected
   Figma frames' largest repeated Lato rung is 50px. The package correctly keeps
   the Figma-derived 50px value. The implementation's 28/40px headings and 16/18px
   body tiers otherwise align with the captured ramp.
4. **Component metrics drift.** The implementation uses 48px contact fields and
   12px pricing-card radii; Figma measures 56px fields and 8px pricing-card radii.
   The package fixture follows Figma.
5. **Behavior is code-only evidence.** The implementation adds a sticky/hiding
   header, a five-second testimonial rotation, and 200ms accordion animation. The
   reactions capture cannot establish those behaviors, so R1 does not promote them
   into captured motion tokens.
6. **Generic dark scaffold is not a SYD theme.** `global.css` includes shadcn-style
   `.dark` defaults, but the rendered root supplies no SYD dark-mode behavior. The
   Figma capture declares no dark axis, so omitting a dark package theme is honest.
7. **Topology differs.** Figma includes the professional-card carousel. A
   `Doctors.tsx` implementation exists, but the patient page does not mount it and
   its content/styles are generic English/blue placeholders. This confirms why the
   implementation is an oracle, not extraction truth.

## R1 acceptance

Passed. One authorized capture made exclusively through the pinned independent
fork interface replays offline into a complete, guard-green OpenDesign package.
Every authored value traces to a variable, style, node measurement, or explicit
override. No fork source was copied, no capture evidence was rewritten, no hidden
official-MCP call was made, and schema fallbacks remain explicitly distinguished
from Figma evidence.
