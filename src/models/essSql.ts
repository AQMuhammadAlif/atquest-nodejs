import { formatNetDateTimeDefault, NetException, netErrors } from "../utils/essDotnet.js";
import { toEssGuid } from "../utils/essFormat.js";

// Shared helpers for code migrated from ESS_Backend that runs SQL through Prisma ($queryRaw /
// $executeRaw / model API): SQL Server errors surfaced the way SqlClient reports them, and rows
// read the way EF Core materializes them or an ADO.NET IDataRecord returns them.
//
// Dates follow the wall-clock convention of utils/essDotnet.ts: Prisma reads a `datetime` value as
// a Date whose UTC fields hold the stored wall-clock, and writes it back the same way.

type PrismaLikeError = { name?: string; code?: string; message?: string; meta?: { message?: unknown } };

// SqlException.Message is SQL Server's own text; Prisma wraps it ("Raw query failed. Code: ...").
export function translateSqlError(error: unknown): unknown {
  const candidate = error as PrismaLikeError | null;
  if (!candidate || typeof candidate.name !== "string" || !candidate.name.startsWith("PrismaClient")) {
    return error;
  }
  const message = typeof candidate.meta?.message === "string" ? candidate.meta.message : (candidate.message ?? "");
  return new NetException("Microsoft.Data.SqlClient.SqlException", message);
}

// Runs one Prisma database call, surfacing SQL Server errors as SqlException.
export async function runSql<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    throw translateSqlError(error);
  }
}

// ---------------------------------------------------------------------------------------------
// Reading rows the way EF Core materializes them (nullable reference types enabled): a NULL in a
// column mapped to a non-nullable property throws "Data is Null", and SqlQuery requires every
// mapped column to be present. Column lookup is case-insensitive like SqlDataReader.GetOrdinal.
// ---------------------------------------------------------------------------------------------

export type SqlRow = Record<string, unknown>;

function columnKey(row: SqlRow, name: string): string | undefined {
  if (name in row) {
    return name;
  }
  return Object.keys(row).find((candidate) => candidate.toLowerCase() === name.toLowerCase());
}

function value(row: SqlRow, name: string): unknown {
  const key = columnKey(row, name);
  if (key === undefined) {
    throw netErrors.invalidOperation(`The required column '${name}' was not present in the results of a 'FromSql' operation.`);
  }
  return row[key];
}

function required<T>(row: SqlRow, name: string, convert: (raw: unknown) => T): T {
  const raw = value(row, name);
  if (raw === null || raw === undefined) {
    throw netErrors.sqlNullValue();
  }
  return convert(raw);
}

function optional<T>(row: SqlRow, name: string, convert: (raw: unknown) => T): T | null {
  const raw = value(row, name);
  return raw === null || raw === undefined ? null : convert(raw);
}

const asGuid = (raw: unknown) => toEssGuid(String(raw)) as string;
const asString = (raw: unknown) => String(raw);
const asInt = (raw: unknown) => Number(raw);
const asBool = (raw: unknown) => Boolean(raw);
const asDate = (raw: unknown) => (raw instanceof Date ? raw : new Date(String(raw)));
const asBytes = (raw: unknown) => Buffer.from(raw as Uint8Array);

export const read = {
  guid: (row: SqlRow, name: string) => required(row, name, asGuid),
  guidOrNull: (row: SqlRow, name: string) => optional(row, name, asGuid),
  string: (row: SqlRow, name: string) => required(row, name, asString),
  stringOrNull: (row: SqlRow, name: string) => optional(row, name, asString),
  int: (row: SqlRow, name: string) => required(row, name, asInt),
  intOrNull: (row: SqlRow, name: string) => optional(row, name, asInt),
  bool: (row: SqlRow, name: string) => required(row, name, asBool),
  boolOrNull: (row: SqlRow, name: string) => optional(row, name, asBool),
  date: (row: SqlRow, name: string) => required(row, name, asDate),
  dateOrNull: (row: SqlRow, name: string) => optional(row, name, asDate),
  bytesOrNull: (row: SqlRow, name: string) => optional(row, name, asBytes),
};

// ---------------------------------------------------------------------------------------------
// ADO.NET reader access used by the SqlCommand-based services:
// record.IsDBNull(ordinal) ? "" : record.GetValue(ordinal)?.ToString()
// GetOrdinal throws IndexOutOfRangeException (message = column name) for a missing column.
// ---------------------------------------------------------------------------------------------

// object.ToString() of the CLR value SqlDataReader.GetValue returns, on the en-MY host culture.
// Prisma returns uniqueidentifier as a string, bit as boolean, bigint as BigInt, decimal as Decimal.
function netValueToString(raw: unknown): string {
  if (raw instanceof Date) {
    return formatNetDateTimeDefault(raw);
  }
  if (typeof raw === "boolean") {
    return raw ? "True" : "False";
  }
  return String(raw);
}

export function getNetString(row: SqlRow, name: string): string {
  const key = columnKey(row, name);
  if (key === undefined) {
    throw netErrors.indexOutOfRange(name);
  }
  const raw = row[key];
  return raw === null || raw === undefined ? "" : netValueToString(raw);
}

// Same, but an absent column reads as "" (ReRoutingService.GetStringSafe).
export function getNetStringSafe(row: SqlRow, name: string): string {
  const key = columnKey(row, name);
  if (key === undefined) {
    return "";
  }
  const raw = row[key];
  return raw === null || raw === undefined ? "" : netValueToString(raw);
}
