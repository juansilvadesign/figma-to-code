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

- **Importer MVP — the original goal, NOT shipped.** With an authorized Figma file
  open in the local plugin, capture its evidence once, replay it offline, and emit a
  guard-green OpenDesign package at `design-systems/<slug>/`.
- **Astro page MVP — the expanded goal, NOT shipped.** Select a desktop/mobile frame
  family from that same capture and produce a static-first Astro page that consumes
  the validated package, builds cleanly, and has final 1440px/390px visual evidence.

The package remains at `0.0.0`, but R0 is now executable: the emitter and validator
run locally against the committed compatibility fixture. The Figma extractor remains
an intentional throwing stub, so neither the Importer MVP nor Astro page MVP has
shipped.

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
| [`talk-to-figma-fork`](../talk-to-figma-fork/) | **Independent runtime dependency** | `956a6af` | Read-only MCP tools: `get_pages`, bounded `get_document_info`, `set_current_page`, `get_variables`, `get_styles`, scoped/summary `get_local_components`, `get_node_info`, `get_node_variables`, `get_reactions`, and `export_node_as_image` |
| [`ai-website-cloner-template`](../ai-website-cloner-template/) | **Vendored generic-code/workflow baseline** | `b7b4dda` (`0.4.0`) | Emitter/validator, Astro scaffold, design-system-first order, component specs, static-first rules, and 1440px/390px QA |
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

The remaining executable stub is `scripts/extract-figma-tokens.ts`.

## ▶ Next session — start here (R1.1 only)

1. **Do not open Figma yet.** Freeze the capture contract and privacy rules before
   producing the first live SYD evidence bundle.
2. Version `capture-manifest.json` and define types/schemas for the manifest, raw
   payload envelope, coverage metadata, hashes, runtime identity, and overrides.
3. Define immutable `raw/` versus reproducible derived ownership, safe node-ID
   filenames, authorization notes, and gitignore defaults for private copy/assets.
4. Build offline fixture tests for each pinned fork reply shape the extractor will
   consume. Treat fork payloads as external contracts; do not import fork source.
5. Stop R1.1 when malformed/incomplete bundles fail clearly and a valid synthetic
   bundle can be loaded offline. Live MCP capture begins only in R1.2.

**R0 retrospective:** the source-agnostic emitter/validator transferred with zero
functional changes, the pinned OpenDesign schema currently resolves 56 slots, and the
compatibility fixture passes all 15 quality checks. The next riskiest assumption is
capture integrity, so R1 starts with the evidence contract rather than live calls.

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
  raw/document.json
  raw/pages.json
  raw/variables.json
  raw/styles.json
  raw/components.json
  raw/nodes/<safe-node-id>.json
  raw/node-variables/<safe-node-id>.json
  raw/reactions/<safe-node-id>.json
  screenshots/<safe-node-id>.png
  slot-overrides.json
```

- [ ] Version `capture-manifest.json`; record file/document identity, source node
      IDs, selected pages/frames, tool name, fork commit/version, server bundle hash,
      plugin identity/API, capability fingerprint (when available), capture time,
      payload hashes, and authorization/provenance notes.
- [ ] Keep original Figma node IDs in the manifest; sanitize `:` only in filenames.
- [ ] Define raw-versus-derived ownership: `raw/` is immutable evidence;
      normalization, mappings, and generated output are reproducible derivatives.
- [ ] Add schemas/types and fixture tests for every payload the extractor consumes.
- [ ] Decide privacy defaults before committing a real client capture. Private raw
      copy/content must be gitignored; only authorized, sanitized fixtures belong in
      version control.

### 1.2 Capture through the local fork

Document and execute this read-only sequence:

- [ ] Preflight the fork's DEV plugin, local relay, built MCP server, and channel.
      Never silently fall back to npm or the rate-limited official MCP.
- [ ] Compare the connected runtime identity/capabilities with the pinned expectation
      before the first document read; fail closed on a mismatch. Until the fork ships
      a handshake, verify commit, `dist` hash, plugin manifest/name, and tool inventory
      explicitly.
- [ ] Invoke the fork only through MCP tool calls. Do not import its TypeScript,
      `code.js`, bundled server modules, or internal helper functions.
- [ ] `get_pages({includeChildCount:true})` to establish honest document scope.
- [ ] For selected pages, use `set_current_page` then bounded
      `get_document_info`; preserve pagination/coverage fields.
- [ ] Capture `get_variables` and require `supported:true`; inspect `complete`,
      `resolutionStatus`, mode collections, and alias resolution before drawing any
      absence conclusion.
- [ ] Capture `get_styles` for the document-wide paint/text/effect/grid inventory.
- [ ] Capture `get_local_components` in summary mode, scoped to relevant pages;
      preserve `complete`, skipped pages, families, and `authoringSessions` so a
      pasted UI kit is not mistaken for authored product work.
- [ ] Target representative desktop/mobile frames with `get_node_info` and
      `get_node_variables`; export source images for later evidence and QA.
- [ ] Capture `get_reactions` only for selected interactive roots, retaining its
      limitations instead of treating an empty result as proof of no behavior.
- [ ] Save each reply once and prove the rest of R1 runs offline without another MCP
      call.
- [ ] Preserve the raw fork replies unchanged; normalize them into separate typed
      artifacts so additive fork fields do not rewrite the evidence.

### 1.3 Measure the remaining read gap

The fork is now a credible extractor, but its current aggregate style payload and
filtered node shape may still omit values needed for structural tokens.

- [ ] Prove whether bounding boxes plus targeted text/node data are sufficient for
      the live schema's mandatory type ramp, section rhythm, container width, and
      gutters.
- [ ] Check whether exact text line-height/letter-spacing, effect values, auto-layout
      padding/gaps, image/vector assets, and breakpoint relationships survive the
      captured shapes.
- [ ] If a required fact is absent, stop and write the smallest generic capability
      request against `talk-to-figma-fork`.
- [ ] Implement the field/tool, its generic fixture, contract test, docs, and rebuilt
      `dist/` **in the fork repository**—never as a private patch here.
- [ ] Update this project's fork pin and payload adapter only after the fork change is
      independently verified; re-capture only the affected replies.
- [ ] Do not compensate with guesses, copied fork internals, or a hidden official-MCP
      call.

### 1.4 Implement the pure offline extractor

- [ ] Replace the stub with a pure transform:
      `--capture docs/research/<slug>/capture-manifest.json` →
      `design-systems/<slug>/source/tokens.source.json`.
- [ ] Normalize versioned raw MCP replies through an explicit fork-adapter boundary;
      extraction logic consumes the normalized types, not fork implementation details.
- [ ] Load OpenDesign's `TOKEN_SCHEMA` at runtime; derive mandatory/optional slots
      from it and never encode the observed 56/26 counts.
- [ ] Implement name resolution in explicit stages: exact map → normalized
      prefix/suffix → regex role map → conservative heuristic → per-file override.
- [ ] Implement mode mapping: light/dark → theme scopes; responsive modes →
      responsive structural slots; brand modes → separate package outputs. Fail on
      ambiguous axes until an override resolves them.
- [ ] Project semantic text styles/nodes onto the type ramp. Interpolation is
      `derived` and cites both neighboring sources.
- [ ] Derive mandatory rhythm/container slots from representative frames and cite
      node IDs plus measurements.
- [ ] Omit unsupported A2/B slots so the emitter owns fallbacks/aliases.
- [ ] Fail before emission with every missing mandatory slot and every incomplete
      evidence dependency.
- [ ] Make output deterministic: identical capture + overrides + schema commit
      produces an identical source artifact apart from explicitly isolated run time.
- [ ] Unit-test declared variables, alias resolution, style-only fallback,
      responsive modes, ambiguous brand modes, missing A1, overrides, and partial
      capture rejection.

### 1.5 Author and validate the rich package

- [ ] Adapt the cloner's proven package-authoring workflow for Figma evidence:
      `DESIGN.md`, `USAGE.md`, `components.html`,
      `preview/{colors,typography,spacing}.html`, and `source/evidence.md`.
- [ ] Build `components.html` from real component families and targeted nodes, not
      from the raw component total or invented controls.
- [ ] Record per-token source, confidence, transformations, capture hashes, and any
      override in `source/evidence.md`.
- [ ] Emit all derived files; never hand-edit a derived cache.
- [ ] Validate and record A1 coverage plus the `high`/`derived`/schema-fallback split.
- [ ] Run the first live acceptance pass on **SYD**. Compare the Figma-derived
      package with the tokens and visual roles in the human-authored
      `zokuWebDesign/SYD-Next` implementation. Keep the Next.js code out of extraction
      so the comparison remains independent; use it only after emission as a
      validation oracle. Treat semantic differences as findings, not automatic
      failures.

**R1 acceptance:** one clean capture made exclusively through the pinned independent
fork interface replays offline into a complete, guard-green OpenDesign package. Every
authored value traces to a variable, style, node, measurement, or explicit override;
no fork source is copied into this repository.

---

## Release R2 — Astro page MVP

Detail this release after the R1 retrospective. Current boundary:

- [ ] Add `--build none|astro`; default to `none` until importer acceptance is stable.
- [ ] Reuse only the cloner's committed generic Astro foundation and workflow—never
      its brand-specific page components.
- [ ] Require a validated `design-systems/<slug>/` before any page component work.
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
      Next.js landing page at the same viewports. Figma is the visual-intent source;
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
- [ ] Add CI for install, typecheck/tests, fixture emission, OpenDesign validation,
      and the Astro build when applicable.
- [ ] Publish the first documented version only after both unrelated files pass.

## Cross-cutting checklist

- [ ] **Read-only Figma operation.** This pipeline never calls setters, creators,
      delete tools, or write-oriented prompts.
- [ ] **Independent tool boundary.** The fork is invoked only through its MCP
      interface; no fork source/plugin helpers are imported or copied here.
- [ ] **Consumer-owned adaptation.** Raw replies remain immutable and versioned;
      fork-specific normalization is isolated from token resolution/emission.
- [ ] **Generic gaps land upstream in the fork.** This repository never carries a
      private Figma-tool implementation.
- [ ] **No invented evidence.** Missing is an error or schema fallback, never a
      plausible-looking value.
- [ ] **No false negatives from partial reads.** Preserve `supported`, `complete`,
      pagination, limitations, skipped pages, and unresolved-status fields.
- [ ] **Dynamic contract.** OpenDesign owns slot names, layers, fallbacks, aliases,
      renderers, and validation.
- [ ] **Immutable raw evidence.** Normalize into new files; never silently rewrite
      the capture that justified an output.
- [ ] **Pinned sibling reuse.** Every vendored file or workflow cites the source
      commit and has a parity check.
- [ ] **One token source in code.** Astro consumes the emitted `tokens.css`; page
      styles do not recreate brand values.
- [ ] **Authorization and privacy.** Capture only files the operator may use; do not
      commit private client copy/assets by default.
- [ ] **Fresh acceptance.** Re-run the guard/build after the last relevant edit;
      stale output is not evidence.

## Open questions still to decide

- [ ] **Structural-read sufficiency:** can current node bounding boxes support every
      mandatory structural slot, or does the fork need additive auto-layout fields?
- [ ] **Capture privacy:** which real fixtures may be committed, and which remain
      local with only sanitized extracts checked in?
- [ ] **Multi-axis modes:** require an explicit mapping file for every non-theme mode,
      or infer only the unambiguous responsive/brand cases?
- [ ] **Astro reuse shape:** vendor a minimal template into this repo, or add a
      reproducible scaffold script sourced from the cloner baseline?
- [ ] **Fork compatibility fingerprint:** what exact runtime fields can be verified at
      `956a6af`, and when can this project require the fork's planned formal
      `get_runtime_info`/capability handshake?
- [ ] **Fork adapter policy:** support one strict runtime pin for MVP, or retain an
      adapter for the immediately previous pin after the first upgrade?

## Inputs needed only when their phase starts

- **R1 live capture:** the SYD Figma file open in the independently running fork DEV
  plugin, the connected channel name, and the verified pinned runtime identity.
- **R3 generalization:** a second unrelated authorized file.
- **Any calendar commitment:** a deadline/capacity decision; until then the project
  remains backlog-paced and scope-open.
