/**
 * Contract for a targeted, private-local node (SVG/PNG) export pass.
 *
 * The twin of `image-fill-export-contract.ts`: same pin, same before/after
 * no-mutation guarantee, same private-local evidence shape — but the source is
 * a whole node's rendered output, not an original IMAGE-fill's bytes, and a
 * node can be legitimately unexportable as SVG. A rejection is recorded
 * verbatim, never discarded and never a crash.
 */

import {
  isJsonObject,
  isRecord,
  sameJson,
  sha256,
  type EvidenceFile,
} from "./image-fill-export-contract.js";
import {
  R3_3_1_FORK,
  computeCapabilityFingerprint,
  type CapabilityRecord,
} from "./capture-contract.js";

export const NODE_EXPORT_SCHEMA_VERSION =
  "figma-to-code/node-export-manifest/v1" as const;
export const NODE_EXPORT_CAPABILITY_SCOPE = "node-export-tools" as const;

/** Same frozen runtime as the image-fill lane and new captures: one DEV plugin, one pin. */
export const NODE_EXPORT_FORK = R3_3_1_FORK;

export const NODE_EXPORT_REQUIRED_TOOLS = [
  "join_channel",
  "get_runtime_info",
  "get_node_info",
  "export_node_as_image",
] as const;

export const NODE_EXPORT_FORMATS = ["SVG", "PNG"] as const;
export type NodeExportFormat = (typeof NODE_EXPORT_FORMATS)[number];

const NODE_EXPORT_OUTCOMES = ["exported", "rejected"] as const;
export type NodeExportOutcome = (typeof NODE_EXPORT_OUTCOMES)[number];

export type NodeExportAsset = {
  id: string;
  capturedAt: string;
  nodeId: string;
  format: NodeExportFormat;
  scale: number;
  outcome: NodeExportOutcome;
  /** Present only when `outcome` is `"exported"`. */
  file?: EvidenceFile;
  /** Present only when `outcome` is `"exported"`. */
  mimeType?: string;
  /** Present only when `outcome` is `"rejected"`: Figma's rejection text, verbatim. */
  rejection?: string;
  toolCall: {
    name: "export_node_as_image";
    arguments: {
      nodeId: string;
      format: NodeExportFormat;
      scale: number;
    };
  };
  before: EvidenceFile;
  after: EvidenceFile;
};

export type NodeExportManifest = {
  $schema: string;
  schemaVersion: typeof NODE_EXPORT_SCHEMA_VERSION;
  exportId: string;
  capturedAt: string;
  sourceCapture: {
    manifestSha256: string;
    bytes: number;
  };
  authorization: {
    status: "authorized";
    basis: "owned" | "client-approved" | "licensed" | "synthetic";
    capturedBy: string;
    containsPrivateContent: true;
    commitPolicy: "private-local";
    notes: string;
  };
  provenance: {
    captureMethod: "read-only-local-mcp";
    operator: "scripts/export-figma-nodes.ts";
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
    plugin: typeof NODE_EXPORT_FORK.plugin;
    capabilityFingerprint: {
      algorithm: "sha256";
      scope: typeof NODE_EXPORT_CAPABILITY_SCOPE;
      value: string;
      tools: CapabilityRecord[];
    };
  };
  assets: NodeExportAsset[];
};

const SHA256 = /^[a-f0-9]{64}$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

function isHash(value: unknown): value is string {
  return typeof value === "string" && SHA256.test(value);
}

function isSafeRelativePath(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    !value.includes("\\") &&
    !value.startsWith("/") &&
    value.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..")
  );
}

function hasEvidenceFile(value: unknown): value is EvidenceFile {
  return (
    isRecord(value) &&
    isSafeRelativePath(value.path) &&
    isHash(value.sha256) &&
    typeof value.bytes === "number" &&
    Number.isSafeInteger(value.bytes) &&
    value.bytes >= 0
  );
}

/** Returns actionable errors instead of coercing an evidence manifest. */
export function validateNodeExportManifest(value: unknown): string[] {
  const issues: string[] = [];
  if (!isRecord(value)) return ["manifest: expected an object"];

  if (value.schemaVersion !== NODE_EXPORT_SCHEMA_VERSION) {
    issues.push(`schemaVersion: expected ${NODE_EXPORT_SCHEMA_VERSION}`);
  }
  if (typeof value.exportId !== "string" || !SLUG.test(value.exportId)) {
    issues.push("exportId: expected lowercase kebab-case");
  }
  if (typeof value.capturedAt !== "string" || !TIMESTAMP.test(value.capturedAt)) {
    issues.push("capturedAt: expected an ISO-8601 UTC timestamp");
  }

  const sourceCapture = value.sourceCapture;
  if (
    !isRecord(sourceCapture) ||
    !isHash(sourceCapture.manifestSha256) ||
    typeof sourceCapture.bytes !== "number" ||
    !Number.isSafeInteger(sourceCapture.bytes) ||
    sourceCapture.bytes <= 0
  ) {
    issues.push("sourceCapture: expected immutable source manifest hash and positive byte count");
  }

  const authorization = value.authorization;
  if (
    !isRecord(authorization) ||
    authorization.status !== "authorized" ||
    authorization.containsPrivateContent !== true ||
    authorization.commitPolicy !== "private-local" ||
    typeof authorization.capturedBy !== "string" ||
    authorization.capturedBy.length === 0 ||
    typeof authorization.notes !== "string" ||
    authorization.notes.length === 0
  ) {
    issues.push("authorization: expected authorized private-local evidence metadata");
  }

  const runtime = value.runtime;
  if (!isRecord(runtime)) {
    issues.push("runtime: expected an object");
  } else {
    if (runtime.provider !== "talk-to-figma-fork") {
      issues.push("runtime.provider: expected talk-to-figma-fork");
    }
    if (runtime.forkCommit !== NODE_EXPORT_FORK.commit) {
      issues.push("runtime.forkCommit: does not match the R2.5 node-export pin");
    }
    if (runtime.packageVersion !== NODE_EXPORT_FORK.packageVersion) {
      issues.push("runtime.packageVersion: does not match the R2.5 node-export pin");
    }
    if (runtime.serverBundleSha256 !== NODE_EXPORT_FORK.serverBundleSha256) {
      issues.push("runtime.serverBundleSha256: does not match the R2.5 node-export pin");
    }
    if (!isRecord(runtime.connection) || runtime.connection.relay !== "local-websocket") {
      issues.push("runtime.connection: expected local-websocket connection metadata");
    }
    if (!isRecord(runtime.plugin)) {
      issues.push("runtime.plugin: expected pinned plugin metadata");
    } else {
      for (const [key, expected] of Object.entries(NODE_EXPORT_FORK.plugin)) {
        if (runtime.plugin[key] !== expected) {
          issues.push(`runtime.plugin.${key}: does not match the R2.5 node-export pin`);
        }
      }
    }
    const fingerprint = runtime.capabilityFingerprint;
    if (
      !isRecord(fingerprint) ||
      fingerprint.algorithm !== "sha256" ||
      fingerprint.scope !== NODE_EXPORT_CAPABILITY_SCOPE ||
      !isHash(fingerprint.value) ||
      !Array.isArray(fingerprint.tools)
    ) {
      issues.push("runtime.capabilityFingerprint: expected the scoped node-export tool fingerprint");
    } else {
      const records: CapabilityRecord[] = [];
      for (const entry of fingerprint.tools) {
        if (!isRecord(entry) || typeof entry.name !== "string" || !isHash(entry.inputSchemaSha256)) {
          issues.push("runtime.capabilityFingerprint.tools: contains an invalid record");
          continue;
        }
        records.push({ name: entry.name, inputSchemaSha256: entry.inputSchemaSha256 });
      }
      const names = records.map((entry) => entry.name);
      if (
        names.length !== NODE_EXPORT_REQUIRED_TOOLS.length ||
        new Set(names).size !== names.length ||
        !NODE_EXPORT_REQUIRED_TOOLS.every((name) => names.includes(name))
      ) {
        issues.push("runtime.capabilityFingerprint.tools: must contain exactly the R2.5 read tools");
      } else if (computeCapabilityFingerprint(records) !== fingerprint.value) {
        issues.push("runtime.capabilityFingerprint.value: does not match its tool schemas");
      }
    }
  }

  if (!Array.isArray(value.assets) || value.assets.length === 0) {
    issues.push("assets: expected at least one targeted export");
  } else {
    const ids = new Set<string>();
    const paths = new Set<string>();
    for (const [index, asset] of value.assets.entries()) {
      const label = `assets[${index}]`;
      if (!isRecord(asset)) {
        issues.push(`${label}: expected an object`);
        continue;
      }
      if (typeof asset.id !== "string" || !SLUG.test(asset.id) || ids.has(asset.id)) {
        issues.push(`${label}.id: expected a unique lowercase kebab-case id`);
      } else {
        ids.add(asset.id);
      }
      if (typeof asset.nodeId !== "string" || asset.nodeId.length === 0) {
        issues.push(`${label}.nodeId: expected an exact node id`);
      }
      if (
        typeof asset.format !== "string" ||
        !(NODE_EXPORT_FORMATS as readonly string[]).includes(asset.format)
      ) {
        issues.push(`${label}.format: expected SVG or PNG`);
      }
      // Figma's own export scale is a multiplier, not a pixel count, so a
      // budget-constrained render (R2-BL-5b: capped near 3 MP) legitimately
      // asks for a fractional value like 1.8 — an integer-only check would
      // reject the exact renders the pixel budget requires.
      if (
        typeof asset.scale !== "number" ||
        !Number.isFinite(asset.scale) ||
        asset.scale <= 0
      ) {
        issues.push(`${label}.scale: expected a positive finite number`);
      }
      const outcome = asset.outcome;
      if (
        typeof outcome !== "string" ||
        !(NODE_EXPORT_OUTCOMES as readonly string[]).includes(outcome)
      ) {
        issues.push(`${label}.outcome: expected exported or rejected`);
      } else if (outcome === "exported") {
        if (asset.rejection !== undefined) {
          issues.push(`${label}.rejection: must be absent when outcome is exported`);
        }
        if (!hasEvidenceFile(asset.file)) {
          issues.push(`${label}.file: expected a hash-checked evidence file`);
        }
        if (typeof asset.mimeType !== "string" || asset.mimeType.length === 0) {
          issues.push(`${label}.mimeType: expected a non-empty MIME type`);
        }
      } else if (outcome === "rejected") {
        if (asset.file !== undefined || asset.mimeType !== undefined) {
          issues.push(`${label}.file/mimeType: must be absent when outcome is rejected`);
        }
        if (typeof asset.rejection !== "string" || asset.rejection.length === 0) {
          issues.push(`${label}.rejection: expected Figma's verbatim rejection text`);
        }
      }
      if (
        !isRecord(asset.toolCall) ||
        asset.toolCall.name !== "export_node_as_image" ||
        !isRecord(asset.toolCall.arguments) ||
        asset.toolCall.arguments.nodeId !== asset.nodeId ||
        asset.toolCall.arguments.format !== asset.format ||
        asset.toolCall.arguments.scale !== asset.scale
      ) {
        issues.push(`${label}.toolCall: must record the exact node-export request`);
      }
      // `file` is optional (present only when exported, checked above);
      // `before`/`after` are always required — every attempt, rejected or
      // not, must still prove the read-only no-mutation guarantee.
      for (const field of ["file", "before", "after"] as const) {
        const evidence = asset[field];
        if (evidence === undefined) {
          if (field !== "file") issues.push(`${label}.${field}: expected a hash-checked evidence file`);
          continue;
        }
        if (!hasEvidenceFile(evidence)) {
          issues.push(`${label}.${field}: expected a hash-checked evidence file`);
          continue;
        }
        if (paths.has(evidence.path)) {
          issues.push(`${label}.${field}.path: evidence file paths must be unique`);
        }
        paths.add(evidence.path);
      }
    }
  }

  return issues;
}

export function assertNodeExportManifest(
  value: unknown,
): asserts value is NodeExportManifest {
  const issues = validateNodeExportManifest(value);
  if (issues.length > 0) {
    throw new Error(
      `Node-export contract failed with ${issues.length} issue(s):\n` +
        issues.map((issue) => `  - ${issue}`).join("\n"),
    );
  }
}

export { isJsonObject, isRecord, sameJson, sha256 };
export type { EvidenceFile };
