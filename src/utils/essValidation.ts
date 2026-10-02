import { z, ZodError, ZodTypeAny } from "zod";
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

  optionalString() {
    return z.string({ invalid_type_error: "The JSON value could not be converted to System.String." }).nullish();
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
