import express, { NextFunction, Request, Response } from "express";
import { isEssJsonContentType } from "../utils/essValidation.js";

declare global {
  namespace Express {
    interface Request {
      essRawBody?: string;
    }
  }
}

// Kestrel's default MaxRequestBodySize.
const KESTREL_MAX_REQUEST_BODY_SIZE = 30_000_000;

const readText = express.text({
  type: (req) => isEssJsonContentType(req.headers["content-type"]),
  limit: KESTREL_MAX_REQUEST_BODY_SIZE,
});

// Keeps the raw JSON text of /v1 requests so bindEssJsonBody can reproduce System.Text.Json's
// behavior (and its error positions). req.body is still the parsed object for parseEssBody.
// Mounted before express.json(), which then skips the already-read body.
export function essJsonBody(req: Request, res: Response, next: NextFunction) {
  readText(req, res, (error?: unknown) => {
    if (error) {
      const status = (error as { status?: number }).status;
      if (status === 413) {
        res.status(413).end();
        return;
      }
      next(error);
      return;
    }
    if (typeof req.body === "string") {
      req.essRawBody = req.body;
      try {
        req.body = req.body.trim() ? JSON.parse(req.body) : undefined;
      } catch {
        req.body = undefined;
      }
    }
    next();
  });
}
