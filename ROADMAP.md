# Figma → Code — Roadmap (post-MVP / v2+)

> Deliberately **outside** the active build in [`TASKS.md`](TASKS.md). The current
> path is: prove the local emitter loop → ship one evidence-backed Figma importer →
> reuse the cloner workflow for one Astro page → generalize on a second file.
>
> This file follows the same deferred/v2+ convention as the audit-engine project:
> capture valuable extensions without letting them inflate the next accepted release.
> Items are re-ranked after each release retrospective; they are not promises or a
> fixed-scope schedule.

| # | Item | Extends | Why deferred / notes |
| --- | --- | --- | --- |
| R1 | **Multi-page and multi-flow Astro builds** | TASKS R2 | MVP proves one coherent page/frame family. Whole products introduce routing, shared chrome, cross-page state, and much larger QA scope; earn this with a real need. |
| R2 | **Retained Next.js target** | TASKS R2 | The cloner already has a complete Next.js 16 target and OpenDesign Tailwind bridge, so this is reuse rather than research. Astro remains first because it is the project's chosen static LP/deck target and has the smaller runtime surface. |
| R3 | **React component/library mode** | Extractor + page builder | Generate reusable components and prop/variant APIs rather than a page. This revives the original idea's app/design-system scope and needs component-set/variant semantics beyond the page MVP. |
| R4 | **Existing-code component matching** | R3 | Resolve a Figma subtree to a component already present in the destination repo instead of rebuilding it. Name matching alone is unsafe; structural matching and a manual map need real fixtures first. |
| R5 | **Remote/team-library variables and components** | Capture contract | The fork reliably reads local variables/styles and resolves style references on nodes. A full library inventory, licensing boundary, and remote-variable provenance are a separate capability. |
| R6 | **Full multi-axis mode compiler** | Mode mapper | MVP handles unambiguous theme/responsive axes and emits separate packages for explicit brand modes. Arbitrary theme × breakpoint × density × brand products need a richer output model or multiple coordinated packages. |
| R7 | **Autonomous capture command** | Agent-driven capture | MVP deliberately keeps MCP calls agent-driven and caches them. A direct CLI/MCP client that opens a session, executes the read plan, persists binary exports, retries safely, and resumes partial captures is valuable only after the artifact contract survives two files. |
| R8 | **Alternate official-MCP / REST adapters** | Capture contract | The normalized capture boundary should eventually allow the official Figma MCP or REST API as sources. They bring plan limits, authentication, and different payload semantics; the free local fork is sufficient for MVP. |
| R9 | **Shared emitter package instead of vendoring** | R0 | Both source projects currently vendor the same source-agnostic scripts. Extract a shared package only when parity checks show real maintenance cost; a premature package adds release/version coupling to two small tools. |
| R10 | **Automated visual-diff scoring** | R2 QA | MVP produces durable 1440px/390px side-by-side evidence and uses human review. Pixel/SSIM thresholds need masking, font/render normalization, and a policy for acceptable responsive differences. |
| R11 | **Prototype and motion reconstruction** | R2 behavior evidence | The fork can read reactions, including variant transitions, but Figma does not fully encode runtime physics, scroll behavior, or production data. Ship static correctness first; add motion by measured value and document fallbacks. |
| R12 | **Original asset/font recovery** | R2 assets | Node exports are enough for MVP fidelity. Recovering original uploads, font files/licenses, SVG sources, video, and variable fonts crosses API, licensing, and destination-build concerns. |
| R13 | **Accessibility and design-lint report** | Rich package | OpenDesign validation checks package integrity, not the usability of the source design. APCA, focus order, semantic reconstruction, and component-state coverage deserve a separate report/gate. |
| R14 | **Batch/operator mode** | R1 importer | Process many files/captures into a report or package set. Defer until one-file retries, privacy, rate control, and deterministic replay are proven. |
| R15 | **Design/code drift monitoring** | R2/R3 | Re-capture a Figma source, diff evidence and emitted tokens/components, then flag implementation drift. Requires stable capture IDs, normalized schemas, storage, and a review policy. |
| R16 | **Write-back / Code Connect publishing** | R3/R4 | Publishing production snippets or repaired tokens back into Figma is a different direction with write risk and plan gates. It is explicitly not part of the read-only importer. |

## Out of scope — use the neighboring tool instead

- **Live website → design system/page.** That is
  [`ai-website-cloner-template`](../ai-website-cloner-template/); this project does
  not add a second browser extractor.
- **Free-form Figma authoring or repair.** Use
  [`talk-to-figma-fork`](../talk-to-figma-fork/) directly. This pipeline treats the
  source file as read-only evidence.
- **Single-frame generic codegen without a portable design system.** Use the official
  Figma design-to-code route or [`figma-to-astro`](../../skills/figma-to-astro/).
- **Backend/application behavior.** Authentication, APIs, databases, billing, and
  product logic cannot be inferred faithfully from visual source and are not generated.
- **Unauthorized brand replication.** Owned files, authorized client work, migrations,
  and learning are valid; passing another brand's identity off as original work is not.

## Parking lot (unsorted)

- DTCG / Tokens Studio export alongside OpenDesign.
- CSS/tokens-only lightweight output that skips the rich-package prose.
- A semantic diff report between Figma-derived and live-site-derived packages for the
  same brand.
- Component Storybook fixtures generated from Figma variants.
- Pitch-deck-specific output (one frame per slide, speaker notes, PDF export).
- A capture viewer that makes raw/normalized/derived provenance inspectable without
  reading JSON by hand.
