/**
 * Immutable Figma capture-bundle contract.
 *
 * Raw fork replies are hashed evidence. This loader validates them without
 * normalizing or rewriting them; later adapters consume the returned values.
 */

import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";

import {
  FORK_PAYLOAD_ROLES,
  type ForkPayloadRole,
  type JsonObject,
  type JsonValue,
  type ValidatedForkPayload,
  isJsonValue,
  validateForkPayload,
} from "./fork-payload-contracts.js";

export const CAPTURE_SCHEMA_VERSION =
  "figma-to-code/capture-manifest/v1" as const;
export const SLOT_OVERRIDES_SCHEMA_VERSION =
  "figma-to-code/slot-overrides/v1" as const;

export const PINNED_FORK = {
  commit: "35467196397fdcecb8bd26c3e2c8f331ec6db0ce",
  packageVersion: "0.3.5",
  serverBundleSha256:
    "d8cf09aad16559b618884616aca3b927ca495c86a7048992d3ad1ab192a5422c",
  plugin: {
    name: "Talk to Figma (fork)",
    id: "1485687494525374295",
    api: "1.0.0",
    documentAccess: "dynamic-page",
    manifestSha256:
      "6c7e43e9a3d2abfbcd809d8adb9174f89d2b1fd3a1a00800b4f30946adab3738",
    codeSha256:
      "4188c501dd2f15502a00c10df7c7c5069dde5c2b1345165d82da64810c5955fe",
  },
} as const;

export const REQUIRED_READ_CAPABILITIES = [
  "export_node_as_image",
  "get_document_info",
  "get_local_components",
  "get_node_info",
  "get_node_variables",
  "get_pages",
  "get_reactions",
  "get_styles",
  "get_variables",
  "set_current_page",
] as const;

const CAPTURE_PURPOSES = [
  "desktop-frame",
  "mobile-frame",
  "interactive-root",
  "token-measurement",
] as const;

const COVERAGE_SCOPES = [
  "document",
  "current-page",
  "selected-pages",
  "node",
  "node-subtree",
] as const;

const AUTHORIZATION_BASES = [
  "owned",
  "client-approved",
  "licensed",
  "synthetic",
] as const;

const COMMIT_POLICIES = ["private-local", "sanitized-fixture"] as const;
const SCREENSHOT_MEDIA_TYPES = [
  "image/png",
  "image/jpeg",
  "image/svg+xml",
] as const;
const HASH_PATTERN = /^[a-f0-9]{64}$/;
const ISO_UTC_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type CapturePurpose = (typeof CAPTURE_PURPOSES)[number];
export type CoverageScope = (typeof COVERAGE_SCOPES)[number];
export type AuthorizationBasis = (typeof AUTHORIZATION_BASES)[number];
export type CommitPolicy = (typeof COMMIT_POLICIES)[number];
export type ScreenshotMediaType = (typeof SCREENSHOT_MEDIA_TYPES)[number];
export type CaptureArtifactRole = ForkPayloadRole | "screenshot";

export type SelectedNode = {
  id: string;
  name: string;
  pageId: string;
  purposes: CapturePurpose[];
};

export type CoverageRecord = {
  scope: CoverageScope;
  complete: boolean;
  supported?: boolean;
  limitations: string[];
};

export type CapabilityRecord = {
  name: string;
  inputSchemaSha256: string;
};

export type CaptureArtifact = {
  id: string;
  role: CaptureArtifactRole;
  path: string;
  mediaType: "application/json" | "text/plain" | ScreenshotMediaType;
  sha256: string;
  bytes: number;
  capturedAt: string;
  nodeId?: string;
  pageId?: string;
  toolCall?: {
    name: string;
    arguments: JsonObject;
  };
  coverage?: CoverageRecord;
  derivedFromArtifactId?: string;
};

export type CaptureManifest = {
  $schema: string;
  schemaVersion: typeof CAPTURE_SCHEMA_VERSION;
  captureId: string;
  brand: string;
  capturedAt: string;
  source: {
    kind: "figma";
    fileKey: string;
    documentId: string;
    documentName: string;
    selectedPageIds: string[];
    selectedNodes: SelectedNode[];
  };
  authorization: {
    status: "authorized";
    basis: AuthorizationBasis;
    capturedBy: string;
    containsPrivateContent: boolean;
    commitPolicy: CommitPolicy;
    notes: string;
  };
  provenance: {
    captureMethod: "read-only-local-mcp";
    operator: string;
    notes: string[];
  };
  runtime: {
    provider: "talk-to-figma-fork";
    forkCommit: string;
    packageVersion: string;
    serverBundleSha256: string;
    connection: {
      relay: "local-websocket";
      channel: string;
    };
    plugin: {
      name: string;
      id: string;
      api: string;
      documentAccess: string;
      manifestSha256: string;
      codeSha256: string;
    };
    capabilityFingerprint: {
      algorithm: "sha256";
      scope: "required-read-tools";
      value: string;
      tools: CapabilityRecord[];
    };
  };
  artifacts: CaptureArtifact[];
  overrides: {
    path: string;
    sha256: string;
    bytes: number;
  };
};

export type LoadedCaptureBundle = {
  root: string;
  manifest: CaptureManifest;
  payloads: ReadonlyMap<string, ValidatedForkPayload>;
  screenshots: ReadonlyMap<string, Uint8Array>;
  overrides: SlotOverrides;
};

export type SlotOverrides = {
  schemaVersion: typeof SLOT_OVERRIDES_SCHEMA_VERSION;
  modeMap: JsonObject;
  slots: JsonObject;
  notes: string[];
};

export class CaptureContractError extends Error {
  readonly issues: readonly string[];

  constructor(issues: string | readonly string[]) {
    const normalized = typeof issues === "string" ? [issues] : [...issues];
    super(
      `Capture contract failed with ${normalized.length} issue(s):\n` +
        normalized.map((issue) => `  - ${issue}`).join("\n"),
    );
    this.name = "CaptureContractError";
    this.issues = normalized;
  }
}

function fail(pathLabel: string, message: string): never {
  throw new CaptureContractError(`${pathLabel}: ${message}`);
}

function recordAt(value: unknown, pathLabel: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(pathLabel, "expected an object");
  }
  return value as Record<string, unknown>;
}

function stringAt(value: unknown, pathLabel: string): string {
  if (typeof value !== "string" || value.length === 0) {
    fail(pathLabel, "expected a non-empty string");
  }
  return value;
}

function booleanAt(value: unknown, pathLabel: string): boolean {
  if (typeof value !== "boolean") fail(pathLabel, "expected a boolean");
  return value;
}

function integerAt(value: unknown, pathLabel: string): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    fail(pathLabel, "expected a non-negative integer");
  }
  return value;
}

function arrayAt(value: unknown, pathLabel: string): unknown[] {
  if (!Array.isArray(value)) fail(pathLabel, "expected an array");
  return value;
}

function stringsAt(value: unknown, pathLabel: string): string[] {
  return arrayAt(value, pathLabel).map((entry, index) =>
    stringAt(entry, `${pathLabel}[${index}]`),
  );
}

function enumAt<const T extends readonly string[]>(
  value: unknown,
  allowed: T,
  pathLabel: string,
): T[number] {
  if (typeof value !== "string" || !allowed.includes(value)) {
    fail(pathLabel, `expected one of: ${allowed.join(", ")}`);
  }
  return value;
}

function exactAt(
  value: unknown,
  expected: string,
  pathLabel: string,
): string {
  const actual = stringAt(value, pathLabel);
  if (actual !== expected) {
    fail(pathLabel, `expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
  }
  return actual;
}

function hashAt(value: unknown, pathLabel: string): string {
  const hash = stringAt(value, pathLabel);
  if (!HASH_PATTERN.test(hash)) {
    fail(pathLabel, "expected a lowercase SHA-256 digest");
  }
  return hash;
}

function isoUtcAt(value: unknown, pathLabel: string): string {
  const timestamp = stringAt(value, pathLabel);
  if (!ISO_UTC_PATTERN.test(timestamp) || Number.isNaN(Date.parse(timestamp))) {
    fail(pathLabel, "expected an ISO-8601 UTC timestamp");
  }
  return timestamp;
}

function uniqueStringsAt(value: unknown, pathLabel: string): string[] {
  const entries = stringsAt(value, pathLabel);
  if (new Set(entries).size !== entries.length) {
    fail(pathLabel, "must not contain duplicate values");
  }
  return entries;
}

function parseSelectedNode(value: unknown, pathLabel: string): SelectedNode {
  const node = recordAt(value, pathLabel);
  const purposes = arrayAt(node.purposes, `${pathLabel}.purposes`).map(
    (purpose, index) =>
      enumAt(
        purpose,
        CAPTURE_PURPOSES,
        `${pathLabel}.purposes[${index}]`,
      ),
  );
  if (purposes.length === 0 || new Set(purposes).size !== purposes.length) {
    fail(`${pathLabel}.purposes`, "must contain unique capture purposes");
  }
  return {
    id: originalNodeIdAt(node.id, `${pathLabel}.id`),
    name: stringAt(node.name, `${pathLabel}.name`),
    pageId: originalNodeIdAt(node.pageId, `${pathLabel}.pageId`),
    purposes,
  };
}

function parseCoverage(value: unknown, pathLabel: string): CoverageRecord {
  const coverage = recordAt(value, pathLabel);
  return {
    scope: enumAt(coverage.scope, COVERAGE_SCOPES, `${pathLabel}.scope`),
    complete: booleanAt(coverage.complete, `${pathLabel}.complete`),
    supported:
      coverage.supported === undefined
        ? undefined
        : booleanAt(coverage.supported, `${pathLabel}.supported`),
    limitations: stringsAt(
      coverage.limitations,
      `${pathLabel}.limitations`,
    ),
  };
}

function parseToolCall(
  value: unknown,
  pathLabel: string,
): CaptureArtifact["toolCall"] {
  const call = recordAt(value, pathLabel);
  const argumentsValue = call.arguments;
  if (!isJsonValue(argumentsValue)) {
    fail(`${pathLabel}.arguments`, "must be a JSON object");
  }
  if (
    argumentsValue === null ||
    Array.isArray(argumentsValue) ||
    typeof argumentsValue !== "object"
  ) {
    fail(`${pathLabel}.arguments`, "must be a JSON object");
  }
  return {
    name: stringAt(call.name, `${pathLabel}.name`),
    arguments: argumentsValue,
  };
}

function parseArtifact(value: unknown, pathLabel: string): CaptureArtifact {
  const artifact = recordAt(value, pathLabel);
  const role = enumAt(
    artifact.role,
    [...FORK_PAYLOAD_ROLES, "screenshot"] as const,
    `${pathLabel}.role`,
  );
  const mediaType = enumAt(
    artifact.mediaType,
    ["application/json", "text/plain", ...SCREENSHOT_MEDIA_TYPES] as const,
    `${pathLabel}.mediaType`,
  );
  return {
    id: stringAt(artifact.id, `${pathLabel}.id`),
    role,
    path: safeRelativePathAt(artifact.path, `${pathLabel}.path`),
    mediaType,
    sha256: hashAt(artifact.sha256, `${pathLabel}.sha256`),
    bytes: integerAt(artifact.bytes, `${pathLabel}.bytes`),
    capturedAt: isoUtcAt(artifact.capturedAt, `${pathLabel}.capturedAt`),
    nodeId:
      artifact.nodeId === undefined
        ? undefined
        : originalNodeIdAt(artifact.nodeId, `${pathLabel}.nodeId`),
    pageId:
      artifact.pageId === undefined
        ? undefined
        : originalNodeIdAt(artifact.pageId, `${pathLabel}.pageId`),
    toolCall:
      artifact.toolCall === undefined
        ? undefined
        : parseToolCall(artifact.toolCall, `${pathLabel}.toolCall`),
    coverage:
      artifact.coverage === undefined
        ? undefined
        : parseCoverage(artifact.coverage, `${pathLabel}.coverage`),
    derivedFromArtifactId:
      artifact.derivedFromArtifactId === undefined
        ? undefined
        : stringAt(
            artifact.derivedFromArtifactId,
            `${pathLabel}.derivedFromArtifactId`,
          ),
  };
}

function parseCapability(
  value: unknown,
  pathLabel: string,
): CapabilityRecord {
  const capability = recordAt(value, pathLabel);
  return {
    name: stringAt(capability.name, `${pathLabel}.name`),
    inputSchemaSha256: hashAt(
      capability.inputSchemaSha256,
      `${pathLabel}.inputSchemaSha256`,
    ),
  };
}

export function parseCaptureManifest(value: unknown): CaptureManifest {
  const root = recordAt(value, "capture-manifest");
  const source = recordAt(root.source, "capture-manifest.source");
  const authorization = recordAt(
    root.authorization,
    "capture-manifest.authorization",
  );
  const provenance = recordAt(
    root.provenance,
    "capture-manifest.provenance",
  );
  const runtime = recordAt(root.runtime, "capture-manifest.runtime");
  const connection = recordAt(
    runtime.connection,
    "capture-manifest.runtime.connection",
  );
  const plugin = recordAt(
    runtime.plugin,
    "capture-manifest.runtime.plugin",
  );
  const fingerprint = recordAt(
    runtime.capabilityFingerprint,
    "capture-manifest.runtime.capabilityFingerprint",
  );
  const overrides = recordAt(
    root.overrides,
    "capture-manifest.overrides",
  );

  const selectedPageIds = uniqueStringsAt(
    source.selectedPageIds,
    "capture-manifest.source.selectedPageIds",
  ).map((id, index) =>
    originalNodeIdAt(id, `capture-manifest.source.selectedPageIds[${index}]`),
  );
  const selectedNodes = arrayAt(
    source.selectedNodes,
    "capture-manifest.source.selectedNodes",
  ).map((node, index) =>
    parseSelectedNode(
      node,
      `capture-manifest.source.selectedNodes[${index}]`,
    ),
  );
  const tools = arrayAt(
    fingerprint.tools,
    "capture-manifest.runtime.capabilityFingerprint.tools",
  ).map((tool, index) =>
    parseCapability(
      tool,
      `capture-manifest.runtime.capabilityFingerprint.tools[${index}]`,
    ),
  );

  const manifest: CaptureManifest = {
    $schema: stringAt(root.$schema, "capture-manifest.$schema"),
    schemaVersion: exactAt(
      root.schemaVersion,
      CAPTURE_SCHEMA_VERSION,
      "capture-manifest.schemaVersion",
    ) as typeof CAPTURE_SCHEMA_VERSION,
    captureId: stringAt(root.captureId, "capture-manifest.captureId"),
    brand: stringAt(root.brand, "capture-manifest.brand"),
    capturedAt: isoUtcAt(root.capturedAt, "capture-manifest.capturedAt"),
    source: {
      kind: exactAt(
        source.kind,
        "figma",
        "capture-manifest.source.kind",
      ) as "figma",
      fileKey: stringAt(
        source.fileKey,
        "capture-manifest.source.fileKey",
      ),
      documentId: stringAt(
        source.documentId,
        "capture-manifest.source.documentId",
      ),
      documentName: stringAt(
        source.documentName,
        "capture-manifest.source.documentName",
      ),
      selectedPageIds,
      selectedNodes,
    },
    authorization: {
      status: exactAt(
        authorization.status,
        "authorized",
        "capture-manifest.authorization.status",
      ) as "authorized",
      basis: enumAt(
        authorization.basis,
        AUTHORIZATION_BASES,
        "capture-manifest.authorization.basis",
      ),
      capturedBy: stringAt(
        authorization.capturedBy,
        "capture-manifest.authorization.capturedBy",
      ),
      containsPrivateContent: booleanAt(
        authorization.containsPrivateContent,
        "capture-manifest.authorization.containsPrivateContent",
      ),
      commitPolicy: enumAt(
        authorization.commitPolicy,
        COMMIT_POLICIES,
        "capture-manifest.authorization.commitPolicy",
      ),
      notes: stringAt(
        authorization.notes,
        "capture-manifest.authorization.notes",
      ),
    },
    provenance: {
      captureMethod: exactAt(
        provenance.captureMethod,
        "read-only-local-mcp",
        "capture-manifest.provenance.captureMethod",
      ) as "read-only-local-mcp",
      operator: stringAt(
        provenance.operator,
        "capture-manifest.provenance.operator",
      ),
      notes: stringsAt(
        provenance.notes,
        "capture-manifest.provenance.notes",
      ),
    },
    runtime: {
      provider: exactAt(
        runtime.provider,
        "talk-to-figma-fork",
        "capture-manifest.runtime.provider",
      ) as "talk-to-figma-fork",
      forkCommit: exactAt(
        runtime.forkCommit,
        PINNED_FORK.commit,
        "capture-manifest.runtime.forkCommit",
      ),
      packageVersion: exactAt(
        runtime.packageVersion,
        PINNED_FORK.packageVersion,
        "capture-manifest.runtime.packageVersion",
      ),
      serverBundleSha256: exactAt(
        runtime.serverBundleSha256,
        PINNED_FORK.serverBundleSha256,
        "capture-manifest.runtime.serverBundleSha256",
      ),
      connection: {
        relay: exactAt(
          connection.relay,
          "local-websocket",
          "capture-manifest.runtime.connection.relay",
        ) as "local-websocket",
        channel: stringAt(
          connection.channel,
          "capture-manifest.runtime.connection.channel",
        ),
      },
      plugin: {
        name: exactAt(
          plugin.name,
          PINNED_FORK.plugin.name,
          "capture-manifest.runtime.plugin.name",
        ),
        id: exactAt(
          plugin.id,
          PINNED_FORK.plugin.id,
          "capture-manifest.runtime.plugin.id",
        ),
        api: exactAt(
          plugin.api,
          PINNED_FORK.plugin.api,
          "capture-manifest.runtime.plugin.api",
        ),
        documentAccess: exactAt(
          plugin.documentAccess,
          PINNED_FORK.plugin.documentAccess,
          "capture-manifest.runtime.plugin.documentAccess",
        ),
        manifestSha256: exactAt(
          plugin.manifestSha256,
          PINNED_FORK.plugin.manifestSha256,
          "capture-manifest.runtime.plugin.manifestSha256",
        ),
        codeSha256: exactAt(
          plugin.codeSha256,
          PINNED_FORK.plugin.codeSha256,
          "capture-manifest.runtime.plugin.codeSha256",
        ),
      },
      capabilityFingerprint: {
        algorithm: exactAt(
          fingerprint.algorithm,
          "sha256",
          "capture-manifest.runtime.capabilityFingerprint.algorithm",
        ) as "sha256",
        scope: exactAt(
          fingerprint.scope,
          "required-read-tools",
          "capture-manifest.runtime.capabilityFingerprint.scope",
        ) as "required-read-tools",
        value: hashAt(
          fingerprint.value,
          "capture-manifest.runtime.capabilityFingerprint.value",
        ),
        tools,
      },
    },
    artifacts: arrayAt(root.artifacts, "capture-manifest.artifacts").map(
      (artifact, index) =>
        parseArtifact(artifact, `capture-manifest.artifacts[${index}]`),
    ),
    overrides: {
      path: safeRelativePathAt(
        overrides.path,
        "capture-manifest.overrides.path",
      ),
      sha256: hashAt(
        overrides.sha256,
        "capture-manifest.overrides.sha256",
      ),
      bytes: integerAt(
        overrides.bytes,
        "capture-manifest.overrides.bytes",
      ),
    },
  };

  assertManifestSemantics(manifest);
  return manifest;
}

function assertManifestSemantics(manifest: CaptureManifest): void {
  const issues: string[] = [];
  if (!SLUG_PATTERN.test(manifest.captureId)) {
    issues.push("capture-manifest.captureId: expected lowercase kebab-case");
  }
  if (!SLUG_PATTERN.test(manifest.brand)) {
    issues.push("capture-manifest.brand: expected lowercase kebab-case");
  }
  if (manifest.source.selectedPageIds.length === 0) {
    issues.push(
      "capture-manifest.source.selectedPageIds: at least one page is required",
    );
  }
  if (manifest.source.selectedNodes.length === 0) {
    issues.push(
      "capture-manifest.source.selectedNodes: at least one node is required",
    );
  }
  const nodeIds = manifest.source.selectedNodes.map((node) => node.id);
  if (new Set(nodeIds).size !== nodeIds.length) {
    issues.push(
      "capture-manifest.source.selectedNodes: node ids must be unique",
    );
  }
  for (const node of manifest.source.selectedNodes) {
    if (!manifest.source.selectedPageIds.includes(node.pageId)) {
      issues.push(
        `selected node ${node.id}: pageId ${node.pageId} is not selected`,
      );
    }
  }
  for (const requiredPurpose of ["desktop-frame", "mobile-frame"] as const) {
    if (
      !manifest.source.selectedNodes.some((node) =>
        node.purposes.includes(requiredPurpose),
      )
    ) {
      issues.push(
        `capture-manifest.source.selectedNodes: missing ${requiredPurpose}`,
      );
    }
  }
  if (
    manifest.authorization.commitPolicy === "sanitized-fixture" &&
    manifest.authorization.containsPrivateContent
  ) {
    issues.push(
      "capture-manifest.authorization: sanitized fixtures cannot contain private content",
    );
  }
  if (
    manifest.authorization.basis === "synthetic" &&
    manifest.authorization.commitPolicy !== "sanitized-fixture"
  ) {
    issues.push(
      "capture-manifest.authorization: synthetic captures must use sanitized-fixture",
    );
  }

  const capabilityNames = manifest.runtime.capabilityFingerprint.tools.map(
    (tool) => tool.name,
  );
  if (new Set(capabilityNames).size !== capabilityNames.length) {
    issues.push(
      "capture-manifest.runtime.capabilityFingerprint.tools: tool names must be unique",
    );
  }
  for (const required of REQUIRED_READ_CAPABILITIES) {
    if (!capabilityNames.includes(required)) {
      issues.push(`capability fingerprint: missing required tool ${required}`);
    }
  }
  for (const capabilityName of capabilityNames) {
    if (
      !(REQUIRED_READ_CAPABILITIES as readonly string[]).includes(
        capabilityName,
      )
    ) {
      issues.push(
        `capability fingerprint: unexpected tool ${capabilityName} in required-read-tools scope`,
      );
    }
  }
  const expectedFingerprint = computeCapabilityFingerprint(
    manifest.runtime.capabilityFingerprint.tools,
  );
  if (
    manifest.runtime.capabilityFingerprint.value !== expectedFingerprint
  ) {
    issues.push(
      `capability fingerprint: expected ${expectedFingerprint}, received ${manifest.runtime.capabilityFingerprint.value}`,
    );
  }

  const artifactIds = manifest.artifacts.map((artifact) => artifact.id);
  const artifactPaths = manifest.artifacts.map((artifact) => artifact.path);
  if (new Set(artifactIds).size !== artifactIds.length) {
    issues.push("capture-manifest.artifacts: artifact ids must be unique");
  }
  if (new Set(artifactPaths).size !== artifactPaths.length) {
    issues.push("capture-manifest.artifacts: artifact paths must be unique");
  }

  for (const role of [
    "pages",
    "variables",
    "styles",
    "components",
  ] as const) {
    const count = manifest.artifacts.filter(
      (artifact) => artifact.role === role,
    ).length;
    if (count !== 1) {
      issues.push(`capture-manifest.artifacts: expected exactly one ${role}`);
    }
  }
  for (const pageId of manifest.source.selectedPageIds) {
    const documents = manifest.artifacts.filter(
      (artifact) =>
        artifact.role === "document" && artifact.pageId === pageId,
    );
    if (documents.length !== 1) {
      issues.push(
        `selected page ${pageId}: expected exactly one document artifact`,
      );
    }
  }
  const documentCount = manifest.artifacts.filter(
    (artifact) => artifact.role === "document",
  ).length;
  if (documentCount !== manifest.source.selectedPageIds.length) {
    issues.push(
      "capture-manifest.artifacts: document artifacts must match selected pages",
    );
  }

  for (const artifact of manifest.artifacts) {
    validateArtifactDeclaration(
      artifact,
      artifactIds,
      manifest.source.selectedPageIds,
      issues,
    );
  }
  for (const node of manifest.source.selectedNodes) {
    for (const role of [
      "node",
      "node-variables",
      "image-export",
      "screenshot",
    ] as const) {
      if (
        !manifest.artifacts.some(
          (artifact) =>
            artifact.role === role && artifact.nodeId === node.id,
        )
      ) {
        issues.push(`selected node ${node.id}: missing ${role} artifact`);
      }
    }
    for (const artifact of manifest.artifacts.filter(
      (candidate) => candidate.nodeId === node.id,
    )) {
      if (artifact.pageId !== node.pageId) {
        issues.push(
          `selected node ${node.id}: artifact ${artifact.id} must preserve pageId ${node.pageId}`,
        );
      }
    }
    if (
      node.purposes.includes("interactive-root") &&
      !manifest.artifacts.some(
        (artifact) =>
          artifact.role === "reactions" && artifact.nodeId === node.id,
      )
    ) {
      issues.push(`selected node ${node.id}: missing reactions artifact`);
    }
  }

  if (manifest.overrides.path !== "slot-overrides.json") {
    issues.push(
      'capture-manifest.overrides.path: expected "slot-overrides.json"',
    );
  }
  if (issues.length > 0) throw new CaptureContractError(issues);
}

function validateArtifactDeclaration(
  artifact: CaptureArtifact,
  artifactIds: string[],
  selectedPageIds: string[],
  issues: string[],
): void {
  const singletonPaths: Partial<Record<CaptureArtifactRole, string>> = {
    pages: "raw/pages.json",
    variables: "raw/variables.json",
    styles: "raw/styles.json",
    components: "raw/components.json",
  };
  const singletonPath = singletonPaths[artifact.role];
  if (singletonPath !== undefined && artifact.path !== singletonPath) {
    issues.push(
      `artifact ${artifact.id}: ${artifact.role} must use ${singletonPath}`,
    );
  }
  if (artifact.role === "document") {
    if (artifact.pageId === undefined) {
      issues.push(`artifact ${artifact.id}: document pageId is required`);
    } else {
      const expectedPath =
        selectedPageIds.length === 1
          ? "raw/document.json"
          : `raw/documents/${sanitizeNodeId(artifact.pageId)}.json`;
      if (artifact.path !== expectedPath) {
        issues.push(
          `artifact ${artifact.id}: expected document path ${expectedPath}`,
        );
      }
    }
  }
  if (
    artifact.pageId !== undefined &&
    !selectedPageIds.includes(artifact.pageId)
  ) {
    issues.push(
      `artifact ${artifact.id}: pageId ${artifact.pageId} is not selected`,
    );
  }

  if (artifact.role === "screenshot") {
    if (
      artifact.mediaType !== "image/png" &&
      artifact.mediaType !== "image/jpeg" &&
      artifact.mediaType !== "image/svg+xml"
    ) {
      issues.push(`artifact ${artifact.id}: screenshot media type is invalid`);
    }
    if (artifact.toolCall !== undefined) {
      issues.push(`artifact ${artifact.id}: screenshot must not have toolCall`);
    }
    if (
      artifact.derivedFromArtifactId === undefined ||
      !artifactIds.includes(artifact.derivedFromArtifactId)
    ) {
      issues.push(
        `artifact ${artifact.id}: screenshot must reference an image-export artifact`,
      );
    }
  } else {
    const expectedTool = expectedToolForRole(artifact.role);
    if (artifact.toolCall?.name !== expectedTool) {
      issues.push(
        `artifact ${artifact.id}: role ${artifact.role} requires ${expectedTool}`,
      );
    }
    if (artifact.coverage === undefined) {
      issues.push(`artifact ${artifact.id}: coverage is required`);
    }
    if (
      artifact.mediaType !== "application/json" &&
      !(artifact.role === "image-export" && artifact.mediaType === "text/plain")
    ) {
      issues.push(
        `artifact ${artifact.id}: raw tool replies must be JSON, except text image exports`,
      );
    }
  }

  const nodeRole = [
    "node",
    "node-variables",
    "reactions",
    "image-export",
    "screenshot",
  ].includes(artifact.role);
  if (nodeRole) {
    if (artifact.nodeId === undefined) {
      issues.push(`artifact ${artifact.id}: nodeId is required`);
      return;
    }
    const safeId = sanitizeNodeId(artifact.nodeId);
    const expectedPrefix: Partial<Record<CaptureArtifactRole, string>> = {
      node: "raw/nodes",
      "node-variables": "raw/node-variables",
      reactions: "raw/reactions",
      "image-export": "raw/exports",
      screenshot: "screenshots",
    };
    const prefix = expectedPrefix[artifact.role];
    const expectedExtension =
      artifact.role === "screenshot"
        ? extensionForMediaType(artifact.mediaType as ScreenshotMediaType)
        : artifact.role === "image-export" &&
            artifact.mediaType === "text/plain"
          ? ".txt"
          : ".json";
    const expectedPath = `${prefix}/${safeId}${expectedExtension}`;
    if (artifact.path !== expectedPath) {
      issues.push(
        `artifact ${artifact.id}: expected path ${expectedPath} for original node id ${artifact.nodeId}`,
      );
    }
    const callNodeId = artifact.toolCall?.arguments.nodeId;
    if (
      artifact.role !== "screenshot" &&
      callNodeId !== artifact.nodeId
    ) {
      issues.push(
        `artifact ${artifact.id}: toolCall.arguments.nodeId must preserve original id ${artifact.nodeId}`,
      );
    }
  }

  if (
    artifact.role === "pages" &&
    artifact.toolCall?.arguments.includeChildCount !== true
  ) {
    issues.push(
      `artifact ${artifact.id}: get_pages must set includeChildCount:true`,
    );
  }
  if (
    artifact.role === "document" &&
    artifact.toolCall?.arguments.summary !== true
  ) {
    issues.push(
      `artifact ${artifact.id}: get_document_info must set summary:true`,
    );
  }
  if (
    artifact.role === "components" &&
    artifact.toolCall?.arguments.summary !== true
  ) {
    issues.push(
      `artifact ${artifact.id}: get_local_components must set summary:true`,
    );
  }
}

function expectedToolForRole(role: ForkPayloadRole): string {
  const mapping: Record<ForkPayloadRole, string> = {
    pages: "get_pages",
    document: "get_document_info",
    variables: "get_variables",
    styles: "get_styles",
    components: "get_local_components",
    node: "get_node_info",
    "node-variables": "get_node_variables",
    reactions: "get_reactions",
    "image-export": "export_node_as_image",
  };
  return mapping[role];
}

export async function loadCaptureBundle(
  manifestPath: string,
): Promise<LoadedCaptureBundle> {
  const absoluteManifestPath = path.resolve(manifestPath);
  const root = path.dirname(absoluteManifestPath);
  const manifest = parseCaptureManifest(
    JSON.parse(await readFile(absoluteManifestPath, "utf8")) as unknown,
  );
  const issues: string[] = [];
  const payloads = new Map<string, ValidatedForkPayload>();
  const screenshots = new Map<string, Uint8Array>();
  const imageExports = new Map<string, ValidatedForkPayload>();

  for (const artifact of manifest.artifacts) {
    try {
      const bytes = await readEvidenceFile(root, artifact.path);
      assertIntegrity(artifact, bytes);
      if (artifact.role === "screenshot") {
        assertScreenshotBytes(
          bytes,
          artifact.mediaType as ScreenshotMediaType,
          artifact.id,
        );
        screenshots.set(artifact.id, bytes);
        continue;
      }

      const rawValue =
        artifact.mediaType === "text/plain"
          ? bytes.toString("utf8")
          : (JSON.parse(bytes.toString("utf8")) as unknown);
      const payload = validateForkPayload(artifact.role, rawValue);
      assertPayloadMatchesArtifact(payload, artifact);
      payloads.set(artifact.id, payload);
      if (artifact.role === "image-export") {
        imageExports.set(artifact.id, payload);
      }
    } catch (error) {
      issues.push(
        `artifact ${artifact.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  for (const screenshot of manifest.artifacts.filter(
    (artifact) => artifact.role === "screenshot",
  )) {
    const sourceId = screenshot.derivedFromArtifactId;
    const screenshotBytes = screenshots.get(screenshot.id);
    const source = sourceId === undefined ? undefined : imageExports.get(sourceId);
    if (
      sourceId === undefined ||
      source === undefined ||
      source.decodedImage === undefined ||
      screenshotBytes === undefined
    ) {
      issues.push(
        `artifact ${screenshot.id}: decoded source image is unavailable`,
      );
      continue;
    }
    if (
      source.nodeId !== undefined &&
      source.nodeId !== screenshot.nodeId
    ) {
      issues.push(
        `artifact ${screenshot.id}: source export node id ${source.nodeId} does not match ${screenshot.nodeId}`,
      );
    }
    if (
      source.imageMimeType !== undefined &&
      source.imageMimeType !== screenshot.mediaType
    ) {
      issues.push(
        `artifact ${screenshot.id}: source MIME ${source.imageMimeType} does not match ${screenshot.mediaType}`,
      );
    }
    if (!Buffer.from(source.decodedImage).equals(screenshotBytes)) {
      issues.push(
        `artifact ${screenshot.id}: decoded bytes differ from ${sourceId}`,
      );
    }
  }

  let overrides: SlotOverrides | undefined;
  try {
    const bytes = await readEvidenceFile(root, manifest.overrides.path);
    if (bytes.length !== manifest.overrides.bytes) {
      issues.push(
        `slot-overrides.json: expected ${manifest.overrides.bytes} bytes, received ${bytes.length}`,
      );
    }
    const hash = sha256(bytes);
    if (hash !== manifest.overrides.sha256) {
      issues.push(
        `slot-overrides.json: expected SHA-256 ${manifest.overrides.sha256}, received ${hash}`,
      );
    }
    overrides = parseSlotOverrides(
      JSON.parse(bytes.toString("utf8")) as unknown,
    );
  } catch (error) {
    issues.push(
      `slot-overrides.json: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  if (issues.length > 0 || overrides === undefined) {
    throw new CaptureContractError(issues);
  }
  return { root, manifest, payloads, screenshots, overrides };
}

function assertPayloadMatchesArtifact(
  payload: ValidatedForkPayload,
  artifact: CaptureArtifact,
): void {
  if (payload.nodeId !== undefined && payload.nodeId !== artifact.nodeId) {
    fail(
      artifact.id,
      `payload node id ${payload.nodeId} does not match manifest ${artifact.nodeId}`,
    );
  }
  if (payload.pageId !== undefined && payload.pageId !== artifact.pageId) {
    fail(
      artifact.id,
      `payload page id ${payload.pageId} does not match manifest ${artifact.pageId}`,
    );
  }
  if (
    payload.supported !== undefined &&
    artifact.coverage?.supported !== payload.supported
  ) {
    fail(
      artifact.id,
      `payload supported=${payload.supported} does not match manifest coverage`,
    );
  }
  if (
    payload.complete !== undefined &&
    artifact.coverage?.complete !== payload.complete
  ) {
    fail(
      artifact.id,
      `payload complete=${payload.complete} does not match manifest coverage`,
    );
  }
  if (
    artifact.coverage !== undefined &&
    JSON.stringify(artifact.coverage.limitations) !==
      JSON.stringify(payload.limitations)
  ) {
    fail(
      artifact.id,
      "payload limitations do not match manifest coverage limitations",
    );
  }
  if (
    ["pages", "document", "variables", "styles", "components", "node-variables", "reactions"].includes(
      artifact.role,
    ) &&
    artifact.coverage?.complete !== true
  ) {
    fail(artifact.id, "required capture payload is incomplete");
  }
  if (
    ["variables", "node-variables"].includes(artifact.role) &&
    artifact.coverage?.supported !== true
  ) {
    fail(artifact.id, "required variable payload is unsupported");
  }
}

async function readEvidenceFile(
  root: string,
  relativePath: string,
): Promise<Buffer> {
  const absolutePath = path.resolve(root, relativePath);
  const relative = path.relative(root, absolutePath);
  if (
    relative.startsWith(`..${path.sep}`) ||
    relative === ".." ||
    path.isAbsolute(relative)
  ) {
    throw new Error(`path escapes capture root: ${relativePath}`);
  }
  const stats = await lstat(absolutePath);
  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw new Error(`expected a regular non-symlink file: ${relativePath}`);
  }
  const [realRoot, realFile] = await Promise.all([
    realpath(root),
    realpath(absolutePath),
  ]);
  const realRelative = path.relative(realRoot, realFile);
  if (
    realRelative.startsWith(`..${path.sep}`) ||
    realRelative === ".." ||
    path.isAbsolute(realRelative)
  ) {
    throw new Error(`resolved path escapes capture root: ${relativePath}`);
  }
  return readFile(realFile);
}

function assertIntegrity(artifact: CaptureArtifact, bytes: Buffer): void {
  if (bytes.length !== artifact.bytes) {
    fail(
      artifact.id,
      `expected ${artifact.bytes} bytes, received ${bytes.length}`,
    );
  }
  const actual = sha256(bytes);
  if (actual !== artifact.sha256) {
    fail(
      artifact.id,
      `expected SHA-256 ${artifact.sha256}, received ${actual}`,
    );
  }
}

function assertScreenshotBytes(
  bytes: Buffer,
  mediaType: ScreenshotMediaType,
  artifactId: string,
): void {
  if (
    mediaType === "image/png" &&
    !bytes.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    )
  ) {
    fail(artifactId, "invalid PNG signature");
  }
  if (
    mediaType === "image/jpeg" &&
    !(bytes[0] === 0xff && bytes[1] === 0xd8)
  ) {
    fail(artifactId, "invalid JPEG signature");
  }
  if (
    mediaType === "image/svg+xml" &&
    !bytes.toString("utf8").trimStart().startsWith("<svg")
  ) {
    fail(artifactId, "invalid SVG document");
  }
}

export function parseSlotOverrides(value: unknown): SlotOverrides {
  const root = recordAt(value, "slot-overrides");
  const modeMap = root.modeMap;
  const slots = root.slots;
  if (
    !isJsonValue(modeMap) ||
    modeMap === null ||
    Array.isArray(modeMap) ||
    typeof modeMap !== "object"
  ) {
    fail("slot-overrides.modeMap", "expected a JSON object");
  }
  if (
    !isJsonValue(slots) ||
    slots === null ||
    Array.isArray(slots) ||
    typeof slots !== "object"
  ) {
    fail("slot-overrides.slots", "expected a JSON object");
  }
  for (const key of Object.keys(slots)) {
    if (!key.startsWith("--")) {
      fail(
        `slot-overrides.slots.${key}`,
        "slot override keys must be CSS custom properties",
      );
    }
  }
  return {
    schemaVersion: exactAt(
      root.schemaVersion,
      SLOT_OVERRIDES_SCHEMA_VERSION,
      "slot-overrides.schemaVersion",
    ) as typeof SLOT_OVERRIDES_SCHEMA_VERSION,
    modeMap,
    slots,
    notes: stringsAt(root.notes, "slot-overrides.notes"),
  };
}

export function computeCapabilityFingerprint(
  tools: readonly CapabilityRecord[],
): string {
  const canonical = [...tools]
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((tool) => ({
      name: tool.name,
      inputSchemaSha256: tool.inputSchemaSha256,
    }));
  return computeJsonSha256(canonical);
}

export function computeJsonSha256(value: JsonValue): string {
  return sha256(Buffer.from(canonicalJson(value), "utf8"));
}

export function canonicalJson(value: JsonValue): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  return `{${Object.keys(value)
    .sort((left, right) => left.localeCompare(right))
    .map(
      (key) =>
        `${JSON.stringify(key)}:${canonicalJson(value[key] as JsonValue)}`,
    )
    .join(",")}}`;
}

export function sanitizeNodeId(nodeId: string): string {
  originalNodeIdAt(nodeId, "nodeId");
  return nodeId.replaceAll(":", "_");
}

function originalNodeIdAt(value: unknown, pathLabel: string): string {
  const nodeId = stringAt(value, pathLabel);
  if (
    nodeId.includes("/") ||
    nodeId.includes("\\") ||
    nodeId === "." ||
    nodeId === ".." ||
    nodeId.includes("\0")
  ) {
    fail(pathLabel, "contains a path-unsafe character");
  }
  return nodeId;
}

function safeRelativePathAt(value: unknown, pathLabel: string): string {
  const relativePath = stringAt(value, pathLabel);
  if (
    relativePath.includes("\\") ||
    path.posix.isAbsolute(relativePath) ||
    path.posix.normalize(relativePath) !== relativePath ||
    relativePath.split("/").some((segment) => segment === "..")
  ) {
    fail(pathLabel, "expected a normalized relative POSIX path");
  }
  return relativePath;
}

function extensionForMediaType(mediaType: ScreenshotMediaType): string {
  if (mediaType === "image/png") return ".png";
  if (mediaType === "image/jpeg") return ".jpg";
  return ".svg";
}

export function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
