import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/services/routingManagement/routingManagementService.js", () => ({
  getUserAllowActionAsync: vi.fn(),
  getMyIntraySummaryAsync: vi.fn(),
  getTaskDetailsByIDAsync: vi.fn(),
  updateRoutingAsync: vi.fn(),
  getMyApprovalHistoryAsync: vi.fn(),
  taskReAssignAsync: vi.fn(),
  restartRoutingAsync: vi.fn(),
}));

// essCurrentUser (mounted on /v1) reads SharePointDBEss through a generated Prisma client.
vi.mock("../src/models/spGroup.js", () => ({ isSharePointGroupMember: vi.fn() }));

import * as service from "../src/services/routingManagement/routingManagementService.js";
import { isSharePointGroupMember } from "../src/models/spGroup.js";
import { essJsonBody } from "../src/middleware/essJsonBody.js";
import { v1Router } from "../src/routes/v1.js";
import { authHeader } from "./helpers.js";

// The /v1 wiring of src/app.ts, without the Prisma-backed /api routers.
const app = express();
app.use(["/v1", "/v1.0"], essJsonBody);
app.use(express.json());
app.use(["/v1", "/v1.0"], v1Router);

const SOURCE = "c69f618d-8314-44f1-96c5-d8161ab267e2";
const EMPLOYEE = "58308791-89fb-45d1-8a9e-72e430f8e677";
const get = (path: string) => request(app).get(path).set(authHeader());

describe("/v1/routingmanagement HTTP contract", () => {
  beforeEach(() => {
    vi.mocked(service.getUserAllowActionAsync).mockReset();
    vi.mocked(service.getMyIntraySummaryAsync).mockReset();
    vi.mocked(service.getTaskDetailsByIDAsync).mockReset();
    vi.mocked(service.updateRoutingAsync).mockReset();
    vi.mocked(service.getMyApprovalHistoryAsync).mockReset();
  });

  it("returns ApiResponse with System.Text.Json camelCase keys and the api-supported-versions header", async () => {
    vi.mocked(service.getUserAllowActionAsync).mockResolvedValue([
      {
        CanAgree: "1",
        CanApprove: "0",
        CanDecline: "1",
        CanAcknowledge: "0",
        CanSubmit: "0",
        CanWithdraw: "0",
        CanCancel: "0",
        CanReceive: "0",
        CanProcess: "0",
        CanRecommend: "0",
        CanEndorse: "0",
        CanVerify: "0",
        CanRework: "0",
        CanProcessMemo: "0",
        CanAgreeCancel: "0",
      },
    ]);

    const res = await get(`/v1/routingmanagement/allow-actions?SOURCEID=${SOURCE.toUpperCase()}&employeeId=${EMPLOYEE}`);

    expect(res.status).toBe(200);
    expect(res.headers["api-supported-versions"]).toBe("1.0");
    expect(res.body.status).toBe("success");
    expect(res.body.message).toBe("data retrieved.");
    expect(res.body.data[0]).toMatchObject({ canAgree: "1", canDecline: "1", canAgreeCancel: "0" });
    expect(service.getUserAllowActionAsync).toHaveBeenCalledWith(SOURCE, EMPLOYEE, "");
  });

  it("returns the controller's ApiResponse 400 for a missing value", async () => {
    const res = await get(`/v1/routingmanagement/allow-actions?employeeId=${EMPLOYEE}`);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ status: "error", message: "sourceId is required.", data: null });
  });

  it("returns ProblemDetails (no version header) when a query value cannot bind", async () => {
    const res = await get(`/v1/routingmanagement/allow-actions?sourceId=nope&employeeId=bad`);
    expect(res.status).toBe(400);
    expect(res.headers["api-supported-versions"]).toBeUndefined();
    expect(res.body.errors).toEqual({
      sourceId: ["The value 'nope' is not valid for sourceId."],
      employeeId: ["The value 'bad' is not valid for employeeId."],
    });
  });

  it("does not resolve the current user (no SharePoint lookup for X-Act-As-Employee-Id)", async () => {
    vi.mocked(service.getMyIntraySummaryAsync).mockResolvedValue([]);
    const res = await get(`/v1/routingmanagement/getmyintraysummary?employeeId=${EMPLOYEE}`).set("X-Act-As-Employee-Id", SOURCE);
    expect(res.status).toBe(200);
    expect(isSharePointGroupMember).not.toHaveBeenCalled();
  });

  it("serves /v1.0 as well as /v1", async () => {
    vi.mocked(service.getMyIntraySummaryAsync).mockResolvedValue([SOURCE]);
    const res = await get(`/v1.0/routingmanagement/getmyintraysummary?employeeId=${EMPLOYEE}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([SOURCE]);
  });

  it("answers a wrong method with an empty 405 and Allow", async () => {
    const res = await request(app).delete("/v1/routingmanagement/allow-actions").set(authHeader());
    expect(res.status).toBe(405);
    expect(res.headers.allow).toBe("GET");
    expect(res.text).toBe("");
  });

  it("answers an unknown path with an empty 404, after authentication", async () => {
    expect((await request(app).get("/v1/nothing-here")).status).toBe(401);
    const res = await get("/v1/nothing-here");
    expect(res.status).toBe(404);
    expect(res.text).toBe("");
  });

  it("returns 404 ApiResponse when the task does not exist, ProblemDetails when the id is not a Guid", async () => {
    vi.mocked(service.getTaskDetailsByIDAsync).mockResolvedValue(null);
    expect((await get(`/v1/routingmanagement/task/${SOURCE}`)).body).toEqual({ status: "error", message: "Task not found.", data: null });

    const bad = await get("/v1/routingmanagement/task/xyz");
    expect(bad.status).toBe(400);
    expect(bad.body.errors).toEqual({ id: ["The value 'xyz' is not valid for id."] });
  });

  it("validates getmyapprovalhistory in the controller's order", async () => {
    const both = await get(`/v1/routingmanagement/getmyapprovalhistory?employeeId=${EMPLOYEE}&dateFrom=2026-07-01`);
    expect(both.body.message).toBe("Both dateFrom and dateTo must be provided together.");

    const order = await get(`/v1/routingmanagement/getmyapprovalhistory?employeeId=${EMPLOYEE}&dateFrom=2026-07-02&dateTo=2026-07-01`);
    expect(order.body.message).toBe("dateFrom must be earlier than or equal to dateTo.");

    const noApplication = await get(`/v1/routingmanagement/getmyapprovalhistory?employeeId=${EMPLOYEE}&dateFrom=2026-07-01&dateTo=2026-07-02`);
    expect(noApplication.body.message).toBe("applicationId is required when dateFrom and dateTo are provided.");
  });

  describe("perform-action body binding", () => {
    const post = (body?: string, contentType = "application/json") => {
      const call = request(app).post("/v1/routingmanagement/perform-action").set(authHeader());
      if (contentType) call.set("Content-Type", contentType);
      return body === undefined ? call : call.send(body);
    };

    it("answers 415 without a JSON content type", async () => {
      const res = await request(app).post("/v1/routingmanagement/perform-action").set(authHeader()).set("Content-Type", "text/plain").send("x");
      expect(res.status).toBe(415);
      expect(res.body).toMatchObject({ title: "Unsupported Media Type", status: 415 });
    });

    it("requires a non-empty body", async () => {
      const res = await post();
      expect(res.status).toBe(400);
      expect(res.body.errors).toEqual({
        "": ["A non-empty request body is required."],
        request: ["The request field is required."],
      });
    });

    it("reports the first conversion error with its path and position", async () => {
      const res = await post('{"taskId":"x"}');
      expect(res.status).toBe(400);
      expect(res.body.errors).toEqual({
        "$.taskId": ["The JSON value could not be converted to System.Guid. Path: $.taskId | LineNumber: 0 | BytePositionInLine: 13."],
        request: ["The request field is required."],
      });
    });

    it("applies the implicit [Required] of non-nullable strings, nested ones included", async () => {
      const res = await post("{}");
      expect(res.status).toBe(400);
      expect(res.body.errors.ActionerId).toEqual(["The ActionerId field is required."]);
      expect(res.body.errors.ApproverAction).toEqual(["The ApproverAction field is required."]);
      expect(res.body.errors["AppInfo.ReferenceNo"]).toEqual(["The ReferenceNo field is required."]);
      expect(service.updateRoutingAsync).not.toHaveBeenCalled();
    });

    it("binds case-insensitively and passes values through to UpdateRouting", async () => {
      vi.mocked(service.updateRoutingAsync).mockResolvedValue({
        Result: true,
        ErrMessage: "",
        RoutingCreated: true,
        RoutingRuleCreated: true,
        EmailEnabled: false,
        EmailSent: false,
        ApproverFound: true,
        Status: "",
        CurrentStageCompleted: true,
        NextApprovalLevel: 2,
        NextRoutingRuleID: SOURCE,
        NextYesStatus: "Approved",
        NextNoStatus: "",
      });
      const appInfo = Object.fromEntries(
        [
          "ReferenceNo",
          "ApplicantDisplayName",
          "RequestorDisplayName",
          "ApplicationURL",
          "ApproverDisplayName",
          "Comment",
          ...Array.from({ length: 20 }, (_, i) => `DisplayText${i + 1}`),
          ...Array.from({ length: 6 }, (_, i) => `DisplayImage${i + 1}`),
        ].map((name) => [name.toLowerCase(), "x"]),
      );
      const res = await post(
        JSON.stringify({ ACTIONERID: EMPLOYEE, approverAction: "Agreed", activityAction: "Agreed", requestAction: "0", taskId: SOURCE, appInfo }),
      );
      expect(res.status).toBe(200);
      expect(res.body.message).toBe("Action processed.");
      expect(res.body.data).toMatchObject({ result: true, nextRoutingRuleID: SOURCE, nextNoStatus: "" });
      const args = vi.mocked(service.updateRoutingAsync).mock.calls[0];
      expect(args[0]).toBe(EMPLOYEE);
      expect(args[5]).toBe(SOURCE);
      expect(args[11]).toBe(0);
      expect(args[13]).toMatchObject({ ReferenceNo: "x", Remove: 1, OptionalApproverID1: "00000000-0000-0000-0000-000000000000" });
    });
  });
});
