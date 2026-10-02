import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { authHeader, EMPLOYEE_ID } from "../helpers.js";

vi.mock("../../src/models/maintenance/maintenanceHistory.js", () => ({
  listCategoryDropdown: vi.fn(),
  listTypeDropdown: vi.fn(),
  listStatusDropdown: vi.fn(),
  listActiveCategories: vi.fn(),
  listActiveTypes: vi.fn(),
  listActiveStatuses: vi.fn(),
  findActiveCategoryName: vi.fn(),
  getProfileHistory: vi.fn(),
  queryRequestById: vi.fn(),
  listRequestDetails: vi.fn(),
  listApprovalAuditLog: vi.fn(),
  findRequestEmployeeId: vi.fn(),
  findEmployeeDetail: vi.fn(),
}));
vi.mock("../../src/models/spGroup.js", () => ({ isSharePointGroupMember: vi.fn() }));

import * as model from "../../src/models/maintenance/maintenanceHistory.js";
import { app } from "../../src/app.js";

const BASE = "/v1/employee";
const REQUEST_ID = "AAAAAAAA-0000-0000-0000-000000000001";
const request_id = REQUEST_ID.toLowerCase();
const OTHER_EMP = "BBBBBBBB-0000-0000-0000-000000000002";

const get = (path: string, headers = authHeader()) => request(app).get(path).set(headers);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(model.listActiveTypes).mockResolvedValue([
    { id: 1, name: "New" },
    { id: 2, name: "Update" },
  ]);
  vi.mocked(model.listActiveStatuses).mockResolvedValue([{ id: 3, name: "Approved" }]);
  vi.mocked(model.listActiveCategories).mockResolvedValue([
    { id: 10, name: "Personal Info" },
    { id: 11, name: "Address" },
  ]);
});

describe("dropdowns", () => {
  it.each([
    ["maintenance-category-ddl", "listCategoryDropdown"],
    ["maintenance-type-ddl", "listTypeDropdown"],
    ["maintenance-status-ddl", "listStatusDropdown"],
  ] as const)("GET /%s maps id/name with an empty code", async (path, fn) => {
    vi.mocked(model[fn]).mockResolvedValue([{ id: 4, name: "Thing" }]);
    const res = await get(`${BASE}/${path}`);
    expect(res.body).toEqual({ status: "success", message: "data retrieved.", data: [{ id: "4", code: "", name: "Thing" }] });
  });
});

describe("GET /v1/employee/maintenance-history", () => {
  const rows = [1, 2, 3].map((i) => ({
    RequestID: `CCCCCCCC-0000-0000-0000-00000000000${i}`,
    RequestNo: `REQ-${i}`,
    RequestCategory: "Address",
    RequestType: i === 1 ? "2" : "Legacy Type",
    RequestStatus: i === 1 ? " 3 " : "99",
    CreatedDate: i === 1 ? new Date("2026-06-28T12:27:58.693Z") : null,
  }));

  it("defaults to the current employee, pages in memory and resolves type/status names", async () => {
    vi.mocked(model.getProfileHistory).mockResolvedValue(rows);

    const res = await get(`${BASE}/maintenance-history?pageSize=2`);

    expect(res.body).toEqual({
      status: "success",
      message: "Employee maintenance history retrieved.",
      data: {
        items: [
          {
            requestId: "cccccccc-0000-0000-0000-000000000001",
            requestNo: "REQ-1",
            requestCategory: "Address",
            requestCategoryCode: 0,
            requestType: "Update",
            requestTypeCode: 2,
            requestStatus: "Approved",
            requestStatusCode: 3,
            createdDate: "2026-06-28T12:27:58.693",
          },
          {
            requestId: "cccccccc-0000-0000-0000-000000000002",
            requestNo: "REQ-2",
            requestCategory: "Address",
            requestCategoryCode: 0,
            requestType: "Legacy Type",
            requestTypeCode: null,
            requestStatus: "99",
            requestStatusCode: 99,
            createdDate: null,
          },
        ],
        page: 1,
        pageSize: 2,
        totalCount: 3,
      },
    });
    expect(model.getProfileHistory).toHaveBeenCalledWith({
      employeeId: EMPLOYEE_ID,
      startDate: null,
      endDate: null,
      areaCode: null,
      subAreaCode: null,
      requestCategory: null,
      requestType: null,
      requestStatus: null,
    });
  });

  it("passes explicit filters: category id -> name, normalized dates, numeric type/status", async () => {
    vi.mocked(model.findActiveCategoryName).mockResolvedValue("Address");
    vi.mocked(model.getProfileHistory).mockResolvedValue([rows[0]]);

    const res = await get(
      `${BASE}/maintenance-history?employeeId=${OTHER_EMP}&dateFrom=05/06/2026&dateTo=12/31/2026&requestCategory=11&requestType=2&requestStatus=3&areaCode=%20A1%20`,
    );

    expect(res.body.data.items[0].requestCategoryCode).toBe(11);
    expect(model.findActiveCategoryName).toHaveBeenCalledWith(11);
    expect(model.getProfileHistory).toHaveBeenCalledWith({
      employeeId: OTHER_EMP.toLowerCase(),
      startDate: "2026/06/05",
      endDate: "2026/12/31",
      areaCode: "A1",
      subAreaCode: null,
      requestCategory: "Address",
      requestType: "2",
      requestStatus: "3",
    });
  });

  it("passes unrecognised date text through unchanged", async () => {
    vi.mocked(model.getProfileHistory).mockResolvedValue([]);
    await get(`${BASE}/maintenance-history?dateFrom=5/6/2026&dateTo=2026-02-30`);
    expect(vi.mocked(model.getProfileHistory).mock.calls[0][0]).toMatchObject({ startDate: "5/6/2026", endDate: "2026-02-30" });
  });

  it("returns an empty page without querying when there is no employee at all", async () => {
    const res = await get(`${BASE}/maintenance-history?page=3`, authHeader("1", { userName: "svc" }));
    expect(res.body.data).toEqual({ items: [], page: 3, pageSize: 10, totalCount: 0 });
    expect(model.getProfileHistory).not.toHaveBeenCalled();
  });

  it("validates paging and query binding", async () => {
    expect((await get(`${BASE}/maintenance-history?pageSize=0`)).body.message).toBe("PageSize must be >= 1.");
    const bad = await get(`${BASE}/maintenance-history?requestType=abc`);
    expect(bad.status).toBe(400);
    // ModelState key = the C# action parameter name ([FromQuery] int? requestType).
    expect(bad.body.errors).toEqual({ requestType: ["The value 'abc' is not valid for requestType."] });
  });
});

describe("GET /maintenance-history/:requestId", () => {
  const row = {
    RequestID: REQUEST_ID,
    RequestNo: "REQ-1",
    RequestCategory: "address",
    RequestType: "1",
    RequestStatus: "Pending",
    EmployeeID: OTHER_EMP,
    EmployeeCode: "E1",
    EmployeeName: null,
    CompanyName: "TNB",
    CompanyCode: null,
    AreaName: null,
    SubAreaName: null,
    CurrentApprovers: "Boss",
    Date: new Date("2026-07-01T00:00:00Z"),
  };

  it("maps the first Request_Query_UNITEN row; category code matched case-insensitively", async () => {
    vi.mocked(model.queryRequestById).mockResolvedValue([row, { ...row, RequestNo: "ignored" }]);

    const res = await get(`${BASE}/maintenance-history/${REQUEST_ID}`);

    expect(res.body).toEqual({
      status: "success",
      message: "Employee maintenance history detail retrieved.",
      data: {
        requestId: request_id,
        requestNo: "REQ-1",
        requestCategory: "address",
        requestCategoryCode: 11,
        requestType: "New",
        requestTypeCode: 1,
        requestStatus: "Pending",
        requestStatusCode: null,
        employeeId: OTHER_EMP.toLowerCase(),
        employeeCode: "E1",
        employeeName: "",
        companyName: "TNB",
        companyCode: "",
        areaName: "",
        subAreaName: "",
        currentApprovers: "Boss",
        lastActionDate: "2026-07-01T00:00:00",
      },
    });
    expect(model.queryRequestById).toHaveBeenCalledWith(request_id);
  });

  it("returns 404 when the request does not exist", async () => {
    vi.mocked(model.queryRequestById).mockResolvedValue([]);
    const res = await get(`${BASE}/maintenance-history/${REQUEST_ID}`);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ status: "error", message: "Employee maintenance history detail not found.", data: null });
  });

  it("returns 500 like ESS when active category names collide (ToDictionary duplicate key)", async () => {
    vi.mocked(model.listActiveCategories).mockResolvedValue([
      { id: 1, name: "Address" },
      { id: 2, name: "ADDRESS" },
    ]);
    const res = await get(`${BASE}/maintenance-history/${REQUEST_ID}`);
    expect(res.status).toBe(500);
  });

  it("does not match a non-GUID request id", async () => {
    expect((await get(`${BASE}/maintenance-history/123`)).status).toBe(404);
    expect(model.queryRequestById).not.toHaveBeenCalled();
  });
});

describe("GET /maintenance-history/:requestId/details", () => {
  it("maps detail rows and re-formats yyyy/MM/dd values of *Date* fields", async () => {
    vi.mocked(model.listRequestDetails).mockResolvedValue([
      {
        DetailID: "DDDDDDDD-0000-0000-0000-000000000001",
        RequestCategory: "Personal Info",
        RequestType: "2",
        FieldName: "BirthDate",
        OldValue: "1990/01/31",
        NewValue: " 1990/02/01 ",
        Documents: null,
        Position: 1,
      },
      {
        DetailID: "DDDDDDDD-0000-0000-0000-000000000002",
        RequestCategory: null,
        RequestType: "x",
        FieldName: "Phone",
        OldValue: "  ",
        NewValue: " 2026/01/01 ",
        Documents: 2,
        Position: 2,
      },
    ]);

    const res = await get(`${BASE}/maintenance-history/${REQUEST_ID}/details`);

    expect(res.body).toEqual({
      status: "success",
      message: "Employee maintenance history detail list retrieved.",
      data: [
        {
          detailId: "dddddddd-0000-0000-0000-000000000001",
          requestCategory: "Personal Info",
          requestCategoryCode: 10,
          requestType: "Update",
          requestTypeCode: 2,
          fieldName: "BirthDate",
          oldValue: "31/01/1990",
          newValue: "01/02/1990",
          documents: 0,
          position: 1,
        },
        {
          detailId: "dddddddd-0000-0000-0000-000000000002",
          requestCategory: "",
          requestCategoryCode: null,
          requestType: "x",
          requestTypeCode: null,
          fieldName: "Phone",
          oldValue: "",
          newValue: "2026/01/01",
          documents: 2,
          position: 2,
        },
      ],
    });
  });
});

describe("GET /maintenance-history/:requestId/audit-logs", () => {
  it("returns the audit log rows from the cross-database view", async () => {
    vi.mocked(model.listApprovalAuditLog).mockResolvedValue([
      {
        ActionerId: EMPLOYEE_ID.toUpperCase(),
        EmployeeName: "Ahmad",
        EmployeeCode: null,
        Comment: "",
        ActivityAction: "Submitted",
        ActivityName: "Submission",
        CreatedDate: new Date("2026-06-28T12:27:58.693Z"),
        SourceId: REQUEST_ID,
        FormattedDate: "28/06/2026 12:27:58 PM",
      },
    ]);

    const res = await get(`${BASE}/maintenance-history/${REQUEST_ID}/audit-logs`);

    expect(res.body).toEqual({
      status: "success",
      message: "Employee maintenance history audit logs retrieved.",
      data: [
        {
          actionerId: EMPLOYEE_ID,
          employeeName: "Ahmad",
          employeeCode: null,
          comment: "",
          activityAction: "Submitted",
          activityName: "Submission",
          createdDate: "2026-06-28T12:27:58.693",
          sourceId: request_id,
          formattedDate: "28/06/2026 12:27:58 PM",
        },
      ],
    });
    expect(model.listApprovalAuditLog).toHaveBeenCalledWith(request_id);
  });
});

describe("GET /maintenance-history/:requestId/employee", () => {
  it("returns the requester's employee details", async () => {
    vi.mocked(model.findRequestEmployeeId).mockResolvedValue(OTHER_EMP);
    vi.mocked(model.findEmployeeDetail).mockResolvedValue({
      employeeId: OTHER_EMP,
      employeeCode: "E2",
      employeeName: "Lim",
      areaCode: "A1",
      areaName: "ICT",
      subAreaCode: null,
      subAreaName: "Digital",
      positionCode: "P1",
      positionName: "Analyst",
      joinDate: new Date("2021-01-11T00:00:00Z"),
      jobKeyName: "ESS",
      managerName: null,
    });

    const res = await get(`${BASE}/maintenance-history/${REQUEST_ID}/employee`);

    expect(res.body).toEqual({
      status: "success",
      message: "Employee maintenance history employee retrieved.",
      data: {
        employeeCode: "E2",
        employeeId: OTHER_EMP.toLowerCase(),
        employeeName: "Lim",
        departmentCode: "A1",
        department: "ICT",
        unitSectionCode: null,
        unitSection: "Digital",
        positionCode: "P1",
        positionName: "Analyst",
        joinDate: "2021-01-11T00:00:00",
        duty: "ESS",
        managerName: null,
      },
    });
  });

  it("returns 404 Employee not found. when the request or employee is missing", async () => {
    vi.mocked(model.findRequestEmployeeId).mockResolvedValue(null);
    const missingRequest = await get(`${BASE}/maintenance-history/${REQUEST_ID}/employee`);
    expect(missingRequest.status).toBe(404);
    expect(missingRequest.body.message).toBe("Employee not found.");

    vi.mocked(model.findRequestEmployeeId).mockResolvedValue(OTHER_EMP);
    vi.mocked(model.findEmployeeDetail).mockResolvedValue(null);
    expect((await get(`${BASE}/maintenance-history/${REQUEST_ID}/employee`)).status).toBe(404);
  });
});

describe("withdraw", () => {
  it("is not migrated (stays on ESS)", async () => {
    const res = await request(app).post(`${BASE}/maintenance-history/${REQUEST_ID}/withdraw`).set(authHeader()).send({});
    expect(res.status).toBe(404);
  });
});
