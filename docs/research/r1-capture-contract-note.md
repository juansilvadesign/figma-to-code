# R1.1 build note — immutable capture contract

Date: 2026-07-31

## Boundary

R1.1 was completed entirely offline. No Figma file was opened, no MCP tool was
called, and `talk-to-figma-fork` was not modified.

The external payload requirements came only from the pinned fork's committed public
`README.md` and `docs/READ-LAYER-PLAN.md` at
`956a6afcec72f8ccd025b46475de8e2474786e36`. The validators do not import or copy
fork implementation code and permit unknown additive reply fields.

## Contract delivered

- Versioned JSON Schema:
  `schemas/capture-manifest.schema.json`.
- Versioned override schema:
  `schemas/slot-overrides.schema.json`.
- Strict manifest/integrity loader:
  `scripts/lib/capture-contract.ts`.
- Isolated external reply validators:
  `scripts/lib/fork-payload-contracts.ts`.
- Synthetic authorized fixture:
  `tests/fixtures/captures/synthetic-valid/`.
- Offline mutation suite:
  `scripts/test-capture-contract.ts`.
- Ownership, fingerprint, coverage, privacy, and R1.2 handoff documentation:
  `docs/CAPTURE-CONTRACT.md`.

The manifest records source identity, selected original page/node IDs, capture time,
authorization/provenance, every tool call, declared scope and limitations, payload
byte counts/hashes, the strict fork/server/plugin pin, and a canonical fingerprint
over the required MCP input schemas.

Original node IDs are preserved in metadata and arguments. Only filename colons are
replaced:

```text
I7448:39456;12:25308 → I7448_39456;12_25308
```

Raw image-export replies are retained separately from screenshots. Validation
decodes the raw base64 and proves the materialized image bytes match.

## Privacy result

Live capture material under `docs/research/<slug>/` is ignored by default:

- `capture-manifest.json`
- `slot-overrides.json`
- `raw/`
- `screenshots/`
- `normalized/`

The sanitized fixture under `tests/fixtures/captures/` remains trackable. A
`sanitized-fixture` manifest with `containsPrivateContent: true` fails validation.

## Clean-install acceptance

Exact commands:

```bash
nvm use
npm ci
npm run check:r1:contract
npm run check:r0
```

Observed results:

- `npm ci`: 6 packages added, 7 audited, 0 vulnerabilities.
- Strict TypeScript: passed for every script and contract module.
- Capture-contract suite: 25 checks passed.
- Valid synthetic bundle: 12 raw payloads and 2 screenshots loaded offline.
- Negative coverage: version/runtime/fingerprint drift, missing artifacts, unsafe
  paths, tool-role drift, privacy violations, hash tampering, incomplete or
  unsupported variables, limitation drift, malformed counts, image divergence,
  and invalid overrides all failed clearly.
- R0 regression suite: emission and both default/explicit OpenDesign validation
  remained green at package quality 100; both R0 negative checks still passed.

## Live-capture caveat

The synthetic raw reply shapes exercise guarantees documented publicly by the fork,
not a real SYD response. R1.2 must preserve the first observed replies unchanged.
Additive fields need no contract change. If a required documented field differs or
is absent, stop at the adapter boundary, record the observed shape, and version the
contract deliberately rather than rewriting evidence to resemble this fixture.
