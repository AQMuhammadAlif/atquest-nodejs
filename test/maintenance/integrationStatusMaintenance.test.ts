import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { authHeader } from "../helpers.js";

vi.mock("../../src/models/maintenance/integrationStatus.js", () => ({
  getIntegrationModules: vi.fn(),
  getIntegrationTransactions: vi.fn(),
  updateIntegrationStatus: vi.fn(),
}));
vi.mock("../../src/models/spGroup.js", () => ({ isSharePointGroupMember: vi.fn() }));

import * as model from "../../src/models/maintenance/integrationStatus.js";
import { app } from "../../src/app.js";
import { parseDotNetDateTime } from "../../src/utils/essRequest.js";

const BASE = "/v1/integration-status-maintenance";
const get = (path: string) => request(app).get(path).set(authHeader());
const retrigger = (body?: unknown) => {
  const req = request(app).post(`${BASE}/retrigger`).set(authHeader());
  return body === undefined ? req : req.send(body as object);
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("dropdowns", () => {
  it("module-ddl drops rows with a blank ModuleCode", async () => {
    vi.mocked(model.getIntegrationModules).mockResolvedValue([
      { ModuleCode: "LV", ModuleName: "Leave" },
      { ModuleCode: "  ", ModuleName: "Blank" },
      { ModuleCode: null, ModuleName: "Null" },
      { ModuleCode: "OT", ModuleName: null },
    ]);
    const res = await get(`${BASE}/module-ddl`);
    expect(res.body).toEqual({
      status: "success",
      message: "Integration module dropdown retrieved.",
      data: [
        { moduleCode: "LV", moduleName: "Leave" },
        { moduleCode: "OT", moduleName: "" },
      ],
    });
  });

  it("integration-status-ddl and request-status-ddl return the legacy static lists", async () => {
    const statuses = await get(`${BASE}/integration-status-ddl`);
    expect(statuses.body.message).toBe("Integration status dropdown retrieved.");
    expect(statuses.body.data.map((option: { value: string }) => option.value)).toEqual([
      "ALL",
      "SENT",
      "FAILED",
      "RECEIVED",
      "ERROR",
    ]);

    const requests = await get(`${BASE}/request-status-ddl`);
    expect(requests.body.message).toBe("Request status dropdown retrieved.");
    expect(requests.body.data).toHaveLength(24);
    expect(requests.body.data[0]).toEqual({ value: "", label: "- ALL -" });
    expect(requests.body.data[23]).toEqual({ value: "SystemError", label: "SystemError" });
  });
});

describe("GET /v1/integration-status-maintenance", () => {
  it("passes trimmed filters and parsed dates, and maps rows", async () => {
    vi.mocked(model.getIntegrationTransactions).mockResolvedValue([
      {
        RequestID: "AAAAAAAA-0000-0000-0000-000000000001",
        RequestNo: "R-1",
        RequestCategory: null,
        RequestType: "Leave",
        IntegrationStatus: "FAILED",
        LastIntegrationDate: new Date("2026-07-01T08:30:00.000Z"),
        ErrorMessage: null,
        EmployeeCode: "E1",
        EmployeeName: "Lim",
        ModuleName: "Leave",
        ModuleCode: "LV",
        FormPath: null,
        RequestStatus: "Pending",
      },
      {
        RequestID: null, RequestNo: null, RequestCategory: null, RequestType: null, IntegrationStatus: null,
        LastIntegrationDate: null, ErrorMessage: null, EmployeeCode: null, EmployeeName: null, ModuleName: null,
        ModuleCode: null, FormPath: null, RequestStatus: null,
      },
    ]);

    const res = await get(`${BASE}?integrationStatus=%20FAILED%20&moduleCode=LV&startDate=2026-07-01&endDate=7/31/2026%205:30%20PM`);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Integration Status Maintenance retrieved.");
    expect(res.body.data[0]).toEqual({
      requestId: "aaaaaaaa-0000-0000-0000-000000000001",
      requestNo: "R-1",
      requestCategory: "",
      requestType: "Leave",
      moduleCode: "LV",
      moduleName: "Leave",
      employeeNo: "E1",
      employeeName: "Lim",
      integrationStatus: "FAILED",
      lastIntegrationDate: "2026-07-01T08:30:00.0000000Z",
      errorMessage: "",
      requestStatus: "Pending",
      formPath: "",
    });
    expect(res.body.data[1]).toMatchObject({ requestId: "", lastIntegrationDate: "" });
    expect(model.getIntegrationTransactions).toHaveBeenCalledWith({
      integrationStatus: "FAILED",
      startDate: new Date("2026-07-01T00:00:00.000Z"),
      endDate: new Date("2026-07-31T17:30:00.000Z"),
      module: "LV",
      requestStatus: null,
    });
  });

  it("ignores unparseable dates instead of rejecting them", async () => {
    vi.mocked(model.getIntegrationTransactions).mockResolvedValue([]);
    const res = await get(`${BASE}?startDate=garbage&endDate=2026-02-30`);
    expect(res.status).toBe(200);
    expect(vi.mocked(model.getIntegrationTransactions).mock.calls[0][0]).toMatchObject({ startDate: null, endDate: null });
  });
});

describe("POST /v1/integration-status-maintenance/retrigger", () => {
  it("retriggers each item; GUID request ids are sent as uppercase text", async () => {
    const res = await retrigger({
      items: [
        { requestId: " aaaaaaaa-0000-0000-0000-000000000001 ", moduleCode: " LV " },
        { RequestId: "LEGACY-42", ModuleCode: "OT" },
      ],
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      status: "success",
      message: "Integration status retriggered.",
      data: { retriggeredCount: 2 },
    });
    expect(model.updateIntegrationStatus).toHaveBeenNthCalledWith(1, "AAAAAAAA-0000-0000-0000-000000000001", "LV");
    expect(model.updateIntegrationStatus).toHaveBeenNthCalledWith(2, "LEGACY-42", "OT");
  });

  it.each([
    [{}, { Items: ["At least one item is required to retrigger."] }],
    [{ items: [] }, { Items: ["At least one item is required to retrigger."] }],
    [{ items: null }, { Items: ["The Items field is required."] }],
    [
      { items: [{ requestId: "", moduleCode: "LV" }, { requestId: "x" }] },
      {
        "Items[0].RequestId": ["The RequestId field is required."],
        "Items[1].ModuleCode": ["The ModuleCode field is required."],
      },
    ],
  ])("returns ProblemDetails 400 for %o", async (body, errors) => {
    const res = await retrigger(body);
    expect(res.status).toBe(400);
    expect(res.body.title).toBe("One or more validation errors occurred.");
    expect(res.body.errors).toEqual(errors);
    expect(model.updateIntegrationStatus).not.toHaveBeenCalled();
  });

  it("returns ProblemDetails 400 for a missing body", async () => {
    const res = await retrigger();
    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual({ "": ["A non-empty request body is required."] });
  });

  it("returns 500 when the procedure fails part-way (no transaction, as in ESS)", async () => {
    vi.mocked(model.updateIntegrationStatus).mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("boom"));
    const res = await retrigger({ items: [{ requestId: "A", moduleCode: "LV" }, { requestId: "B", moduleCode: "LV" }] });
    expect(res.status).toBe(500);
    expect(model.updateIntegrationStatus).toHaveBeenCalledTimes(2);
  });
});

describe("parseDotNetDateTime", () => {
  it.each([
    ["2026-07-28", "2026-07-28T00:00:00.000Z"],
    ["2026-7-8 09:05", "2026-07-08T09:05:00.000Z"],
    ["2026-07-28T10:11:12.1234567", "2026-07-28T10:11:12.123Z"],
    ["07/28/2026", "2026-07-28T00:00:00.000Z"],
    ["7/28/2026 12:15 AM", "2026-07-28T00:15:00.000Z"],
  ])("parses %s as wall-clock time", (input, expected) => {
    expect(parseDotNetDateTime(input)?.toISOString()).toBe(expected);
  });

  it.each(["", "garbage", "2026-13-01", "02/30/2026", "28/07/2026", "2026-07-28 24:00"])("rejects %s", (input) => {
    expect(parseDotNetDateTime(input)).toBeNull();
  });

  it("converts values with an offset to server-local wall-clock time", () => {
    const instant = new Date("2026-07-28T10:00:00Z");
    const expected = new Date(
      Date.UTC(instant.getFullYear(), instant.getMonth(), instant.getDate(), instant.getHours(), instant.getMinutes()),
    );
    expect(parseDotNetDateTime("2026-07-28T10:00:00Z")).toEqual(expected);
    expect(parseDotNetDateTime("2026-07-28T18:00:00+08:00")).toEqual(expected);
  });
});
