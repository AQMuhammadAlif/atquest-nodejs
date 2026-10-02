import { randomBytes, randomUUID } from "node:crypto";
import { ErrorRequestHandler, Response } from "express";
import { ZodError } from "zod";
import { HttpError } from "../utils/errors.js";
import { API_SUPPORTED_VERSIONS_HEADER, essFail } from "../utils/essResponse.js";
import { EssUnsupportedMediaTypeError, EssValidationError } from "../utils/essValidation.js";

// ProblemDetails.traceId is Activity.Current.Id: a W3C traceparent ("00-<trace>-<span>-00").
function activityTraceId() {
  return `00-${randomBytes(16).toString("hex")}-${randomBytes(8).toString("hex")}-00`;
}

// Model-binding failures are answered by filters that run before ReportApiVersions.
function sendProblem(res: Response, status: number, body: Record<string, unknown>) {
  res.removeHeader(API_SUPPORTED_VERSIONS_HEADER);
  res.status(status).type("application/problem+json").json({ ...body, traceId: activityTraceId() });
}

// Error handler for the /v1 routers. Reproduces ESS_Backend's responses:
// - HttpError        -> ApiResponse.Fail(message) with that status
// - validation error -> ASP.NET ProblemDetails 400
// - unsupported body -> ASP.NET ProblemDetails 415
// - anything else    -> GlobalExceptionMiddleware 500 body
export const essErrorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    essFail(res, err.status, err.message);
    return;
  }

  if (err instanceof EssValidationError || err instanceof ZodError) {
    const errors = err instanceof ZodError ? EssValidationError.fromZod(err).errors : err.errors;
    sendProblem(res, 400, {
      type: "https://tools.ietf.org/html/rfc9110#section-15.5.1",
      title: "One or more validation errors occurred.",
      status: 400,
      errors,
    });
    return;
  }

  if (err instanceof EssUnsupportedMediaTypeError) {
    sendProblem(res, 415, {
      type: "https://tools.ietf.org/html/rfc9110#section-15.5.16",
      title: "Unsupported Media Type",
      status: 415,
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
