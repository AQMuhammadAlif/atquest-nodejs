// .NET runtime behavior that code migrated from ESS_Backend depends on: exception types and
// their exact messages, Guid parsing, string/culture semantics, local wall-clock DateTime and
// the XmlSerializer format. Ported code uses these so it behaves the way the C# did.

export class NetException extends Error {
  // `name` carries the .NET type's full name; GlobalExceptionMiddleware exposes it as error.type.
  constructor(typeFullName: string, message: string) {
    super(message);
    this.name = typeFullName;
  }
}

export const netErrors = {
  format: (message: string) => new NetException("System.FormatException", message),
  argument: (message: string) => new NetException("System.ArgumentException", message),
  argumentNull: (parameter: string) =>
    new NetException("System.ArgumentNullException", `Value cannot be null. (Parameter '${parameter}')`),
  invalidOperation: (message: string) => new NetException("System.InvalidOperationException", message),
  indexOutOfRange: (message: string) => new NetException("System.IndexOutOfRangeException", message),
  generic: (message: string) => new NetException("System.Exception", message),
  // EF Core materializes non-nullable properties without a null check (nullable reference types
  // are enabled in ESS_Backend), so a NULL from SQL Server surfaces as this exception.
  sqlNullValue: () =>
    new NetException(
      "System.Data.SqlTypes.SqlNullValueException",
      "Data is Null. This method or property cannot be called on Null values.",
    ),
  dbUpdate: () =>
    new NetException(
      "Microsoft.EntityFrameworkCore.DbUpdateException",
      "An error occurred while saving the entity changes. See the inner exception for details.",
    ),
  dbUpdateConcurrency: (affected: number) =>
    new NetException(
      "Microsoft.EntityFrameworkCore.DbUpdateConcurrencyException",
      `The database operation was expected to affect 1 row(s), but actually affected ${affected} row(s); data may have been modified or deleted since entities were loaded. See https://go.microsoft.com/fwlink/?LinkId=527962 for information on understanding and handling optimistic concurrency exceptions.`,
    ),
  objectDisposed: (objectName: string) =>
    new NetException(
      "System.ObjectDisposedException",
      "Cannot access a disposed context instance. A common cause of this error is disposing a context instance that was resolved from dependency injection and then later trying to use the same context instance elsewhere in your application. This may occur if you are calling 'Dispose' on the context instance, or wrapping it in a using statement. If you are using dependency injection, you should let the dependency injection container take care of disposing context instances.\r\n" +
        `Object name: '${objectName}'.`,
    ),
};

// ---------------------------------------------------------------------------------------------
// Guid
// ---------------------------------------------------------------------------------------------

export const EMPTY_GUID = "00000000-0000-0000-0000-000000000000";

const GUID_INVALID_LENGTH = "Guid should contain 32 digits with 4 dashes (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx).";
const GUID_DASHES = "Dashes are in the wrong position for GUID parsing.";
const GUID_INVALID_CHAR = "Guid string should only contain hexadecimal characters.";
const GUID_UNRECOGNIZED = "Unrecognized Guid format.";

type GuidParse = { ok: true; value: string } | { ok: false; message: string };

function parseGuidD(text: string): GuidParse {
  if (text.length !== 36 || text[8] !== "-" || text[13] !== "-" || text[18] !== "-" || text[23] !== "-") {
    return { ok: false, message: text.length !== 36 ? GUID_INVALID_LENGTH : GUID_DASHES };
  }
  const hex = text.slice(0, 8) + text.slice(9, 13) + text.slice(14, 18) + text.slice(19, 23) + text.slice(24);
  return /^[0-9a-f]{32}$/i.test(hex) ? { ok: true, value: formatGuidD(hex) } : { ok: false, message: GUID_INVALID_CHAR };
}

function formatGuidD(hex32: string) {
  const h = hex32.toLowerCase();
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// System.Guid.TryParseGuid: trims, then picks the format from the first character.
function parseNetGuid(input: string): GuidParse {
  const text = netTrim(input);
  if (text.length === 0) {
    return { ok: false, message: GUID_UNRECOGNIZED };
  }
  if (text[0] === "(" || (text[0] === "{" && text.includes("-"))) {
    const close = text[0] === "(" ? ")" : "}";
    if (text.length !== 38 || text[37] !== close) {
      return { ok: false, message: GUID_INVALID_LENGTH };
    }
    return parseGuidD(text.slice(1, 37));
  }
  if (text[0] === "{") {
    return parseGuidX(text);
  }
  if (text.includes("-")) {
    return parseGuidD(text);
  }
  if (text.length !== 32) {
    return { ok: false, message: GUID_INVALID_LENGTH };
  }
  return /^[0-9a-f]{32}$/i.test(text) ? { ok: true, value: formatGuidD(text) } : { ok: false, message: GUID_INVALID_CHAR };
}

// "X" format: {0x00000000,0x0000,0x0000,{0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00}}
function parseGuidX(text: string): GuidParse {
  const match =
    /^\{0[xX]([0-9a-fA-F]{1,8}),0[xX]([0-9a-fA-F]{1,4}),0[xX]([0-9a-fA-F]{1,4}),\{0[xX]([0-9a-fA-F]{1,2}),0[xX]([0-9a-fA-F]{1,2}),0[xX]([0-9a-fA-F]{1,2}),0[xX]([0-9a-fA-F]{1,2}),0[xX]([0-9a-fA-F]{1,2}),0[xX]([0-9a-fA-F]{1,2}),0[xX]([0-9a-fA-F]{1,2}),0[xX]([0-9a-fA-F]{1,2})\}\}$/.exec(
      text.replace(/\s/g, ""),
    );
  if (!match) {
    return { ok: false, message: GUID_UNRECOGNIZED };
  }
  const widths = [8, 4, 4, 2, 2, 2, 2, 2, 2, 2, 2];
  const hex = match
    .slice(1)
    .map((part, index) => part.padStart(widths[index], "0"))
    .join("");
  return { ok: true, value: formatGuidD(hex) };
}

// `new Guid(string)`: throws FormatException with .NET's message, returns lowercase "D" format.
export function newGuid(value: string | null | undefined): string {
  if (value === null || value === undefined) {
    throw netErrors.argumentNull("g");
  }
  const result = parseNetGuid(value);
  if (!result.ok) {
    throw netErrors.format(result.message);
  }
  return result.value;
}

// `Guid.TryParse(string, out Guid)`.
export function tryParseGuid(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const result = parseNetGuid(value);
  return result.ok ? result.value : null;
}

export function guidEquals(a: string | null | undefined, b: string | null | undefined) {
  return (a ?? "").toLowerCase() === (b ?? "").toLowerCase();
}

// ---------------------------------------------------------------------------------------------
// Strings
// ---------------------------------------------------------------------------------------------

// string.Replace(oldValue, newValue): ordinal, and a null newValue removes the match.
// (JS String.replace would interpret `$&` etc. in the replacement and print "null".)
export function netReplace(text: string, oldValue: string, newValue: string | null | undefined): string {
  return text.split(oldValue).join(newValue ?? "");
}

// string.Equals(a, b, StringComparison.OrdinalIgnoreCase): per-char simple upper-case mapping.
export function equalsOrdinalIgnoreCase(a: string | null | undefined, b: string | null | undefined) {
  if (a === null || a === undefined || b === null || b === undefined) {
    return a === b;
  }
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    if (simpleUpper(a[i]) !== simpleUpper(b[i])) {
      return false;
    }
  }
  return true;
}

function simpleUpper(ch: string) {
  const upper = ch.toUpperCase();
  return upper.length === 1 ? upper : ch;
}

// string.ToUpper() on the culture of the ESS host (en-MY); same as invariant for these values.
export function netToUpper(text: string) {
  let result = "";
  for (const ch of text) {
    result += simpleUpper(ch);
  }
  return result;
}

export function isNullOrEmpty(value: string | null | undefined): value is null | undefined | "" {
  return value === null || value === undefined || value === "";
}

// Char.IsWhiteSpace: unlike JS \s it includes U+0085 and excludes U+FEFF.
const NET_WHITESPACE = "\\t\\n\\v\\f\\r \\u0085\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000";
const NET_TRIM = new RegExp(`^[${NET_WHITESPACE}]+|[${NET_WHITESPACE}]+$`, "g");

// string.Trim()
export function netTrim(value: string) {
  return value.replace(NET_TRIM, "");
}

export function isNullOrWhiteSpace(value: string | null | undefined) {
  return value === null || value === undefined || netTrim(value) === "";
}

// LINQ OrderBy over strings uses the current culture's comparer (en-MY).
const cultureCollator = new Intl.Collator("en-MY");

export function orderByCulture<T>(items: T[], key: (item: T) => string | null | undefined): T[] {
  return [...items].sort((a, b) => {
    const left = key(a);
    const right = key(b);
    if (left === right) return 0;
    if (left === null || left === undefined) return -1;
    if (right === null || right === undefined) return 1;
    return cultureCollator.compare(left, right);
  });
}

// ---------------------------------------------------------------------------------------------
// DateTime
//
// ESS_Backend uses DateTime.Now (local wall-clock time, Kind=Unspecified once stored) and the
// database stores that wall-clock in `datetime` columns. Node represents such a value as a Date
// whose UTC fields hold the wall-clock (how Prisma reads and writes `datetime` columns), so
// toEssDate prints it exactly like System.Text.Json.
// ---------------------------------------------------------------------------------------------

// DateTime.Now
export function netNow(): Date {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
}

// DateTime.Today
export function netToday(): Date {
  const now = netNow();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function addMilliseconds(value: Date, milliseconds: number) {
  return new Date(value.getTime() + milliseconds);
}

export function addDays(value: Date, days: number) {
  return new Date(value.getTime() + days * 86_400_000);
}

// Convert.ToDateTime(DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss")) drops the fraction.
export function truncateToSeconds(value: Date) {
  return new Date(Math.floor(value.getTime() / 1000) * 1000);
}

function pad(value: number, length = 2) {
  return String(value).padStart(length, "0");
}

// DateTime.ToString(format) for the custom formats ESS_Backend uses.
export function formatNetDate(value: Date, format: "dd-MM-yyyy" | "yyyy-MM-dd") {
  const day = pad(value.getUTCDate());
  const month = pad(value.getUTCMonth() + 1);
  const year = pad(value.getUTCFullYear(), 4);
  return format === "dd-MM-yyyy" ? `${day}-${month}-${year}` : `${year}-${month}-${day}`;
}

// DateTime.ToString() on the ESS host culture (en-MY): "d/M/yyyy h:mm:ss tt".
export function formatNetDateTimeDefault(value: Date) {
  const hours = value.getUTCHours();
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  const designator = hours < 12 ? "AM" : "PM";
  return `${value.getUTCDate()}/${value.getUTCMonth() + 1}/${value.getUTCFullYear()} ${hour12}:${pad(value.getUTCMinutes())}:${pad(value.getUTCSeconds())} ${designator}`;
}

// ---------------------------------------------------------------------------------------------
// XmlSerializer (flat classes only, e.g. ApplicationInfo)
// ---------------------------------------------------------------------------------------------

export type XmlFieldValue = string | number | null;

// XmlWriter (CheckCharacters = true) rejects characters that are not valid XML 1.0.
function assertXmlChars(text: string) {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    const isHighSurrogate = code >= 0xd800 && code <= 0xdbff;
    if (isHighSurrogate) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        i++;
        continue;
      }
    }
    const valid =
      code === 0x9 || code === 0xa || code === 0xd || (code >= 0x20 && code <= 0xd7ff) || (code >= 0xe000 && code <= 0xfffd);
    if (!valid) {
      throw netErrors.argument(`'${String.fromCharCode(code)}', hexadecimal value 0x${code.toString(16).toUpperCase().padStart(2, "0")}, is an invalid character.`);
    }
  }
}

function escapeXmlText(text: string) {
  assertXmlChars(text);
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\r\n|\r/g, "\n");
}

// new XmlSerializer(typeof(T)).Serialize(XmlWriter.Create(StringWriter), value):
// utf-16 declaration, xsi/xsd namespaces, declaration-order elements, null strings omitted,
// empty strings as empty elements.
export function xmlSerializeFlat(rootName: string, fields: [name: string, value: XmlFieldValue][]) {
  let xml = `<?xml version="1.0" encoding="utf-16"?><${rootName} xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">`;
  for (const [name, value] of fields) {
    if (value === null) {
      continue;
    }
    const text = String(value);
    xml += text === "" ? `<${name} />` : `<${name}>${escapeXmlText(text)}</${name}>`;
  }
  return `${xml}</${rootName}>`;
}

function decodeXmlEntities(text: string) {
  return text.replace(/&(#x[0-9a-fA-F]+|#\d+|lt|gt|amp|quot|apos);/g, (_match, entity: string) => {
    if (entity[0] === "#") {
      return String.fromCodePoint(entity[1] === "x" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10));
    }
    return { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" }[entity] ?? "";
  });
}

// XmlSerializer.Deserialize for a flat class: returns child element texts by name.
// Missing elements are left to the caller's defaults, like the C# constructor values.
export function xmlParseFlat(xml: string, rootName: string): Map<string, string> {
  const body = xml.replace(/^\s*<\?xml[^>]*\?>/, "").trim();
  if (body === "") {
    throw new NetException("System.Xml.XmlException", "Root element is missing.");
  }
  const root = new RegExp(`^<${rootName}(\\s[^>]*)?(/>|>([\\s\\S]*)</${rootName}>)$`).exec(body);
  if (!root) {
    throw netErrors.invalidOperation("There is an error in XML document (1, 1).");
  }
  const values = new Map<string, string>();
  const children = root[3] ?? "";
  const element = /<([A-Za-z_][\w.-]*)(\s[^>]*)?(?:\/>|>([\s\S]*?)<\/\1\s*>)/g;
  for (let match = element.exec(children); match; match = element.exec(children)) {
    values.set(match[1], decodeXmlEntities(match[3] ?? ""));
  }
  return values;
}

// XmlConvert.ToInt32 (XmlConvert.TrimString: XML whitespace only)
export function xmlToInt32(text: string) {
  const trimmed = text.replace(/^[ \t\n\r]+|[ \t\n\r]+$/g, "");
  if (!/^[+-]?\d+$/.test(trimmed)) {
    throw netErrors.format(`The input string '${text}' was not in a correct format.`);
  }
  return Number(trimmed);
}
