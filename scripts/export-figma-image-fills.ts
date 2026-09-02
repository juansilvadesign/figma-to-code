#!/usr/bin/env -S node --import tsx

/**
 * Targeted, read-only original IMAGE-fill exporter.
 *
 * This script deliberately does not invoke `capture-figma.ts`, enumerate pages, switch
 * the active page, or touch the historical raw capture. It verifies the R2.5 runtime
 * pin, then reads only the explicitly named image paints and records a new private-local
 * evidence bundle alongside (not inside) the frozen capture.
 *
 * Usage:
 *   npm run export:image-fills -- \
 *     --channel <channel> --export-id <slug> --out <private-dir> \
 *     --source-capture <existing-capture-manifest> --captured-by <operator> \
 *     --asset <asset-id>=<node-id>@<paint-index> [--asset ...]
 */

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { lstat, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  type CapabilityRecord,
  computeCapabilityFingerprint,
  computeJsonSha256,
} from "./lib/capture-contract.js";
import {
  IMAGE_FILL_EXPORT_CAPABILITY_SCOPE,
  IMAGE_FILL_EXPORT_FORK,
  IMAGE_FILL_EXPORT_REQUIRED_TOOLS,
  IMAGE_FILL_EXPORT_SCHEMA_VERSION,
  assertImageFillExportManifest,
  isJsonObject,
  isRecord,
  preservesObservedImageFillFields,
  sameJson,
  sha256,
  type EvidenceFile,
  type ImageFillExportAsset,
  type ImageFillExportManifest,
} from "./lib/image-fill-export-contract.js";
import type { JsonObject, JsonValue } from "./lib/fork-payload-contracts.js";

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const DEFAULT_FORK_ROOT = path.resolve(PROJECT_ROOT, "..", "talk-to-figma-fork");
const DEFAULT_RELAY_PORT = 3055;
const CALL_TIMEOUT_MS = 120_000;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SAFE_NODE_ID = /^[^/\\\0]+$/;

type AssetRequest = {
  id: string;
  nodeId: string;
  paintIndex: number;
};

type Options = {
  channel: string;
  exportId: string;
  outDir: string;
  sourceCapture: string;
  capturedBy: string;
  basis: ImageFillExportManifest["authorization"]["basis"];
  notes: string;
  assets: AssetRequest[];
  forkRoot: string;
  relayPort: number;
};

type McpTool = {
  name: string;
  inputSchema: JsonValue;
};

type CapabilityFingerprint = {
  algorithm: "sha256";
  scope: typeof IMAGE_FILL_EXPORT_CAPABILITY_SCOPE;
  value: string;
  tools: CapabilityRecord[];
};

type Preflight = {
  serverPath: string;
  capabilityFingerprint: CapabilityFingerprint;
};

type McpClient = {
  listTools: () => Promise<McpTool[]>;
  callText: (name: string, args: JsonObject) => Promise<string>;
  close: () => void;
};

function nextArg(argv: readonly string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function parseAsset(value: string): AssetRequest {
  const equals = value.indexOf("=");
  const at = value.lastIndexOf("@");
  if (equals <= 0 || at <= equals + 1 || at === value.length - 1) {
    throw new Error("--asset expects <asset-id>=<node-id>@<paint-index>");
  }
  const id = value.slice(0, equals);
  const nodeId = value.slice(equals + 1, at);
  const paintIndexText = value.slice(at + 1);
  const paintIndex = Number.parseInt(paintIndexText, 10);
  if (!SLUG.test(id)) {
    throw new Error(`asset id ${JSON.stringify(id)} must be lowercase kebab-case`);
  }
  if (!SAFE_NODE_ID.test(nodeId) || nodeId === "." || nodeId === "..") {
    throw new Error(`asset ${id} has a path-unsafe node id`);
  }
  if (!Number.isSafeInteger(paintIndex) || paintIndex < 0 || `${paintIndex}` !== paintIndexText) {
    throw new Error(`asset ${id} paint index must be a non-negative integer`);
  }
  return { id, nodeId, paintIndex };
}

function parseArgs(argv: readonly string[]): Options {
  let channel = "";
  let exportId = "";
  let outDir = "";
  let sourceCapture = "";
  let capturedBy = "";
  let basis: ImageFillExportManifest["authorization"]["basis"] = "owned";
  let notes = "";
  const assets: AssetRequest[] = [];
  let forkRoot = DEFAULT_FORK_ROOT;
  let relayPort = DEFAULT_RELAY_PORT;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case "--channel":
        channel = nextArg(argv, index, arg);
        index += 1;
        break;
      case "--export-id":
        exportId = nextArg(argv, index, arg);
        index += 1;
        break;
      case "--out":
        outDir = path.resolve(PROJECT_ROOT, nextArg(argv, index, arg));
        index += 1;
        break;
      case "--source-capture":
        sourceCapture = path.resolve(PROJECT_ROOT, nextArg(argv, index, arg));
        index += 1;
        break;
      case "--captured-by":
        capturedBy = nextArg(argv, index, arg);
        index += 1;
        break;
      case "--basis": {
        const candidate = nextArg(argv, index, arg);
        if (!(["owned", "client-approved", "licensed", "synthetic"] as const).includes(
          candidate as ImageFillExportManifest["authorization"]["basis"],
        )) {
          throw new Error("--basis must be owned, client-approved, licensed, or synthetic");
        }
        basis = candidate as ImageFillExportManifest["authorization"]["basis"];
        index += 1;
        break;
      }
      case "--notes":
        notes = nextArg(argv, index, arg);
        index += 1;
        break;
      case "--asset":
        assets.push(parseAsset(nextArg(argv, index, arg)));
        index += 1;
        break;
      case "--fork-root":
        forkRoot = path.resolve(nextArg(argv, index, arg));
        index += 1;
        break;
      case "--relay-port": {
        const parsed = Number.parseInt(nextArg(argv, index, arg), 10);
        if (!Number.isSafeInteger(parsed) || parsed <= 0) {
          throw new Error("--relay-port must be a positive integer");
        }
        relayPort = parsed;
        index += 1;
        break;
      }
      default:
        throw new Error(`unknown argument: ${arg}`);
    }
  }

  if (!channel) throw new Error("--channel is required");
  if (!SLUG.test(exportId)) throw new Error("--export-id must be lowercase kebab-case");
  if (!outDir) throw new Error("--out is required");
  if (!sourceCapture) throw new Error("--source-capture is required");
  if (!capturedBy) throw new Error("--captured-by is required");
  if (assets.length === 0) throw new Error("at least one --asset is required");
  if (new Set(assets.map((asset) => asset.id)).size !== assets.length) {
    throw new Error("--asset ids must be unique");
  }

  return {
    channel,
    exportId,
    outDir,
    sourceCapture,
    capturedBy,
    basis,
    notes:
      notes ||
      "Targeted original IMAGE-fill export. The frozen full-page capture was read only and not rewritten.",
    assets,
    forkRoot,
    relayPort,
  };
}

function requestMcp(
  child: ChildProcessWithoutNullStreams,
  pending: Map<number, (message: JsonObject) => void>,
  nextId: () => number,
  method: string,
  params: JsonValue,
): Promise<JsonObject> {
  const id = nextId();
  return new Promise<JsonObject>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`MCP ${method} timed out after ${CALL_TIMEOUT_MS}ms`));
    }, CALL_TIMEOUT_MS);
    pending.set(id, (message) => {
      clearTimeout(timer);
      if (message.error !== undefined) {
        reject(new Error(`MCP ${method} error: ${JSON.stringify(message.error)}`));
        return;
      }
      resolve(message);
    });
    child.stdin.write(
      `${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`,
      (error) => {
        if (error) {
          clearTimeout(timer);
          pending.delete(id);
          reject(error);
        }
      },
    );
  });
}

async function connect(serverPath: string, clientName: string): Promise<McpClient> {
  const child: ChildProcessWithoutNullStreams = spawn(process.execPath, [serverPath], {
    stdio: ["pipe", "pipe", "pipe"],
  });
  const pending = new Map<number, (message: JsonObject) => void>();
  let nextId = 1;
  let buffer = "";
  let stderr = "";
  const allocateId = (): number => {
    const id = nextId;
    nextId += 1;
    return id;
  };
  const rejectPending = (error: Error): void => {
    for (const resolve of pending.values()) {
      resolve({ jsonrpc: "2.0", id: -1, error: { message: error.message } });
    }
    pending.clear();
  };

  child.stdout.on("data", (chunk: Buffer) => {
    buffer += chunk.toString("utf8");
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf("\n");
      if (!line) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        continue;
      }
      if (!isRecord(parsed) || typeof parsed.id !== "number") continue;
      const resolve = pending.get(parsed.id);
      if (resolve) {
        pending.delete(parsed.id);
        resolve(parsed as JsonObject);
      }
    }
  });
  child.stderr.on("data", (chunk: Buffer) => {
    stderr = `${stderr}${chunk.toString("utf8")}`.slice(-4_000);
  });
  child.on("error", (error) => rejectPending(error));
  child.on("close", (code) => {
    if (pending.size > 0) {
      rejectPending(
        new Error(
          `MCP server exited (${code ?? "signal"})${stderr ? `: ${stderr.trim()}` : ""}`,
        ),
      );
    }
  });

  const request = (method: string, params: JsonValue): Promise<JsonObject> =>
    requestMcp(child, pending, allocateId, method, params);

  try {
    await request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: clientName, version: "1.0.0" },
    });
    child.stdin.write(
      `${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} })}\n`,
    );
  } catch (error) {
    child.kill();
    throw error;
  }

  const firstText = async (name: string, args: JsonObject): Promise<string> => {
    const response = await request("tools/call", { name, arguments: args });
    if (!isRecord(response.result) || !Array.isArray(response.result.content)) {
      throw new Error(`${name}: reply carried no content array`);
    }
    const text = response.result.content.find(
      (block): block is JsonObject => isJsonObject(block) && block.type === "text" && typeof block.text === "string",
    );
    if (!text || typeof text.text !== "string") {
      throw new Error(`${name}: reply has no text content block`);
    }
    if (response.result.isError === true || /^Error\b/.test(text.text)) {
      throw new Error(`${name} failed: ${text.text.slice(0, 500)}`);
    }
    return text.text;
  };

  return {
    listTools: async () => {
      const response = await request("tools/list", {});
      if (!isRecord(response.result) || !Array.isArray(response.result.tools)) {
        throw new Error("tools/list: reply has no tools array");
      }
      return response.result.tools.flatMap((entry) => {
        if (!isRecord(entry) || typeof entry.name !== "string") return [];
        return entry.inputSchema === undefined
          ? []
          : [{ name: entry.name, inputSchema: entry.inputSchema as JsonValue }];
      });
    },
    callText: firstText,
    close: () => child.kill(),
  };
}

async function runGit(forkRoot: string): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const child = spawn("git", ["-C", forkRoot, "rev-parse", "HEAD"], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(stderr.trim() || "could not read the fork commit"));
    });
  });
}

async function relayReachable(port: number): Promise<boolean> {
  return await new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    const settle = (reachable: boolean): void => {
      socket.destroy();
      resolve(reachable);
    };
    socket.setTimeout(2_000);
    socket.once("connect", () => settle(true));
    socket.once("timeout", () => settle(false));
    socket.once("error", () => settle(false));
  });
}

function requiredCapabilityFingerprint(tools: readonly McpTool[]): CapabilityFingerprint {
  const byName = new Map(tools.map((tool) => [tool.name, tool]));
  const missing = IMAGE_FILL_EXPORT_REQUIRED_TOOLS.filter((name) => !byName.has(name));
  if (missing.length > 0) {
    throw new Error(`runtime is missing required image-fill tools: ${missing.join(", ")}`);
  }
  const records = IMAGE_FILL_EXPORT_REQUIRED_TOOLS.map((name) => {
    const tool = byName.get(name);
    if (!tool) throw new Error(`tool ${name} disappeared during preflight`);
    return { name, inputSchemaSha256: computeJsonSha256(tool.inputSchema) };
  });
  return {
    algorithm: "sha256",
    scope: IMAGE_FILL_EXPORT_CAPABILITY_SCOPE,
    value: computeCapabilityFingerprint(records),
    tools: [...records].sort((left, right) => left.name.localeCompare(right.name)),
  };
}

async function preflight(options: Options): Promise<Preflight> {
  const serverPath = path.join(options.forkRoot, "dist", "server.js");
  const pluginRoot = path.join(options.forkRoot, "src", "cursor_mcp_plugin");
  const manifestPath = path.join(pluginRoot, "manifest.json");
  const codePath = path.join(pluginRoot, "code.js");
  const [forkCommit, packageText, serverBytes, pluginManifestText, pluginCodeBytes, relayUp] =
    await Promise.all([
      runGit(options.forkRoot),
      readFile(path.join(options.forkRoot, "package.json"), "utf8"),
      readFile(serverPath),
      readFile(manifestPath, "utf8"),
      readFile(codePath),
      relayReachable(options.relayPort),
    ]);
  const packageJson = JSON.parse(packageText) as { version?: unknown };
  const pluginManifest = JSON.parse(pluginManifestText) as Record<string, unknown>;
  const failures: string[] = [];
  const expect = (label: string, expected: string, actual: unknown): void => {
    if (actual !== expected) failures.push(`${label}: expected ${expected}, received ${String(actual)}`);
  };

  expect("fork commit", IMAGE_FILL_EXPORT_FORK.commit, forkCommit);
  expect("package version", IMAGE_FILL_EXPORT_FORK.packageVersion, packageJson.version);
  expect("server bundle hash", IMAGE_FILL_EXPORT_FORK.serverBundleSha256, sha256(serverBytes));
  for (const [key, expected] of Object.entries(IMAGE_FILL_EXPORT_FORK.plugin)) {
    const actual = key.endsWith("Sha256")
      ? key === "manifestSha256"
        ? sha256(Buffer.from(pluginManifestText, "utf8"))
        : sha256(pluginCodeBytes)
      : pluginManifest[key];
    expect(`plugin ${key}`, expected, actual);
  }
  if (!relayUp) {
    failures.push(`local relay: expected listening on 127.0.0.1:${options.relayPort}`);
  }

  const client = await connect(serverPath, "figma-to-code-image-fill-preflight");
  let capabilityFingerprint: CapabilityFingerprint;
  try {
    capabilityFingerprint = requiredCapabilityFingerprint(await client.listTools());
  } finally {
    client.close();
  }
  if (failures.length > 0) {
    throw new Error(`R2.5 asset-export preflight failed:\n${failures.map((failure) => `  - ${failure}`).join("\n")}`);
  }
  return { serverPath, capabilityFingerprint };
}

function parseJson(text: string, tool: string): JsonObject {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`${tool}: expected a JSON text reply`);
  }
  if (!isJsonObject(parsed)) {
    throw new Error(`${tool}: expected a JSON object reply`);
  }
  return parsed;
}

function exactImageFill(node: JsonObject, request: AssetRequest): JsonObject {
  if (!Array.isArray(node.fills)) {
    throw new Error(`asset ${request.id}: node reply has no fills array`);
  }
  const fill = node.fills[request.paintIndex];
  if (!isJsonObject(fill) || fill.type !== "IMAGE") {
    throw new Error(`asset ${request.id}: selected fill is not an IMAGE paint`);
  }
  return fill;
}

function receiptNumber(value: unknown, field: string): number | null {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`export_image_fill: receipt ${field} must be a finite number or null`);
  }
  return value;
}

function receiptStringOrNull(value: unknown, field: string): string | null {
  if (value === null) return null;
  if (typeof value !== "string") {
    throw new Error(`export_image_fill: receipt ${field} must be a string or null`);
  }
  return value;
}

function ensureRuntime(runtime: JsonObject): void {
  const server = runtime.server;
  const plugin = runtime.plugin;
  const compatibility = runtime.compatibility;
  if (!isJsonObject(server) || !isJsonObject(plugin) || !isJsonObject(compatibility)) {
    throw new Error("get_runtime_info: incomplete server/plugin compatibility reply");
  }
  const checks: Array<[string, unknown, string]> = [
    ["server release", server.release, IMAGE_FILL_EXPORT_FORK.runtime.release],
    ["server build", server.buildId, IMAGE_FILL_EXPORT_FORK.runtime.serverBuildId],
    ["server schema", server.schemaVersion, IMAGE_FILL_EXPORT_FORK.runtime.serverSchemaVersion],
    ["server fingerprint", server.capabilityFingerprint, IMAGE_FILL_EXPORT_FORK.runtime.capabilityFingerprint],
    ["plugin release", plugin.release, IMAGE_FILL_EXPORT_FORK.runtime.release],
    ["plugin build", plugin.buildId, IMAGE_FILL_EXPORT_FORK.runtime.pluginBuildId],
    ["plugin API", plugin.apiVersion, IMAGE_FILL_EXPORT_FORK.runtime.pluginApiVersion],
    ["plugin schema", plugin.serverSchemaVersion, IMAGE_FILL_EXPORT_FORK.runtime.serverSchemaVersion],
    ["plugin fingerprint", plugin.capabilityFingerprint, IMAGE_FILL_EXPORT_FORK.runtime.capabilityFingerprint],
    ["runtime compatibility", compatibility.status, "compatible"],
  ];
  const failures = checks
    .filter(([, actual, expected]) => actual !== expected)
    .map(([label, actual, expected]) => `${label}: expected ${expected}, received ${String(actual)}`);
  if (!Array.isArray(compatibility.issues) || compatibility.issues.length !== 0) {
    failures.push("runtime compatibility: expected no compatibility issues");
  }
  if (failures.length > 0) {
    throw new Error(`R2.5 runtime mismatch:\n${failures.map((failure) => `  - ${failure}`).join("\n")}`);
  }
}

function relativePath(outDir: string, target: string): string {
  const relative = path.relative(outDir, target).split(path.sep).join("/");
  if (!relative || relative === ".." || relative.startsWith("../") || path.isAbsolute(relative)) {
    throw new Error(`evidence path escapes output directory: ${target}`);
  }
  return relative;
}

async function writeEvidence(
  outDir: string,
  relative: string,
  bytes: Uint8Array,
): Promise<EvidenceFile> {
  const target = path.resolve(outDir, relative);
  const normalized = relativePath(outDir, target);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, bytes);
  return { path: normalized, sha256: sha256(bytes), bytes: bytes.length };
}

async function recordExistingEvidence(
  outDir: string,
  target: string,
): Promise<EvidenceFile> {
  const bytes = await readFile(target);
  return {
    path: relativePath(outDir, target),
    sha256: sha256(bytes),
    bytes: bytes.length,
  };
}

async function assertEmptyOutputDirectory(outDir: string): Promise<void> {
  await mkdir(outDir, { recursive: true });
  const entries = await readdir(outDir);
  if (entries.length > 0) {
    throw new Error(`--out must be a new empty directory; found ${entries.length} existing entry(s)`);
  }
}

async function assertRegularFile(filePath: string, label: string): Promise<void> {
  const stats = await lstat(filePath);
  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw new Error(`${label} must be a regular non-symlink file`);
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  await assertRegularFile(options.sourceCapture, "--source-capture");
  await assertEmptyOutputDirectory(options.outDir);

  const [sourceCaptureBytes, runtime] = await Promise.all([
    readFile(options.sourceCapture),
    preflight(options),
  ]);
  const client = await connect(runtime.serverPath, "figma-to-code-image-fill-export");
  const assets: ImageFillExportAsset[] = [];

  try {
    const liveFingerprint = requiredCapabilityFingerprint(await client.listTools());
    if (liveFingerprint.value !== runtime.capabilityFingerprint.value) {
      throw new Error("connected tool schemas changed after preflight; refusing to capture evidence");
    }

    const joined = await client.callText("join_channel", { channel: options.channel });
    if (!joined.includes("joined channel")) {
      throw new Error("join_channel did not confirm the requested channel");
    }
    ensureRuntime(parseJson(await client.callText("get_runtime_info", {}), "get_runtime_info"));

    for (const request of options.assets) {
      const beforeText = await client.callText("get_node_info", { nodeId: request.nodeId });
      const before = parseJson(beforeText, "get_node_info");
      const beforeFill = exactImageFill(before, request);
      const assetPath = path.join(options.outDir, "assets", `${request.id}.asset`);
      const receiptText = await client.callText("export_image_fill", {
        nodeId: request.nodeId,
        paintIndex: request.paintIndex,
        filePath: assetPath,
      });
      const receipt = parseJson(receiptText, "export_image_fill");
      if (
        receipt.nodeId !== request.nodeId ||
        receipt.paintIndex !== request.paintIndex ||
        receipt.delivery !== "file" ||
        receipt.path !== assetPath ||
        typeof receipt.imageHash !== "string" ||
        receipt.imageHash.length === 0 ||
        !isJsonObject(receipt.imageFill) ||
        receipt.imageFill.type !== "IMAGE" ||
        receipt.imageFill.imageHash !== receipt.imageHash ||
        !preservesObservedImageFillFields(beforeFill, receipt.imageFill)
      ) {
        throw new Error(`asset ${request.id}: export receipt does not match the named image paint`);
      }
      if (typeof receipt.mimeType !== "string" || receipt.mimeType.length === 0) {
        throw new Error(`asset ${request.id}: export receipt has no MIME type`);
      }
      const sourceBytes = await recordExistingEvidence(options.outDir, assetPath);
      if (receipt.bytes !== sourceBytes.bytes || receipt.sha256 !== sourceBytes.sha256) {
        throw new Error(`asset ${request.id}: source bytes do not match the export receipt`);
      }

      const afterText = await client.callText("get_node_info", { nodeId: request.nodeId });
      const after = parseJson(afterText, "get_node_info");
      const beforeEvidence = await writeEvidence(
        options.outDir,
        `node-observations/${request.id}.before.json`,
        Buffer.from(beforeText, "utf8"),
      );
      const receiptEvidence = await writeEvidence(
        options.outDir,
        `receipts/${request.id}.json`,
        Buffer.from(receiptText, "utf8"),
      );
      const afterEvidence = await writeEvidence(
        options.outDir,
        `node-observations/${request.id}.after.json`,
        Buffer.from(afterText, "utf8"),
      );
      if (!sameJson(before as JsonValue, after as JsonValue)) {
        throw new Error(`asset ${request.id}: a read-only export changed the node reply`);
      }

      assets.push({
        id: request.id,
        capturedAt: new Date().toISOString(),
        nodeId: request.nodeId,
        paintIndex: request.paintIndex,
        sourceImageHash: receipt.imageHash as string,
        imageFill: receipt.imageFill,
        mimeType: receipt.mimeType,
        width: receiptNumber(receipt.width, "width"),
        height: receiptNumber(receipt.height, "height"),
        dimensionSource: receiptStringOrNull(receipt.dimensionSource, "dimensionSource"),
        toolCall: {
          name: "export_image_fill",
          arguments: { nodeId: request.nodeId, paintIndex: request.paintIndex },
          delivery: "file",
        },
        sourceBytes,
        receipt: receiptEvidence,
        before: beforeEvidence,
        after: afterEvidence,
      });
      console.log(`captured ${request.id}`);
    }
  } finally {
    client.close();
  }

  const manifest: ImageFillExportManifest = {
    $schema: "https://figma-to-code.local/schemas/image-fill-export-manifest.schema.json",
    schemaVersion: IMAGE_FILL_EXPORT_SCHEMA_VERSION,
    exportId: options.exportId,
    capturedAt: new Date().toISOString(),
    sourceCapture: {
      manifestSha256: sha256(sourceCaptureBytes),
      bytes: sourceCaptureBytes.length,
    },
    authorization: {
      status: "authorized",
      basis: options.basis,
      capturedBy: options.capturedBy,
      containsPrivateContent: true,
      commitPolicy: "private-local",
      notes: options.notes,
    },
    provenance: {
      captureMethod: "read-only-local-mcp",
      operator: "scripts/export-figma-image-fills.ts",
      notes: [
        "The historical capture manifest and raw replies were read only and not rewritten.",
        "Each asset records get_node_info observations before and after the source-byte read; canonical JSON equality is required.",
        "The source file is the original IMAGE fill bytes, not a composited node export.",
      ],
    },
    runtime: {
      provider: "talk-to-figma-fork",
      forkCommit: IMAGE_FILL_EXPORT_FORK.commit,
      packageVersion: IMAGE_FILL_EXPORT_FORK.packageVersion,
      serverBundleSha256: IMAGE_FILL_EXPORT_FORK.serverBundleSha256,
      connection: { relay: "local-websocket", channel: options.channel },
      plugin: { ...IMAGE_FILL_EXPORT_FORK.plugin },
      capabilityFingerprint: runtime.capabilityFingerprint,
    },
    assets,
  };
  assertImageFillExportManifest(manifest);
  await writeEvidence(
    options.outDir,
    "asset-export-manifest.json",
    Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8"),
  );
  console.log(`asset export bundle verified: ${assets.length} targeted image fill(s)`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
