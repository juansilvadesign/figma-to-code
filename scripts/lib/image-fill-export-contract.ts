/**
 * Contract for a targeted, private-local IMAGE-fill export pass.
 *
 * This is intentionally separate from capture-manifest/v1: a later asset recovery
 * must not rewrite the frozen full-page capture or pretend it was collected by the
 * historical runtime pin. Each pass records its own tool surface, runtime identity,
 * source-capture hash, source bytes, paint placement, and before/after node readings.
 */

import { createHash } from "node:crypto";

import {
  canonicalJson,
  computeCapabilityFingerprint,
  type CapabilityRecord,
} from "./capture-contract.js";
import type { JsonObject, JsonValue } from "./fork-payload-contracts.js";

export const IMAGE_FILL_EXPORT_SCHEMA_VERSION =
  "figma-to-code/image-fill-export-manifest/v1" as const;
export const IMAGE_FILL_EXPORT_CAPABILITY_SCOPE =
  "image-fill-export-tools" as const;

/**
 * The R2.5 asset lane has its own pin. `PINNED_FORK` remains the immutable R1
 * capture pin, so old raw evidence stays independently replayable.
 */
export const IMAGE_FILL_EXPORT_FORK = {
  commit: "63e305503c83b686329e6f3fa41b928a5d00da62",
  packageVersion: "0.3.5",
  serverBundleSha256:
    "52ebf5c96f9abcd8790dac9d14ffcd6ce461f902cd96a4563ba73d3f8ad69e46",
  plugin: {
    name: "Talk to Figma (fork)",
    id: "1485687494525374295",
    api: "1.0.0",
    documentAccess: "dynamic-page",
    manifestSha256:
      "6c7e43e9a3d2abfbcd809d8adb9174f89d2b1fd3a1a00800b4f30946adab3738",
    codeSha256:
      "2dfd799cff500c541685bacc16123d6ec9584f867eb6108795f7adcffb769c08",
  },
  runtime: {
    release: "R3.2.1",
    serverBuildId: "r3.2.1-server-cbd2531f8a0e",
    pluginBuildId: "r3.2.1-plugin-ad75ba5fe779",
    serverSchemaVersion: "1.21.0",
    pluginApiVersion: "1.21.0",
    capabilityFingerprint:
      "sha256:f6f9c2bb7f12264f754f81afb2715fa3ba613208bec65b5713da639bc979902d",
  },
} as const;

export const IMAGE_FILL_EXPORT_REQUIRED_TOOLS = [
  "join_channel",
  "get_runtime_info",
  "get_node_info",
  "export_image_fill",
] as const;

export type EvidenceFile = {
  path: string;
  sha256: string;
  bytes: number;
};

export type ImageFillExportAsset = {
  id: string;
  capturedAt: string;
  nodeId: string;
  paintIndex: number;
  sourceImageHash: string;
  imageFill: JsonObject;
  mimeType: string;
  width: number | null;
  height: number | null;
  dimensionSource: string | null;
  toolCall: {
    name: "export_image_fill";
    arguments: {
      nodeId: string;
      paintIndex: number;
    };
    delivery: "file";
  };
  sourceBytes: EvidenceFile;
  receipt: EvidenceFile;
  before: EvidenceFile;
  after: EvidenceFile;
};

export type ImageFillExportManifest = {
  $schema: string;
  schemaVersion: typeof IMAGE_FILL_EXPORT_SCHEMA_VERSION;
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
    operator: "scripts/export-figma-image-fills.ts";
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
    plugin: typeof IMAGE_FILL_EXPORT_FORK.plugin;
    capabilityFingerprint: {
      algorithm: "sha256";
      scope: typeof IMAGE_FILL_EXPORT_CAPABILITY_SCOPE;
      value: string;
      tools: CapabilityRecord[];
    };
  };
  assets: ImageFillExportAsset[];
};

const SHA256 = /^[a-f0-9]{64}$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TIMESTAMP =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

export function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function isJsonObject(value: unknown): value is JsonObject {
  return isRecord(value);
}

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
export function validateImageFillExportManifest(value: unknown): string[] {
  const issues: string[] = [];
  if (!isRecord(value)) return ["manifest: expected an object"];

  if (value.schemaVersion !== IMAGE_FILL_EXPORT_SCHEMA_VERSION) {
    issues.push(`schemaVersion: expected ${IMAGE_FILL_EXPORT_SCHEMA_VERSION}`);
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
    if (runtime.forkCommit !== IMAGE_FILL_EXPORT_FORK.commit) {
      issues.push("runtime.forkCommit: does not match the R2.5 asset-export pin");
    }
    if (runtime.packageVersion !== IMAGE_FILL_EXPORT_FORK.packageVersion) {
      issues.push("runtime.packageVersion: does not match the R2.5 asset-export pin");
    }
    if (runtime.serverBundleSha256 !== IMAGE_FILL_EXPORT_FORK.serverBundleSha256) {
      issues.push("runtime.serverBundleSha256: does not match the R2.5 asset-export pin");
    }
    if (!isRecord(runtime.connection) || runtime.connection.relay !== "local-websocket") {
      issues.push("runtime.connection: expected local-websocket connection metadata");
    }
    if (!isRecord(runtime.plugin)) {
      issues.push("runtime.plugin: expected pinned plugin metadata");
    } else {
      for (const [key, expected] of Object.entries(IMAGE_FILL_EXPORT_FORK.plugin)) {
        if (runtime.plugin[key] !== expected) {
          issues.push(`runtime.plugin.${key}: does not match the R2.5 asset-export pin`);
        }
      }
    }
    const fingerprint = runtime.capabilityFingerprint;
    if (
      !isRecord(fingerprint) ||
      fingerprint.algorithm !== "sha256" ||
      fingerprint.scope !== IMAGE_FILL_EXPORT_CAPABILITY_SCOPE ||
      !isHash(fingerprint.value) ||
      !Array.isArray(fingerprint.tools)
    ) {
      issues.push("runtime.capabilityFingerprint: expected the scoped image-fill tool fingerprint");
    } else {
      const records: CapabilityRecord[] = [];
      for (const entry of fingerprint.tools) {
        if (!isRecord(entry) || typeof entry.name !== "string" || !isHash(entry.inputSchemaSha256)) {
          issues.push("runtime.capabilityFingerprint.tools: contains an invalid record");
          continue;
        }
        records.push({
          name: entry.name,
          inputSchemaSha256: entry.inputSchemaSha256,
        });
      }
      const names = records.map((entry) => entry.name);
      if (
        names.length !== IMAGE_FILL_EXPORT_REQUIRED_TOOLS.length ||
        new Set(names).size !== names.length ||
        !IMAGE_FILL_EXPORT_REQUIRED_TOOLS.every((name) => names.includes(name))
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
        typeof asset.paintIndex !== "number" ||
        !Number.isSafeInteger(asset.paintIndex) ||
        asset.paintIndex < 0
      ) {
        issues.push(`${label}.paintIndex: expected a non-negative integer`);
      }
      if (typeof asset.sourceImageHash !== "string" || asset.sourceImageHash.length === 0) {
        issues.push(`${label}.sourceImageHash: expected Figma's opaque image hash`);
      }
      if (!isJsonObject(asset.imageFill) || asset.imageFill.type !== "IMAGE") {
        issues.push(`${label}.imageFill: expected an IMAGE paint`);
      }
      if (typeof asset.mimeType !== "string" || asset.mimeType.length === 0) {
        issues.push(`${label}.mimeType: expected a non-empty MIME type`);
      }
      for (const field of ["width", "height"] as const) {
        if (
          asset[field] !== null &&
          (typeof asset[field] !== "number" || !Number.isFinite(asset[field]))
        ) {
          issues.push(`${label}.${field}: expected a finite number or null`);
        }
      }
      if (asset.dimensionSource !== null && typeof asset.dimensionSource !== "string") {
        issues.push(`${label}.dimensionSource: expected a string or null`);
      }
      if (
        !isRecord(asset.toolCall) ||
        asset.toolCall.name !== "export_image_fill" ||
        asset.toolCall.delivery !== "file" ||
        !isRecord(asset.toolCall.arguments) ||
        asset.toolCall.arguments.nodeId !== asset.nodeId ||
        asset.toolCall.arguments.paintIndex !== asset.paintIndex
      ) {
        issues.push(`${label}.toolCall: must record the exact file-delivered image-fill request`);
      }
      for (const field of ["sourceBytes", "receipt", "before", "after"] as const) {
        const evidence = asset[field];
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

export function assertImageFillExportManifest(
  value: unknown,
): asserts value is ImageFillExportManifest {
  const issues = validateImageFillExportManifest(value);
  if (issues.length > 0) {
    throw new Error(
      `Image-fill export contract failed with ${issues.length} issue(s):\n` +
        issues.map((issue) => `  - ${issue}`).join("\n"),
    );
  }
}

/** A stable comparison for raw JSON replies; preserves no invented normalization. */
export function sameJson(left: JsonValue, right: JsonValue): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

/**
 * The stable node reader may intentionally omit opaque fields such as imageHash. An
 * original-byte receipt must still preserve every placement field that reader did expose.
 */
export function preservesObservedImageFillFields(
  observed: JsonObject,
  exported: JsonObject,
): boolean {
  return Object.entries(observed).every(
    ([key, value]) =>
      Object.hasOwn(exported, key) &&
      sameJson(value, exported[key] as JsonValue),
  );
}
