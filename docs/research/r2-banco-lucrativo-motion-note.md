# R2 motion follow-up: the differential header on Banco Lucrativo (2026-09-26)

This note covers the desktop differential band's `header_component`: its four 1280 × 832 variants, animated on the private-local route. The nav hover is still open. The component's 1920 × 1080 variants stay out of scope, like the 1920 frame. Client content, node ids and renders stay private-local. This note records only mechanics, decisions and results.

## Evidence

- **The page capture held one state.** It recorded the component in its initial state only. The three later states had never been read.
- **Three read-only node-export bundles filled the gap.** They ran on fork R3.3.1 (`01ab491`) from its own worktree:
  - the four state renders (4/4);
  - per-card renders (6/6);
  - chip, title and icon renders (7/7, including two real SVGs).

  Together that is 17 exported and 0 rejected. Each export carries before/after node observations with canonical equality.
- **The reaction chain has four states in sequence.** Each step fires on mouse-enter after a 0.8 s delay, and runs a 0.3 s smart-animate with `EASE_OUT`. The last state resets on click, with no transition.

## What the states do

1. **Initial → 2:** a 25% dark overlay fades in over the background photo. A transaction chip slides up into the focused card from below its clip.
2. **2 → 3:** the focused card shrinks and its corner radius tightens. At the same time its outside stroke grows until it covers the whole stage. That growing stroke is the white wipe. The node's render bounds become the full stage, and the exact stroke weight isn't in the payload.
3. **3 → final:** the heading and the two side cards fade in. The side cards slide down 8 px, and the focused card drops into the row.

## Web translation

| Figma | Page |
| --- | --- |
| Mouse-enter + 0.8 s delay per step | **Scroll into view** (owner decision, 2026-09-26): the chain starts once, when ≥ 50% of the stage is visible, after its images decode. Each step fires 0.8 s after the previous transition ends. |
| Smart-animate, 0.3 s `EASE_OUT` | CSS transitions keyed on a `data-state` attribute, `0.3s cubic-bezier(0, 0, 0.58, 1)`. Layers are matched by name. |
| A layer whose `absoluteRenderBounds` is null | Opacity 0. It fades in when it appears. |
| Outside stroke | A spread `box-shadow`, which follows the corner radius the same way. The wipe weight is 460 px: the smallest multiple of ten that covers the stage, because render bounds give only a lower bound. |
| Final-state click → initial, no transition | Kept: an instant cut, then the chain replays. |
| — | Reduced motion shows the final state with no transitions. Without JS, the page shows the initial state. Mobile is unchanged, because the mobile frame has no animated component. |

The implementation is one small bundled script (no framework, no island) plus scoped CSS, and it uses tokens only. It has two colour deviations:
- The 25% overlay uses `color-mix(in srgb, black 25%, transparent)`, because the package has no black slot.
- The amount grey maps to the nearest token.

## Verification (the verifier's own runs)

- **Schedule:** 803–811, 1903–1911 and 3003–3011 ms after intersection across two runs, against the specified 800, 1900 and 3000.
- **Transitions:** 2, 18 and 6 running transitions per step. They were captured in real time, with the transitions paused and seeked to 25, 50 and 75%.
- **Settled states against the Figma renders:** the mean absolute difference per channel is at most 3.61, and at most 4.37% of pixels differ by more than 16.

  | State | R | G | B | Pixels > 16 |
  | --- | ---: | ---: | ---: | ---: |
  | initial | 3.360 | 2.405 | 3.609 | 4.367% |
  | 2 | 3.122 | 2.351 | 3.329 | 3.478% |
  | 3 | 1.069 | 0.905 | 1.165 | 1.698% |
  | final | 3.451 | 2.748 | 3.490 | 4.301% |
- **Other modes:** reduced motion lands on the final state with 0 running animations. No-JS stays on the initial state. The final-state click resets within one frame and replays.
- **Regressions:**
  - the 375 px band is pixel-identical to QA round 6;
  - the 1280 page is still 8851 px tall, with no overflow, 0 broken images and 0 console errors;
  - the band keeps its image-cover geometry at 768, 1024, 1280, 1440 and 1920 px.
- **Gates:**
  - `npm run check:astro` passes;
  - `npm run validate -- --brand banco-lucrativo` scores 100 (15 checks, 0 failing);
  - the colour scan of the private route finds 0 hard-coded colours.

## Found along the way

- **A fake clock can hide CSS transitions.** The first QA pass stepped the page with Playwright's `page.clock`. It recorded the 2 → 3 step with **zero** running transitions, so its "mid-transition" strip was three copies of the settled state. It still read as clean. The capture now pauses the transitions in real time, and exits non-zero whenever a step captures none.
- **A settled-state comparison can't see mid-transition defects.** The first derived photo for the focused card filled its corners from a render with the chip baked in. The live chip covers that spot at rest. Mid-shrink, it showed as white crescents. The corners now come from the background composite. It is measured as aligned with the card's photo: a mean difference of 3.5–4.3, against 15.5–72 when shifted by 12 px.
- **The capture schema records no `opacity`, `visible` or `strokeWeight`.** Hidden layers are inferred from null render bounds, and the wipe weight has only a lower bound. This is a generic read gap, so it belongs to the fork.
- **A 1 px font drift wrapped the subtitle.** Figma renders the final-state subtitle on one line, both in its layout (render bounds 575 × 18 inside a 588 × 27 box) and in its export. The web Inter measures the same line at 589 px, so the page wrapped its last word onto a second line. Whether it wrapped then depended on sub-pixel details. It is now pinned to one line (`white-space: nowrap`), which matches the design's single-line box. The first diagnosis blamed the export: the side-by-side panels had been read the wrong way round (Figma is on the left).

## Known limitation

A thin ring arc can show at the focused card's two bottom corners during part of the 0.3 s shrink: 2,502 raster pixels, by the derivation script's count. No exported render has clean photo there, because the initial renders carry the stroke and the final render carries the baked chip. The fill's original image bytes would remove it, and that path waits on the fork's image-fill payload cap.
