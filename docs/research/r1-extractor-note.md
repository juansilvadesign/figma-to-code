# R1.4 — the offline extractor

**Date:** 2026-08-02 · **Status:** shipped · **Gate:** `npm run check:r1:extract`

Turns the R1.2 capture bundle into `design-systems/<slug>/source/tokens.source.json`
with no MCP calls, no network, and no clock. This note records the decisions and
the findings, because the capture bundle it was built against is gitignored and
does not survive a fresh clone.

## What runs

```bash
npm run extract -- --capture docs/research/syd/capture-manifest.json \
  --name "SYD (SaveYourDay)"       # [--out] [--report] [--stamp <iso>] [--dry-run]
npm run check:r1:extract           # typecheck + 17 offline checks
```

Three files, one direction, no back-references:

| File | Job |
|---|---|
| `scripts/lib/figma-normalize.ts` | **The fork-adapter boundary.** The only file that reads a raw fork payload. When the fork's reply shape changes, only this changes. |
| `scripts/lib/token-resolution.ts` | The staged name → slot resolver and the bilingual role table. |
| `scripts/lib/extract-tokens.ts` | The pure transform. No I/O. Same inputs → byte-identical output. |

## Result on SYD

**26 of 26 mandatory slots resolved.** 9 `high`, 19 `derived`, 28 A2/B slots
deliberately omitted so the emitter applies its own fallbacks and aliases.
Stages used: 1 exact, 8 role-map, 19 heuristic, **0 override**.

| Group | Confidence | Where it came from |
|---|---|---|
| 6 identity colors + `--danger` + `--warn` | `high` | declared paint styles (`bg`, `card`, `texto`, `placeholder`, `primaria`, `erro`, `atencao`) |
| `--font-display`, `--font-body` | `high` | the `Typograph` variable collection (`Lato`) |
| 11-slot type ramp | `derived` | measured off text nodes — **the file declares 0 text styles** |
| section rhythm, container, gutters | `derived` | bbox arithmetic on the two captured frames |
| `--border` | `derived` | most frequent stroke — see finding 1 |

Desktop measured cleanly: `padTop` 112px on 9 of 12 sections, container 1168px,
gutter 56px. Tablet has no captured frame, so it interpolates on the *declared*
widths from the `Size` collection (375 → 768 → 1280) and rounds to whole pixels.

## The two decisions that shaped the output

Both were settled by interview before any code was written, and neither is
recoverable from reading the code.

### 1. The role map is bilingual (en + pt-BR)

SYD's palette is `primaria`, `secundaria`, `texto`, `texto-lp`, `bg`, `card`,
`apoio`, `placeholder`, `erro`, `atencao`. An English-only role table resolves
**none** of them, which would push every pt-BR file through hand-written
overrides forever. The table now carries both languages, matched on a
diacritic-stripped key so `atenção` and `atencao` are one entry.

**One deliberate exclusion:** `secundaria` / `secundario` are *not* mapped to
`--muted`, even though English `text/secondary` is. In a pt-BR brand palette
"secundária" is the second *brand* color, not muted body copy — SYD's is a
saturated indigo. Bare English `secondary` is likewise unclaimed; only the
path-style `text/secondary` resolves, via the group/variant stage.

**Risk accepted:** the table was written while looking at SYD, so R3's
second-file test is weaker than it looks. `extraction-report.json` records which
stage resolved each slot precisely so that pass can measure how much of the map
was hindsight.

### 2. The type ramp uses declared-font text only

16 of 145 desktop text nodes are not `Lato`: an Untitled UI form kit (Inter), App
Store badges (SF Pro Text / Product Sans), a Roboto price, and a Genty display
numeral used as decorative section numbers "1" "2" "3". These are pasted
third-party artifacts, not the design language.

Unfiltered, `--text-4xl` would be **96px** off those three decorative numerals
and `--text-3xl` **56px** off a single Roboto price. Filtered to the families the
`Typograph` collection declares, the ramp is 10 / 14 / 16 / 18 / 24 / 28 / 40 /
50 — with `--text-4xl` = 50px, the real hero size. Every exclusion is written
into the artifact's limitations.

Sizes are *projected*, not copied: 10 distinct Lato sizes across both frames onto
8 rungs. Adjacent sizes with the smallest ratio merge into the more-used member,
and the merge is recorded — `--text-sm` says `12px merged into this rung (ratio
1.167, 8 node(s) vs 45)`.

**Guard added after the fact:** if the declared-font filter would empty the pool
(a stale font variable naming a family nothing uses), it falls back to all text
and says so. Without it, that file would fail with a baffling "11 mandatory slots
missing" instead of one honest limitation.

## Two findings for R1.5 — not failures

### Finding 1 — `--border` is `#f8f8f8`, identical to `--bg`

No declared style claims a border role, so the conservative heuristic ran: the
most frequent stroke across the captured frames. That is `#f8f8f8` on 48 nodes —
the page background color. Card edges in this file are not visually distinct.

The extractor **records the collision rather than picking a prettier
runner-up** (`#95cf9a`, 21 nodes; `#ffffff`, 18). Choosing the second-place value
because the first looks wrong would be taste dressed as measurement. This is the
first genuine use case for `docs/research/syd/slot-overrides.json`, still empty.

### Finding 2 — the name won over usage, twice

Decided 2026-08-02: when name resolution and usage evidence disagree, the name
wins and the disagreement is recorded.

| Slot | Chosen by name | Usage | Unclaimed rival |
|---|---|---|---|
| `--accent` | `primaria` `#95cf9a` | 2 fill / 25 stroke | `secundaria` `#6460be` — **757 uses** |
| `--fg` | `texto` `#000000` | **0 recorded uses** | `texto-lp` `#141414` — 122 fills |

Both disagreements are written into the token's own `reason` and into
`extraction-report.json`'s `unmappedEvidence`, sorted by usage descending. R1.5's
comparison against `SYD-Next` therefore *starts* from the disagreement instead of
discovering it.

## Determinism

Verified byte-identical across runs on the real capture. There is no time field
in the artifact at all unless `--stamp <iso>` asks for one — the run clock is the
single explicitly-isolated value, and it is opt-in rather than opt-out.

## Schema authority

`TOKEN_SCHEMA` is loaded from open-design at runtime; the 56/26 counts appear
nowhere. The breakpoint set is read off the schema's own slot names too, so a
hypothetical `--section-y-ultrawide` is a hard error rather than a silent skip —
there is a test that appends exactly that slot and asserts the failure.

## What this does not do

- **No emission.** `npm run emit -- --brand syd` has never run; there is no
  `components.html`, `DESIGN.md`, or `tokens.css`. That is R1.5.
- **No `SYD-Next`.** The oracle at `workspace/spaceapps/projects/syd/website/`
  was deliberately not opened. Extraction stays independent of the
  implementation so the R1.5 comparison means something.
- **No effect or spacing values.** The fork reports effect *names*
  (`Shadows/shadow-xs`) but not values, and auto-layout padding/gaps are absent
  from every captured node. Both map to A2 slots, so they are omitted and the
  emitter's fallbacks own them. No fork change is required.
- **No Figma file key.** The fork's socket interface does not expose one, so
  `fileKey` in the manifest is just the document name again. The extractor
  refuses to publish it as a key and records the gap instead — R1.5's
  `evidence.md` must carry the URL by hand.
