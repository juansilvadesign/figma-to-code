# R2 — Banco Lucrativo page MVP: acceptance

**Date:** 2026-09-26
**Verdict:** R2 acceptance is met. The page is static HTML on its private-local route. It
imports the validated package through the token seam, the production build is green, and
it has current 1280px/375px visual evidence plus documented gaps.

Everything below is private-local and gitignored except this note. That covers the
capture, package, topology, assets, page, and QA images.

## Pipeline

| Stage | Result |
| --- | --- |
| Capture | Fork R3.3.1 (`01ab491`) from its own worktree, with the pair `r3.3.1-server-9c8cb843a656` ↔ `r3.3.1-plugin-41fd0e925b27`. It produced 16 artifacts: 14 payloads and 2 screenshots. The 70 remote TEXT style records now read `partial` instead of crashing. |
| Package | 26/26 A1 slots and 14 authored overrides. The overrides assign roles only, and every value is measured in the capture. 56 slots were emitted, and OpenDesign quality is 100. |
| Topology | 14/14 bands, 235/235 TEXT nodes, 42/42 image fills, 24/24 reactions. See [`r2-banco-lucrativo-topology-note.md`](r2-banco-lucrativo-topology-note.md). |
| Assets | 117 published files, all from bounded node exports. See [`../R2.5-ASSET-EXPORT.md`](../R2.5-ASSET-EXPORT.md) § Live acceptance. |
| Page | 14 section components. It has no client JavaScript, no hard-coded colours, and 0 placeholders. |

## Gates (Node 24.18.0), final run

- `npm run check:astro`: passed. It covers lint, `astro check` (0 errors, 0 warnings, 0 hints), the scripts typecheck, and the build (2 pages).
- `npm run validate -- --brand banco-lucrativo`: quality 100, 15 checks, 0 failing. It was re-run after the last page correction.
- `check:r1:contract` 41, `check:r1:extract` 21, `check:r2.5:node-export` 13, `check:r2.5:asset-export` 6.
- The colour scan of the private route finds 0 hard-coded colours.

## Visual evidence

| Width | Figma frame height | Rendered height | Horizontal overflow | Broken images / anchors | Console errors |
| ---: | ---: | ---: | --- | --- | ---: |
| 1280 | 8851 | 8851 | none | 0 / 0 | 0 |
| 375 | 9653 | 9653 | none | 0 / 0 | 0 |

The final renders' SHA-256:
- 1280: `b7f85b78a959ab82…`
- 375: `4d3c2fceb46f82ab…`

There were six QA rounds. The first two measured the instrument, not the page:
- **Round 1:** 39 of 55 images rendered blank. The script counted only *completed* zero-width images as broken, so lazy images that were still loading passed silently. The fix forces every image eager and waits for all of them.
- **Round 2:** three images were still blank. Chromium's full-page capture can paint undecoded async images blank when they are off-screen. The fix calls `decode()` on every image and captures with a viewport as tall as the page.

## Corrections made during QA

- **Package.** `--surface-warm` became `#81c654` (the band fill), and `--accent-active` became `#25491e` (the band ink and the dark CTA). Both are measured values, assigned to roles.
- **Page:**
  - band colours and contrast;
  - the differential band now comes from a real render, and its hidden copy stays visually hidden, as in the captured initial frame;
  - one social-icon set per view;
  - the newsletter row geometry at both widths;
  - the testimonial measure;
  - the consent-link styling;
  - the FAQ open state;
  - the app art geometry;
  - the mobile header elevation;
  - a duplicated hero mark removed;
  - the transfer art now uses its composite instead of an authored outline.

## Gaps and deviations (documented, not guessed)

- **Video.** The URL captured in the design is dead: YouTube oEmbed returns 404. The embed is wired and waits for an owner-supplied URL.
- **Static by design:** motion (the variant transitions and hover animation), the simulator logic, the carousel, form submission, and every destination the design doesn't define.
- **Text emphasis ranges.** The capture reports uniform fills for mixed-style text nodes, so no range is applied rather than guessing one.
- **Newsletter watermark.** Its root fill can't be rendered without baking in visible copy, and the original-bytes path is blocked by the fork defect below.
- **Typefaces.** The source's nav and legal typefaces render in the body token.
- **Authored pieces:** the mobile menu disclosure and two accessibility strings.
- **Transfer art** sits about 30px narrower on desktop than in the source: its composite bounds include the outline margin.

## Found along the way

- **Fork.** `export_image_fill` sends each original image as one message. Large originals exceed the relay's 16 MiB cap (Bun's default) and drop the plugin. This is logged in the fork as a consumer bug. It didn't block R2, because bounded node renders replaced it.
- **Consumer.** The capture script and both exporters call `join_channel` as soon as the spawned server starts. One transient `Not connected to Figma` was that start-up race, and a retry passed. The R3 candidate fix is to wait for the server's relay socket first.
- **Extractor.** Mode names that carry the axis word ("Light Mode", "Modo Escuro") now classify as theme modes, with 4 new checks.
