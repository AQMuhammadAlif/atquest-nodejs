import { NextFunction, Request, Response } from "express";
import { HttpError } from "./errors.js";
import { EssValidationError } from "./essValidation.js";

// Helpers that reproduce ASP.NET Core model binding for the /v1 endpoints migrated
// from ESS_Backend: case-insensitive query keys, empty string => null, first value wins,
// and a ProblemDetails 400 for values that cannot be converted.

const GUID_PATTERNS = [
  /^([0-9a-f]{8})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{12})$/i,
  /^\{([0-9a-f]{8})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{12})\}$/i,
  /^\(([0-9a-f]{8})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{12})\)$/i,
  /^([0-9a-f]{8})([0-9a-f]{4})([0-9a-f]{4})([0-9a-f]{4})([0-9a-f]{12})$/i,
];

export const EMPTY_GUID = "00000000-0000-0000-0000-000000000000";

// Returns the GUID in .NET's default "D" format (lowercase), or null if it is not a GUID.
export function parseGuid(value: string): string | null {
  const trimmed = value.trim();
  for (const pattern of GUID_PATTERNS) {
    const match = pattern.exec(trimmed);
    if (match) {
      return match.slice(1).join("-").toLowerCase();
    }
  }
  return null;
}

function pascal(name: string) {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function invalid(name: string, raw: string): never {
  throw new EssValidationError({ [pascal(name)]: [`The value '${raw}' is not valid for ${pascal(name)}.`] });
}

export function queryString(req: Request, name: string): string | undefined {
  const wanted = name.toLowerCase();
  const key = Object.keys(req.query).find((candidate) => candidate.toLowerCase() === wanted);
  if (key === undefined) {
    return undefined;
  }
  const raw = req.query[key];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === "string" && value !== "" ? value : undefined;
}

export function queryInt(req: Request, name: string): number | undefined {
  const raw = queryString(req, name);
  if (raw === undefined) {
    return undefined;
  }
  if (!/^\s*[+-]?\d+\s*$/.test(raw)) {
    invalid(name, raw);
  }
  const value = Number(raw);
  if (value > 2_147_483_647 || value < -2_147_483_648) {
    invalid(name, raw);
  }
  return value;
}

export function queryGuid(req: Request, name: string): string | undefined {
  const raw = queryString(req, name);
  if (raw === undefined) {
    return undefined;
  }
  return parseGuid(raw) ?? invalid(name, raw);
}

export function queryBool(req: Request, name: string): boolean | undefined {
  const raw = queryString(req, name);
  if (raw === undefined) {
    return undefined;
  }
  const normalized = raw.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  return invalid(name, raw);
}

// Route-constraint equivalent of `{name:guid}`: a non-GUID segment does not match the route.
export function guidParam(name: string) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const value = req.params[name];
    const guid = typeof value === "string" ? parseGuid(value) : null;
    if (!guid) {
      next("route");
      return;
    }
    req.params[name] = guid;
    next();
  };
}

export type PagingInput = {
  page?: number;
  pageSize?: number;
  legacyPage?: number;
  legacyPageSize?: number;
};

export type PagingDefaults = {
  defaultPage: number;
  defaultPageSize: number;
  maxPageSize: number;
};

// appsettings.json "Pagination" section of ESS_Backend.
export const ESS_PAGINATION: PagingDefaults = {
  defaultPage: Number(process.env.ESS_PAGINATION_DEFAULT_PAGE ?? 1),
  defaultPageSize: Number(process.env.ESS_PAGINATION_DEFAULT_PAGE_SIZE ?? 10),
  maxPageSize: Number(process.env.ESS_PAGINATION_MAX_PAGE_SIZE ?? 100),
};

// Approval/Notification maintenance controllers clamp at 500 instead of Pagination:MaxPageSize.
export const MAINTENANCE_MAX_PAGE_SIZE = 500;

export function resolvePaging(input: PagingInput, maxPageSize = ESS_PAGINATION.maxPageSize) {
  const page = input.page ?? input.legacyPage ?? ESS_PAGINATION.defaultPage;
  let pageSize = input.pageSize ?? input.legacyPageSize ?? ESS_PAGINATION.defaultPageSize;

  if (page < 1) {
    throw new HttpError(400, "Page must be >= 1.");
  }
  if (pageSize < 1) {
    throw new HttpError(400, "PageSize must be >= 1.");
  }
  if (pageSize > maxPageSize) {
    pageSize = maxPageSize;
  }
  return { page, pageSize };
}

// Approximates DateTime.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.None):
// ISO 8601 (yyyy-MM-dd[THH:mm[:ss[.fffffff]]][Z|±hh:mm]) or invariant M/d/yyyy [h:mm[:ss]] [AM|PM].
// Returns the wall-clock value as a Date whose UTC fields hold it (how Prisma binds DATETIME),
// or null when unparseable. Values with an offset are converted to server-local time, like .NET.
export function parseDotNetDateTime(value: string): Date | null {
  const text = value.trim();
  const iso =
    /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,7}))?)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/i.exec(text);
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?$/i.exec(text);

  let parts: { y: number; mo: number; d: number; h: number; mi: number; s: number; ms: number } | null = null;
  let offset: string | undefined;

  if (iso) {
    const [, y, mo, d, h = "0", mi = "0", s = "0", frac = "0", tz] = iso;
    parts = { y: +y, mo: +mo, d: +d, h: +h, mi: +mi, s: +s, ms: Math.floor(Number(`0.${frac}`) * 1000) };
    offset = tz;
  } else if (us) {
    const [, mo, d, y, h = "0", mi = "0", s = "0", meridiem] = us;
    let hour = +h;
    if (meridiem) {
      if (hour < 1 || hour > 12) return null;
      hour = (hour % 12) + (meridiem.toUpperCase() === "PM" ? 12 : 0);
    }
    parts = { y: +y, mo: +mo, d: +d, h: hour, mi: +mi, s: +s, ms: 0 };
  }
  if (!parts) return null;

  const { y, mo, d, h, mi, s, ms } = parts;
  const wall = new Date(Date.UTC(y, mo - 1, d, h, mi, s, ms));
  const valid =
    wall.getUTCFullYear() === y &&
    wall.getUTCMonth() === mo - 1 &&
    wall.getUTCDate() === d &&
    h < 24 &&
    mi < 60 &&
    s < 60;
  if (!valid) return null;

  if (!offset) return wall;

  const offsetMinutes =
    offset.toUpperCase() === "Z"
      ? 0
      : (offset[0] === "-" ? -1 : 1) * (Number(offset.slice(1, 3)) * 60 + Number(offset.slice(-2)));
  const instant = new Date(wall.getTime() - offsetMinutes * 60_000);
  return new Date(
    Date.UTC(
      instant.getFullYear(),
      instant.getMonth(),
      instant.getDate(),
      instant.getHours(),
      instant.getMinutes(),
      instant.getSeconds(),
      instant.getMilliseconds(),
    ),
  );
}
