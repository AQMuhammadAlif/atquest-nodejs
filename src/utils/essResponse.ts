import { RequestHandler, Response, Router } from "express";

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

// Endpoint routing when the path matches but the HTTP method does not: an empty 405 with Allow.
// (ASP.NET does not serve HEAD from an [HttpGet] action, so HEAD lands here too.)
export function essMethodNotAllowed(...allowed: string[]): RequestHandler {
  return (_req, res) => {
    // Not an action, so no ReportApiVersions header.
    res.removeHeader("api-supported-versions");
    res.status(405).set("Allow", allowed.join(", ")).end();
  };
}

type EssVerb = "GET" | "POST" | "PUT" | "DELETE";

// Registers one ASP.NET route template with its actions (verb -> handler chain) and answers any
// other method on that path with the empty 405 endpoint routing produces.
export function essEndpoint(router: Router, path: string, actions: Partial<Record<EssVerb, RequestHandler[]>>) {
  const route = router.route(path);
  const verbs = Object.keys(actions) as EssVerb[];
  const notAllowed = essMethodNotAllowed(...verbs);
  // Express would serve HEAD from the GET handler; ASP.NET's [HttpGet] does not match HEAD.
  route.head(notAllowed);
  for (const verb of verbs) {
    const handlers = actions[verb] ?? [];
    if (verb === "GET") route.get(...handlers);
    if (verb === "POST") route.post(...handlers);
    if (verb === "PUT") route.put(...handlers);
    if (verb === "DELETE") route.delete(...handlers);
  }
  route.all(notAllowed);
}

// Asp.Versioning ReportApiVersions: executed actions report the supported versions.
// essErrorHandler removes it again for responses ASP.NET produces before the action runs.
export const API_SUPPORTED_VERSIONS_HEADER = "api-supported-versions";

export const essReportApiVersions: RequestHandler = (_req, res, next) => {
  res.setHeader(API_SUPPORTED_VERSIONS_HEADER, "1.0");
  next();
};
