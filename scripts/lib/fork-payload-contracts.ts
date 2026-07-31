/**
 * External payload contracts for talk-to-figma-fork @ 956a6af.
 *
 * These validators intentionally cover only guarantees published by the fork's
 * README and docs/READ-LAYER-PLAN.md. Unknown additive fields are preserved.
 * Nothing here imports or copies the fork's implementation.
 */

export const FORK_PAYLOAD_ROLES = [
  "pages",
  "document",
  "variables",
  "styles",
  "components",
  "node",
  "node-variables",
  "reactions",
  "image-export",
] as const;

export type ForkPayloadRole = (typeof FORK_PAYLOAD_ROLES)[number];

export type JsonPrimitive = boolean | number | string | null;
export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export type ValidatedForkPayload = {
  role: ForkPayloadRole;
  value: JsonObject | string;
  nodeId?: string;
  pageId?: string;
  supported?: boolean;
  complete?: boolean;
  limitations: string[];
  decodedImage?: Uint8Array;
  imageMimeType?: string;
};

export class ForkPayloadContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ForkPayloadContractError";
  }
}

function fail(path: string, message: string): never {
  throw new ForkPayloadContractError(`${path}: ${message}`);
}

function objectAt(value: unknown, path: string): JsonObject {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(path, "expected an object");
  }
  if (!isJsonValue(value)) {
    fail(path, "contains a non-JSON value");
  }
  return value as JsonObject;
}

function arrayAt(value: JsonValue | undefined, path: string): JsonValue[] {
  if (!Array.isArray(value)) fail(path, "expected an array");
  return value;
}

function stringAt(value: JsonValue | undefined, path: string): string {
  if (typeof value !== "string" || value.length === 0) {
    fail(path, "expected a non-empty string");
  }
  return value;
}

function booleanAt(value: JsonValue | undefined, path: string): boolean {
  if (typeof value !== "boolean") fail(path, "expected a boolean");
  return value;
}

function integerAt(value: JsonValue | undefined, path: string): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    fail(path, "expected a non-negative integer");
  }
  return value;
}

function stringsAt(value: JsonValue | undefined, path: string): string[] {
  return arrayAt(value, path).map((entry, index) =>
    stringAt(entry, `${path}[${index}]`),
  );
}

function optionalBoolean(
  value: JsonValue | undefined,
  path: string,
): boolean | undefined {
  return value === undefined ? undefined : booleanAt(value, path);
}

function optionalString(
  value: JsonValue | undefined,
  path: string,
): string | undefined {
  return value === undefined ? undefined : stringAt(value, path);
}

function limitationsOf(payload: JsonObject, path: string): string[] {
  return payload.limitations === undefined
    ? []
    : stringsAt(payload.limitations, `${path}.limitations`);
}

function pageAt(value: JsonValue, path: string): JsonObject {
  const page = objectAt(value, path);
  stringAt(page.id, `${path}.id`);
  stringAt(page.name, `${path}.name`);
  if (page.childCount !== undefined) {
    integerAt(page.childCount, `${path}.childCount`);
  }
  return page;
}

function validatePages(value: unknown): ValidatedForkPayload {
  const path = "get_pages";
  const payload = objectAt(value, path);
  const pages = arrayAt(payload.pages, `${path}.pages`).map((page, index) =>
    pageAt(page, `${path}.pages[${index}]`),
  );
  const pageCount = integerAt(payload.pageCount, `${path}.pageCount`);
  if (pageCount !== pages.length) {
    fail(
      `${path}.pageCount`,
      `expected ${pages.length} to match pages.length`,
    );
  }
  const complete = optionalBoolean(payload.complete, `${path}.complete`);
  return {
    role: "pages",
    value: payload,
    complete,
    limitations: limitationsOf(payload, path),
  };
}

function validateDocument(value: unknown): ValidatedForkPayload {
  const path = "get_document_info";
  const payload = objectAt(value, path);
  const currentPage = objectAt(payload.currentPage, `${path}.currentPage`);
  stringAt(currentPage.id, `${path}.currentPage.id`);
  stringAt(currentPage.name, `${path}.currentPage.name`);
  const childCount = integerAt(
    currentPage.childCount,
    `${path}.currentPage.childCount`,
  );
  const children = arrayAt(
    currentPage.children,
    `${path}.currentPage.children`,
  );
  for (const [index, child] of children.entries()) {
    const node = objectAt(child, `${path}.currentPage.children[${index}]`);
    stringAt(node.id, `${path}.currentPage.children[${index}].id`);
    stringAt(node.name, `${path}.currentPage.children[${index}].name`);
    stringAt(node.type, `${path}.currentPage.children[${index}].type`);
  }
  const pages = arrayAt(payload.pages, `${path}.pages`).map((page, index) =>
    pageAt(page, `${path}.pages[${index}]`),
  );
  const pageCount = integerAt(payload.pageCount, `${path}.pageCount`);
  if (pageCount !== pages.length) {
    fail(
      `${path}.pageCount`,
      `expected ${pages.length} to match pages.length`,
    );
  }
  const pagination = objectAt(payload.pagination, `${path}.pagination`);
  const offset = integerAt(pagination.offset, `${path}.pagination.offset`);
  const returned = integerAt(
    pagination.returned,
    `${path}.pagination.returned`,
  );
  integerAt(pagination.limit, `${path}.pagination.limit`);
  const hasMore = booleanAt(
    pagination.hasMore,
    `${path}.pagination.hasMore`,
  );
  if (returned !== children.length) {
    fail(
      `${path}.pagination.returned`,
      `expected ${children.length} to match currentPage.children.length`,
    );
  }
  if (hasMore !== offset + returned < childCount) {
    fail(
      `${path}.pagination.hasMore`,
      "does not agree with offset, returned, and childCount",
    );
  }
  const truncated = booleanAt(
    payload.childrenTruncated,
    `${path}.childrenTruncated`,
  );
  if (truncated !== hasMore) {
    fail(
      `${path}.childrenTruncated`,
      "must agree with pagination.hasMore",
    );
  }
  const complete = optionalBoolean(payload.complete, `${path}.complete`);
  return {
    role: "document",
    value: payload,
    pageId: stringAt(currentPage.id, `${path}.currentPage.id`),
    complete,
    limitations: limitationsOf(payload, path),
  };
}

function validateVariables(value: unknown): ValidatedForkPayload {
  const path = "get_variables";
  const payload = objectAt(value, path);
  const supported = booleanAt(payload.supported, `${path}.supported`);
  const complete = booleanAt(payload.complete, `${path}.complete`);
  const collections = arrayAt(
    payload.collections,
    `${path}.collections`,
  );
  for (const [collectionIndex, entry] of collections.entries()) {
    const collection = objectAt(
      entry,
      `${path}.collections[${collectionIndex}]`,
    );
    stringAt(collection.id, `${path}.collections[${collectionIndex}].id`);
    stringAt(collection.name, `${path}.collections[${collectionIndex}].name`);
    const modes = arrayAt(
      collection.modes,
      `${path}.collections[${collectionIndex}].modes`,
    );
    for (const [modeIndex, modeEntry] of modes.entries()) {
      const mode = objectAt(
        modeEntry,
        `${path}.collections[${collectionIndex}].modes[${modeIndex}]`,
      );
      stringAt(
        mode.id,
        `${path}.collections[${collectionIndex}].modes[${modeIndex}].id`,
      );
      stringAt(
        mode.name,
        `${path}.collections[${collectionIndex}].modes[${modeIndex}].name`,
      );
    }
    arrayAt(
      collection.variables,
      `${path}.collections[${collectionIndex}].variables`,
    );
  }
  const collectionCount = integerAt(
    payload.collectionCount,
    `${path}.collectionCount`,
  );
  if (collectionCount !== collections.length) {
    fail(
      `${path}.collectionCount`,
      `expected ${collections.length} to match collections.length`,
    );
  }
  integerAt(payload.variableCount, `${path}.variableCount`);
  optionalString(payload.resolutionStatus, `${path}.resolutionStatus`);
  return {
    role: "variables",
    value: payload,
    supported,
    complete,
    limitations: limitationsOf(payload, path),
  };
}

function validateStyles(value: unknown): ValidatedForkPayload {
  const path = "get_styles";
  const payload = objectAt(value, path);
  const styles = arrayAt(payload.styles, `${path}.styles`);
  for (const [index, entry] of styles.entries()) {
    const style = objectAt(entry, `${path}.styles[${index}]`);
    stringAt(style.id, `${path}.styles[${index}].id`);
    stringAt(style.name, `${path}.styles[${index}].name`);
    stringAt(style.type, `${path}.styles[${index}].type`);
    optionalBoolean(style.remote, `${path}.styles[${index}].remote`);
  }
  const count = integerAt(payload.count, `${path}.count`);
  if (count !== styles.length) {
    fail(`${path}.count`, `expected ${styles.length} to match styles.length`);
  }
  const supported = optionalBoolean(payload.supported, `${path}.supported`);
  const complete = optionalBoolean(payload.complete, `${path}.complete`);
  return {
    role: "styles",
    value: payload,
    supported,
    complete,
    limitations: limitationsOf(payload, path),
  };
}

function validateComponents(value: unknown): ValidatedForkPayload {
  const path = "get_local_components";
  const payload = objectAt(value, path);
  booleanAt(payload.summary, `${path}.summary`);
  integerAt(payload.count, `${path}.count`);
  arrayAt(payload.families, `${path}.families`);
  arrayAt(payload.authoringSessions, `${path}.authoringSessions`);
  const coverage = objectAt(payload.coverage, `${path}.coverage`);
  stringAt(coverage.scope, `${path}.coverage.scope`);
  const complete = booleanAt(
    coverage.complete,
    `${path}.coverage.complete`,
  );
  integerAt(coverage.pagesTotal, `${path}.coverage.pagesTotal`);
  integerAt(coverage.pagesScanned, `${path}.coverage.pagesScanned`);
  arrayAt(coverage.pagesSkipped, `${path}.coverage.pagesSkipped`);
  arrayAt(coverage.pagesNotFound, `${path}.coverage.pagesNotFound`);
  const limitations = stringsAt(
    coverage.limitations,
    `${path}.coverage.limitations`,
  );
  return {
    role: "components",
    value: payload,
    complete,
    limitations,
  };
}

function validateNode(value: unknown): ValidatedForkPayload {
  const path = "get_node_info";
  const payload = objectAt(value, path);
  const nodeId = stringAt(payload.id, `${path}.id`);
  stringAt(payload.name, `${path}.name`);
  stringAt(payload.type, `${path}.type`);
  return {
    role: "node",
    value: payload,
    nodeId,
    limitations: limitationsOf(payload, path),
  };
}

function validateNodeVariables(value: unknown): ValidatedForkPayload {
  const path = "get_node_variables";
  const payload = objectAt(value, path);
  const nodeId = stringAt(payload.nodeId, `${path}.nodeId`);
  const supported = booleanAt(payload.supported, `${path}.supported`);
  const complete = booleanAt(payload.complete, `${path}.complete`);
  const bindings = arrayAt(payload.bindings, `${path}.bindings`);
  const styles = arrayAt(payload.styles, `${path}.styles`);
  const bindingCount = integerAt(
    payload.bindingCount,
    `${path}.bindingCount`,
  );
  const styleCount = integerAt(payload.styleCount, `${path}.styleCount`);
  if (bindingCount !== bindings.length) {
    fail(
      `${path}.bindingCount`,
      `expected ${bindings.length} to match bindings.length`,
    );
  }
  if (styleCount !== styles.length) {
    fail(
      `${path}.styleCount`,
      `expected ${styles.length} to match styles.length`,
    );
  }
  integerAt(payload.unresolvedVariables, `${path}.unresolvedVariables`);
  integerAt(payload.unresolvedStyles, `${path}.unresolvedStyles`);
  return {
    role: "node-variables",
    value: payload,
    nodeId,
    supported,
    complete,
    limitations: limitationsOf(payload, path),
  };
}

function validateReactions(value: unknown): ValidatedForkPayload {
  const path = "get_reactions";
  const payload = objectAt(value, path);
  const nodeId = stringAt(payload.nodeId, `${path}.nodeId`);
  const reactions = arrayAt(payload.reactions, `${path}.reactions`);
  const reactionCount = integerAt(
    payload.reactionCount,
    `${path}.reactionCount`,
  );
  if (reactionCount !== reactions.length) {
    fail(
      `${path}.reactionCount`,
      `expected ${reactions.length} to match reactions.length`,
    );
  }
  const complete = optionalBoolean(payload.complete, `${path}.complete`);
  return {
    role: "reactions",
    value: payload,
    nodeId,
    complete,
    limitations: limitationsOf(payload, path),
  };
}

function decodeBase64(value: string, path: string): Uint8Array {
  const encoded = value.includes(",") ? value.slice(value.indexOf(",") + 1) : value;
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded) || encoded.length % 4 !== 0) {
    fail(path, "expected canonical base64");
  }
  const decoded = Buffer.from(encoded, "base64");
  if (decoded.length === 0) fail(path, "decoded image is empty");
  return decoded;
}

function validateImageExport(value: unknown): ValidatedForkPayload {
  const path = "export_node_as_image";
  if (typeof value === "string") {
    return {
      role: "image-export",
      value,
      limitations: [],
      decodedImage: decodeBase64(value.trim(), path),
    };
  }
  const payload = objectAt(value, path);
  const nodeId = stringAt(payload.nodeId, `${path}.nodeId`);
  stringAt(payload.format, `${path}.format`);
  const mimeType = stringAt(payload.mimeType, `${path}.mimeType`);
  const encoding = stringAt(payload.encoding, `${path}.encoding`);
  if (encoding !== "base64") {
    fail(`${path}.encoding`, 'expected "base64"');
  }
  const data = stringAt(payload.data, `${path}.data`);
  return {
    role: "image-export",
    value: payload,
    nodeId,
    limitations: limitationsOf(payload, path),
    decodedImage: decodeBase64(data, `${path}.data`),
    imageMimeType: mimeType,
  };
}

export function validateForkPayload(
  role: ForkPayloadRole,
  value: unknown,
): ValidatedForkPayload {
  switch (role) {
    case "pages":
      return validatePages(value);
    case "document":
      return validateDocument(value);
    case "variables":
      return validateVariables(value);
    case "styles":
      return validateStyles(value);
    case "components":
      return validateComponents(value);
    case "node":
      return validateNode(value);
    case "node-variables":
      return validateNodeVariables(value);
    case "reactions":
      return validateReactions(value);
    case "image-export":
      return validateImageExport(value);
  }
}

export function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string"
  ) {
    return true;
  }
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (typeof value !== "object") return false;
  return Object.values(value).every(isJsonValue);
}
