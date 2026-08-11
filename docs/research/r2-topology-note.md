# R2.4 — frozen SYD desktop/mobile topology

**Date:** 2026-08-10  
**Release:** R2 — Astro page MVP  
**Verdict:** passed

## Outcome

The cached Paciente frame family is frozen before section implementation. One
private-local spec now maps all 12 desktop/mobile section pairs to semantic Astro
component contracts and records their copy, assets, responsive relationships,
source disagreements, interactions, and unsupported behavior.

The detailed artifact stays at `docs/research/syd/page-topology.md` because it quotes
private client copy and node/asset evidence. It is 31,860 bytes / 625 lines with
SHA-256:

```text
3b85994d05f1df23c520214ff1cb6e6fe030fd67141c91c30bbacbc05f653b73
```

`.gitignore` now explicitly protects this artifact class rather than relying on all
of the directory's existing children happening to be ignored. This note records the
non-private acceptance result. No `.astro` section was authored.

## Selected frame family

| View | Root | Size | Direct sections | Node payload SHA-256 | Screenshot SHA-256 |
| --- | --- | ---: | ---: | --- | --- |
| Desktop | `1082:1875` | 1280 × 9410 | 12 | `44f77a3696be37a8190ed75ce27e181cb7fb95009994b2c052c469d119fe8050` | `9db53db3dae7e096b927139fb8c83becd42e90df4934748af62882e26c219c32` |
| Mobile | `1155:5211` | 375 × 11759 | 12 | `9b579982c0524892cf9d3fa90a80378f933ca33c81030fc86b99373d1787ced6` | `72d485a70a05dcf5fd97537d248dcbb767049ae54d7a4adad5831dcb1e848943` |

Both roots are `Paciente` frames from page `1068:5433` in the authoritative source
capture. Their direct children have the same names in the same order, and their
heights sum exactly to their respective root heights. Each section starts at the
previous section's end: the page owns 12 contiguous section bands with no unassigned
gap.

The semantic mapping is:

```text
SiteHeader → HeroSection → HowItWorksSection → BenefitsSection
→ PricingSection → ProfessionalsSection → BusinessCtaSection
→ ContactSection → TestimonialsSection → FaqSection
→ AppDownloadSection → SiteFooter
```

## How the freeze was checked

1. Parsed both immutable node trees and paired their 12 direct children by index and
   Figma name.
2. Cropped the two hashed whole-frame PNGs at those exact section boundaries and
   visually compared all 12 desktop/mobile pairs. Crops were temporary QA output,
   not new source evidence.
3. Audited every captured text node against the private spec after representing the
   source's U+2028 and LF separators explicitly: **275 / 275 text nodes represented,
   0 missing** (145 desktop, 130 mobile). Hidden UI-kit helper/login residue is
   recorded and explicitly excluded rather than silently dropped.
4. Classified all **61 image-fill nodes** (32 desktop, 29 mobile) by section and
   asset role. The apparent count is high because each professional card contains
   one main photo plus five overlapping avatar image fills.
5. Mapped all **13 captured reactive descendants**: four benefits timeline hovers,
   three contact help-icon hovers, and six FAQ clicks. The spec preserves the fork's
   limitation and does not treat the absence of other reactions as proof.
6. Confirmed `src/` still contains only the R2.2 foundation page
   `src/pages/index.astro`; no section component exists.

## Responsive findings now fixed as contract

- The recurring content relationship is 1168px + 56px gutters at the 1280px source
  and 343px + 16px gutters at the 375px source.
- Navigation links/CTA collapse to a menu icon; they do not wrap.
- Hero, benefits, contact, testimonials, app download, and footer change composition,
  not merely scale.
- Benefits drops its illustration on mobile; hero drops its large lockup and both
  store actions.
- Process steps and pricing cards move from rows to stacks.
- Professional and testimonial tracks deliberately overflow; mobile shows one card
  plus following-track evidence rather than shrinking cards.
- FAQ retains the same six-item order and first-open state.

## Conflicts preserved, not guessed away

The two source views disagree on the hero headline, pricing introduction, one
session-duration value, and testimonial inventory. The private spec cites the exact
nodes and strings. The implementation may not pick a canonical winner without
recording that product decision.

This is the main reason R2.4 precedes components: a page authored directly from the
screenshots would almost certainly normalize these differences invisibly.

## Asset sufficiency finding

The cache is sufficient to freeze topology but is **not** a standalone asset bundle.
Only the two complete page frames were exported. Child image nodes have geometry and
fill kind but no image reference or bytes; several logos, illustrations, and icons
are opaque instances.

Most photographic gaps can be represented temporarily by a crop of the evidence
screenshot, clearly marked as derived. One cannot: the business CTA's image fill is
on the section root underneath its text. Its background cannot be separated from the
cached PNG without damaging or duplicating content.

The next slice may therefore use the existing R2 exception for a **targeted read-only
child export pass**, scoped only to asset nodes named by the frozen spec. It must not
recapture the page, rewrite raw evidence, reopen token heuristics, or start section
code before the required asset provenance is settled.

## Regression gates

Run on Node `v24.18.0` / npm `11.16.0` after the freeze:

| Gate | Result |
| --- | --- |
| Private `syd` package validation | quality 100; 15 checks, 0 failing |
| `npm run check:r1:contract` | 31 checks passed |
| R2.3 build-target tests | 6 checks passed, including failure-before-mutation |
| Vendor parity | 24 checks passed |
| Astro lint/typecheck | 4 files; 0 errors, warnings, or hints |
| Static Astro build | 1 page built; committed `psiativa` seam restored |

The standalone validator's first sandboxed `tsx` invocation hit the already known
local IPC restriction under `/tmp/tsx-1000`; the approved identical rerun passed.

## Acceptance

Passed. The desktop/mobile page topology, verbatim copy ledger, asset inventory,
responsive mappings, interaction evidence, and gaps are frozen against immutable
hashes. R2 can now reason about asset readiness and page assembly without deriving
structure while coding.
