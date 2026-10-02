import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { authHeader, EMPLOYEE_ID } from "../helpers.js";

vi.mock("../../src/models/maintenance/notificationMaintenance.js", () => ({
  searchEmailTemplates: vi.fn(),
  findEmailTemplateView: vi.fn(),
  listAvailableActions: vi.fn(),
  listRoutingRuleLookups: vi.fn(),
  routingRuleExists: vi.fn(),
  findEmailTemplate: vi.fn(),
  emailTemplateTypeExists: vi.fn(),
  insertEmailTemplate: vi.fn(),
  updateEmailTemplate: vi.fn(),
  deleteEmailTemplate: vi.fn(),
}));
vi.mock("../../src/models/spGroup.js", () => ({ isSharePointGroupMember: vi.fn() }));

import * as model from "../../src/models/maintenance/notificationMaintenance.js";
import { app } from "../../src/app.js";

const BASE = "/v1/notification-maintenance";
const TEMPLATE_ID = "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE";
const RULE_ID = "11111111-2222-3333-4444-555555555555";

const viewRow = {
  EmailTemplateID: TEMPLATE_ID,
  RoutingName: "Leave Application",
  ApprovalTitle: "Manager Approval",
  NotificationType: "Approval",
  Subject: "Please approve",
  EmailTo: "Approver",
  EmailCC: null,
  EmailBCC: "Applicant",
  ContentTemplate: "<p>Hi</p>",
  SendEmail: true,
};

const dto = {
  id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  approvalName: "Leave Application",
  activityName: "Manager Approval",
  notificationType: "Approval",
  subject: "Please approve",
  assignTo: "Approver",
  cc: "",
  bcc: "Applicant",
  bodyMessage: "<p>Hi</p>",
  enableNotification: true,
};

const createBody = {
  routingRuleId: RULE_ID,
  notificationType: " Approval ",
  subject: " Please approve ",
  assignTo: " Approver ",
  bcc: " Applicant ",
  bodyMessage: "<p>Hi</p>",
};

const get = (path: string) => request(app).get(path).set(authHeader());

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /v1/notification-maintenance", () => {
  it("requires authentication", async () => {
    const res = await request(app).get(BASE);
    // ESS's JwtBearer challenge: empty body + WWW-Authenticate.
    expect(res.status).toBe(401);
    expect(res.headers["www-authenticate"]).toBe("Bearer");
    expect(res.text).toBe("");
  });

  it("returns a paged result in the ESS shape", async () => {
    vi.mocked(model.searchEmailTemplates).mockResolvedValue([{ ...viewRow, TotalCount: 42 }]);

    const res = await get(`${BASE}?approvalName=%20leave%20&subject=&routingId=${RULE_ID.toLowerCase()}&page=2&pageSize=5`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      status: "success",
      message: "Notification Maintenance retrieved.",
      data: { items: [dto], page: 2, pageSize: 5, totalCount: 42 },
    });
    expect(model.searchEmailTemplates).toHaveBeenCalledWith({
      routingId: RULE_ID.toLowerCase(),
      routingRuleId: null,
      approvalName: "leave",
      activityName: null,
      subject: null,
      offset: 5,
      pageSize: 5,
    });
  });

  it("supports legacy _page/_limit, defaults, and clamps pageSize at 500", async () => {
    vi.mocked(model.searchEmailTemplates).mockResolvedValue([]);

    expect((await get(BASE)).body.data).toEqual({ items: [], page: 1, pageSize: 10, totalCount: 0 });
    expect((await get(`${BASE}?_page=3&_limit=20`)).body.data).toMatchObject({ page: 3, pageSize: 20 });
    expect((await get(`${BASE}?pageSize=9999`)).body.data).toMatchObject({ pageSize: 500 });
  });

  it("rejects page < 1 and a non-GUID routingId", async () => {
    const page = await get(`${BASE}?page=0`);
    expect(page.status).toBe(400);
    expect(page.body.message).toBe("Page must be >= 1.");

    const guid = await get(`${BASE}?routingId=abc`);
    expect(guid.status).toBe(400);
    // ModelState key = the C# action parameter name ([FromQuery] Guid? routingId).
    expect(guid.body.errors).toEqual({ routingId: ["The value 'abc' is not valid for routingId."] });
  });
});

describe("dropdowns", () => {
  it("GET /routing-rule-ddl maps rules, optionally filtered by routingId", async () => {
    vi.mocked(model.listRoutingRuleLookups).mockResolvedValue([
      { id: RULE_ID, approvalTitle: "Manager Approval", routing: { routingName: "Leave Application" } },
    ]);

    const res = await get(`${BASE}/routing-rule-ddl?routingId=${RULE_ID}`);

    expect(res.body).toEqual({
      status: "success",
      message: "Routing rules retrieved.",
      data: [{ id: RULE_ID.toLowerCase(), approvalName: "Leave Application", activityName: "Manager Approval" }],
    });
    expect(model.listRoutingRuleLookups).toHaveBeenCalledWith(RULE_ID.toLowerCase());
  });

  it("GET /assign-to-ddl falls back to ActionName when ActionType is null", async () => {
    vi.mocked(model.listAvailableActions).mockResolvedValue([
      { ActionName: "Approver", ActionType: "Current Approver" },
      { ActionName: "Applicant", ActionType: null },
    ]);

    const res = await get(`${BASE}/assign-to-ddl`);

    expect(res.body).toEqual({
      status: "success",
      message: "Assign-to dropdown retrieved.",
      data: [
        { id: "Approver", code: "Approver", name: "Current Approver" },
        { id: "Applicant", code: "Applicant", name: "Applicant" },
      ],
    });
  });
});

describe("GET /v1/notification-maintenance/:id", () => {
  it("returns the template from the GetEmailTemplate view", async () => {
    vi.mocked(model.findEmailTemplateView).mockResolvedValue(viewRow);
    const res = await get(`${BASE}/${TEMPLATE_ID}`);
    expect(res.body).toEqual({ status: "success", message: "Notification template retrieved.", data: dto });
    expect(model.findEmailTemplateView).toHaveBeenCalledWith(TEMPLATE_ID.toLowerCase());
  });

  it("returns 404 when not found", async () => {
    vi.mocked(model.findEmailTemplateView).mockResolvedValue(null);
    const res = await get(`${BASE}/${TEMPLATE_ID}`);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ status: "error", message: "Notification template not found.", data: null });
  });

  it("does not match a non-GUID id (route constraint)", async () => {
    const res = await get(`${BASE}/not-a-guid`);
    expect(res.status).toBe(404);
    expect(model.findEmailTemplateView).not.toHaveBeenCalled();
  });
});

describe("POST /v1/notification-maintenance", () => {
  const post = (body: unknown) => request(app).post(BASE).set(authHeader()).send(body as object);

  beforeEach(() => {
    vi.mocked(model.routingRuleExists).mockResolvedValue(true);
    vi.mocked(model.emailTemplateTypeExists).mockResolvedValue(false);
    vi.mocked(model.findEmailTemplateView).mockResolvedValue(viewRow);
  });

  it("creates a template with trimmed fields, ESS defaults and the current employee as actor", async () => {
    const res = await post(createBody);

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ status: "success", message: "Notification template created.", data: dto });
    expect(res.headers.location).toMatch(/\/v1\/notification-maintenance\/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee$/);

    expect(model.emailTemplateTypeExists).toHaveBeenCalledWith(RULE_ID.toLowerCase(), "Approval");
    const inserted = vi.mocked(model.insertEmailTemplate).mock.calls[0][0];
    expect(inserted).toMatchObject({
      routingRuleId: RULE_ID.toLowerCase(),
      sendEmail: true,
      isHtmlBody: true,
      notificationType: "Approval",
      subject: "Please approve",
      emailTo: "Approver",
      emailCc: null,
      emailBcc: "Applicant",
      contentTemplate: "<p>Hi</p>",
      actorId: EMPLOYEE_ID,
    });
    expect(inserted.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(model.findEmailTemplateView).toHaveBeenCalledWith(inserted.id);
  });

  it("accepts PascalCase property names like ASP.NET", async () => {
    const res = await post({ RoutingRuleId: RULE_ID, NotificationType: "A", Subject: "S", AssignTo: "T", BodyMessage: "B", EnableNotification: false });
    expect(res.status).toBe(201);
    expect(vi.mocked(model.insertEmailTemplate).mock.calls[0][0]).toMatchObject({ sendEmail: false });
  });

  it("uses the system actor when the token has no employee", async () => {
    await request(app).post(BASE).set(authHeader("1", { userName: "svc" })).send(createBody);
    expect(vi.mocked(model.insertEmailTemplate).mock.calls[0][0].actorId).toBe("00000000-0000-0000-0000-000000000001");
  });

  it("returns 404 when the routing rule does not exist (missing id => Guid.Empty)", async () => {
    vi.mocked(model.routingRuleExists).mockResolvedValue(false);
    const { routingRuleId: _omit, ...withoutRule } = createBody;

    const res = await post(withoutRule);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ status: "error", message: "Routing rule not found.", data: null });
    expect(model.routingRuleExists).toHaveBeenCalledWith("00000000-0000-0000-0000-000000000000");
  });

  it("returns 409 for a duplicate notification type on the same activity", async () => {
    vi.mocked(model.emailTemplateTypeExists).mockResolvedValue(true);
    const res = await post(createBody);
    expect(res.status).toBe(409);
    expect(res.body.message).toBe(
      "A notification template with the same notification type already exists for this activity.",
    );
    expect(model.insertEmailTemplate).not.toHaveBeenCalled();
  });

  it("returns 500 when the created row is not visible through the view", async () => {
    vi.mocked(model.findEmailTemplateView).mockResolvedValue(null);
    const res = await post(createBody);
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ status: "error", message: "Failed to create notification template.", data: null });
  });

  it("returns ProblemDetails 400 for data-annotation failures", async () => {
    const res = await post({ ...createBody, notificationType: "x".repeat(51), subject: "   ", assignTo: null, routingRuleId: "bad" });

    expect(res.status).toBe(400);
    expect(res.body.title).toBe("One or more validation errors occurred.");
    expect(res.body.errors).toEqual({
      RoutingRuleId: ["The JSON value could not be converted to System.Guid."],
      NotificationType: ["The field NotificationType must be a string or array type with a maximum length of '50'."],
      Subject: ["The Subject field is required."],
      AssignTo: ["The AssignTo field is required."],
    });
    expect(model.routingRuleExists).not.toHaveBeenCalled();
  });

  it("returns ProblemDetails 400 for an empty body", async () => {
    const res = await request(app).post(BASE).set(authHeader());
    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual({ "": ["A non-empty request body is required."] });
  });
});

describe("PUT /v1/notification-maintenance/:id", () => {
  const put = (body: object) => request(app).put(`${BASE}/${TEMPLATE_ID}`).set(authHeader()).send(body);
  const updateBody = {
    notificationType: "Reminder",
    subject: "S",
    assignTo: "T",
    cc: " boss ",
    bodyMessage: "B",
    approvalName: "ignored",
  };

  beforeEach(() => {
    vi.mocked(model.findEmailTemplate).mockResolvedValue({ id: TEMPLATE_ID, routingRuleId: RULE_ID });
    vi.mocked(model.emailTemplateTypeExists).mockResolvedValue(false);
    vi.mocked(model.findEmailTemplateView).mockResolvedValue(viewRow);
  });

  it("updates the template; enableNotification defaults to false on update", async () => {
    const res = await put(updateBody);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "success", message: "Notification template updated.", data: dto });
    expect(model.emailTemplateTypeExists).toHaveBeenCalledWith(RULE_ID, "Reminder", TEMPLATE_ID.toLowerCase());
    expect(model.updateEmailTemplate).toHaveBeenCalledWith(
      TEMPLATE_ID.toLowerCase(),
      expect.objectContaining({ sendEmail: false, isHtmlBody: true, emailCc: "boss", emailBcc: null, actorId: EMPLOYEE_ID }),
    );
  });

  it("returns 404 when the template does not exist", async () => {
    vi.mocked(model.findEmailTemplate).mockResolvedValue(null);
    const res = await put(updateBody);
    expect(res.status).toBe(404);
    expect(res.body.message).toBe("Notification template not found.");
  });

  it("returns 409 when another template on the activity has that type", async () => {
    vi.mocked(model.emailTemplateTypeExists).mockResolvedValue(true);
    const res = await put(updateBody);
    expect(res.status).toBe(409);
    expect(model.updateEmailTemplate).not.toHaveBeenCalled();
  });

  it("returns 500 when the updated row is not visible through the view", async () => {
    vi.mocked(model.findEmailTemplateView).mockResolvedValue(null);
    const res = await put(updateBody);
    expect(res.status).toBe(500);
    expect(res.body.message).toBe("Failed to update notification template.");
  });

  it("validates the body before looking up the template", async () => {
    const res = await put({ subject: "S" });
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.errors).sort()).toEqual(["AssignTo", "BodyMessage", "NotificationType"]);
    expect(model.findEmailTemplate).not.toHaveBeenCalled();
  });
});

describe("DELETE /v1/notification-maintenance/:id", () => {
  it("deletes the template", async () => {
    vi.mocked(model.findEmailTemplate).mockResolvedValue({ id: TEMPLATE_ID, routingRuleId: RULE_ID });
    const res = await request(app).delete(`${BASE}/${TEMPLATE_ID}`).set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "success", message: "Notification template deleted.", data: null });
    expect(model.deleteEmailTemplate).toHaveBeenCalledWith(TEMPLATE_ID.toLowerCase());
  });

  it("returns 404 when the template does not exist", async () => {
    vi.mocked(model.findEmailTemplate).mockResolvedValue(null);
    const res = await request(app).delete(`${BASE}/${TEMPLATE_ID}`).set(authHeader());
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ status: "error", message: "Notification template not found.", data: null });
    expect(model.deleteEmailTemplate).not.toHaveBeenCalled();
  });
});
