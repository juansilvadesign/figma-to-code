# Figma → Code — Build Task Tracker

> **Open this first, every session.** This is the running implementation state for
> `figma-to-code`. Check a box only when its acceptance evidence exists. Deferred
> and v2+ work lives in [`ROADMAP.md`](ROADMAP.md); the original rationale and
> contracts live in [`docs/BUILD-PLAN.md`](docs/BUILD-PLAN.md); extraction rules
> live in [`docs/EXTRACTION-GUIDE.md`](docs/EXTRACTION-GUIDE.md).
>
> **Re-baselined 2026-07-28.** The original plan was written before the local
> [`talk-to-figma-fork`](../talk-to-figma-fork/) had a trustworthy read layer and
> before [`ai-website-cloner-template`](../ai-website-cloner-template/) shipped its
> OpenDesign emitter, validator, Astro target, and visual-QA workflow. The fork is
> now a pinned external tool dependency; the cloner is a pinned reuse baseline.

## Project boundary — load-bearing

`figma-to-code` and `talk-to-figma-fork` are separate products:

| This repository owns | [`talk-to-figma-fork`](../talk-to-figma-fork/) owns |
| --- | --- |
| Read-only capture plan and immutable evidence bundle | MCP schemas and result contracts |
| Payload normalization and fork-version adapters | MCP server, relay, Figma plugin, and connection lifecycle |
| Figma evidence → OpenDesign token/component mapping | Generic Figma reads, writes, exports, progress, and errors |
| OpenDesign emission and validation | Its own regression fixtures, packaging, and releases |
| Optional Astro generation and visual QA | No knowledge of this capture schema, OpenDesign, or generated code |

Dependency flows one way:

```text
figma-to-code ──versioned read-only MCP calls──▶ talk-to-figma-fork ──▶ Figma
```

Hard rules:

- Never import the fork's `src/`, plugin code, or internal helpers into this project.
- Never patch/reimplement a missing generic Figma read inside this repository.
- If capture exposes a tool gap, implement and verify the smallest generic change in
  the fork, rebuild/version it there, then update the pin and adapter here.
- The fork never imports this project, its capture manifests, OpenDesign, or Astro.
- This pipeline never calls the fork's setters, creators, deletes, or write-oriented
  prompts. A future Code → Figma workflow would be a third project.

## Two levels of done — do not conflate them

- **Importer MVP — the original goal, SHIPPED 2026-08-10.** An authorized Figma
  file was captured once through the local plugin, replayed offline, and emitted as
  a guard-green OpenDesign package at `design-systems/syd/`.
- **Astro page MVP — the expanded goal, NOT shipped.** Select a desktop/mobile frame
  family from that same capture and produce a static-first Astro page that consumes
  the validated package, builds cleanly, and has final 1440px/390px visual evidence.

The package remains at `0.0.0` because generalization is still ahead, but **R1 is
complete**. The immutable SYD capture replays offline, extraction resolves 26/26
A1 slots deterministically, and R1.5 emits the first Figma-derived rich package:
56 schema slots, 65 component selectors, seven detected groups, zero undeclared
token references, and OpenDesign package quality 100. The Importer MVP has shipped;
the Astro page MVP has not.

## Planning frame

- **Outcome:** authorized Figma source → read-only capture through a pinned independent
  MCP tool → evidence-backed OpenDesign system → optional Astro implementation, with
  no guessed tokens and no paid official Figma MCP dependency.
- **Capacity constraint:** one maintainer using the existing local workspace,
  local Figma plugin/relay, and checked-in tooling. Do not add a hosted service or
  paid plan to make the MVP work.
- **Schedule:** backlog-paced; no calendar deadline or cash budget has been supplied,
  so this tracker does not invent either. Scope is re-cut at every release checkpoint.
- **Scope is the variable:** preserve the evidence and acceptance gates; defer extra
  targets, automation, and fidelity features when they threaten the next useful
  release.

## Pinned dependency and reuse baselines

| Project | Relationship | Baseline inspected 2026-07-28 | Contract used here |
| --- | --- | --- | --- |
| [`talk-to-figma-fork`](../talk-to-figma-fork/) | **Independent runtime dependency** | `5e0c869` (was `956a6af` → `3546719`; both advances docs-only, executable hashes verified identical) | Read-only MCP tools: `get_pages`, bounded `get_document_info`, `set_current_page`, `get_variables`, `get_styles`, scoped/summary `get_local_components`, `get_node_info`, `get_node_variables`, `get_reactions`, and `export_node_as_image` |
| [`ai-website-cloner-template`](../ai-website-cloner-template/) | **Vendored generic-code/workflow baseline** | `b7b4dda` (`0.4.0`) — held; its `HEAD` has since grown a `src/clones/<slug>/` multi-clone architecture this project does not need until R3 | Emitter/validator, Astro scaffold, design-system-first order, component specs, static-first rules, and 1440px/390px QA |
| [`open-design`](../../skills/open-design/) | **Schema/validation dependency** | `3447f60a3` | Live token schema and guard/rendering contracts; code discovers the contract rather than encoding the observed 56/26 counts |

**Fork dependency rule:** invoke the built fork as an MCP process and treat replies as
external versioned payloads. Do not copy or import its server/plugin implementation.
Record the fork commit/version, server bundle hash, plugin identity/API, and capability
fingerprint in every capture manifest. Until the fork exposes a formal runtime
fingerprint, record the measurable pieces explicitly.

**Vendored reuse rule:** copy generic cloner code only from a named commit, record
provenance, and test parity. Never copy its current working tree wholesale: it may
contain uncommitted, brand-specific work.

**Runtime rule:** the published `cursor-talk-to-figma-mcp@latest` does not contain the
fork's read-layer work. Live extraction uses the fork's built `dist/server.js`, its DEV
plugin, and its local relay—not the npm package. Preflight the expected runtime before
capture and fail closed on a mismatch.

**Scheduling rule:** the fork maintains its own roadmap. This project does not wait for
unrelated fork testing, distribution, or authoring milestones; it upgrades the pin only
for a required read fix or a deliberately accepted compatible release.

## Benefit-delivering release sequence

| Release | Value shipped | Riskiest assumption retired |
| --- | --- | --- |
| **R0 — Proven local loop** | A known-good source artifact emits and validates inside this repository | The reusable emitter/validator and OpenDesign paths still work at this repo depth |
| **R1 — Importer MVP** | One real Figma file becomes a reproducible, guard-green OpenDesign package | The pinned independent fork contract exposes enough declared and measured evidence to satisfy the live schema honestly |
| **R2 — Astro page MVP** | One selected Figma page/frame family becomes compiling, static-first Astro with visual evidence | The cloner's page-building workflow transfers from browser evidence to Figma evidence |
| **R3 — Generalized release** | A second unrelated file succeeds and the project is documented/releasable | The resolver is not merely a one-file collection of overrides |

After each release: record what was learned, re-rank the remaining scope, and detail
only the next release. Later releases stay coarse until the preceding checkpoint.

---

## ✅ Done so far — decisions and external capability

- [x] **Project seam chosen:** Figma extraction writes the same
  `source/tokens.source.json` contract the website cloner consumes.
- [x] **Destination chosen:** OpenDesign rich package; its own validator is the
      acceptance gate.
- [x] **Dependency boundary chosen:** `talk-to-figma-fork` remains an independent MCP
      tool. This project consumes its pinned read contract and owns all capture,
      normalization, OpenDesign, and code-generation behavior.
- [x] **Primary read lane chosen:** the pinned local fork runtime, eliminating the
      original official-MCP call-budget blocker for MVP without importing fork source.
- [x] **Downstream reuse now exists:** the cloner has shipped the generic emitter,
  validator, Astro foundation, static-first build guidance, and visual-QA contract.
- [x] **First live fixture chosen — SYD (2026-07-28).** Its landing page has an
  owned, human-designed desktop/mobile Figma source and an existing human-authored
  Next.js implementation (`zokuWebDesign/SYD-Next`), giving the importer both design
  intent and an implementation reference for end-to-end comparison.
- [x] **Scaffold exists:** package metadata, extraction guide, build plan, skill, and
  explicit throwing stubs were committed in `6d74f8f`.
- [x] **R0 shipped — proven local loop (2026-07-31).** The vendored scripts have no
  functional delta from `b7b4dda`; a Node 24 clean install re-emits the committed
  PsiAtiva compatibility fixture and passes OpenDesign at package quality 100.
  Evidence: [`docs/research/r0-build-note.md`](docs/research/r0-build-note.md).
- [x] **R1.1 shipped — immutable capture contract (2026-07-31).** Strict runtime,
  identity, coverage, hash, path, authorization, and payload boundaries load a
  sanitized synthetic bundle fully offline; 25 positive/negative checks pass.
  Evidence:
  [`docs/research/r1-capture-contract-note.md`](docs/research/r1-capture-contract-note.md).

- [x] **R1.2 shipped — nine-role SYD capture (2026-08-02).** Replays offline
  through `loadCaptureBundle` with zero MCP calls. Evidence:
  [`docs/research/r1-capture-note.md`](docs/research/r1-capture-note.md).
- [x] **R1.4 shipped — the offline extractor (2026-08-02).** 26/26 mandatory
  slots from the SYD capture, deterministic, 17 offline checks. Evidence:
  [`docs/research/r1-extractor-note.md`](docs/research/r1-extractor-note.md).
- [x] **R1.5 / R1 shipped — first Figma rich package (2026-08-10).** Three
  evidence-backed role overrides, 56 emitted slots, a seven-group component
  fixture, complete provenance ledger, and OpenDesign quality 100. Evidence:
  [`docs/research/r1-package-note.md`](docs/research/r1-package-note.md).

There are no throwing stubs left. `scripts/extract-figma-tokens.ts` is implemented.

## ▶ Next session — R2.4, freeze the SYD page topology

The package → Astro seam is closed (steps 1, 2, and 4 below). R2.3 chose
**in-process revalidation**, not a receipt: `--build astro` now emits the current
package, calls the exported validator on that exact directory, and only then
retargets `src/styles/global.css` and runs Astro. Six focused checks include the
failure-order negative; an isolated emitter CLI smoke also reached a real Astro build. Evidence:
[`docs/research/r2-brand-seam-note.md`](docs/research/r2-brand-seam-note.md).

The next task is step 3. Work only from the cached SYD frame family; do not write
page components until one desktop/mobile section spec records topology, verbatim
copy and assets, responsive relationships, and known behavior gaps.

R1 is closed. Do not recapture or revisit token heuristics unless R2 exposes an
actual evidence failure. Start the page MVP by retiring its next riskiest
assumption: that the cloner's generic Astro foundation can consume this private,
validated Figma package without importing brand-specific code.

Start here, in order:

1. [x] **Astro reuse shape decided (2026-08-10).** Minimal vendor at root pinned to
   `b7b4dda`, committed brand default `psiativa`, executable parity manifest, pin
   not advanced. Execute it exactly as specified — the file list, deltas, baseline
   hashes, and rationale are in
   [`docs/research/r2-astro-seam-note.md`](docs/research/r2-astro-seam-note.md).
   Do not re-derive the shape; do not copy the cloner's working tree or page code.
2. [x] **Validated brand seam shipped 2026-08-10.** `--build none|astro` lives on
   the emitter and defaults to the unchanged package-only path. `astro` re-runs the
   validator in-process, fails before mutation on any violation, retargets the exact
   first `@import`, and invokes Astro's build API. Evidence:
   [`docs/research/r2-brand-seam-note.md`](docs/research/r2-brand-seam-note.md).
3. **Next — freeze SYD page topology from the cached frames.** Record one section spec per
   desktop/mobile pair, verbatim copy/assets, responsive relationships, and known
   behavior gaps before writing `.astro` components.
4. [x] **Foundation proven 2026-08-10.** The static shell typechecks and builds
   against the committed `psiativa` package; `dist/index.html` carries all 56 token
   declarations, both scopes, and zero undeclared references. Run against `psiativa`,
   never `syd` — `design-systems/syd/` is gitignored, so a `syd`-pinned import cannot
   build on a clean clone or ever become a CI gate. Evidence:
   [`docs/research/r2-foundation-note.md`](docs/research/r2-foundation-note.md).

**R0 retrospective:** the source-agnostic emitter/validator transferred with zero
functional changes, the pinned OpenDesign schema currently resolves 56 slots, and the
compatibility fixture passes all 15 quality checks. The next riskiest assumption is
capture integrity, so R1 starts with the evidence contract rather than live calls.

**R1.1 retrospective:** the fork's public contracts are sufficient to freeze a
fail-closed evidence envelope without importing its implementation. The remaining
uncertainty is empirical payload sufficiency, so the next work is one private,
single-pass SYD capture—not extractor heuristics.

**R1.2 retrospective:** deriving payload validators from a dependency's prose docs
was the wrong bet — two of nine roles were specified incorrectly and only live
traffic revealed it. The deeper lesson is about *absence*: `get_styles` returned
empty and `get_variables` returned `complete:true` with no SYD data, and both were
honest, yet the file has a full token system in a remote library. **A complete
document-wide read is not a token census.** Structural sufficiency is better than
feared (bbox arithmetic + `TEXT.style` cover the A1 set) and auto-layout/effect
values are genuinely absent, but they map to A2 slots the emitter can fall back on —
so no fork change is required for MVP.

**R1 retrospective:** payload sufficiency was not the last hard problem; semantic
role assignment was. SYD's palette names disagree with the landing-page roles, so
three explicit, evidence-backed overrides were safer than either blind name trust
or raw frequency. OpenDesign also compresses a white canvas plus two greens into
fewer semantic slots; the honest result records the unused evidence instead of
mislabeling it. `SYD-Next` confirmed the core violet/ink/green decisions but also
diverged in component metrics, topology, and behavior, validating its role as an
oracle rather than an input. The next risk is the package → static Astro seam, not
more Figma reads.

---

## Release R0 — proven local emission loop

### 0.1 Vendor the proven generic code

- [x] Copy the cloner's committed emitter and validator from baseline `b7b4dda`;
      preserve behavior and add provenance only.
- [x] Diff both vendored files against that commit and record any intentional delta.
      Expected functional delta: none.
- [x] Make `npm run emit`, `npm run validate`, and a script typecheck work from a
      clean install.
- [x] Pin the runtime/dependency baseline with a lockfile; do not leave only
      floating lower bounds.

### 0.2 Prove the whole downstream contract

- [x] Install a known-good package fixture without relying on sibling uncommitted
      files.
- [x] Re-emit `tokens.css`, `design-tokens.json`, `tailwind-v4.css`,
      `components.manifest.json`, `manifest.json`, and
      `source/token-contract.report.json`.
- [x] Run the validator against the re-emitted package and save the exact command
      and result in the R0 build note.
- [x] Confirm `--od-root` works both by default in this workspace and when passed
      explicitly.
- [x] Confirm an intentionally missing A1 token fails with a useful token list.
- [x] Confirm an undeclared `var(--…)` in `components.html` fails validation.

**R0 acceptance — passed 2026-07-31:** a fresh checkout can install, re-emit the
fixture, typecheck the scripts, and pass the OpenDesign validator without touching
Figma. See [`docs/research/r0-build-note.md`](docs/research/r0-build-note.md).

---

## Release R1 — importer MVP

### 1.1 Freeze the capture contract before live extraction

Define one immutable capture bundle per source:

```text
docs/research/<slug>/
  capture-manifest.json
  raw/document.json                       # one selected page
  raw/documents/<safe-page-id>.json       # multi-page alternative
  raw/pages.json
  raw/variables.json
  raw/styles.json
  raw/components.json
  raw/nodes/<safe-node-id>.json
  raw/node-variables/<safe-node-id>.json
  raw/reactions/<safe-node-id>.json
  raw/exports/<safe-node-id>.json
  screenshots/<safe-node-id>.<png|jpg|svg>
  slot-overrides.json
```

- [x] Version `capture-manifest.json`; record file/document identity, source node
      IDs, selected pages/frames, tool name, fork commit/version, server bundle hash,
      plugin identity/API, capability fingerprint (when available), capture time,
      payload hashes, and authorization/provenance notes.
- [x] Keep original Figma node IDs in the manifest; sanitize `:` only in filenames.
- [x] Define raw-versus-derived ownership: `raw/` is immutable evidence;
      normalization, mappings, and generated output are reproducible derivatives.
- [x] Add schemas/types and fixture tests for every payload the extractor consumes.
- [x] Decide privacy defaults before committing a real client capture. Private raw
      copy/content must be gitignored; only authorized, sanitized fixtures belong in
      version control.

**R1.1 acceptance — passed 2026-07-31:** a clean install validates the versioned
schemas and loads a complete sanitized synthetic bundle offline; malformed,
incomplete, unsupported, tampered, unsafe, or runtime-mismatched variants fail
clearly. See
[`docs/research/r1-capture-contract-note.md`](docs/research/r1-capture-contract-note.md).

### 1.2 Capture through the local fork

Document and execute this read-only sequence:

- [x] Preflight the fork's DEV plugin, local relay, built MCP server, and channel.
      Never silently fall back to npm or the rate-limited official MCP.
      Shipped as `npm run check:r1:preflight`
      ([`scripts/preflight-capture.ts`](scripts/preflight-capture.ts)), fail-closed.
- [x] Compare the connected runtime identity/capabilities with the pinned expectation
      before the first document read; fail closed on a mismatch. Until the fork ships
      a handshake, verify commit, `dist` hash, plugin manifest/name, and tool inventory
      explicitly. **Pin advanced `956a6af` → `3546719`** (docs-only delta, all
      executable hashes identical); fingerprint `6ec10c8a…`, 10/10 tools of 48.
- [x] Invoke the fork only through MCP tool calls. Do not import its TypeScript,
      `code.js`, bundled server modules, or internal helper functions.
- [x] `get_pages({includeChildCount:true})` to establish honest document scope.
      33 pages; SYD is `52:435`. (First attempt errored transiently at connect
      time; the succeeding reply is the evidence.)
- [x] For selected pages, use `set_current_page` then bounded
      `get_document_info`; preserve pagination/coverage fields.
- [x] Capture `get_variables` and require `supported:true`; inspect `complete`,
      `resolutionStatus`, mode collections, and alias resolution before drawing any
      absence conclusion. **`complete:true` but zero SYD collections — and it omits
      a variable a node is demonstrably bound to. Not a token census.**
- [x] Capture `get_styles` for the document-wide paint/text/effect/grid inventory.
      **Entirely empty; SYD's styles are `remote: true` library styles.**
- [x] Capture `get_local_components` in summary mode, scoped to relevant pages;
      preserve `complete`, skipped pages, families, and `authoringSessions` so a
      pasted UI kit is not mistaken for authored product work. 13 components, one
      authoring session (`52`), 4 families — hand-authored.
- [x] Target representative desktop/mobile frames with `get_node_info` and
      `get_node_variables`; export source images for later evidence and QA.
      Paciente `1082:1875` (1280×9410) + `1155:5211` (375×11759), all four roles
      each. Image exports needed a raw-reply client —
      [`scripts/capture-figma.ts`](scripts/capture-figma.ts) is it: it spawns the
      pinned `dist/server.js` and writes replies verbatim, so the base64 envelope
      survives and the screenshot is decoded from, and checked against, it.
- [x] Capture `get_reactions` only for selected interactive roots, retaining its
      limitations instead of treating an empty result as proof of no behavior.
- [x] Save each reply once and prove the rest of R1 runs offline without another MCP
      call. **`docs/research/syd/` — 14 artifacts, 9/9 roles, `loadCaptureBundle`
      green offline.** The capture script self-verifies against the contract before
      it exits, so a bundle that does not replay is never written.
- [x] Preserve the raw fork replies unchanged; normalize them into separate typed
      artifacts so additive fork fields do not rewrite the evidence.

**R1.2 acceptance — passed 2026-08-02.** The authoritative capture is of the
**`SYD (SaveYourDay) - Spaceapps`** source file (page `1068:5433`), not the
`Landing Pages` portfolio file first read on 2026-07-31. The portfolio's SYD page
is a *copy* whose tokens are remote refs; the source file holds them locally — 11
paint styles with resolved values plus `Size` (1280/768/375) and `Typograph`
(Lato) variable collections. That moves SYD from tier 3 (`derived`) to **tier 1+2
(`high`)**. The copy's bundle is kept at `docs/research/syd-landing-pages-copy/`
as the regression fixture for the remote-library finding.

**Defects found by the live capture — all fixed** (see
[`docs/research/r1-capture-note.md`](docs/research/r1-capture-note.md) §5, §6b):

- [x] **Seven of nine payload roles were specified wrongly.** `document`
      (`children` is top-level), `variables` (variables nest under modes),
      `styles` (four typed inventories + `counts{}`, not one list),
      `components` (`nameFamilies`; coverage at top level), `node-variables`
      (`rootNode`, `unresolvedBindings`), `reactions` (`nodes[]`,
      `nodesCount`/`nodesWithReactions`, `coverage.limitation`), and
      `image-export` (an MCP image content block `{type,data,mimeType}` — no
      `nodeId`, no `encoding`). Only `pages` and `node` were right. Every role is
      now shaped from an observed reply.
- [x] The reactions argument check required a `nodeId` the tool does not take;
      it now accepts a single-element `nodeIds[]` naming exactly the filed node.
- [x] The blanket `complete:true` rule rejected node-variables replies that are
      `complete:false` only because 3 of 888 style refs are `mixed`. An
      incomplete read is now accepted when the fork quantifies the unresolved
      subset and the manifest records the limitation; unquantified partials stay
      fatal.
- [x] A page index reporting `childCount: null` / `childCountStatus:
      "not_requested"` is an explicit absence, not a malformed count.

Verified: **both SYD bundles' payloads validate**, the offline suite is at
**31 checks** (was 25), typecheck, R0, and preflight green.

**Pin advanced `3546719` → `5e0c869`** — one commit, our own `TASKS.md` edit
auto-committed in the fork repo. `dist/server.js`, plugin `manifest.json`, and
plugin `code.js` hashes verified byte-identical; fingerprint unchanged at
`6ec10c8a…`. Preflight caught the drift and failed closed, as intended.

**Upstream, logged in [`talk-to-figma-fork`](../talk-to-figma-fork/TASKS.md) R1 —
neither blocks MVP, and both are now lower priority:**

- `get_node_variables` should return the resolved *value* beside the resolved
  name for style references. **No longer blocking for SYD:** on the source file
  `get_styles` returns paint values inline and 93 % of style refs are local, so
  `atencao` resolves at `high`. Still worth having for the 61 remote UI-kit refs
  and for any file that is itself a copy.
- The already-planned compact export path (local path or resource reference
  instead of base64). **No longer blocking at all** — `scripts/capture-figma.ts`
  captures the base64 envelope directly. Now purely a payload-size nicety.

### 1.3 Measure the remaining read gap

The fork is now a credible extractor, but its current aggregate style payload and
filtered node shape may still omit values needed for structural tokens.

- [x] Prove whether bounding boxes plus targeted text/node data are sufficient for
      the live schema's mandatory type ramp, section rhythm, container width, and
      gutters. **Yes for the A1 set.** Type ramp from `TEXT.style`
      (`fontSize`/`fontWeight`/`letterSpacing`/`lineHeightPx`); container + gutters
      from bbox arithmetic (1280 frame → 1168 container → 56px gutter; mobile 375 →
      343 → 16px). Section rhythm is derivable only as bbox deltas between sibling
      sections, never read directly — mark `derived`.
- [x] Check whether exact text line-height/letter-spacing, effect values, auto-layout
      padding/gaps, image/vector assets, and breakpoint relationships survive the
      captured shapes. **Line-height/letter-spacing survive. `layoutMode`,
      `itemSpacing`, `padding*`, `effects`, and `opacity` are absent from every one
      of the 503 desktop nodes** — so `--space-*` and `--elev-*` (both A2) are
      unevidenced and must be omitted, not guessed. Effect *names* survive via
      `get_node_variables` (`Shadows/shadow-xs`); values do not.
- [x] **Re-answered against the source file (2026-08-02).** Colors and fonts are
      no longer measured: `get_styles` returns paint values inline (10 solid
      styles) and `Typograph` declares `Lato` for `Heading`/`Body`/`Button`, so
      the 6 identity colors and both A1 font slots are `high`, not `derived`. The
      `Size` collection declares `width` 1280/768/375 per breakpoint mode, so the
      responsive structural slots have a declared basis instead of a guess. Still
      `derived`: the 11-slot type ramp (0 text styles in the file) and section
      rhythm (bbox deltas). Still absent: effect *values* (`perfil` carries no
      value) and auto-layout, both A2 — omit, do not guess.
- [x] If a required fact is absent, stop and write the smallest generic capability
      request against `talk-to-figma-fork`. Two logged, neither blocking; see
      above.
- [ ] Implement the field/tool, its generic fixture, contract test, docs, and rebuilt
      `dist/` **in the fork repository**—never as a private patch here.
- [ ] Update this project's fork pin and payload adapter only after the fork change is
      independently verified; re-capture only the affected replies.
- [ ] Do not compensate with guesses, copied fork internals, or a hidden official-MCP
      call.

### 1.4 Implement the pure offline extractor

- [x] Replace the stub with a pure transform:
      `--capture docs/research/<slug>/capture-manifest.json` →
      `design-systems/<slug>/source/tokens.source.json`.
      `scripts/extract-figma-tokens.ts`, `npm run extract`.
- [x] Normalize versioned raw MCP replies through an explicit fork-adapter boundary;
      extraction logic consumes the normalized types, not fork implementation details.
      `scripts/lib/figma-normalize.ts` is the only file that reads a raw payload.
- [x] Load OpenDesign's `TOKEN_SCHEMA` at runtime; derive mandatory/optional slots
      from it and never encode the observed 56/26 counts. The breakpoint set is read
      off the schema's own slot names too — an unrecognized `--section-y-*` suffix is
      a hard error, proven by a test that appends a fake `--section-y-ultrawide`.
- [x] Implement name resolution in explicit stages: exact map → normalized
      prefix/suffix → regex role map → conservative heuristic → per-file override.
      `scripts/lib/token-resolution.ts`. **The role map is bilingual (en + pt-BR)** —
      decided 2026-08-02, because the first real file names its palette `primaria`,
      `texto`, `bg`, `card`, `erro`, `atencao` and an English-only table resolves
      none of them. `secundaria` is deliberately NOT mapped to `--muted`: in a pt-BR
      palette it is the second *brand* color, not muted body copy.
- [x] Implement mode mapping: light/dark → theme scopes; responsive modes →
      responsive structural slots; brand modes → separate package outputs. Fail on
      ambiguous axes until an override resolves them.
- [x] Project semantic text styles/nodes onto the type ramp. Interpolation is
      `derived` and cites both neighboring sources. **Ramp evidence is filtered to
      declared font families** — decided 2026-08-02. SYD's frames carry an Untitled
      UI form kit (Inter), App Store badges (SF Pro / Product Sans) and a Genty
      display numeral; unfiltered, `--text-4xl` would be 96px off three decorative
      numerals instead of 50px off the real hero. Every exclusion is recorded as a
      limitation. When the filter would empty the pool, it falls back to all text
      and says so, rather than reporting 11 missing A1 slots.
- [x] Derive mandatory rhythm/container slots from representative frames and cite
      node IDs plus measurements. Breakpoints with no captured frame interpolate on
      the *declared* widths and round to whole pixels.
- [x] Omit unsupported A2/B slots so the emitter owns fallbacks/aliases — 28 omitted
      on SYD, asserted by test.
- [x] Fail before emission with every missing mandatory slot and every incomplete
      evidence dependency.
- [x] Make output deterministic: identical capture + overrides + schema commit
      produces an identical source artifact apart from explicitly isolated run time.
      The run clock is opt-in via `--stamp`; without it there is no time field at
      all. Verified byte-identical on the real SYD capture across runs.
- [x] Unit-test declared variables, alias resolution, style-only fallback,
      responsive modes, ambiguous brand modes, missing A1, overrides, and partial
      capture rejection. `npm run check:r1:extract` — 17 checks, offline, against
      the real `TOKEN_SCHEMA`.

**R1.4 acceptance — passed 2026-08-02.** `npm run extract -- --capture
docs/research/syd/capture-manifest.json` resolves **26/26 mandatory slots** with
zero MCP calls: 9 `high` (6 identity colors + `--danger`/`--warn` from declared
paint styles, both fonts from the `Typograph` variable collection) and 19
`derived` (the 11-slot ramp, section rhythm, container/gutters). Stages used:
1 exact, 8 role-map, 19 heuristic, 0 override.

**Two findings adjudicated in R1.5 — closed 2026-08-10:**

1. **`--border` measured as `#f8f8f8`, identical to `--bg`.** The most frequent
   stroke in the file (48 nodes) is the page background color, so card edges are
   not visually distinct. No declared style claims a border role. The extractor
   records the collision instead of quietly picking a prettier runner-up
   (`#95cf9a`, 21 nodes). R1.5 overrides `--border` to that visible green and
   preserves the displaced heuristic in the report.
2. **Name-vs-usage disagreement, originally resolved in favour of the name**
   (2026-08-02). `--accent` = `primaria` `#95cf9a` (2 fill / 25 stroke uses) while
   the unclaimed `secundaria` `#6460be` carries **757** uses; `--fg` = `texto`
   `#000000` with **0** recorded uses while the unclaimed `texto-lp` `#141414`
   carries 122 fills. Both disagreements are written into the token's own
   `reason` and into `extraction-report.json`. R1.5's human adjudication selects
   `secundaria` for `--accent` and `texto-lp` for `--fg`; `SYD-Next` independently
   confirms both roles.

**R1.4 retrospective:** the load-bearing decisions were not algorithmic, they
were about *what counts as evidence* — which language a role name may be written
in, and whether a pasted third-party UI kit inside a frame is part of the design
language. Both were settled by interview before any code, and both are recorded
here because neither is recoverable from the code alone.

### 1.5 Author and validate the rich package

- [x] Adapt the cloner's proven package-authoring workflow for Figma evidence:
      `DESIGN.md`, `USAGE.md`, `components.html`,
      `preview/{colors,typography,spacing}.html`, and `source/evidence.md`.
- [x] Build `components.html` from real component families and targeted nodes, not
      from the raw component total or invented controls.
- [x] Record per-token source, confidence, transformations, capture hashes, and any
      override in `source/evidence.md`.
- [x] Emit all derived files; never hand-edit a derived cache.
- [x] Validate and record A1 coverage plus the `high`/`derived`/schema-fallback split.
- [x] Run the first live acceptance pass on **SYD**. Compare the Figma-derived
      package with the tokens and visual roles in the human-authored
      `SYD-Next` implementation, checked out at
      `workspace/spaceapps/projects/syd/website/`. Keep the Next.js code out of
      extraction so the comparison remains independent; use it only after emission
      as a validation oracle. Treat semantic differences as findings, not automatic
      failures.

**R1 acceptance — passed 2026-08-10:** one clean capture made exclusively through
the pinned independent fork interface replays offline into a complete, guard-green
OpenDesign package. Every authored value traces to a variable, style, node,
measurement, or explicit override; no fork source is copied into this repository.
See [`docs/research/r1-package-note.md`](docs/research/r1-package-note.md).

---

## Release R2 — Astro page MVP

R1's retrospective is complete. Execute in this order; defer fidelity extras that
do not retire the package → Astro → visual-evidence path:

- [x] **Validated build routing shipped 2026-08-10.** `--build none|astro` is owned
      by the emitter and defaults to `none`; the Astro route is ordered emit →
      in-process validate → retarget seam → build. Evidence:
      [`docs/research/r2-brand-seam-note.md`](docs/research/r2-brand-seam-note.md).
- [x] **Reuse shape frozen 2026-08-10.** Minimal vendor of the five generic baseline
      files at repository root, pinned to `b7b4dda`; `index.astro` authored here and
      `ClonePlaceholder.astro` excluded as brand-specific. Spec, deltas, and baseline
      hashes: [`docs/research/r2-astro-seam-note.md`](docs/research/r2-astro-seam-note.md).
- [x] **Foundation vendored and green 2026-08-10.** Five files vendored behind the R0
      provenance block, Astro dependency set added at the baseline's ranges,
      `vendor.manifest.json` + `scripts/check-vendor-parity.ts` + `npm run check:vendor`
      shipped and extended over R0's two scripts. 26 parity checks pass, 5 of 7 files
      are byte-identical to the baseline, and both drift-injection negatives fail the
      gate. `check:astro` green; `check:r0` and both R1 suites unaffected. Evidence:
      [`docs/research/r2-foundation-note.md`](docs/research/r2-foundation-note.md).
- [x] Require a validated `design-systems/<slug>/` before any page component work;
      the Astro build route cannot touch the seam until that exact package passes.
- [ ] Choose one coherent desktop/mobile frame family and write page topology plus
      one evidence-backed component spec per section.
- [ ] Extract verbatim text, exported assets, responsive relationships, and known
      interactions from the cached Figma bundle; document unsupported behavior.
- [ ] Build semantic `.astro` sections with scoped vanilla CSS consuming
      `var(--…)`; hydrate only genuine interactions and keep content server-rendered.
- [ ] Run the Astro typecheck/build after the foundation and after assembly.
- [ ] Capture the implementation at 1440px and 390px and create final side-by-side
      comparisons against the corresponding Figma exports.
- [ ] For SYD, also compare the generated result with the existing human-authored
      Next.js landing page at `workspace/spaceapps/projects/syd/website/` at the
      same viewports. Figma is the visual-intent source;
      `SYD-Next` is the implementation/behavior reference.
- [ ] Re-run the design-system guard after the last page correction.

**R2 acceptance:** the selected page is present as static HTML, imports the validated
token source of truth, passes the production build, and has current 1440px/390px visual
evidence plus documented behavior gaps.

---

## Release R3 — generalization and first release

Keep coarse until R2 is complete:

- [ ] Run the full importer on a second, unrelated file with a different naming
      convention and preferably a different evidence tier (variables vs styles).
- [ ] Quantify override use, unresolved evidence, confidence split, and capture cost
      for both fixtures.
- [ ] Turn both captures into offline regression fixtures, sanitized as required.
- [ ] Reconcile stale claims in `AGENTS.md`, `README.md`, `docs/BUILD-PLAN.md`,
      `docs/EXTRACTION-GUIDE.md`, the project skill, the idea note, and
      [`knowledge/skills/CONTEXT.md`](../../skills/CONTEXT.md).
- [ ] Publish the supported fork commit/version and runtime fingerprint alongside the
      importer release; changing that pin requires a fresh capture compatibility pass.
- [ ] Revisit the cloner pin now that a second package makes multi-package routing
      real: adopting `HEAD`'s `src/clones/<slug>/` layout would be a move of the R2
      page, not a rewrite. Deferred deliberately at R2.1.
- [ ] Add CI for install, typecheck/tests, fixture emission, OpenDesign validation,
      and the Astro build when applicable.
- [ ] Publish the first documented version only after both unrelated files pass.

## Cross-cutting checklist

- [x] **Read-only Figma operation.** This pipeline never calls setters, creators,
      delete tools, or write-oriented prompts.
- [x] **Independent tool boundary.** The fork is invoked only through its MCP
      interface; no fork source/plugin helpers are imported or copied here.
- [x] **Consumer-owned adaptation.** Raw replies remain immutable and versioned;
      fork-specific normalization is isolated from token resolution/emission.
- [x] **Generic gaps land upstream in the fork.** This repository never carries a
      private Figma-tool implementation.
- [x] **No invented evidence.** Missing is an error or schema fallback, never a
      plausible-looking value.
- [x] **No false negatives from partial reads.** Preserve `supported`, `complete`,
      pagination, limitations, skipped pages, and unresolved-status fields.
- [x] **Dynamic contract.** OpenDesign owns slot names, layers, fallbacks, aliases,
      renderers, and validation.
- [x] **Immutable raw evidence.** Normalize into new files; never silently rewrite
      the capture that justified an output.
- [x] **Pinned sibling reuse.** Every vendored file or workflow cites the source
      commit and has a parity check.
- [ ] **One token source in code.** Astro consumes the emitted `tokens.css`; page
      styles do not recreate brand values.
- [x] **Authorization and privacy.** Capture only files the operator may use; do not
      commit private client copy/assets by default.
- [x] **Fresh acceptance.** Re-run the guard/build after the last relevant edit;
      stale output is not evidence.

## Open questions still to decide

- [x] **Structural-read sufficiency:** *Answered 2026-07-31.* Bounding boxes plus
      `TEXT.style` cover every mandatory A1 structural slot. Auto-layout fields are
      absent but map only to A2 slots (`--space-*`), so they are an optional
      upstream enhancement, not an MVP blocker.
- [x] **Capture privacy:** *Answered 2026-07-31, corrected 2026-08-02.* The first
      portfolio-copy read exposed unrelated client collections; the authoritative
      six-page SYD source is still private client content. Both real captures stay
      `private-local` and gitignored; only non-private acceptance notes are committed.
- [x] **Library-backed tokens:** *Answered for MVP 2026-08-02.* The first portfolio
      copy uses remote library refs and remains a regression fixture, but the
      authoritative SYD source exposes 11 local paint styles plus `Size` and
      `Typograph` collections. Remote-library enumeration is not required for SYD;
      reopen only when an unrelated authorized file proves it blocks R3.
- [ ] **Multi-axis modes:** require an explicit mapping file for every non-theme mode,
      or infer only the unambiguous responsive/brand cases?
- [x] **Astro reuse shape:** *Answered 2026-08-10 — minimal vendor.* The baseline's
      whole generic foundation is 1302 bytes across five reusable files, so a
      scaffold script would be larger than what it emits and would add a second
      sibling-repository runtime dependency to generate an immutable pin. Vendored at
      root behind R0's provenance block, brand default `psiativa` (the committed
      fixture — `syd` is gitignored and cannot build on a clean clone), parity made
      executable via `vendor.manifest.json`, pin held at `b7b4dda`. Full record:
      [`docs/research/r2-astro-seam-note.md`](docs/research/r2-astro-seam-note.md).
- [x] **Fork compatibility fingerprint:** *Answered 2026-07-31.* Verifiable today:
      git commit, `package.json` version, `dist/server.js` SHA-256, plugin
      `manifest.json` identity + hash, plugin `code.js` hash, relay reachability,
      and a canonical fingerprint over the 10 required tools' `inputSchema` — all
      implemented in `scripts/preflight-capture.ts`. A formal `get_runtime_info`
      handshake would replace the filesystem probes but is not required for MVP.
- [ ] **Fork adapter policy:** support one strict runtime pin for MVP, or retain an
      adapter for the immediately previous pin after the first upgrade?

## Inputs needed only when their phase starts

- **R2:** no new Figma session is required unless the cached SYD bundle lacks a
  page asset or interaction that the frozen topology explicitly requires.
- **R3 generalization:** a second unrelated authorized file.
- **Any calendar commitment:** a deadline/capacity decision; until then the project
  remains backlog-paced and scope-open.
