# Capture contract v1

Status: frozen for R1.1 on 2026-07-31. No live Figma capture was used to define or
test this contract.

The capture bundle is the immutable seam between the pinned independent Figma
reader and every transform this project owns:

```text
talk-to-figma-fork reply
  → byte-for-byte evidence + hashes
  → versioned manifest validation
  → later fork adapter / normalized data
  → tokens.source.json
```

The runtime implementation is
[`scripts/lib/capture-contract.ts`](../scripts/lib/capture-contract.ts). Fork
payload guarantees are isolated in
[`scripts/lib/fork-payload-contracts.ts`](../scripts/lib/fork-payload-contracts.ts).
Those validators were derived only from the pinned fork's committed public
`README.md` and `docs/READ-LAYER-PLAN.md`; this project does not import fork
source or helpers.

## Bundle layout

One directory represents one capture:

```text
docs/research/<slug>/
  capture-manifest.json
  raw/
    document.json
    documents/<safe-page-id>.json   # used instead for multi-page captures
    pages.json
    variables.json
    styles.json
    components.json
    nodes/<safe-node-id>.json
    node-variables/<safe-node-id>.json
    reactions/<safe-node-id>.json
    exports/<safe-node-id>.json
  screenshots/<safe-node-id>.<png|jpg|svg>
  slot-overrides.json
```

`raw/exports/` keeps the original `export_node_as_image` reply. The screenshot is
the decoded image bytes and declares `derivedFromArtifactId` in the manifest.
Validation proves that the decoded bytes match, so materializing the image never
destroys the original reply.

Original Figma IDs remain in `source.selectedPageIds`,
`source.selectedNodes`, artifact `nodeId`/`pageId`, and tool arguments. Only
filenames change: `:` becomes `_`; every other path-safe character is preserved.
For example:

```text
I7448:39456;12:25308
→ I7448_39456;12_25308
```

A one-page capture uses `raw/document.json`. A multi-page capture requires one
`get_document_info` artifact per selected page under `raw/documents/`; the
manifest records the original `pageId` for each.

## Ownership and mutability

| Layer | Owner | Rule |
| --- | --- | --- |
| `capture-manifest.json` | Capture operation | Versioned index of identity, runtime, calls, coverage, authorization, and integrity. Never edit it to disguise changed evidence. |
| `raw/**` | Fork tool replies | Immutable evidence. Save once and never normalize, sort, or prune fields in place. |
| `screenshots/**` | Capture operation | Exact decoded bytes from the linked raw export reply. |
| `slot-overrides.json` | Human/operator | Explicit authored input, separately hashed. Never present an override as Figma evidence. |
| Future `normalized/**` | This project | Disposable, reproducible adapter output. Delete and rebuild instead of editing. |
| `design-systems/<slug>/**` | This project/OpenDesign | Reproducible output from validated capture plus explicit overrides. |

If any raw reply must be called again, make a new capture directory and manifest.
Do not silently replace an artifact under an existing capture ID.

## Manifest guarantees

Schema:
[`schemas/capture-manifest.schema.json`](../schemas/capture-manifest.schema.json).
The TypeScript loader enforces cross-file rules JSON Schema cannot:

- exact schema version `figma-to-code/capture-manifest/v1`;
- file/document identity plus selected original page and node IDs;
- at least one desktop and one mobile representative frame;
- authorization basis, privacy declaration, and commit policy;
- strict pinned fork commit, package version, server bundle hash, plugin identity,
  plugin API/document-access mode, plugin manifest hash, and plugin code hash;
- all required read capabilities and their input-schema hashes;
- canonical required-tool capability fingerprint;
- one document/pages/variables/styles/components payload plus the node evidence
  required by every selected frame;
- a reactions payload for each node marked `interactive-root`;
- exact role → tool, node ID → argument, and role → path relationships;
- byte count and SHA-256 for every artifact and the override file;
- raw payload top-level guarantees, count arithmetic, support, completeness, and
  limitations;
- screenshot MIME/signature plus equality with its decoded raw export.

Unknown manifest versions and runtime mismatches fail closed. Unknown additive
fields inside raw fork replies remain allowed and preserved.

## Runtime fingerprint

R1 uses a strict runtime pin:

| Item | Expected |
| --- | --- |
| Fork commit | `35467196397fdcecb8bd26c3e2c8f331ec6db0ce` |
| Package version | `0.3.5` |
| `dist/server.js` SHA-256 | `d8cf09aad16559b618884616aca3b927ca495c86a7048992d3ad1ab192a5422c` |
| Plugin | `Talk to Figma (fork)` / `1485687494525374295` |
| Plugin API | `1.0.0`, `documentAccess: dynamic-page` |
| Plugin manifest SHA-256 | `6c7e43e9a3d2abfbcd809d8adb9174f89d2b1fd3a1a00800b4f30946adab3738` |
| Plugin `code.js` SHA-256 | `4188c501dd2f15502a00c10df7c7c5069dde5c2b1345165d82da64810c5955fe` |

**Pin advanced 956a6af → 3546719 on 2026-07-31**, as a deliberately accepted
compatible release rather than a read fix. R1.2 preflight found the connected
runtime two commits ahead of the R1.1 pin; `956a6af` is a verified ancestor of
`3546719` and the delta is `ROADMAP.md` plus `TASKS.md` only — 506 insertions, no
deletions, and no change to `src/`, `dist/`, or the plugin. Every hash in the table
above is byte-identical across the two commits, so the executable contract R1.1
froze is unchanged. Only the commit identifier moved.

Until the fork exposes a formal runtime handshake, R1.2 must list the MCP tools,
canonicalize each required tool's complete `inputSchema` by recursively sorting
object keys, hash each schema, then hash the sorted
`{name,inputSchemaSha256}` list. `computeJsonSha256()` and
`computeCapabilityFingerprint()` implement that definition.

The checked-in synthetic fixture uses deterministic stand-in input-schema hashes
and says so in provenance. A live capture must use the schemas actually returned
by that runtime.

## Coverage policy

The contract preserves `supported`, `complete`, pagination, scope, skipped/not-found
pages, and limitations rather than treating a missing value as a negative finding.

For the Importer MVP:

- `get_variables` and `get_node_variables` must report both
  `supported: true` and `complete: true`;
- pages, document summary, styles, selected-page component summary, node-variable
  reads, and reactions must be complete for their declared scope;
- `get_document_info` may contain a bounded child slice, but its pagination and
  `childrenTruncated` fields must agree with `currentPage.childCount`;
- a scoped component scan may be complete for selected pages while explicitly not
  being a document census;
- reaction limitations remain evidence even when `reactionCount` is zero.

Any partial critical payload blocks downstream extraction. The response remains on
disk so the operator can diagnose or recapture it.

## Privacy default

Live bundle manifests, raw replies, screenshots, overrides, and normalized outputs
under `docs/research/<slug>/` are gitignored by default. They can expose file keys,
client copy, images, variable/style names, and internal node IDs.

Only an authorized sanitized fixture may enter
`tests/fixtures/captures/`. It must declare:

```json
{
  "containsPrivateContent": false,
  "commitPolicy": "sanitized-fixture"
}
```

Use `private-local` for any real capture that has not been explicitly sanitized and
approved for version control. Never store Figma access tokens, cookies, relay
credentials, or other secrets in a bundle.

## Offline acceptance

The synthetic fixture is
[`tests/fixtures/captures/synthetic-valid/`](../tests/fixtures/captures/synthetic-valid/).
It contains no real Figma data.

```bash
nvm use
npm ci
npm run check:r1:contract
```

The suite loads the valid bundle and then mutates temporary copies to prove that
version/runtime drift, missing evidence, unsafe paths, tool mismatches, byte/hash
tampering, unsupported or incomplete variables, limitation drift, malformed payload
counts, export/screenshot divergence, and invalid overrides all fail clearly.

## R1.2 handoff

The first live SYD session begins with read-only preflight, not capture:

1. verify the server/plugin hashes and identity above;
2. collect and hash the required MCP tool schemas;
3. compare the computed fingerprint before the first document read;
4. capture each reply exactly once into a private-local bundle;
5. run the offline loader before any normalization or extraction work.

If the real reply adds fields, preserve them. If it contradicts a documented required
field, stop and update the versioned fork adapter from observed evidence; do not
rewrite the raw reply to fit this fixture.
