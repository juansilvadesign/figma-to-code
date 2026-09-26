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
[`scripts/lib/fork-payload-contracts.ts`](../scripts/lib/fork-payload-contracts.ts);
this project does not import fork source or helpers.

> **Corrected 2026-07-31 / 2026-08-02 from live evidence.** These validators were
> originally derived from the fork's committed prose (`README.md`,
> `docs/READ-LAYER-PLAN.md`), and live capture showed **seven of nine payload
> roles were specified wrongly** — `document`, `variables`, `styles`,
> `components`, `node-variables`, `reactions`, and `image-export`. Only `pages`
> and `node` were right. Prose is not a schema: every role is now shaped from an
> observed reply, and `docs/research/r1-capture-note.md` records what each one
> actually returns.
>
> `image-export` was the last to be verified because it needs a client that does
> not render images. `export_node_as_image` returns an **MCP image content
> block** — `{type: "image", data, mimeType}` — not a descriptive envelope. It
> carries no node id and no `encoding` field, so the exported node is knowable
> only from the manifest's `toolCall.arguments.nodeId`.

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

Every manifest names exactly one supported pin, and it is checked against that pin, never
against whichever pin is current. `CAPTURE_FORK_PINS` in
[`capture-contract.ts`](../scripts/lib/capture-contract.ts) holds the table; `PINNED_FORK`
is the one new captures must use.

| Item | `R1_CAPTURE_FORK` (SYD's capture) | `R3_2_1_FORK` (new captures, 2026-09-24–2026-09-25) | `R3_3_1_FORK` (new captures, since 2026-09-25) |
| --- | --- | --- | --- |
| Fork commit | `5e0c869b0409f196de1b73c9f849736dfb114e48` | `e136177eb3a8007288126381d1cdb145a387137d` | `01ab4916f9e41180664b997e4a601b9cef930417` |
| Package version | `0.3.5` | `0.3.5` | `0.3.5` |
| `dist/server.js` SHA-256 | `d8cf09aad16559b618884616aca3b927ca495c86a7048992d3ad1ab192a5422c` | `35bbb280ff5a0a945fd54a1ea98ec2e9d6864c451b9d81ad9b342f76d431b69f` | `f99c3e4470f3d9a913dc87b1c978df55a729f4495b540c3b2bdfcfc9185f87bb` |
| Plugin | `Talk to Figma (fork)` / `1485687494525374295` | same | same |
| Plugin API | `1.0.0`, `documentAccess: dynamic-page` | same | same |
| Plugin manifest SHA-256 | `6c7e43e9a3d2abfbcd809d8adb9174f89d2b1fd3a1a00800b4f30946adab3738` | same | same |
| Plugin `code.js` SHA-256 | `4188c501dd2f15502a00c10df7c7c5069dde5c2b1345165d82da64810c5955fe` | `6d6215beed6a4b680a7beefcd189107644e6cc3f206a0b4e3c5af1aced8d270c` | `58dd025b2e894771f98d93e4e0175bcda3646d782430cc05a6c23ba29f02afb7` |
| Connected identity | none (predates `get_runtime_info`) | `R3.2.1`, `r3.2.1-server-798028241619` ↔ `r3.2.1-plugin-d9b64d2ac562`, schema/API `1.21.0`, `sha256:f6f9c2bb…` | `R3.3.1`, `r3.3.1-server-9c8cb843a656` ↔ `r3.3.1-plugin-41fd0e925b27`, schema/API `1.23.0`, `sha256:541d14db…` |

**Why the connected identity matters.** The file hashes describe a checkout on disk, not
the plugin Figma actually launched. A development plugin imported from a second checkout
carries the same name and id, so the Figma menu cannot tell the two apart. On 2026-09-24
the handshake refused exactly that: a work-in-progress plugin launched from the fork's own
tree. Run captures from an isolated, detached worktree at the pin, and preflight it with
`--fork-root`.

**Adding a pin.** Add a new entry and leave the old ones in place while any kept capture
names them. A kept capture is never re-stamped: it replays against the runtime that
produced it.

**Historical: pin advanced 956a6af → 3546719 → 5e0c869**, each a deliberately accepted
compatible release rather than a read fix. Preflight found the drift and failed
closed both times, which is the intended behaviour. Each earlier pin is a verified
ancestor, and both deltas touch only `ROADMAP.md` / `TASKS.md` — no change to
`src/`, `dist/`, or the plugin. Every hash in the table above is byte-identical
across all three commits and the capability fingerprint is unchanged, so the
executable contract R1.1 froze is untouched. Only the commit identifier moved.

Advancing the pin is therefore a two-step rule: prove the old pin is an ancestor,
and prove `git diff --name-only <old>..<new>` touches no executable path. If
either fails, re-capture rather than re-pin.

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

- `get_variables` must report both `supported: true` and `complete: true`;
- `get_node_variables` must report `supported: true`. It may report
  `complete: false` **only** when it quantifies exactly what it could not
  resolve (`unresolvedBindings` / `unresolvedStyles`, at least one non-zero) and
  the manifest records the matching limitation. A read that resolves 885 of 888
  style references is evidence, not a failure — discarding it because 3 are
  `mixed` is the false negative this policy exists to prevent. Unquantified
  partials remain fatal;
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
