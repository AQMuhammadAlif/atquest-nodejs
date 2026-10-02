import { describe, expect, it } from "vitest";
import {
  deserializeApplicationInfo,
  newApplicationInfo,
  serializeApplicationInfo,
} from "../src/models/routingManagement/routingManagement.js";
import {
  equalsOrdinalIgnoreCase,
  formatNetDate,
  formatNetDateTimeDefault,
  netReplace,
  newGuid,
  tryParseGuid,
} from "../src/utils/essDotnet.js";
import { toCamelCase, toEssJson } from "../src/utils/essFormat.js";

describe("new Guid(string)", () => {
  it("parses the .NET formats to lowercase D", () => {
    expect(newGuid("58308791-89FB-45D1-8A9E-72E430F8E677")).toBe("58308791-89fb-45d1-8a9e-72e430f8e677");
    expect(newGuid(" {58308791-89FB-45D1-8A9E-72E430F8E677} ")).toBe("58308791-89fb-45d1-8a9e-72e430f8e677");
    expect(newGuid("5830879189FB45D18A9E72E430F8E677")).toBe("58308791-89fb-45d1-8a9e-72e430f8e677");
  });

  it.each([
    ["", "Unrecognized Guid format."],
    ["abc", "Guid should contain 32 digits with 4 dashes (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)."],
    ["58308791-89FB-45D18-A9E-72E430F8E677", "Dashes are in the wrong position for GUID parsing."],
    ["5830879Z-89FB-45D1-8A9E-72E430F8E677", "Guid string should only contain hexadecimal characters."],
  ])("throws FormatException for %j", (input, message) => {
    expect(() => newGuid(input)).toThrow(message);
    expect(tryParseGuid(input)).toBeNull();
  });
});

describe(".NET string semantics", () => {
  it("Replace removes on null and does not expand $ patterns", () => {
    expect(netReplace("Hi {Name}", "{Name}", null)).toBe("Hi ");
    expect(netReplace("Hi {Name} {Name}", "{Name}", "$&")).toBe("Hi $& $&");
  });

  it("OrdinalIgnoreCase", () => {
    expect(equalsOrdinalIgnoreCase("Leave Process", "LEAVE process")).toBe(true);
    expect(equalsOrdinalIgnoreCase("a", null)).toBe(false);
  });
});

describe("DateTime formatting", () => {
  const value = new Date(Date.UTC(2026, 5, 30, 16, 28, 5));

  it("ToString() on the en-MY host culture", () => {
    expect(formatNetDateTimeDefault(value)).toBe("30/6/2026 4:28:05 PM");
    expect(formatNetDateTimeDefault(new Date(Date.UTC(2026, 0, 1, 0, 5, 0)))).toBe("1/1/2026 12:05:00 AM");
  });

  it("custom formats", () => {
    expect(formatNetDate(value, "dd-MM-yyyy")).toBe("30-06-2026");
    expect(formatNetDate(value, "yyyy-MM-dd")).toBe("2026-06-30");
  });
});

describe("System.Text.Json camelCase", () => {
  it.each([
    ["ID", "id"],
    ["RoutingRuleID", "routingRuleID"],
    ["SourceID", "sourceID"],
    ["IMStaffID", "imStaffID"],
    ["IMOfIMStaffID", "imOfIMStaffID"],
    ["IMOfIMStaffEmailAddress", "imOfIMStaffEmailAddress"],
    ["CanAgree", "canAgree"],
    ["items", "items"],
  ])("%s -> %s", (name, expected) => {
    expect(toCamelCase(name)).toBe(expected);
  });

  it("serializes nested values, nulls and dates", () => {
    expect(toEssJson({ ID: "a", CreatedDate: new Date(Date.UTC(2026, 6, 3, 16, 47, 51, 443)), Items: [{ ApproverID: null }] })).toEqual({
      id: "a",
      createdDate: "2026-07-03T16:47:51.443",
      items: [{ approverID: null }],
    });
  });
});

describe("ApplicationInfo XmlSerializer", () => {
  it("writes the XmlSerializer document", () => {
    const info = newApplicationInfo();
    info.ReferenceNo = "LUP01-260630-0001";
    info.Comment = "a < b & c";
    const xml = serializeApplicationInfo(info);
    expect(xml.startsWith(
      '<?xml version="1.0" encoding="utf-16"?><ApplicationInfo xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"><ReferenceNo>LUP01-260630-0001</ReferenceNo><ApplicantDisplayName />',
    )).toBe(true);
    expect(xml).toContain("<Comment>a &lt; b &amp; c</Comment>");
    expect(xml.endsWith("<OptionalApproverID1>00000000-0000-0000-0000-000000000000</OptionalApproverID1><Repeat>0</Repeat><Remove>1</Remove></ApplicationInfo>")).toBe(true);
  });

  it("reads the form SQL Server stores (declaration stripped, empty elements collapsed)", () => {
    const stored =
      '<ApplicationInfo xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"><ReferenceNo>LUP01-260630-0001</ReferenceNo><Comment>[Hidden]Agreed via Postman</Comment><DisplayText16/><OptionalApproverID1>58308791-89FB-45D1-8A9E-72E430F8E677</OptionalApproverID1><Repeat>2</Repeat></ApplicationInfo>';
    const info = deserializeApplicationInfo(stored);
    expect(info.ReferenceNo).toBe("LUP01-260630-0001");
    expect(info.Comment).toBe("[Hidden]Agreed via Postman");
    expect(info.DisplayText16).toBe("");
    expect(info.OptionalApproverID1).toBe("58308791-89fb-45d1-8a9e-72e430f8e677");
    expect(info.Repeat).toBe(2);
    // Missing element keeps the constructor default.
    expect(info.Remove).toBe(1);
  });

  it("fails on an empty document like XmlSerializer", () => {
    expect(() => deserializeApplicationInfo("")).toThrow("Root element is missing.");
  });
});
