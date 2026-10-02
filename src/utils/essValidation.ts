import { z, ZodError, ZodTypeAny } from "zod";
import { isNullOrWhiteSpace } from "./essDotnet.js";
import { EMPTY_GUID, parseGuid } from "./essRequest.js";

// ASP.NET [ApiController] returns RFC 9110 ProblemDetails (not ApiResponse) when model
// binding or data-annotation validation fails. EssValidationError carries those errors
// so essErrorHandler can reproduce that 400 body.
export class EssValidationError extends Error {
  errors: Record<string, string[]>;

  constructor(errors: Record<string, string[]>) {
    super("One or more validation errors occurred.");
    this.name = "EssValidationError";
    this.errors = errors;
  }

  static fromZod(error: ZodError) {
    const errors: Record<string, string[]> = {};
    for (const issue of error.issues) {
      const key = issue.path.length ? pascalPath(issue.path) : "$";
      (errors[key] ??= []).push(issue.message);
    }
    return new EssValidationError(errors);
  }
}

function pascalPath(path: (string | number)[]) {
  return path
    .map((part) => (typeof part === "number" ? `[${part}]` : part.charAt(0).toUpperCase() + part.slice(1)))
    .join(".")
    .replace(/\.\[/g, "[");
}

function unwrap(schema: ZodTypeAny): ZodTypeAny {
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) {
    return unwrap(schema.unwrap());
  }
  if (schema instanceof z.ZodDefault) {
    return unwrap(schema._def.innerType);
  }
  if (schema instanceof z.ZodEffects) {
    return unwrap(schema.innerType());
  }
  return schema;
}

// System.Text.Json in ASP.NET binds property names case-insensitively; Zod does not.
// Rename incoming keys to the schema's spelling before parsing.
function remapKeys(value: unknown, schema: ZodTypeAny): unknown {
  const inner = unwrap(schema);
  if (inner instanceof z.ZodArray && Array.isArray(value)) {
    return value.map((item) => remapKeys(item, inner.element));
  }
  if (inner instanceof z.ZodObject && value && typeof value === "object" && !Array.isArray(value)) {
    const shape = inner.shape as Record<string, ZodTypeAny>;
    const canonical = new Map(Object.keys(shape).map((key) => [key.toLowerCase(), key]));
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      const target = canonical.get(key.toLowerCase()) ?? key;
      result[target] = target in shape ? remapKeys(item, shape[target]) : item;
    }
    return result;
  }
  return value;
}

function int32() {
  const message = "The JSON value could not be converted to System.Int32.";
  return z
    .number({ invalid_type_error: message })
    .int(message)
    .min(-2_147_483_648, message)
    .max(2_147_483_647, message);
}

// Field builders that reproduce ASP.NET data-annotation / System.Text.Json binding semantics.
export const essField = {
  // [Required] string (rejects null, missing and whitespace-only), optional [MaxLength(n)].
  requiredString(name: string, maxLength?: number) {
    const required = `The ${name} field is required.`;
    return z.string({ required_error: required, invalid_type_error: required }).superRefine((value, ctx) => {
      if (value.trim().length === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: required });
      } else if (maxLength !== undefined && value.length > maxLength) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `The field ${name} must be a string or array type with a maximum length of '${maxLength}'.`,
        });
      }
    });
  },

  // string? with an optional [MaxLength(n)].
  optionalString(name?: string, maxLength?: number) {
    const schema = z.string({ invalid_type_error: "The JSON value could not be converted to System.String." });
    if (name === undefined || maxLength === undefined) {
      return schema.nullish();
    }
    return schema
      .max(maxLength, `The field ${name} must be a string or array type with a maximum length of '${maxLength}'.`)
      .nullish();
  },

  // Non-nullable Guid: missing => Guid.Empty, unparseable => binding error.
  guid() {
    return z
      .string({ invalid_type_error: "The JSON value could not be converted to System.Guid." })
      .optional()
      .transform((value, ctx) => {
        if (value === undefined) return EMPTY_GUID;
        const guid = parseGuid(value);
        if (!guid) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: "The JSON value could not be converted to System.Guid." });
          return z.NEVER;
        }
        return guid;
      });
  },

  // Non-nullable int with the property initializer's default (JSON null is a binding error).
  int(defaultValue: number) {
    return int32().optional().transform((value) => value ?? defaultValue);
  },

  optionalInt() {
    return int32().nullish().transform((value) => value ?? null);
  },

  optionalBool() {
    return z
      .boolean({ invalid_type_error: "The JSON value could not be converted to System.Boolean." })
      .nullish()
      .transform((value) => value ?? null);
  },

  // Non-nullable bool with the property initializer's default.
  bool(defaultValue: boolean) {
    return z
      .boolean({ invalid_type_error: "The JSON value could not be converted to System.Boolean." })
      .optional()
      .transform((value) => value ?? defaultValue);
  },
};

export function parseEssBody<T extends ZodTypeAny>(schema: T, body: unknown): z.output<T> {
  if (body === undefined || body === null) {
    throw new EssValidationError({ "": ["A non-empty request body is required."] });
  }
  const result = schema.safeParse(remapKeys(body, schema));
  if (!result.success) {
    throw EssValidationError.fromZod(result.error);
  }
  return result.data;
}

// ---------------------------------------------------------------------------------------------
// ModelState: ASP.NET binds every action parameter (query, route and body) before the action
// runs and returns one ProblemDetails 400 listing all errors. Controllers collect them here.
// ---------------------------------------------------------------------------------------------

// [FromBody] with a Content-Type no input formatter accepts: ASP.NET answers 415.
export class EssUnsupportedMediaTypeError extends Error {
  constructor() {
    super("Unsupported Media Type");
    this.name = "EssUnsupportedMediaTypeError";
  }
}

export class EssModelState {
  readonly errors: Record<string, string[]> = {};

  add(key: string, message: string) {
    (this.errors[key] ??= []).push(message);
  }

  // Runs one essRequest binder (queryGuid, queryInt, ...) and records its error instead of throwing.
  bind<T>(binder: () => T): T | undefined {
    try {
      return binder();
    } catch (error) {
      if (error instanceof EssValidationError) {
        for (const [key, messages] of Object.entries(error.errors)) {
          for (const message of messages) {
            this.add(key, message);
          }
        }
        return undefined;
      }
      throw error;
    }
  }

  get isValid() {
    return Object.keys(this.errors).length === 0;
  }

  throwIfInvalid() {
    if (!this.isValid) {
      throw new EssValidationError(this.errors);
    }
  }
}

// ---------------------------------------------------------------------------------------------
// [FromBody] binding the way ASP.NET does it with System.Text.Json (JsonSerializerDefaults.Web):
// case-insensitive property names, numbers accepted as strings, unknown properties ignored,
// the first conversion error reported with its JSON path and position, then DataAnnotations
// validation where every non-nullable reference property is implicitly [Required]
// (ESS_Backend has <Nullable>enable</Nullable>).
// ---------------------------------------------------------------------------------------------

export type EssBodyField =
  | { type: "string" } // non-nullable string: implicit [Required]
  | { type: "string?" }
  | { type: "guid" }
  | { type: "int" }
  | { type: "bool" }
  | { type: "guid[]" } // List<Guid>: implicit [Required]
  | { type: "string[]" } // List<string>: implicit [Required]
  | { type: "object"; spec: EssBodySpec }; // non-nullable class: implicit [Required]

export type EssBodySpec = {
  clrType: string; // full .NET type name, used in conversion error messages
  create: () => Record<string, unknown>; // the C# constructor and property initializers
  fields: Record<string, EssBodyField>; // C# property name -> type, in declaration order
};

type JsonPos = { line: number; byte: number };

type JsonNode =
  | { kind: "object"; members: [string, JsonNode][]; start: JsonPos }
  | { kind: "array"; items: JsonNode[]; start: JsonPos }
  | { kind: "string"; value: string; end: JsonPos }
  | { kind: "number"; raw: string; end: JsonPos }
  | { kind: "true" | "false" | "null"; end: JsonPos };

class JsonReadError extends Error {
  constructor(
    readonly path: string,
    message: string,
  ) {
    super(message);
  }
}

function jsonExceptionMessage(message: string, path: string, pos: JsonPos) {
  return `${message} Path: ${path} | LineNumber: ${pos.line} | BytePositionInLine: ${pos.byte}.`;
}

// Utf8JsonReader equivalent: tracks LineNumber / BytePositionInLine (UTF-8 bytes) for messages.
class JsonScanner {
  private index = 0;
  private line = 0;
  private byte = 0;

  constructor(private readonly text: string) {}

  parseDocument(): JsonNode {
    this.skipWhitespace();
    const root = this.parseValue("$");
    this.skipWhitespace();
    if (this.index < this.text.length) {
      this.fail("$", `'${this.peek()}' is invalid after a single JSON value. Expected end of data.`);
    }
    return root;
  }

  private pos(): JsonPos {
    return { line: this.line, byte: this.byte };
  }

  private peek() {
    return this.text[this.index];
  }

  private advance() {
    const code = this.text.charCodeAt(this.index);
    if (code === 0x0a) {
      this.line++;
      this.byte = 0;
    } else if (code < 0x80) {
      this.byte += 1;
    } else if (code < 0x800) {
      this.byte += 2;
    } else if (code >= 0xd800 && code <= 0xdbff) {
      this.byte += 4;
    } else if (code < 0xdc00 || code > 0xdfff) {
      this.byte += 3;
    }
    this.index++;
  }

  private skipWhitespace() {
    while (this.index < this.text.length && " \t\r\n".includes(this.text[this.index])) {
      this.advance();
    }
  }

  private fail(path: string, message: string): never {
    throw new JsonReadError(path, jsonExceptionMessage(message, path, this.pos()));
  }

  private failEndOfData(path: string): never {
    this.fail(
      path,
      "Expected depth to be zero at the end of the JSON payload. There is an open JSON object or array that should be closed.",
    );
  }

  private parseValue(path: string): JsonNode {
    if (this.index >= this.text.length) {
      this.failEndOfData(path);
    }
    const ch = this.peek();
    if (ch === "{") return this.parseObject(path);
    if (ch === "[") return this.parseArray(path);
    if (ch === '"') {
      const value = this.parseString(path);
      return { kind: "string", value, end: this.pos() };
    }
    if (ch === "-" || (ch >= "0" && ch <= "9")) return this.parseNumber(path);
    for (const literal of ["true", "false", "null"] as const) {
      if (ch === literal[0]) {
        if (!this.text.startsWith(literal, this.index)) {
          this.fail(path, `'${ch}' is an invalid JSON literal. Expected the literal '${literal}'.`);
        }
        for (let i = 0; i < literal.length; i++) this.advance();
        return { kind: literal, end: this.pos() };
      }
    }
    return this.fail(path, `'${ch}' is an invalid start of a value.`);
  }

  private parseObject(path: string): JsonNode {
    this.advance();
    const node: Extract<JsonNode, { kind: "object" }> = { kind: "object", members: [], start: this.pos() };
    this.skipWhitespace();
    if (this.peek() === "}") {
      this.advance();
      return node;
    }
    for (;;) {
      if (this.index >= this.text.length) this.failEndOfData(path);
      if (this.peek() !== '"') {
        this.fail(path, `'${this.peek()}' is an invalid start of a property name. Expected a '"'.`);
      }
      const name = this.parseString(path);
      const memberPath = `${path}.${name}`;
      this.skipWhitespace();
      if (this.index >= this.text.length) this.failEndOfData(memberPath);
      if (this.peek() !== ":") {
        this.fail(memberPath, `'${this.peek()}' is invalid after a property name. Expected a ':'.`);
      }
      this.advance();
      this.skipWhitespace();
      node.members.push([name, this.parseValue(memberPath)]);
      this.skipWhitespace();
      if (this.index >= this.text.length) this.failEndOfData(memberPath);
      const next = this.peek();
      if (next === "}") {
        this.advance();
        return node;
      }
      if (next !== ",") {
        this.fail(memberPath, `'${next}' is invalid after a value. Expected either ',', '}', or ']'.`);
      }
      this.advance();
      this.skipWhitespace();
      if (this.peek() === "}") {
        this.fail(
          memberPath,
          "The JSON object contains a trailing comma at the end which is not supported in this mode. Change the reader options.",
        );
      }
    }
  }

  private parseArray(path: string): JsonNode {
    this.advance();
    const node: Extract<JsonNode, { kind: "array" }> = { kind: "array", items: [], start: this.pos() };
    this.skipWhitespace();
    if (this.peek() === "]") {
      this.advance();
      return node;
    }
    for (;;) {
      const itemPath = `${path}[${node.items.length}]`;
      node.items.push(this.parseValue(itemPath));
      this.skipWhitespace();
      if (this.index >= this.text.length) this.failEndOfData(itemPath);
      const next = this.peek();
      if (next === "]") {
        this.advance();
        return node;
      }
      if (next !== ",") {
        this.fail(itemPath, `'${next}' is invalid after a value. Expected either ',', '}', or ']'.`);
      }
      this.advance();
      this.skipWhitespace();
      if (this.peek() === "]") {
        this.fail(
          itemPath,
          "The JSON array contains a trailing comma at the end which is not supported in this mode. Change the reader options.",
        );
      }
    }
  }

  private parseString(path: string): string {
    this.advance(); // opening quote
    let value = "";
    for (;;) {
      if (this.index >= this.text.length) {
        this.fail(path, "Expected end of string, but instead reached end of data.");
      }
      const ch = this.peek();
      if (ch === '"') {
        this.advance();
        return value;
      }
      const code = ch.charCodeAt(0);
      if (code < 0x20) {
        this.fail(
          path,
          `'0x${code.toString(16).toUpperCase().padStart(2, "0")}' is invalid within a JSON string. The string should be correctly escaped.`,
        );
      }
      if (ch === "\\") {
        this.advance();
        const escape = this.peek() ?? "";
        const simple: Record<string, string> = { '"': '"', "\\": "\\", "/": "/", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t" };
        if (escape in simple) {
          value += simple[escape];
          this.advance();
          continue;
        }
        const hex = this.text.slice(this.index + 1, this.index + 5);
        if (escape === "u" && /^[0-9a-fA-F]{4}$/.test(hex)) {
          value += String.fromCharCode(parseInt(hex, 16));
          for (let i = 0; i < 5; i++) this.advance();
          continue;
        }
        this.fail(
          path,
          `'${escape}' is not a valid escapable character within a JSON string. The string should be correctly escaped.`,
        );
      }
      value += ch;
      this.advance();
    }
  }

  private parseNumber(path: string): JsonNode {
    const match = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/.exec(this.text.slice(this.index));
    if (!match) {
      this.advance();
      return this.fail(
        path,
        `'${this.peek() ?? ""}' is invalid within a number, immediately after a sign character ('-' or '+'). Expected a digit ('0'-'9').`,
      );
    }
    for (let i = 0; i < match[0].length; i++) this.advance();
    return { kind: "number", raw: match[0], end: this.pos() };
  }
}

const CLR_LIST_TYPES = {
  "guid[]": "System.Collections.Generic.List`1[System.Guid]",
  "string[]": "System.Collections.Generic.List`1[System.String]",
};

function nodePos(node: JsonNode): JsonPos {
  return "end" in node ? node.end : node.start;
}

function conversionError(node: JsonNode, clrType: string, path: string): never {
  throw new JsonReadError(path, jsonExceptionMessage(`The JSON value could not be converted to ${clrType}.`, path, nodePos(node)));
}

// System.Text.Json reads Guid only in the 36-character "D" format.
const STJ_GUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

function convertInt(node: JsonNode, path: string): number {
  const raw = node.kind === "number" ? node.raw : node.kind === "string" ? node.value : null;
  const valid = raw !== null && (node.kind === "number" ? /^-?\d+$/ : /^[+-]?\d+$/).test(raw);
  const value = valid ? Number(raw) : NaN;
  if (!valid || value > 2_147_483_647 || value < -2_147_483_648) {
    conversionError(node, "System.Int32", path);
  }
  return value === 0 ? 0 : value;
}

function convertGuid(node: JsonNode, path: string): string {
  if (node.kind !== "string" || !STJ_GUID.test(node.value)) {
    return conversionError(node, "System.Guid", path);
  }
  return node.value.toLowerCase();
}

function convertField(node: JsonNode, field: EssBodyField, path: string): unknown {
  switch (field.type) {
    case "string":
    case "string?":
      if (node.kind === "null") return null;
      if (node.kind !== "string") return conversionError(node, "System.String", path);
      return node.value;
    case "guid":
      return convertGuid(node, path);
    case "int":
      return convertInt(node, path);
    case "bool":
      if (node.kind === "true") return true;
      if (node.kind === "false") return false;
      return conversionError(node, "System.Boolean", path);
    case "guid[]":
    case "string[]": {
      if (node.kind === "null") return null;
      if (node.kind !== "array") return conversionError(node, CLR_LIST_TYPES[field.type], path);
      return node.items.map((item, index) => {
        const itemPath = `${path}[${index}]`;
        if (field.type === "guid[]") return convertGuid(item, itemPath);
        if (item.kind === "null") return null;
        if (item.kind !== "string") return conversionError(item, "System.String", itemPath);
        return item.value;
      });
    }
    case "object":
      if (node.kind === "null") return null;
      if (node.kind !== "object") return conversionError(node, field.spec.clrType, path);
      return bindObject(node, field.spec, path);
  }
}

function bindObject(node: Extract<JsonNode, { kind: "object" }>, spec: EssBodySpec, path: string) {
  const target = spec.create();
  const fieldNames = Object.keys(spec.fields);
  for (const [name, value] of node.members) {
    const fieldName = fieldNames.find((candidate) => candidate.toLowerCase() === name.toLowerCase());
    if (fieldName !== undefined) {
      target[fieldName] = convertField(value, spec.fields[fieldName], `${path}.${name}`);
    }
  }
  return target;
}

function validateRequired(target: Record<string, unknown>, spec: EssBodySpec, prefix: string, ms: EssModelState) {
  for (const [name, field] of Object.entries(spec.fields)) {
    const value = target[name];
    const key = `${prefix}${name}`;
    const required = `The ${name} field is required.`;
    if (field.type === "string") {
      if (value === null || value === undefined || isNullOrWhiteSpace(String(value))) ms.add(key, required);
    } else if (field.type === "guid[]" || field.type === "string[]") {
      if (value === null || value === undefined) ms.add(key, required);
    } else if (field.type === "object") {
      if (value === null || value === undefined) ms.add(key, required);
      else validateRequired(value as Record<string, unknown>, field.spec, `${key}.`, ms);
    }
  }
}

// Media types the ASP.NET System.Text.Json input formatter accepts.
export function isEssJsonContentType(contentType: string | undefined) {
  const mediaType = (contentType ?? "").split(";")[0].trim().toLowerCase();
  return mediaType === "application/json" || mediaType === "text/json" || /^application\/[^/]+\+json$/.test(mediaType);
}

// Binds a [FromBody] parameter from the raw request text. Returns null (errors recorded in `ms`)
// when binding fails, like the null model ASP.NET has before ModelStateInvalidFilter answers 400.
export function bindEssJsonBody<T>(
  contentType: string | undefined,
  rawBody: string | undefined,
  ms: EssModelState,
  parameterName: string,
  spec: EssBodySpec,
): T | null {
  if (!isEssJsonContentType(contentType)) {
    throw new EssUnsupportedMediaTypeError();
  }
  const parameterRequired = () => ms.add(parameterName, `The ${parameterName} field is required.`);
  if (rawBody === undefined || rawBody.length === 0) {
    ms.add("", "A non-empty request body is required.");
    parameterRequired();
    return null;
  }

  try {
    const root = new JsonScanner(rawBody).parseDocument();
    if (root.kind === "null") {
      parameterRequired();
      return null;
    }
    if (root.kind !== "object") {
      return conversionError(root, spec.clrType, "$");
    }
    const model = bindObject(root, spec, "$");
    validateRequired(model, spec, "", ms);
    return model as T;
  } catch (error) {
    if (error instanceof JsonReadError) {
      ms.add(error.path, error.message);
      parameterRequired();
      return null;
    }
    throw error;
  }
}
