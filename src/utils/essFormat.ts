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

// .NET serializes Guid lowercase; SQL Server/tedious returns uniqueidentifier uppercase.
export function toEssGuid(value: string | null | undefined): string | null {
  return value ? value.toLowerCase() : null;
}

// DateTime.ToUniversalTime().ToString("o") on a value read from SQL Server (Kind treated as UTC):
// always 7 fractional digits and a trailing Z, e.g. 2026-07-28T12:15:00.1230000Z.
export function toEssRoundTripUtc(value: Date): string {
  return `${value.toISOString().slice(0, 23)}0000Z`;
}
