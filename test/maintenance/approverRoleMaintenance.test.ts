import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { authHeader, EMPLOYEE_ID } from "../helpers.js";

vi.mock("../../src/models/maintenance/approverRoleMaintenance.js", () => ({
  getModules: vi.fn(),
  getRoles: vi.fn(),
  findRoleInModule: vi.fn(),
  getRoleMembers: vi.fn(),
  saveRoleMember: vi.fn(),
  saveRoleMembers: vi.fn(),
  deleteRoleMember: vi.fn(),
  deleteRoleMembers: vi.fn(),
}));
vi.mock("../../src/models/employee.js", () => ({ isInGroup: vi.fn(), findEmployeeByLoginName: vi.fn() }));
vi.mock("../../src/models/orgDropdown.js", () => ({
  listCompanies: vi.fn(),
  listDivisions: vi.fn(),
  listUnitSections: vi.fn(),
}));
vi.mock("../../src/models/peoplePicker.js", () => ({ searchPeoplePicker: vi.fn(), employeeExists: vi.fn() }));
vi.mock("../../src/models/spGroup.js", () => ({ isSharePointGroupMember: vi.fn() }));

import * as model from "../../src/models/maintenance/approverRoleMaintenance.js";
import * as employees from "../../src/models/employee.js";
import * as org from "../../src/models/orgDropdown.js";
import * as people from "../../src/models/peoplePicker.js";
import { app } from "../../src/app.js";

const BASE = "/v1/approver-role-maintenance";
const MODULE_ID = "AAAAAAAA-0000-0000-0000-000000000001";
const ROLE_ID = "BBBBBBBB-0000-0000-0000-000000000002";
const MEMBER_EMP = "CCCCCCCC-0000-0000-0000-000000000003";
const EMPTY = "00000000-0000-0000-0000-000000000000";

const noEmployee = () => authHeader("1", { userName: "svc" });
const get = (path: string, headers = authHeader()) => request(app).get(path).set(headers);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(employees.isInGroup).mockResolvedValue(true);
});

describe("module-ddl / role-ddl", () => {
  it("passes the current employee and IsInGroup('ESS Admin') to Role_GetModules", async () => {
    vi.mocked(employees.isInGroup).mockResolvedValue(false);
    vi.mocked(model.getModules).mockResolvedValue([{ Value: MODULE_ID, Text: "Leave" }, { Value: ROLE_ID, Text: null }]);

    const res = await get(`${BASE}/module-ddl`);

    expect(res.body).toEqual({
      status: "success",
      message: "data retrieved.",
      data: [
        { id: MODULE_ID.toLowerCase(), code: "", name: "Leave" },
        { id: ROLE_ID.toLowerCase(), code: "", name: "" },
      ],
    });
    expect(employees.isInGroup).toHaveBeenCalledWith(EMPLOYEE_ID, "ESS Admin");
    expect(model.getModules).toHaveBeenCalledWith(EMPLOYEE_ID, false);
  });

  it("returns 500 (as ESS does) when the token has no employee", async () => {
    const res = await get(`${BASE}/module-ddl`, noEmployee());
    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ status: "error", message: "Employee ID is unavailable for the current user." });
  });

  it("role-ddl requires a non-empty moduleId", async () => {
    for (const qs of ["", `?moduleId=${EMPTY}`]) {
      const res = await get(`${BASE}/role-ddl${qs}`);
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ status: "error", message: "ModuleId must be provided.", data: null });
    }
    const bad = await get(`${BASE}/role-ddl?moduleId=x`);
    expect(bad.status).toBe(400);
    expect(bad.body.errors).toEqual({ ModuleId: ["The value 'x' is not valid for ModuleId."] });
  });

  it("role-ddl calls Role_GetRoles with the module", async () => {
    vi.mocked(model.getRoles).mockResolvedValue([{ Value: ROLE_ID, Text: "Approver" }]);
    const res = await get(`${BASE}/role-ddl?moduleId=${MODULE_ID}`);
    expect(res.body.data).toEqual([{ id: ROLE_ID.toLowerCase(), code: "", name: "Approver" }]);
    expect(model.getRoles).toHaveBeenCalledWith(EMPLOYEE_ID, MODULE_ID.toLowerCase(), true);
  });
});

describe("GET /role-members", () => {
  const path = `${BASE}/role-members?moduleId=${MODULE_ID}&roleId=${ROLE_ID}`;
  const memberRow = (i: number) => ({
    ID: `DDDDDDDD-0000-0000-0000-00000000000${i}`,
    ModuleID: MODULE_ID,
    ModuleName: "Leave",
    RoleID: ROLE_ID,
    RoleName: null,
    EmployeeID: null,
    EmployeeCode: `E${i}`,
    EmployeeName: null,
    DivisionCode: "D1",
    DepartmentCode: null,
    UnitSectionCode: null,
  });

  beforeEach(() => {
    vi.mocked(model.findRoleInModule).mockResolvedValue({
      id: ROLE_ID,
      roleCode: "APPR",
      roleDesc: "Approver",
      needHierarchy: null,
    });
    vi.mocked(model.getRoleMembers).mockResolvedValue([1, 2, 3].map(memberRow));
  });

  it("returns role detail plus in-memory paged members", async () => {
    const res = await get(`${path}&page=2&pageSize=2`);

    expect(res.body).toEqual({
      status: "success",
      message: "data retrieved.",
      data: {
        roleDetail: { id: ROLE_ID.toLowerCase(), roleCode: "APPR", roleName: "Approver", needHierarchy: true },
        roleMembers: {
          items: [
            {
              id: "dddddddd-0000-0000-0000-000000000003",
              moduleId: MODULE_ID.toLowerCase(),
              moduleName: "Leave",
              roleId: ROLE_ID.toLowerCase(),
              roleName: "",
              employeeId: null,
              employeeCode: "E3",
              employeeName: "",
              divisionCode: "D1",
              departmentCode: "",
              unitSectionCode: "",
            },
          ],
          page: 2,
          pageSize: 2,
          totalCount: 3,
        },
      },
    });
    expect(model.findRoleInModule).toHaveBeenCalledWith(ROLE_ID.toLowerCase(), MODULE_ID.toLowerCase());
    expect(model.getRoleMembers).toHaveBeenCalledWith(MODULE_ID.toLowerCase(), ROLE_ID.toLowerCase(), true, EMPLOYEE_ID);
  });

  it("clamps pageSize at Pagination:MaxPageSize (100)", async () => {
    expect((await get(`${path}&pageSize=1000`)).body.data.roleMembers.pageSize).toBe(100);
  });

  it.each([
    [`${BASE}/role-members?roleId=${ROLE_ID}`, "ModuleId must be provided."],
    [`${BASE}/role-members?moduleId=${MODULE_ID}`, "RoleId must be provided."],
    [`${path}&page=0`, "Page must be >= 1."],
  ])("returns 400 for %s", async (url, message) => {
    const res = await get(url);
    expect(res.status).toBe(400);
    expect(res.body.message).toBe(message);
  });

  it("returns 404 when the role does not belong to the module", async () => {
    vi.mocked(model.findRoleInModule).mockResolvedValue(null);
    const res = await get(path);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ status: "error", message: "Role not found for the selected module.", data: null });
    expect(employees.isInGroup).not.toHaveBeenCalled();
  });
});

describe("POST /role-members/single and /multiple", () => {
  const body = { roleId: ROLE_ID, employeeId: MEMBER_EMP, divisionCode: " D1 ", departmentCode: "  " };

  it("saves one member through RoleMember_Save and returns 201 with its new id", async () => {
    const res = await request(app).post(`${BASE}/role-members/single`).set(authHeader()).send(body);

    expect(res.status).toBe(201);
    expect(res.body.message).toBe("Role member created.");
    const saved = vi.mocked(model.saveRoleMember).mock.calls[0][0];
    expect(saved).toEqual({
      id: res.body.data.id,
      roleId: ROLE_ID.toLowerCase(),
      employeeId: MEMBER_EMP.toLowerCase(),
      divisionCode: "D1",
      departmentCode: null,
      unitSectionCode: null,
      actionerId: EMPLOYEE_ID,
    });
    expect(res.headers.location).toBeUndefined();
  });

  it.each([
    [{ employeeId: MEMBER_EMP }, "RoleId must be provided."],
    [{ roleId: ROLE_ID, employeeId: EMPTY }, "EmployeeId must be provided."],
  ])("validates single %o", async (payload, message) => {
    const res = await request(app).post(`${BASE}/role-members/single`).set(authHeader()).send(payload);
    expect(res.status).toBe(400);
    expect(res.body.message).toBe(message);
  });

  it("returns ProblemDetails 400 when a code exceeds [MaxLength(200)]", async () => {
    const res = await request(app)
      .post(`${BASE}/role-members/multiple`)
      .set(authHeader())
      .send([{ roleId: ROLE_ID, employeeId: MEMBER_EMP, unitSectionCode: "x".repeat(201) }]);
    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual({
      "[0].UnitSectionCode": ["The field UnitSectionCode must be a string or array type with a maximum length of '200'."],
    });
  });

  it("saves many members in one call and returns their ids", async () => {
    const res = await request(app)
      .post(`${BASE}/role-members/multiple`)
      .set(authHeader())
      .send([body, { ...body, employeeId: EMPLOYEE_ID }]);

    expect(res.status).toBe(201);
    expect(res.body.message).toBe("Role members created.");
    const saved = vi.mocked(model.saveRoleMembers).mock.calls[0][0];
    expect(saved).toHaveLength(2);
    expect(res.body.data).toEqual(saved.map((member) => ({ id: member.id })));
  });

  it.each([
    [[], "At least one role member must be provided."],
    [[{ employeeId: MEMBER_EMP }], "RoleId must be provided for every role member."],
    [[{ roleId: ROLE_ID }], "EmployeeId must be provided for every role member."],
  ])("validates multiple %o", async (payload, message) => {
    const res = await request(app).post(`${BASE}/role-members/multiple`).set(authHeader()).send(payload);
    expect(res.status).toBe(400);
    expect(res.body.message).toBe(message);
    expect(model.saveRoleMembers).not.toHaveBeenCalled();
  });

  it("returns 500 when the token has no employee", async () => {
    const res = await request(app).post(`${BASE}/role-members/single`).set(noEmployee()).send(body);
    expect(res.status).toBe(500);
    expect(model.saveRoleMember).not.toHaveBeenCalled();
  });
});

describe("DELETE /role-members/single and /multiple", () => {
  const MEMBER_ID = "EEEEEEEE-0000-0000-0000-000000000005";

  it("deletes one member from the JSON body", async () => {
    const res = await request(app).delete(`${BASE}/role-members/single`).set(authHeader()).send({ id: MEMBER_ID });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "success", message: "Role member deleted.", data: null });
    expect(model.deleteRoleMember).toHaveBeenCalledWith(MEMBER_ID.toLowerCase());
  });

  it("deletes many members", async () => {
    const res = await request(app)
      .delete(`${BASE}/role-members/multiple`)
      .set(authHeader())
      .send([{ id: MEMBER_ID }, { Id: ROLE_ID }]);
    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Role members deleted.");
    expect(model.deleteRoleMembers).toHaveBeenCalledWith([MEMBER_ID.toLowerCase(), ROLE_ID.toLowerCase()]);
  });

  it.each([
    ["single", {}, "Id must be provided."],
    ["multiple", [], "At least one role member must be provided."],
    ["multiple", [{ id: EMPTY }], "Id must be provided for every role member."],
  ])("validates %s %o", async (kind, payload, message) => {
    const res = await request(app).delete(`${BASE}/role-members/${kind}`).set(authHeader()).send(payload);
    expect(res.status).toBe(400);
    expect(res.body.message).toBe(message);
  });

  it("returns ProblemDetails 400 when the body is missing", async () => {
    const res = await request(app).delete(`${BASE}/role-members/single`).set(authHeader());
    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual({ "": ["A non-empty request body is required."] });
  });
});

describe("org dropdowns", () => {
  it("division-ddl lists companies; department-ddl and unit-section-ddl filter by parent", async () => {
    vi.mocked(org.listCompanies).mockResolvedValue([{ id: 1, code: "TNB", name: "Tenaga" }]);
    vi.mocked(org.listDivisions).mockResolvedValue([{ id: 7, code: "ICT", name: "ICT" }]);
    vi.mocked(org.listUnitSections).mockResolvedValue([]);

    expect((await get(`${BASE}/division-ddl`)).body).toEqual({
      status: "success",
      message: "data retrieved.",
      data: [{ id: "1", code: "TNB", name: "Tenaga" }],
    });
    expect((await get(`${BASE}/department-ddl?divisionId=1`)).body.data).toEqual([{ id: "7", code: "ICT", name: "ICT" }]);
    expect(org.listDivisions).toHaveBeenCalledWith(1);
    expect((await get(`${BASE}/unit-section-ddl`)).body.data).toEqual([]);
    expect(org.listUnitSections).toHaveBeenCalledWith(null);
  });
});

describe("GET /people-picker", () => {
  it("scopes the picker to the current employee with no search type", async () => {
    vi.mocked(people.searchPeoplePicker).mockResolvedValue([]);
    const res = await get(`${BASE}/people-picker?empCode=E1&pageSize=500`);
    expect(res.body).toEqual({
      status: "success",
      message: "data retrieved.",
      data: { items: [], page: 1, pageSize: 100, totalCount: 0 },
    });
    expect(people.searchPeoplePicker).toHaveBeenCalledWith({
      employeeCode: "E1",
      employeeName: null,
      searchType: null,
      currEmployeeId: EMPLOYEE_ID,
    });
  });

  it("returns 401 when the token has no employee", async () => {
    const res = await get(`${BASE}/people-picker`, noEmployee());
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ status: "error", message: "Employee ID is unavailable for the current user.", data: null });
  });
});
