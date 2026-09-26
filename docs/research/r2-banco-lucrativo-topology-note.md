# R2.4 — frozen desktop/mobile page topology

**Date:** 2026-09-25  
**Release:** R2 static-first page contract  
**Verdict:** passed

## Outcome

The captured desktop and mobile frame family is frozen in a private-local topology specification and three normalized ledgers. The specification pairs 14 ordered bands, records view-specific copy and responsive relationships, identifies asset export targets, and separates captured interactions from documented gaps. No page implementation or source capture was changed.

| View | Root | Size | Content bands | Node payload SHA-256 | Screenshot SHA-256 |
| --- | --- | ---: | ---: | --- | --- |
| Desktop | `2976:36077` | 1280 × 8851 | 14 | `83916e1bd7435879986d0434da05c2f50fe6c884dc80ae3085e23722ce2e5f85` | `9abdea07ece4816d4695b6b27653f3b61a0a0a8e12478945eead51c0c8a50fa5` |
| Mobile | `3029:36452` | 375 × 9653 | 14 | `8db8890a534f34ed794fc8a9926c328d95d256fdbf54cfe0c29b6c7bd32efda9` | `dca36b791a38fcda795ba397822709442a4a6c513e1aeed1b31b74975a2b5e78` |

The capture manifest SHA-256 is `94e4b73ebf254cc27d647c96c8245d6b7ac4dd9ce169eef853964a20813f7648`.

## Private artifact lock

| Artifact | Coverage | SHA-256 |
| --- | ---: | --- |
| `docs/research/banco-lucrativo/normalized/text-ledger.json` | 235 / 235 TEXT nodes | `0fc816fc782e05714e15a54cfea49fcb5e3504aeddb757b529fb69a52ac4ee90` |
| `docs/research/banco-lucrativo/normalized/asset-ledger.json` | 42 / 42 image fills; 63 SVG targets; 14 composites | `83e18a973e51c5abc7f60b3e1aa8b84fc2282bf8564409f6acfb123ea0fc2d5e` |
| `docs/research/banco-lucrativo/normalized/reaction-ledger.json` | 24 / 24 reactions | `d373b8ffa6e4d3ed6f3559554c1327ca6721e16dad6e79ffe49f53881bebb373` |
| `docs/research/banco-lucrativo/page-topology.md` | 14 / 14 section specs | `7f17e660d577d934ff2c556bdfc27462b52ee0336e58ae2f7163166d8455ad77` |

The detailed artifacts remain private-local because they contain source copy and asset identifiers. This note contains only counts, hashes, and acceptance results.

## Verification

- TEXT coverage is 122 / 122 desktop and 113 / 113 mobile. The ledger preserves exact node characters and assigns every entry a disposition. All 129 page-copy entries are represented byte-for-byte in the private topology; 125 have render bounds in the captured state.
- Image-fill coverage is 23 / 23 desktop and 19 / 19 mobile. Parent-node SVG export targets total 32 desktop and 31 mobile.
- Reaction coverage is 14 / 14 desktop, 2 / 2 mobile, and 8 / 8 in the separate component set. The ledger counts one reaction per captured reaction object, even when the payload repeats its action in two fields.
- `npm run check:r1:contract`: 41 checks passed.
- `npm run check:r1:extract`: 21 checks passed.

## Acceptance

Passed. The private contract is locked to the manifest, frame payloads, screenshots, and ledgers above. Source copy differences and behavior gaps remain explicit for implementation review. The cache provides topology evidence but no standalone child asset files; any later export or derived crop must keep its provenance.
