import { Response } from "express";

// Response contract of ESS_Backend (ApiResponse<T> / PagedResult<T>), used only by
// the endpoints migrated from it under /v1. Everything else uses utils/response.ts.

export type PagedResult<T> = {
  items: T[];
  page: number;
  pageSize: number;
  totalCount: number;
};

function send(res: Response, httpStatus: number, status: "success" | "error", message: string, data: unknown) {
  res.status(httpStatus).json({ status, message, data: data ?? null });
}

export function essOk(res: Response, data: unknown, message: string) {
  send(res, 200, "success", message, data);
}

// ASP.NET CreatedAtAction / StatusCode(201): `location` mirrors the Location header when ESS sets one.
export function essCreated(res: Response, data: unknown, message: string, location?: string) {
  if (location) {
    res.location(location);
  }
  send(res, 201, "success", message, data);
}

export function essFail(res: Response, httpStatus: number, message: string) {
  send(res, httpStatus, "error", message, null);
}
