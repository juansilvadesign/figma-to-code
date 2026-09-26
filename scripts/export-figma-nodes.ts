#!/usr/bin/env -S node --import tsx

/**
 * Targeted, read-only node (SVG/PNG) exporter.
 *
 * The twin of `export-figma-image-fills.ts`: same pin, same before/after
 * no-mutation guarantee over `get_node_info`, same private-local evidence
 * bundle written alongside (not inside) the frozen capture. The difference is
 * the source — a whole node's *rendered* output via `export_node_as_image`,
 * not an original IMAGE-fill's bytes — and that Figma can legitimately refuse
 * to export a given node as SVG. That refusal is recorded verbatim as a
 * "rejected" asset; it never aborts the rest of the batch.
 *
 * This script never discovers a page, walks a subtree, switches the active
 * page, or calls a write-oriented MCP tool. Every `--node` names one exact
 * node id.
 *
 * Usage:
 *   npm run export:nodes -- \
 *     --channel <channel> --export-id <slug> --out <private-dir> \
 *     --source-capture <existing-capture-manifest> --captured-by <operator> \
 *     --node <asset-id>=<node-id>:<SVG|PNG>@<scale> [--node ...]
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
  runtimeIdentityIssues,
} from "./lib/capture-contract.js";
import {
  NODE_EXPORT_CAPABILITY_SCOPE,
  NODE_EXPORT_FORK,
  NODE_EXPORT_REQUIRED_TOOLS,
  NODE_EXPORT_SCHEMA_VERSION,
  assertNodeExportManifest,
  isJsonObject,
  isRecord,
  sameJson,
  sha256,
  type EvidenceFile,
  type NodeExportAsset,
  type NodeExportFormat,
  type NodeExportManifest,
} from "./lib/node-export-contract.js";
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
// Scale is a Figma export multiplier, not a pixel count: a pixel-budgeted
// render (R2-BL-5b) legitimately asks for a fraction below 1 (a huge node)
// or between 1 and 2 (a large one), so this accepts an optional decimal tail
// rather than digits-only.
const NODE_SPEC = /^(.+):(SVG|PNG)@([0-9]+(?:\.[0-9]+)?)$/;

type NodeRequest = {
  id: string;
  nodeId: string;
  format: NodeExportFormat;
  scale: number;
};

type Options = {
  channel: string;
  exportId: string;
  outDir: string;
  sourceCapture: string;
  capturedBy: string;
  basis: NodeExportManifest["authorization"]["basis"];
  notes: string;
  requests: NodeRequest[];
  forkRoot: string;
  relayPort: number;
};

type McpTool = {
  name: string;
  inputSchema: JsonValue;
};

type CapabilityFingerprint = {
  algorithm: "sha256";
  scope: typeof NODE_EXPORT_CAPABILITY_SCOPE;
  value: string;
  tools: CapabilityRecord[];
};

type Preflight = {
  serverPath: string;
  capabilityFingerprint: CapabilityFingerprint;
};

type McpClient = {
  listTools: () => Promise<McpTool[]>;
  /** Throws unless the reply is a non-error text content block. */
  callText: (name: string, args: JsonObject) => Promise<string>;
  /** Never throws on `isError` or reply shape — the caller decides. */
  callRaw: (name: string, args: JsonObject) => Promise<{ isError: boolean; block: JsonObject }>;
  close: () => void;
};

function nextArg(argv: readonly string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function parseNodeRequest(value: string): NodeRequest {
  const equals = value.indexOf("=");
  if (equals <= 0) {
    throw new Error("--node expects <asset-id>=<node-id>:<SVG|PNG>@<scale>");
  }
  const id = value.slice(0, equals);
  const rest = value.slice(equals + 1);
  const match = NODE_SPEC.exec(rest);
  if (!match) {
    throw new Error(`--node ${id}: expected <node-id>:<SVG|PNG>@<scale>`);
  }
  const [, nodeId, format, scaleText] = match;
  if (!SLUG.test(id)) {
    throw new Error(`node id ${JSON.stringify(id)} must be lowercase kebab-case`);
  }
  if (!SAFE_NODE_ID.test(nodeId) || nodeId === "." || nodeId === "..") {
    throw new Error(`node ${id} has a path-unsafe node id`);
  }
  const scale = Number.parseFloat(scaleText);
  if (!Number.isFinite(scale) || scale <= 0) {
    throw new Error(`node ${id}: scale must be a positive number`);
  }
  return { id, nodeId, format: format as NodeExportFormat, scale };
}

function parseArgs(argv: readonly string[]): Options {
  let channel = "";
  let exportId = "";
  let outDir = "";
  let sourceCapture = "";
  let capturedBy = "";
  let basis: NodeExportManifest["authorization"]["basis"] = "owned";
  let notes = "";
  const requests: NodeRequest[] = [];
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
          candidate as NodeExportManifest["authorization"]["basis"],
        )) {
          throw new Error("--basis must be owned, client-approved, licensed, or synthetic");
        }
        basis = candidate as NodeExportManifest["authorization"]["basis"];
        index += 1;
        break;
      }
      case "--notes":
        notes = nextArg(argv, index, arg);
        index += 1;
        break;
      case "--node":
        requests.push(parseNodeRequest(nextArg(argv, index, arg)));
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
  if (requests.length === 0) throw new Error("at least one --node is required");
  if (new Set(requests.map((request) => request.id)).size !== requests.length) {
    throw new Error("--node ids must be unique");
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
      "Targeted node (SVG/PNG) export. The frozen full-page capture was read only and not rewritten.",
    requests,
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

  const firstBlock = async (
    name: string,
    args: JsonObject,
  ): Promise<{ isError: boolean; block: JsonObject }> => {
    const response = await request("tools/call", { name, arguments: args });
    if (!isRecord(response.result) || !Array.isArray(response.result.content)) {
      throw new Error(`${name}: reply carried no content array`);
    }
    const block = response.result.content[0];
    if (!isJsonObject(block)) {
      throw new Error(`${name}: first content block is not an object`);
    }
    return { isError: response.result.isError === true, block };
  };

  const callText = async (name: string, args: JsonObject): Promise<string> => {
    const { isError, block } = await firstBlock(name, args);
    if (typeof block.text !== "string") {
      throw new Error(`${name}: reply has no text content block`);
    }
    if (isError || /^Error\b/.test(block.text)) {
      throw new Error(`${name} failed: ${block.text.slice(0, 500)}`);
    }
    return block.text;
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
    callText,
    callRaw: firstBlock,
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
  const missing = NODE_EXPORT_REQUIRED_TOOLS.filter((name) => !byName.has(name));
  if (missing.length > 0) {
    throw new Error(`runtime is missing required node-export tools: ${missing.join(", ")}`);
  }
  const records = NODE_EXPORT_REQUIRED_TOOLS.map((name) => {
    const tool = byName.get(name);
    if (!tool) throw new Error(`tool ${name} disappeared during preflight`);
    return { name, inputSchemaSha256: computeJsonSha256(tool.inputSchema) };
  });
  return {
    algorithm: "sha256",
    scope: NODE_EXPORT_CAPABILITY_SCOPE,
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

  expect("fork commit", NODE_EXPORT_FORK.commit, forkCommit);
  expect("package version", NODE_EXPORT_FORK.packageVersion, packageJson.version);
  expect("server bundle hash", NODE_EXPORT_FORK.serverBundleSha256, sha256(serverBytes));
  for (const [key, expected] of Object.entries(NODE_EXPORT_FORK.plugin)) {
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

  const client = await connect(serverPath, "figma-to-code-node-export-preflight");
  let capabilityFingerprint: CapabilityFingerprint;
  try {
    capabilityFingerprint = requiredCapabilityFingerprint(await client.listTools());
  } finally {
    client.close();
  }
  if (failures.length > 0) {
    throw new Error(`R2.5 node-export preflight failed:\n${failures.map((failure) => `  - ${failure}`).join("\n")}`);
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

function ensureRuntime(runtime: JsonObject): void {
  const failures = runtimeIdentityIssues(runtime, NODE_EXPORT_FORK.runtime);
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

function decodeBase64(value: string): Buffer {
  const encoded = value.includes(",") ? value.slice(value.indexOf(",") + 1) : value;
  return Buffer.from(encoded, "base64");
}

function extensionFor(mimeType: string): string {
  if (mimeType === "image/svg+xml") return "svg";
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  throw new Error(`export_node_as_image: unsupported mimeType ${mimeType}`);
}

/**
 * `export_node_as_image` delivers inline, not by file path: a PNG arrives as
 * an MCP image content block (`{type:"image", data:<base64>, mimeType}`), and
 * an SVG can arrive the same way or as a plain text block carrying the raw
 * `<svg …>` markup — the fork does not always wrap vector text in the image
 * envelope. Either shape is a success. Anything else naming neither is
 * Figma's own rejection prose passed straight through, verbatim, and is
 * reported to the caller rather than thrown, so one ungeneratable node never
 * aborts the batch.
 */
type ExportOutcome =
  | { kind: "exported"; bytes: Buffer; mimeType: string }
  | { kind: "rejected"; text: string };

function interpretExport(block: JsonObject, format: NodeExportFormat): ExportOutcome {
  if (block.type === "image" && typeof block.data === "string") {
    const mimeType = typeof block.mimeType === "string" ? block.mimeType : "image/png";
    return { kind: "exported", bytes: decodeBase64(block.data), mimeType };
  }
  if (typeof block.text === "string") {
    const text = block.text.trimStart();
    if (format === "SVG" && (text.startsWith("<svg") || text.startsWith("<?xml"))) {
      return { kind: "exported", bytes: Buffer.from(block.text, "utf8"), mimeType: "image/svg+xml" };
    }
    return { kind: "rejected", text: block.text };
  }
  throw new Error(`export_node_as_image: unrecognized reply shape ${JSON.stringify(block).slice(0, 200)}`);
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  await assertRegularFile(options.sourceCapture, "--source-capture");
  await assertEmptyOutputDirectory(options.outDir);

  const [sourceCaptureBytes, runtime] = await Promise.all([
    readFile(options.sourceCapture),
    preflight(options),
  ]);
  const client = await connect(runtime.serverPath, "figma-to-code-node-export");
  const assets: NodeExportAsset[] = [];
  let exportedCount = 0;
  let rejectedCount = 0;

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

    for (const request of options.requests) {
      const beforeText = await client.callText("get_node_info", { nodeId: request.nodeId });
      const before = parseJson(beforeText, "get_node_info");

      const exportArgs = { nodeId: request.nodeId, format: request.format, scale: request.scale };
      const { block } = await client.callRaw("export_node_as_image", exportArgs);
      const outcome = interpretExport(block, request.format);

      const afterText = await client.callText("get_node_info", { nodeId: request.nodeId });
      const after = parseJson(afterText, "get_node_info");
      if (!sameJson(before as JsonValue, after as JsonValue)) {
        throw new Error(`asset ${request.id}: a read-only export changed the node reply`);
      }

      const beforeEvidence = await writeEvidence(
        options.outDir,
        `node-observations/${request.id}.before.json`,
        Buffer.from(beforeText, "utf8"),
      );
      const afterEvidence = await writeEvidence(
        options.outDir,
        `node-observations/${request.id}.after.json`,
        Buffer.from(afterText, "utf8"),
      );

      const toolCall = {
        name: "export_node_as_image" as const,
        arguments: exportArgs,
      };
      if (outcome.kind === "exported") {
        const ext = extensionFor(outcome.mimeType);
        const file = await writeEvidence(options.outDir, `assets/${request.id}.${ext}`, outcome.bytes);
        assets.push({
          id: request.id,
          capturedAt: new Date().toISOString(),
          nodeId: request.nodeId,
          format: request.format,
          scale: request.scale,
          outcome: "exported",
          file,
          mimeType: outcome.mimeType,
          toolCall,
          before: beforeEvidence,
          after: afterEvidence,
        });
        exportedCount += 1;
        console.log(`exported ${request.id} (${outcome.mimeType}, ${outcome.bytes.length}B)`);
      } else {
        assets.push({
          id: request.id,
          capturedAt: new Date().toISOString(),
          nodeId: request.nodeId,
          format: request.format,
          scale: request.scale,
          outcome: "rejected",
          rejection: outcome.text,
          toolCall,
          before: beforeEvidence,
          after: afterEvidence,
        });
        rejectedCount += 1;
        console.log(`rejected ${request.id}: ${outcome.text.slice(0, 200)}`);
      }
    }
  } finally {
    client.close();
  }

  const manifest: NodeExportManifest = {
    $schema: "https://figma-to-code.local/schemas/node-export-manifest.schema.json",
    schemaVersion: NODE_EXPORT_SCHEMA_VERSION,
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
      operator: "scripts/export-figma-nodes.ts",
      notes: [
        "The historical capture manifest and raw replies were read only and not rewritten.",
        "Each asset records get_node_info observations before and after the export; canonical JSON equality is required.",
        "A rejected SVG export carries Figma's rejection text verbatim; the request is otherwise unchanged.",
      ],
    },
    runtime: {
      provider: "talk-to-figma-fork",
      forkCommit: NODE_EXPORT_FORK.commit,
      packageVersion: NODE_EXPORT_FORK.packageVersion,
      serverBundleSha256: NODE_EXPORT_FORK.serverBundleSha256,
      connection: { relay: "local-websocket", channel: options.channel },
      plugin: { ...NODE_EXPORT_FORK.plugin },
      capabilityFingerprint: runtime.capabilityFingerprint,
    },
    assets,
  };
  assertNodeExportManifest(manifest);
  await writeEvidence(
    options.outDir,
    "node-export-manifest.json",
    Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8"),
  );
  console.log(
    `node export bundle verified: ${exportedCount} exported, ${rejectedCount} rejected of ${assets.length} requested`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

