# Figma → Code — Roadmap (post-MVP / v2+)

> `figma-to-code` is a **separate importer product** that consumes the independent
> [`talk-to-figma-fork`](../talk-to-figma-fork/) through its MCP interface. It does
> not own, embed, or become that tool.
>
> Active work lives in [`TASKS.md`](TASKS.md). The current path is: prove the local
> emitter loop → capture one real Figma file through a pinned fork runtime → emit one
> evidence-backed OpenDesign package → reuse the cloner workflow for one Astro page
> → generalize on a second file.
>
> This file holds deferred/v2+ scope. Items are re-ranked after each release
> retrospective; they are not promises or a fixed-scope schedule.

## Project boundary and dependency direction

```text
figma-to-code
capture plan · evidence bundle · normalization · OpenDesign · optional Astro
        │
        │ versioned MCP calls (read-only)
        ▼
talk-to-figma-fork
tool schemas · server · relay · Figma plugin · generic Figma reads/writes
        │
        ▼
      Figma
```

| `figma-to-code` owns | `talk-to-figma-fork` owns |
| --- | --- |
| Capture manifest and privacy/provenance rules | MCP schemas and result contracts |
| Raw-response persistence and source adapters | Server, relay, plugin, and connection lifecycle |
| Figma payload normalization and compatibility adapters | Generic bounded reads, writes, exports, progress, and errors |
| Token/mode/component resolution | Tool-level tests, fixtures, packaging, and releases |
| OpenDesign package emission/validation | Runtime identity and server/plugin compatibility |
| Astro generation and visual acceptance | No knowledge of OpenDesign, Astro, or this capture schema |

Dependency flows from this project to a **pinned fork commit/version**. There is no
runtime source import in either direction.

When extraction reveals a missing Figma fact:

1. Specify the smallest generic capability in `talk-to-figma-fork`.
2. Implement, test, document, and rebuild/release it there.
3. Update this project's pinned runtime and payload adapter.
4. Re-capture only the affected evidence.

Do not patch fork internals inside this repository, invent the missing fact, or hide an
official-MCP call behind the local adapter.

## Deferred / v2+ options

| # | Item | Extends | Why deferred / notes |
| --- | --- | --- | --- |
| R1 | **Multi-page and multi-flow Astro builds** | TASKS R2 | MVP proves one coherent page/frame family. Whole products add routing, shared chrome, cross-page state, and much larger QA scope. |
| R2 | **Retained Next.js target** | TASKS R2 | The cloner already has a complete Next.js target and OpenDesign Tailwind bridge. Astro remains first because it is the chosen static target and has the smaller runtime surface. |
| R3 | **React component/library mode** | Extractor + page builder | Generate reusable components and prop/variant APIs rather than a page. This needs component-set/variant semantics beyond the page MVP. |
| R4 | **Existing-code component matching** | R3 | Resolve a Figma subtree to a component in the destination repo. Name matching alone is unsafe; structural matching and a manual map need real fixtures. |
| R5 | **Remote/team-library variables and components** | Fork read contract + capture adapter | The pinned fork reads local resources reliably. Remote inventory must first become a generic fork capability; this project then normalizes and maps it. |
| R6 | **Full multi-axis mode compiler** | Mode mapper | MVP handles unambiguous theme/responsive axes and separate packages for explicit brand modes. Arbitrary theme × breakpoint × density × brand needs a richer output policy. |
| R7 | **Autonomous capture command** | Agent-driven capture | This project may eventually own an MCP client that executes its read plan, persists replies, retries, and resumes. It still calls the fork as an external tool; it does not absorb fork source. |
| R8 | **Alternate official-MCP / REST adapters** | Capture boundary | The normalized bundle may accept other sources later. Each adapter keeps its own authentication, limits, payload semantics, and provenance. |
| R9 | **Shared emitter package instead of vendoring** | TASKS R0 | Extract only when parity checks show real maintenance cost; a premature package adds release coupling to small projects. |
| R10 | **Automated visual-diff scoring** | TASKS R2 QA | MVP keeps durable 1440px/390px comparisons and human review. Thresholds need masking plus font/render normalization. |
| R11 | **Prototype and motion reconstruction** | TASKS R2 behavior evidence | The fork can read some reactions, but Figma does not encode complete runtime physics, scroll behavior, or production data. Ship static correctness first. |
| R12 | **Original asset/font recovery** | TASKS R2 assets | Node exports are sufficient for MVP. Original uploads, font files/licenses, SVG sources, video, and variable fonts cross API and licensing boundaries. |
| R13 | **Accessibility and design-lint report** | Rich package | OpenDesign validation checks package integrity, not contrast, focus order, semantics, or component-state coverage. |
| R14 | **Batch/operator mode** | TASKS R1 importer | Multiple files need queueing, privacy isolation, retries, rate control, and deterministic one-file behavior first. |
| R15 | **Design/code drift monitoring** | TASKS R2/R3 | Re-capture through a pinned tool runtime, diff normalized evidence/output, and route changes for review. Requires stable capture IDs and adapters. |
| R16 | **Multiple supported fork versions** | Capture adapter | Start with one strict pin. Version adapters are justified only after two real fork contracts must remain supported concurrently. |

## Out of scope — use the owning project

- **Generic Figma transport, reads, or writes.** Those belong to
  [`talk-to-figma-fork`](../talk-to-figma-fork/). This project requests generic
  additions there and consumes the resulting MCP contract.
- **Free-form Figma authoring or repair.** Use the independent fork directly.
  `figma-to-code` is read-only.
- **Code → Figma/write-back orchestration.** That would be a separate future
  consumer of the fork's generic write tools—not a reverse mode inside this importer.
- **Live website → design system/page.** That is
  [`ai-website-cloner-template`](../ai-website-cloner-template/); this project does
  not add a second browser extractor.
- **Single-frame generic codegen without a portable design system.** Use the official
  Figma design-to-code route or [`figma-to-astro`](../../skills/figma-to-astro/).
- **Backend/application behavior.** Authentication, APIs, databases, billing, and
  product logic cannot be inferred faithfully from visual source.
- **Unauthorized brand replication.** Only owned files, authorized client work,
  migrations, and legitimate learning fixtures are valid inputs.

## Parking lot

- DTCG / Tokens Studio export alongside OpenDesign.
- CSS/tokens-only lightweight output.
- A semantic diff between Figma-derived and website-derived packages for one brand.
- Storybook fixtures generated from Figma variants.
- Pitch-deck output: one frame per slide, speaker notes, and PDF.
- A capture viewer for raw/normalized/derived provenance and fork runtime identity.
