import { z, ZodError, ZodTypeAny } from "zod";

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

export function parseEssBody<T extends ZodTypeAny>(schema: T, body: unknown): z.output<T> {
  const result = schema.safeParse(remapKeys(body, schema));
  if (!result.success) {
    throw EssValidationError.fromZod(result.error);
  }
  return result.data;
}
