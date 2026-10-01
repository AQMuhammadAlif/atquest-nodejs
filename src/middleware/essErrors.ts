import { randomUUID } from "node:crypto";
import { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { HttpError } from "../utils/errors.js";
import { essFail } from "../utils/essResponse.js";
import { EssValidationError } from "../utils/essValidation.js";

// Error handler for the /v1 routers. Reproduces ESS_Backend's responses:
// - HttpError        -> ApiResponse.Fail(message) with that status
// - validation error -> ASP.NET ProblemDetails 400
// - anything else    -> GlobalExceptionMiddleware 500 body
export const essErrorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    essFail(res, err.status, err.message);
    return;
  }

  if (err instanceof EssValidationError || err instanceof ZodError) {
    const errors = err instanceof ZodError ? EssValidationError.fromZod(err).errors : err.errors;
    res.status(400).json({
      type: "https://tools.ietf.org/html/rfc9110#section-15.5.1",
      title: "One or more validation errors occurred.",
      status: 400,
      errors,
      traceId: randomUUID(),
    });
    return;
  }

  console.error(err);
  const includeDetails = process.env.NODE_ENV !== "production";
  const error = err instanceof Error ? err : new Error(String(err));
  res.status(500).json({
    status: "error",
    message: includeDetails ? error.message : "An unexpected error occurred.",
    data: null,
    traceId: randomUUID(),
    error: includeDetails ? { type: error.name, detail: error.stack ?? error.message } : null,
  });
};
