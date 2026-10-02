// Serialization helpers so values look the way System.Text.Json writes them in ESS_Backend.

// .NET DateTime read from SQL Server has Kind=Unspecified: ISO-8601 without an offset, and
// fractional seconds only when non-zero (trailing zeros trimmed).
export function toEssDate(value: Date | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const iso = value.toISOString(); // YYYY-MM-DDTHH:mm:ss.sssZ (Prisma reads SQL datetimes as UTC)
  const [seconds, fraction] = iso.slice(0, 23).split(".");
  const trimmed = fraction.replace(/0+$/, "");
  return trimmed ? `${seconds}.${trimmed}` : seconds;
}

// JsonNamingPolicy.CamelCase: lower-cases the leading run of capitals, keeping the last one
// when a lower-case letter follows (ID -> id, RoutingRuleID -> routingRuleID, IMOfIMStaffID -> imOfIMStaffID).
export function toCamelCase(name: string): string {
  const chars = [...name];
  for (let i = 0; i < chars.length; i++) {
    if (i === 1 && !isUpper(chars[i])) {
      break;
    }
    const hasNext = i + 1 < chars.length;
    if (i > 0 && hasNext && !isUpper(chars[i + 1])) {
      if (chars[i + 1] === " ") {
        chars[i] = chars[i].toLowerCase();
      }
      break;
    }
    chars[i] = chars[i].toLowerCase();
  }
  return chars.join("");
}

function isUpper(ch: string) {
  return ch !== ch.toLowerCase() && ch === ch.toUpperCase();
}

// Serializes values that use C# property names the way ASP.NET's System.Text.Json does:
// camelCase keys in declaration order, nulls kept, DateTime via toEssDate.
export function toEssJson(value: unknown): unknown {
  if (value instanceof Date) {
    return toEssDate(value);
  }
  if (Array.isArray(value)) {
    return value.map(toEssJson);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [toCamelCase(key), toEssJson(item)]));
  }
  return value === undefined ? null : value;
}

// .NET serializes Guid lowercase; SQL Server/tedious returns uniqueidentifier uppercase.
export function toEssGuid(value: string | null | undefined): string | null {
  return value ? value.toLowerCase() : null;
}

// DateTime.ToUniversalTime().ToString("o") on a value read from SQL Server (Kind treated as UTC):
// always 7 fractional digits and a trailing Z, e.g. 2026-07-28T12:15:00.1230000Z.
export function toEssRoundTripUtc(value: Date): string {
  return `${value.toISOString().slice(0, 23)}0000Z`;
}
