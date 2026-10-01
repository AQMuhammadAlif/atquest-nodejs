import { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { HttpError } from "../utils/errors.js";
import { fail } from "../utils/response.js";

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    fail(res, err.status, err.message);
    return;
  }

  if (err instanceof ZodError) {
    const message = err.issues.map((issue) => issue.message).join(", ");
    fail(res, 400, message);
    return;
  }

  console.error(err);
  fail(res, 500, "Internal server error");
};
