import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { authHeader, EMPLOYEE_ID } from "../helpers.js";

vi.mock("../../src/models/maintenance/approvalMaintenance.js", () => ({
  searchApprovalRules: vi.fn(),
  findRuleWithRouting: vi.fn(),
  listCustomApproverIds: vi.fn(),
  listActiveRoutings: vi.fn(),
  listRuleLookups: vi.fn(),
  activeRoutingExists: vi.fn(),
  hasAvailableActions: vi.fn(),
  availableActionExists: vi.fn(),
  emailTemplateExistsForRule: vi.fn(),
  taskExistsForRule: vi.fn(),
  insertRuleWithApprovers: vi.fn(),
  updateRuleAndApprovers: vi.fn(),
  deleteRuleAndApprovers: vi.fn(),
}));
vi.mock("../../src/models/maintenance/notificationMaintenance.js", () => ({ listAvailableActions: vi.fn() }));
vi.mock("../../src/models/peoplePicker.js", () => ({ searchPeoplePicker: vi.fn(), employeeExists: vi.fn() }));
vi.mock("../../src/models/spGroup.js", () => ({ isSharePointGroupMember: vi.fn() }));

import * as model from "../../src/models/maintenance/approvalMaintenance.js";
import * as notification from "../../src/models/maintenance/notificationMaintenance.js";
import * as people from "../../src/models/peoplePicker.js";
import { app } from "../../src/app.js";

const BASE = "/v1/approval-maintenance";
const RULE_ID = "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE";
const rule_id = RULE_ID.toLowerCase();
const ROUTING_ID = "11111111-2222-3333-4444-555555555555";
const APPROVER_A = "99999999-0000-0000-0000-00000000000A";
const APPROVER_B = "99999999-0000-0000-0000-00000000000b";

function makeRule(overrides: Record<string, unknown> = {}) {
  return {
    id: RULE_ID,
    routingId: ROUTING_ID,
    approvalTitle: "Manager Approval",
    approvalLevel: 2,
    approvalRole: "IM",
    currentStatus: "Pending",
    optionalApproval: false,
    requiredEveryOneAction: true,
    yesLabel: "Approve",
    yesActionLogLabel: "Approved",
    yesStatus: "Approved",
    noStatus: "Rejected",
    noLabel: "Reject",
    noActionLogLabel: "Rejected",
    reworkLabel: null,
    reworkActionLogLabel: null,
    reworkStatus: null,
    changeProcessAfter: 99999,
    changeProcessStatus: null,
    endProcessAfter: 99999,
    endProcessStatus: null,
    escalateAfter: 99999,
    escalateTo: null,
    skipSameApprover: false,
    createdDate: new Date("2026-07-28T12:15:00.120Z"),
    modifiedDate: null,
    createdBy: null,
    modifiedBy: null,
    routing: { routingName: "Leave Application" },
    ...overrides,
  };
}

const summary = {
  id: rule_id,
  approvalName: "Leave Application",
  activityName: "Manager Approval",
  assignTo: "IM",
  approvalStep: "Two",
  requiredEveryoneAction: true,
  skipSameApprover: false,
  createdDate: "2026-07-28T12:15:00.1200000Z",
  lastModifiedDate: null,
};

const createBody = {
  routingId: ROUTING_ID,
  approvalTitle: " Manager Approval ",
  approvalStep: "two",
  approvalRole: " IM ",
  yesLabel: "Approve",
  yesActionLogLabel: "Approved",
  noLabel: "Reject",
  noActionLogLabel: "Rejected",
  specificApproverIds: `${APPROVER_A}; ;${APPROVER_B}`,
};

const get = (path: string) => request(app).get(path).set(authHeader());

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(model.findRuleWithRouting).mockResolvedValue(makeRule() as never);
  vi.mocked(model.listCustomApproverIds).mockResolvedValue([]);
  vi.mocked(model.hasAvailableActions).mockResolvedValue(true);
  vi.mocked(model.availableActionExists).mockResolvedValue(true);
  vi.mocked(model.activeRoutingExists).mockResolvedValue(true);
  vi.mocked(people.employeeExists).mockResolvedValue(true);
});

describe("GET /v1/approval-maintenance", () => {
  it("returns the paged search result with ESS date and step formatting", async () => {
    vi.mocked(model.searchApprovalRules).mockResolvedValue([
      {
        ID: RULE_ID,
        RoutingName: "Leave Application",
        ApprovalTitle: "Manager Approval",
        ApprovalLevel: 2,
        ApprovalRole: "IM",
        RequiredEveryOneAction: true,
        SkipSameApprover: false,
        CreatedDate: new Date("2026-07-28T12:15:00.120Z"),
        ModifiedDate: new Date("2026-08-01T00:00:00.000Z"),
        TotalCount: 7,
      },
    ]);

    const res = await get(`${BASE}?assignTo=%20im%20&_page=2&_limit=3`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      status: "success",
      message: "Approval Maintenance retrieved.",
      data: {
        items: [{ ...summary, lastModifiedDate: "2026-08-01T00:00:00.0000000Z" }],
        page: 2,
        pageSize: 3,
        totalCount: 7,
      },
    });
    expect(model.searchApprovalRules).toHaveBeenCalledWith({
      routingId: null,
      routingRuleId: null,
      approvalName: null,
      activityName: null,
      assignTo: "im",
      offset: 3,
      pageSize: 3,
    });
  });

  it("reports an unknown approval level as its number and a missing CreatedDate as now", async () => {
    vi.mocked(model.searchApprovalRules).mockResolvedValue([
      {
        ID: RULE_ID, RoutingName: "R", ApprovalTitle: "T", ApprovalLevel: 9, ApprovalRole: "IM",
        RequiredEveryOneAction: false, SkipSameApprover: false, CreatedDate: null, ModifiedDate: null, TotalCount: 1,
      },
    ]);
    const item = (await get(BASE)).body.data.items[0];
    expect(item.approvalStep).toBe("9");
    expect(item.createdDate).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{7}Z$/);
  });
});

describe("dropdowns and picker", () => {
  it("GET /routing-ddl lists active routings with id = code", async () => {
    vi.mocked(model.listActiveRoutings).mockResolvedValue([{ RoutingID: ROUTING_ID, RoutingName: "Leave" }]);
    const res = await get(`${BASE}/routing-ddl`);
    expect(res.body).toEqual({
      status: "success",
      message: "Routing dropdown retrieved.",
      data: [{ id: ROUTING_ID.toLowerCase(), code: ROUTING_ID.toLowerCase(), name: "Leave" }],
    });
  });

  it("GET /routing-rule-ddl maps rules", async () => {
    vi.mocked(model.listRuleLookups).mockResolvedValue([
      { id: RULE_ID, approvalTitle: "Manager Approval", routing: { routingName: "Leave" } },
    ]);
    const res = await get(`${BASE}/routing-rule-ddl`);
    expect(res.body.data).toEqual([{ id: rule_id, approvalName: "Leave", activityName: "Manager Approval" }]);
    expect(model.listRuleLookups).toHaveBeenCalledWith(null);
  });

  it("GET /assign-to-ddl maps available actions", async () => {
    vi.mocked(notification.listAvailableActions).mockResolvedValue([{ ActionName: "IM", ActionType: null }]);
    const res = await get(`${BASE}/assign-to-ddl`);
    expect(res.body).toEqual({
      status: "success",
      message: "Assign-to dropdown retrieved.",
      data: [{ id: "IM", code: "IM", name: "IM" }],
    });
  });

  it("GET /approval-step-ddl returns the static Zero..Five list", async () => {
    const res = await get(`${BASE}/approval-step-ddl`);
    expect(res.body.message).toBe("Approval step dropdown retrieved.");
    expect(res.body.data).toHaveLength(6);
    expect(res.body.data[5]).toEqual({ id: "5", code: "5", name: "Five" });
  });

  it("GET /employee-picker pages the proc result in memory", async () => {
    vi.mocked(people.searchPeoplePicker).mockResolvedValue(
      Array.from({ length: 3 }, (_, i) => ({
        EmployeeID: `CC1726E0-BF29-4971-9635-66336855E4E${i}`,
        EmployeeCode: `E${i}`,
        EmployeeName: `Name ${i}`,
        AreaName: null,
        SubAreaName: "Digital",
        PositionCode: null,
        PositionName: "Analyst",
        JobKeyName: null,
        JoinDate: i === 1 ? new Date("2021-01-11T00:00:00Z") : null,
        ManagerName: null,
      })),
    );

    const res = await get(`${BASE}/employee-picker?empName=%20lim%20&searchType=&page=2&pageSize=1`);

    expect(res.body).toEqual({
      status: "success",
      message: "Employee picker results retrieved.",
      data: {
        items: [
          {
            employeeId: "cc1726e0-bf29-4971-9635-66336855e4e1",
            employeeNo: "E1",
            employeeName: "Name 1",
            department: "",
            unitSection: "Digital",
            position: "Analyst",
            positionCode: "",
            joinedDate: "2021-01-11T00:00:00",
            duty: "",
            manager: "",
          },
        ],
        page: 2,
        pageSize: 1,
        totalCount: 3,
      },
    });
    expect(people.searchPeoplePicker).toHaveBeenCalledWith({
      employeeCode: null,
      employeeName: "lim",
      searchType: null,
      currEmployeeId: null,
    });
  });
});

describe("GET /v1/approval-maintenance/:id", () => {
  it("returns the detail DTO with ';'-joined custom approvers", async () => {
    vi.mocked(model.listCustomApproverIds).mockResolvedValue([APPROVER_A, APPROVER_B]);

    const res = await get(`${BASE}/${RULE_ID}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Approval maintenance record retrieved.");
    expect(res.body.data).toEqual({
      ...summary,
      routingId: ROUTING_ID.toLowerCase(),
      currentStatus: "Pending",
      optionalApproval: false,
      yesLabel: "Approve",
      yesActionLogLabel: "Approved",
      yesStatus: "Approved",
      noStatus: "Rejected",
      noLabel: "Reject",
      noActionLogLabel: "Rejected",
      reworkLabel: null,
      reworkActionLogLabel: null,
      reworkStatus: null,
      changeProcessAfter: 99999,
      changeProcessStatus: null,
      endProcessAfter: 99999,
      endProcessStatus: null,
      escalateAfter: 99999,
      escalateTo: null,
      specificApproverIds: `${APPROVER_A.toLowerCase()};${APPROVER_B}`,
    });
  });

  it("returns null specificApproverIds when there are none, and 404 when missing", async () => {
    expect((await get(`${BASE}/${RULE_ID}`)).body.data.specificApproverIds).toBeNull();

    vi.mocked(model.findRuleWithRouting).mockResolvedValue(null);
    const res = await get(`${BASE}/${RULE_ID}`);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ status: "error", message: "Approval maintenance record not found.", data: null });
  });
});

describe("POST /v1/approval-maintenance", () => {
  const post = (body: unknown) => request(app).post(BASE).set(authHeader()).send(body as object);

  it("creates the rule with ESS defaults, trimmed fields and custom approvers", async () => {
    const res = await post(createBody);

    expect(res.status).toBe(201);
    expect(res.body.message).toBe("Approval maintenance record created.");
    expect(res.headers.location).toMatch(/\/v1\/approval-maintenance\/[0-9a-f-]{36}$/);

    const [id, columns, approverIds, actorId] = vi.mocked(model.insertRuleWithApprovers).mock.calls[0];
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(columns).toMatchObject({
      routingId: ROUTING_ID.toLowerCase(),
      approvalTitle: "Manager Approval",
      approvalLevel: 2,
      approvalRole: "IM",
      currentStatus: null,
      optionalApproval: false,
      requiredEveryOneAction: false,
      skipSameApprover: false,
      escalateAfter: 99999,
      changeProcessAfter: 99999,
      endProcessAfter: 99999,
    });
    expect(approverIds).toEqual([APPROVER_A.toLowerCase(), APPROVER_B]);
    expect(actorId).toBe(EMPLOYEE_ID);
    expect(model.availableActionExists).toHaveBeenCalledWith("IM");
    expect(model.findRuleWithRouting).toHaveBeenCalledWith(id);
  });

  it("defaults the level to One when neither approvalLevel nor approvalStep is given", async () => {
    const { approvalStep: _omit, ...body } = createBody;
    await post(body);
    expect(vi.mocked(model.insertRuleWithApprovers).mock.calls[0][1].approvalLevel).toBe(1);
  });

  it("stores a null actor when the token has no employee (no system fallback here)", async () => {
    await request(app).post(BASE).set(authHeader("1", { userName: "svc" })).send(createBody);
    expect(vi.mocked(model.insertRuleWithApprovers).mock.calls[0][3]).toBeNull();
  });

  it("returns ProblemDetails 400 for the implicitly required (non-nullable) strings", async () => {
    const res = await post({ routingId: ROUTING_ID, approvalRole: "   " });
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.errors).sort()).toEqual([
      "ApprovalRole",
      "ApprovalTitle",
      "NoActionLogLabel",
      "NoLabel",
      "YesActionLogLabel",
      "YesLabel",
    ]);
    expect(res.body.errors.ApprovalTitle).toEqual(["The ApprovalTitle field is required."]);
  });

  it("returns ProblemDetails 400 when a non-nullable int is null", async () => {
    const res = await post({ ...createBody, escalateAfter: null });
    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual({ EscalateAfter: ["The JSON value could not be converted to System.Int32."] });
  });

  it.each([
    [{ approvalLevel: 6 }],
    [{ approvalStep: "Six" }],
    [{ approvalStep: "-1" }],
  ])("returns 400 for an out-of-range step %o", async (override) => {
    const res = await post({ ...createBody, ...override });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ status: "error", message: "Approval step must be between 0 and 5.", data: null });
    expect(model.activeRoutingExists).not.toHaveBeenCalled();
  });

  it("returns 404 Routing not found. for a missing or inactive routing", async () => {
    vi.mocked(model.activeRoutingExists).mockResolvedValue(false);
    const res = await post(createBody);
    expect(res.status).toBe(404);
    expect(res.body.message).toBe("Routing not found.");
  });

  it("returns 400 when assign-to is not in a non-empty AvailableAction catalog", async () => {
    vi.mocked(model.availableActionExists).mockResolvedValue(false);
    const res = await post(createBody);
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Assign-to role 'IM' is not valid.");
  });

  it("skips assign-to validation when the AvailableAction catalog is empty", async () => {
    vi.mocked(model.hasAvailableActions).mockResolvedValue(false);
    vi.mocked(model.availableActionExists).mockResolvedValue(false);
    expect((await post(createBody)).status).toBe(201);
  });

  it("returns 400 for an unparseable or unknown custom approver and saves nothing", async () => {
    const bad = await post({ ...createBody, specificApproverIds: "nope" });
    expect(bad.status).toBe(400);
    expect(bad.body.message).toBe("Invalid employee id 'nope'.");

    vi.mocked(people.employeeExists).mockResolvedValue(false);
    const missing = await post(createBody);
    expect(missing.status).toBe(400);
    expect(missing.body.message).toBe(`Employee not found: ${APPROVER_A.toLowerCase()}.`);
    expect(model.insertRuleWithApprovers).not.toHaveBeenCalled();
  });

  it("returns 500 when the created rule cannot be read back", async () => {
    vi.mocked(model.findRuleWithRouting).mockResolvedValue(null);
    const res = await post(createBody);
    expect(res.status).toBe(500);
    expect(res.body.message).toBe("Failed to create approval maintenance record.");
  });
});

describe("PUT /v1/approval-maintenance/:id", () => {
  const put = (body: object) => request(app).put(`${BASE}/${RULE_ID}`).set(authHeader()).send(body);

  it("applies only provided fields, following ESS's null vs blank rules", async () => {
    const res = await put({
      approvalName: "Leave Application",
      activityName: "Manager Approval",
      approvalStep: "Two",
      assignTo: " SP ",
      currentStatus: "",
      yesLabel: "  ",
      noLabel: "Decline",
      reworkStatus: "",
      escalateAfter: 5,
      skipSameApprover: true,
    });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Approval maintenance record updated.");
    const [id, changes, approverIds, actorId] = vi.mocked(model.updateRuleAndApprovers).mock.calls[0];
    expect(id).toBe(rule_id);
    expect(changes).toEqual({
      approvalRole: "SP",
      currentStatus: "",
      noLabel: "Decline",
      reworkStatus: "",
      escalateAfter: 5,
      skipSameApprover: true,
    });
    expect(approverIds).toBeNull();
    expect(actorId).toBe(EMPLOYEE_ID);
  });

  it("replaces custom approvers when specificApproverIds is present, even empty", async () => {
    await put({ specificApproverIds: "" });
    expect(vi.mocked(model.updateRuleAndApprovers).mock.calls[0][2]).toEqual([]);
  });

  it.each([
    [{ routingId: "22222222-2222-3333-4444-555555555555" }, "Approval name cannot be changed after the approval rule is created."],
    [{ approvalName: "Other" }, "Approval name cannot be changed after the approval rule is created."],
    [{ approvalTitle: "Other" }, "Activity name cannot be changed after the approval rule is created."],
    [{ activityName: "manager approval" }, "Activity name cannot be changed after the approval rule is created."],
    [{ approvalLevel: 3 }, "Approval step cannot be changed after the approval rule is created."],
    [{ approvalStep: "nine" }, "Approval step must be between 0 and 5."],
  ])("rejects immutable-field change %o", async (body, message) => {
    const res = await put(body);
    expect(res.status).toBe(400);
    expect(res.body.message).toBe(message);
    expect(model.updateRuleAndApprovers).not.toHaveBeenCalled();
  });

  it("accepts the same routingId in any GUID casing", async () => {
    expect((await put({ routingId: ROUTING_ID.toLowerCase() })).status).toBe(200);
  });

  it("returns 404 when the rule does not exist", async () => {
    vi.mocked(model.findRuleWithRouting).mockResolvedValue(null);
    const res = await put({});
    expect(res.status).toBe(404);
    expect(res.body.message).toBe("Approval maintenance record not found.");
  });

  it("returns 400 for an invalid assign-to without saving", async () => {
    vi.mocked(model.availableActionExists).mockResolvedValue(false);
    const res = await put({ approvalRole: "Nobody" });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Assign-to role 'Nobody' is not valid.");
    expect(model.updateRuleAndApprovers).not.toHaveBeenCalled();
  });
});

describe("DELETE /v1/approval-maintenance/:id", () => {
  const del = () => request(app).delete(`${BASE}/${RULE_ID}`).set(authHeader());

  beforeEach(() => {
    vi.mocked(model.emailTemplateExistsForRule).mockResolvedValue(false);
    vi.mocked(model.taskExistsForRule).mockResolvedValue(false);
  });

  it("deletes the rule and its custom approvers", async () => {
    const res = await del();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "success", message: "Approval maintenance record deleted.", data: null });
    expect(model.deleteRuleAndApprovers).toHaveBeenCalledWith(rule_id);
  });

  it("returns 404 when missing", async () => {
    vi.mocked(model.findRuleWithRouting).mockResolvedValue(null);
    expect((await del()).status).toBe(404);
  });

  it("returns 409 when notification templates or tasks reference the rule", async () => {
    vi.mocked(model.emailTemplateExistsForRule).mockResolvedValue(true);
    const templates = await del();
    expect(templates.status).toBe(409);
    expect(templates.body.message).toBe(
      "Routing rule cannot be deleted because notification templates are linked to it.",
    );

    vi.mocked(model.emailTemplateExistsForRule).mockResolvedValue(false);
    vi.mocked(model.taskExistsForRule).mockResolvedValue(true);
    const tasks = await del();
    expect(tasks.status).toBe(409);
    expect(tasks.body.message).toBe("Routing rule cannot be deleted because active routing tasks reference it.");
    expect(model.deleteRuleAndApprovers).not.toHaveBeenCalled();
  });
});
