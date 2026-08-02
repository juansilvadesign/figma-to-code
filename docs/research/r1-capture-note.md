# R1.2 — live capture (SYD), 2026-07-31 / 2026-08-02

Status: **complete.** `docs/research/syd/` holds all nine payload roles across 14
artifacts and `loadCaptureBundle` accepts it offline with zero further MCP calls
— the R1.2 exit criterion. Seven of nine roles had been specified wrongly by
R1.1; all are now shaped from observed replies.

No value in this note was guessed. Everything is read from captured bundles
(gitignored, private-local).

## 0. Two captures, and why the second one is authoritative

The first capture (2026-07-31) read SYD from **`Landing Pages`** — a 33-page
agency portfolio file where SYD is page `52:435`. That file's SYD page is a
**copy**: its tokens are `remote: true` references, so every document-local read
came back empty and SYD looked tier-3 "no design system".

The second capture (2026-08-02) reads the **`SYD (SaveYourDay) - Spaceapps`**
source file, page `3-LP` (`1068:5433`). That file *is* the library the copy was
pointing at. The Paciente frames are byte-for-byte the same design — identical
dimensions, 1280 × 9410 and 375 × 11759 — and the operator confirmed both files
carry the same landing pages.

| | `Landing Pages` (copy) | `SYD (SaveYourDay)` (source) |
| --- | --- | --- |
| Bundle | `docs/research/syd-landing-pages-copy/` | **`docs/research/syd/`** |
| Local paint styles | **0** | **11**, with resolved values |
| Local variables | 15 collections, none SYD's | **`Size`** (Laptop/Tablet/Mobile) + **`Typograph`** |
| Extraction tier | 3 — measure everything, `derived` | **1 + 2 — `high`** |
| Roles captured | 7 of 9 (no exports) | **9 of 9** |

The first bundle is kept: it is the evidence for §3's remote-library finding,
which is the more generalizable result. The second is the extraction input.

## 1. Preflight — passed, and the pin moved

`npm run check:r1:preflight` was added in this session
([`scripts/preflight-capture.ts`](../scripts/preflight-capture.ts)) so the gate is
repeatable and fail-closed rather than a one-off checklist.

| Check | Result |
| --- | --- |
| Fork commit | `3546719` — **two docs-only commits ahead of the R1.1 pin `956a6af`** |
| Package version | `0.3.5` ✔ |
| `dist/server.js` SHA-256 | `d8cf09aa…` ✔ byte-identical |
| Plugin name / id / api / documentAccess | ✔ all identical |
| Plugin `manifest.json` / `code.js` SHA-256 | `6c7e43e9…` / `4188c501…` ✔ |
| Local relay | `127.0.0.1:3055` listening ✔ |
| Live runtime | fork `dist/server.js` under bun (PID 447069), **not** the npm package ✔ |
| Required read tools | **10/10** present of 48 advertised ✔ |
| Capability fingerprint | `6ec10c8a2360879c1d8a4a98b86d405101f78b6d4645e34f86b44a74c6358802` |

**Pin advanced `956a6af` → `3546719`** as a deliberately accepted compatible
release. `956a6af` is a verified ancestor; the delta is `ROADMAP.md` + `TASKS.md`
only (506 insertions, 0 deletions, no `src/`, `dist/`, or plugin change), so every
executable byte R1.1 froze is unchanged. Recorded in
[`CAPTURE-CONTRACT.md`](../CAPTURE-CONTRACT.md) § Runtime fingerprint.

The live fingerprint necessarily differs from the synthetic fixture's
`3a16d7c5…`, which uses documented stand-in schema hashes.

## 2. Source

`Landing Pages` (document `0:0`) is a **33-page multi-client portfolio file**, not
a SYD-only file. SYD is page `52:435`, 15 children: three parallel audience tracks
(PACIENTE / Profissional / RH), each an `Assets` + `Wireframe` + `LP` section trio,
plus standalone `Navbar / 2 /`, `Dropdown`, and `Menu`.

Representative frames (Paciente track, per operator decision):

| Node | Name | Size | Purposes |
| --- | --- | --- | --- |
| `52:7799` | Paciente | 1280 × 9410 | desktop-frame, interactive-root, token-measurement |
| `52:8263` | Paciente | 375 × 11759 | mobile-frame, token-measurement |

The other 32 pages carry other clients' names and data, so this capture is
`private-local` / `containsPrivateContent: true` and stays gitignored. Only this
note is committed.

## 3. The headline finding — SYD's tokens live in a remote library

The document-wide reads look like a file with no design system. They are wrong,
and each is individually honest:

- `get_styles` → **completely empty**: 0 colors, 0 texts, 0 effects, 0 grids.
- `get_variables` → `supported: true`, `complete: true`, 15 collections, 53
  variables — and **not one belongs to SYD**. They are other clients'
  collections (PHR Advogados, JK Construfaz, RPN, …), mostly prototype toggles
  (`Banner`, `NavBar show`), not tokens.

Taken alone these would classify SYD as EXTRACTION-GUIDE tier 3 ("no token
system, measure everything"). **That conclusion would be wrong.**
`get_node_variables` on the desktop frame reports **137 variable bindings and 888
style references**, and the style entries carry **`remote: true`** — 636 of 639 on
mobile. SYD's design language lives in an **external Figma library**, which the
document-local reads cannot see by construction.

Real token names, recovered only from the node reads:

| Kind | Names (count on desktop) |
| --- | --- |
| Paint styles | `secundaria` (473), `atencao` (248), `texto-lp` (67), `primaria` (16), `apoio` (14), `placeholder` (8), `card` (4) |
| Generic scale | `Gray/300`,`400`,`600`,`700`, `Brand/600`, `Base/White`, `Shadows/shadow-xs` |
| Variable bindings | `Body` (74), `Heading` (31), `Color Neutral/neutral lighter` (11), `Button` (9), `Background color/primary` (7), `Text/alternate` (3), `Color Neutral/black` (1), `width` (1) |
| Other | 8 TEXT styles, 3 EFFECT styles |

**Load-bearing gap:** the root frame is bound to `VariableID:52:21158` (`width`,
value `1280`), and that variable **does not appear anywhere in the `complete: true`
`get_variables` reply**. A document-wide variables read that declares itself
complete therefore cannot be treated as the file's token census. Any extractor
that trusts `get_variables` alone will silently produce a tokenless package for
library-driven files — likely the common case for agency work.

## 4. R1.3 answered early — field coverage of `get_node_info`

Measured across all 503 nodes of `52:7799`:

| Node type | Count | Fields the fork returns |
| --- | --- | --- |
| FRAME | 253 | `id, name, type, boundVariables, absoluteBoundingBox, children, fills, strokes, cornerRadius` |
| TEXT | 143 | `… characters, style` |
| INSTANCE | 53 | `… fills, strokes, cornerRadius` |
| GROUP | 22 | `id, name, type, absoluteBoundingBox, children` |
| ELLIPSE | 20 | `… fills, boundVariables` |
| RECTANGLE | 12 | `… fills, cornerRadius, strokes` |

**Sufficient today:**

- **Identity colors** — `fills`/`strokes` resolve to hex (`#ffffff`, `#95cf9a`).
- **Type ramp (11 A1 slots)** — `TEXT.style` carries `fontFamily`, `fontStyle`,
  `fontWeight`, `fontSize`, `letterSpacing`, **`lineHeightPx`**. Observed ramp:
  display **Genty 96**, body **Lato 16/400** (28 uses), sizes 96·56·50·40·38·24·20·18·16·14·12·10.
  Stray `Roboto`/`Inter`/`SF Pro Text`/`Product Sans` appear in a few nodes and
  should be treated as UI-kit residue, not brand fonts.
- **Container + gutters (A1)** — from bbox arithmetic. Desktop frame `x=7300 w=1280`,
  `Container` `x=7356 w=1168` → `--container-max: 1168px`,
  `--container-gutter-desktop: 56px`. Mobile sections are full-bleed at 375 with a
  343 content column → 16px gutters. (1168 recurs 29×, 343 recurs 72×.)
- **Radius** — `cornerRadius` on 58 nodes.

**Absent — confirmed by probing every node:**

| Field | Impact |
| --- | --- |
| `layoutMode`, `itemSpacing`, `paddingLeft/Top/…` | **No auto-layout data at all.** `--space-*` (A2) unevidenced; `--section-y-*` (A1 ×3) must be derived from bbox deltas between sibling section frames, never read directly. |
| `effects` | `--elev-*` (A2) unevidenced from nodes. Effect *names* survive via `get_node_variables` (`Shadows/shadow-xs`), values do not. |
| `opacity` | Not recoverable. |

So the answer to TASKS.md's open question "can current node bounding boxes support
every mandatory structural slot?" is **yes for container/gutter/type-ramp, no for
section rhythm without bbox-delta derivation, and no for spacing/elevation values**.
None of this requires a fork change — bbox arithmetic covers the A1 set, and the
missing pieces map to A2 slots the emitter can fall back on. An additive
auto-layout field upstream would upgrade `--space-*` from omitted to evidenced;
that is a genuine but optional enhancement request, not an MVP blocker.

## 5. Six of nine payload roles were specified wrongly — all now fixed

**Status: fixed 2026-07-31.** All 13 captured payloads validate, the offline
suite is at 29 checks (was 25), and preflight stays green.

These are **this project's** adapter bugs, not fork gaps. The fork's replies are
richer and well-formed and declare their own coverage; nothing needs to land
upstream for them. R1.1 derived the validators from the fork's prose docs, and
only live traffic showed how far off that was:

| Role | R1.1 assumed | Fork actually returns |
| --- | --- | --- |
| `document` | `currentPage.children` | `children` at top level; `currentPage` holds identity + true `childCount` |
| `variables` | `collections[].variables` | `collections[].modes[].variables` — values are per mode |
| `styles` | one `styles[]` + `count` | four typed inventories `colors`/`texts`/`effects`/`grids` + `counts{}` |
| `components` | `families`, `coverage{}` wrapper | `nameFamilies`; scope/completeness/pages at top level |
| `node-variables` | `nodeId`, `unresolvedVariables` | `rootNode{id,name,type}`, `unresolvedBindings` |
| `reactions` | `nodeId`, `reactions[]`, `reactionCount`, `limitations[]` | `nodes[]`, `nodesCount`, `nodesWithReactions`, `coverage.limitation`, `errors[]` |

Only `pages` and `node` were correct. `image-export` remains untested (§6).

A page index also reports `childCount: null` with
`childCountStatus: "not_requested"` — an explicit absence that the validator now
accepts rather than rejecting as a malformed count.

### A. The reactions argument check was unsatisfiable

`capture-contract.ts` required
`toolCall.arguments.nodeId === artifact.nodeId`, which **no faithful reactions
capture could satisfy**, because `get_reactions` takes `nodeIds: [...]`. It now
accepts a single-element `nodeIds` array for that role and requires it to name
exactly the node the artifact is filed under — locked in by a new test.

### B. The `complete: true` rule was too strict for node-variables

`CAPTURE-CONTRACT.md` § Coverage policy requires `get_node_variables` to report
`complete: true`, and the suite asserts "complete:false variable evidence is
rejected". Live, **both** frames return `complete: false` for a trivial reason:

> "3 style references could not be fully resolved; inspect each entry's
> resolutionStatus (\"mixed\" means the node carries more than one style on that
> property)."

Desktop: `unresolvedBindings: 0`, `unresolvedStyles: 3` of 888 (885 resolved).
Mobile: same, 3 of 639. Rejecting 885 resolved references because 3 are `mixed`
is a false negative of exactly the kind the contract's own "no false negatives
from partial reads" rule exists to prevent.

The policy now distinguishes them: `complete: false` is accepted for
`node-variables` **only** when the fork quantifies the unresolved subset
(`unresolvedBindings` / `unresolvedStyles`, at least one non-zero) and the
manifest records the matching limitation. Unquantified partials, and a
`complete: false` claiming nothing unresolved, both stay fatal. The synthetic
fixture now carries a quantified-partial mobile read so the accepting path is
covered, and two negative tests cover the rejecting paths.

## 6. What was captured

Seven of nine roles, `docs/research/syd/raw/` (gitignored):

| Role | File(s) | Coverage as declared by the fork |
| --- | --- | --- |
| pages | `pages.json` | `childCountIncluded: true`, 33 pages |
| document | `document.json` | current page, `childrenTruncated: false`, 15/15 |
| variables | `variables.json` | `supported: true`, `complete: true`, 0 resolution issues |
| styles | `styles.json` | document-wide, all four inventories empty |
| components | `components.json` | scoped to `52:435`, `complete: true`, 13 components |
| node | `nodes/52_7799.json`, `nodes/52_8263.json` | 503 / 452 nodes |
| node-variables | `node-variables/52_7799.json`, `52_8263.json` | `complete: false` — see §5B |
| reactions | `reactions/52_7799.json`, `52_8637.json`, `52_10282.json`, `52_10283.json` | `complete: true`; limitations preserved even at 0 |

Reaction evidence is real: 13 interactive nodes on the desktop LP
(`Timeline Item` MOUSE_ENTER, `Accordion Item` ON_CLICK, `Help icon` ON_HOVER, all
`CHANGE_TO` variant transitions), 13 on `Dropdown`, 1 on `Menu`, 0 on `Navbar` —
the empty one still carrying its limitation string. Their `path` fields also
expose the desktop section order: `Navbar / 2 /` → `Header / 30 /` →
`Layout / 299 /` → `Layout / 121 /` (Timeline) → `Pricing / 20 /` →
`Gallery / 23 /` → `Contact / 9 /` → `FAQ / 2 /`.

Components are **hand-authored, not a pasted kit**: all 13 sit in a single
`authoringSession` (`52`), matching the page's own node-id prefix, across 4
families (`Timeline Item` ×8, `Accordion Item` ×2, `Profissional` ×2, `card` ×1).
Note for R1.5: the guard wants **≥4 component groups** and this file yields exactly
4 — no margin.

### The export blocker, and how it was removed

On the first pass `image-export` and `screenshot` were **missing for both
frames**, because the operator harness materializes images: `export_node_as_image`
returned a rendered PNG, never the raw base64 reply. Re-encoding decoded bytes
into a synthetic envelope would assert an unverifiable claim about the original
reply, so it was not done.

That was a **capture-pipeline finding, not a fork limitation** — and it is now
resolved. [`scripts/capture-figma.ts`](../../scripts/capture-figma.ts) is the
raw-reply client: it spawns the pinned fork's own `dist/server.js`, speaks MCP
over stdio, and writes each reply verbatim. Nothing renders the image on the way
past, so the base64 envelope survives to disk and the screenshot is decoded from
the stored bytes and checked against them. The fork needed no change.

## 6b. The second capture — all nine roles

`docs/research/syd/`, 14 artifacts, `bundle ok — 12 payloads, 2 screenshots`:

| Role | Artifact | Coverage as declared by the fork |
| --- | --- | --- |
| pages | `pages.json` | `childCountIncluded: true`, 6 pages |
| document | `document.json` | page `1068:5433`, 16/16 children, not truncated |
| variables | `variables.json` | `supported: true`, `complete: true`, **2 collections, 5 variables** |
| styles | `styles.json` | **11 colors + 1 effect**, all local, values resolved |
| components | `components.json` | scoped, `complete: true` |
| node | `nodes/1082_1875.json`, `nodes/1155_5211.json` | 142 KB / 128 KB |
| node-variables | `node-variables/1082_1875.json`, `1155_5211.json` | `complete: false`, quantified: 0 unresolved bindings, 3 unresolved styles (§5B) |
| **image-export** | `exports/1082_1875.json`, `1155_5211.json` | image content blocks, 4.29 MB / 1.73 MB base64 |
| **screenshot** | `screenshots/1082_1875.png`, `1155_5211.png` | **1280 × 9410** and **375 × 11759**, decoded and byte-matched |
| reactions | `reactions/1082_1875.json` | `complete: true`, limitation preserved |

**A seventh wrongly-specified role.** R1.1 assumed `export_node_as_image` returns
`{nodeId, format, mimeType, encoding, data}`. It actually returns an **MCP image
content block** — `{type: "image", data, mimeType}` — with no node id and no
`encoding` field. The exported node is knowable only from the manifest's
`toolCall.arguments.nodeId`. Fixed, with two negative tests.

## 7. Style names resolve to values — with one hole

Because SYD's tokens are remote, values must be recovered by joining
`get_node_variables` (which gives the style *name* per node) to `get_node_info`
(which gives that node's resolved `fills`/`strokes`/`style`). Tested offline
against the captured bundle: **22 of 26 distinct styles resolve**, including the
whole A1 identity set —

| Slot | Style | Value |
| --- | --- | --- |
| `--bg` | `bg` | `#f8f8f8` |
| `--surface` | `card` | `#ececec` |
| `--fg` | `texto-lp` | `#141414` |
| `--accent` | `secundaria` (473 refs) | `#6460be` |
| `--border` | `Gray/300` | `#d5d7da` |
| `--muted` | `Gray/500` | `#717680` |

plus `primaria` `#95cf9a`, `apoio` `#72ad77`, `placeholder` `#000000`,
`Brand/600` `#7f56d9`, `Base/White`, `Gray/600`, `Gray/700`, and 5 TEXT styles
(`Text sm/Regular` → Inter 400 14px/20, etc.).

**The hole:** `get_node_info` returns only **31 % (desktop) / 40 % (mobile)** of
the nodes `get_node_variables` scans (503 of 1638; 452 of 1142), so only 20–26 %
of style references land on a node whose value is readable. Four styles resolve
on neither frame:

| Refs (desktop / mobile) | Type | Name |
| --- | --- | --- |
| **248 / 215** | PAINT | **`atencao`** |
| 15 / 15 | PAINT | `Gray/400` |
| 3 / 3 | — | `(mixed)` |
| 3 / 3 | EFFECT | `Shadows/shadow-xs` |

`atencao` is the second-most-used colour in the file and is used *only* below
`get_node_info`'s depth. The join is a workaround with a demonstrable gap.

**Smallest generic fork request:** have `get_node_variables` return the resolved
**value** beside the resolved name for style references. It already resolves
`styleName`, `styleType`, `remote`, and `resolutionStatus`; adding the
paint/text/effect value removes the cross-read join entirely and fixes styles
used below `get_node_info`'s depth. Additive, read-only, no new tool. Optional
follow-ups (A2 slots only): auto-layout fields and `effects` on `get_node_info`.

Nothing needs re-capturing for this — when it ships, only the two
`node-variables` replies need re-reading.

### 7b. On the source file the join is not needed

`get_styles` on the source file returns the **paint value inline**, so the whole
name→value join is bypassed for local styles:

| Slot | Style | Value | Confidence |
| --- | --- | --- | --- |
| `--bg` | `bg` | `#F8F8F8` | `high` |
| `--surface` | `card` | `#ECECEC` | `high` |
| `--fg` | `texto-lp` | `#141414` | `high` |
| `--accent` | `secundaria` (482 refs) | `#6460BE` | `high` |
| — | `primaria` | `#95CF9A` | `high` |
| — | `apoio` | `#72AD77` | `high` |
| — | **`atencao`** (248 refs) | **`#F9B800`** | `high` |
| `--danger` | `erro` | `#D92D20` | `high` |
| — | `texto` | `#000000` | `high` |
| — | `placeholder` | `#000000` @ 0.5 | `high` |

The first four **independently reproduce** the values the lossy join recovered
from the copy — and `atencao`, the style the join could *not* resolve on either
frame, resolves here at `high`. **841 of 902 desktop style references (93 %) are
local**; the remaining 61 are a third-party UI kit (`Gray/*`, `Brand/600`,
`Base/White`, `Shadows/shadow-xs`, `Text sm/*`, `Avatar user square/*`) and still
need the join or an override.

Also newly `high` instead of derived:

- **`--font-display` / `--font-body` = `Lato`** — declared in the `Typograph`
  collection (`Heading`, `Body`, `Button`, all Lato).
- **Breakpoints** — the `Size` collection declares `width` **1280 / 768 / 375**
  with a matching `breakpoint` string per mode, feeding the responsive
  `--section-y-*` and `--container-gutter-*` slots directly instead of by
  inference. This is the `Desktop/Tablet/Phone` mode axis EXTRACTION-GUIDE
  Phase 2 anticipated.

Still unevidenced and correctly omitted: the `perfil` effect style carries only
`id`/`name`/`key` with **no value**, so `--elev-*` (A2) stays absent; there are
**0 text styles**, so the 11-slot type ramp still comes from `TEXT.style` on
nodes and stays `derived`.

## 8. Next

1. **R1.4** — implement the offline extractor against `docs/research/syd/`.
   Resolve colors and fonts from `get_styles` + `get_variables` (`high`), the type
   ramp from `TEXT.style` (`derived`), and rhythm/container from bbox arithmetic
   cross-checked against the declared `Size` widths.
2. It must not treat a `complete: true` `get_variables` reply as proof that a file
   has no tokens (§3) — the copy bundle is the regression fixture for that.
3. **R1.5** — the comparison oracle is checked out at
   `workspace/spaceapps/projects/syd/website/` (`SYD-Next`). Keep it out of
   extraction; use it only after emission.
