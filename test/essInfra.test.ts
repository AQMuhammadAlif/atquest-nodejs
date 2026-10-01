import express, { Router } from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { requireAuth } from "../src/middleware/auth.js";
import { essCurrentUser } from "../src/middleware/essCurrentUser.js";
import { essErrorHandler } from "../src/middleware/essErrors.js";
import { asyncHandler } from "../src/utils/asyncHandler.js";
import { HttpError } from "../src/utils/errors.js";
import { toEssDate, toEssGuid } from "../src/utils/essFormat.js";
import {
  guidParam,
  MAINTENANCE_MAX_PAGE_SIZE,
  parseGuid,
  queryBool,
  queryGuid,
  queryInt,
  queryString,
  resolvePaging,
} from "../src/utils/essRequest.js";
import { essCreated, essOk } from "../src/utils/essResponse.js";
import { parseEssBody } from "../src/utils/essValidation.js";
import { authHeader } from "./helpers.js";

function buildApp() {
  const router = Router();
  router.use(requireAuth, essCurrentUser);

  router.get("/me", (req, res) => essOk(res, { employeeId: req.employeeId, isEssAdmin: req.isEssAdmin }, "data retrieved."));
  router.get("/query", (req, res) =>
    essOk(
      res,
      {
        name: queryString(req, "name") ?? null,
        count: queryInt(req, "count") ?? null,
        id: queryGuid(req, "id") ?? null,
        active: queryBool(req, "active") ?? null,
      },
      "ok",
    ),
  );
  router.get("/paged", (req, res) =>
    essOk(
      res,
      resolvePaging(
        {
          page: queryInt(req, "page"),
          pageSize: queryInt(req, "pageSize"),
          legacyPage: queryInt(req, "_page"),
          legacyPageSize: queryInt(req, "_limit"),
        },
        MAINTENANCE_MAX_PAGE_SIZE,
      ),
      "ok",
    ),
  );
  router.get("/items/lookup", (_req, res) => essOk(res, "lookup", "ok"));
  router.get("/items/:id", guidParam("id"), (req, res) => essOk(res, req.params.id, "ok"));
  router.post("/items", (req, res) => {
    const body = parseEssBody(z.object({ roleId: z.string(), members: z.array(z.object({ employeeId: z.string() })) }), req.body);
    essCreated(res, body, "created.", "/v1/items/1");
  });
  router.get("/not-found", asyncHandler(async () => {
    throw new HttpError(404, "Thing not found.");
  }));
  router.get("/boom", asyncHandler(async () => {
    throw new Error("kaboom");
  }));
  router.use(essErrorHandler);

  const app = express();
  app.use(express.json());
  app.use("/v1", router);
  app.use((_req, res) => {
    res.status(404).json({ fallthrough: true });
  });
  return app;
}

const app = buildApp();
const get = (path: string) => request(app).get(path).set(authHeader());

describe("ESS contract infrastructure", () => {
  it("returns the ESS ApiResponse shape on 401 from requireAuth", async () => {
    const res = await request(app).get("/v1/me");
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ status: "error", message: "Unauthorized", data: null });
  });

  it("exposes the placeholder identity, lowercased", async () => {
    const res = await get("/v1/me");
    expect(res.body).toEqual({
      status: "success",
      message: "data retrieved.",
      data: { employeeId: "58308791-89fb-45d1-8a9e-72e430f8e677", isEssAdmin: true },
    });
  });

  it("binds query params case-insensitively, first value wins, empty => null", async () => {
    const res = await get("/v1/query?NAME=a&name=b&Count=5&id={58308791-89FB-45D1-8A9E-72E430F8E677}&active=");
    expect(res.body.data).toEqual({ name: "a", count: 5, id: "58308791-89fb-45d1-8a9e-72e430f8e677", active: null });
  });

  it.each([
    ["count=abc", "Count", "The value 'abc' is not valid for Count."],
    ["count=99999999999", "Count", "The value '99999999999' is not valid for Count."],
    ["id=nope", "Id", "The value 'nope' is not valid for Id."],
    ["active=yes", "Active", "The value 'yes' is not valid for Active."],
  ])("returns ProblemDetails 400 for unbindable %s", async (qs, key, message) => {
    const res = await get(`/v1/query?${qs}`);
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ title: "One or more validation errors occurred.", status: 400, errors: { [key]: [message] } });
  });

  it("resolves paging with defaults, legacy params and clamping", async () => {
    expect((await get("/v1/paged")).body.data).toEqual({ page: 1, pageSize: 10 });
    expect((await get("/v1/paged?_page=3&_limit=20")).body.data).toEqual({ page: 3, pageSize: 20 });
    expect((await get("/v1/paged?page=2&_page=3&pageSize=9999")).body.data).toEqual({ page: 2, pageSize: 500 });
  });

  it.each([
    ["page=0", "Page must be >= 1."],
    ["pageSize=0", "PageSize must be >= 1."],
  ])("rejects %s with an ESS 400", async (qs, message) => {
    const res = await get(`/v1/paged?${qs}`);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ status: "error", message, data: null });
  });

  it("matches GUID routes only for GUIDs, like {id:guid}", async () => {
    expect((await get("/v1/items/58308791-89FB-45D1-8A9E-72E430F8E677")).body.data).toBe("58308791-89fb-45d1-8a9e-72e430f8e677");
    expect((await get("/v1/items/lookup")).body.data).toBe("lookup");
    const miss = await get("/v1/items/123");
    expect(miss.status).toBe(404);
    expect(miss.body).toEqual({ fallthrough: true });
  });

  it("binds JSON bodies case-insensitively and sets Location on 201", async () => {
    const res = await request(app)
      .post("/v1/items")
      .set(authHeader())
      .send({ RoleId: "r", MEMBERS: [{ EmployeeID: "e" }] });
    expect(res.status).toBe(201);
    expect(res.headers.location).toBe("/v1/items/1");
    expect(res.body.data).toEqual({ roleId: "r", members: [{ employeeId: "e" }] });
  });

  it("returns ProblemDetails 400 for invalid bodies", async () => {
    const res = await request(app).post("/v1/items").set(authHeader()).send({ members: [{}] });
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.errors).sort()).toEqual(["Members[0].EmployeeId", "RoleId"]);
  });

  it("maps HttpError to ApiResponse.Fail", async () => {
    const res = await get("/v1/not-found");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ status: "error", message: "Thing not found.", data: null });
  });

  it("maps unexpected errors to the GlobalExceptionMiddleware body", async () => {
    const res = await get("/v1/boom");
    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ status: "error", message: "kaboom", data: null, traceId: expect.any(String) });
    expect(res.body.error.type).toBe("Error");
  });
});

describe("ESS serialization helpers", () => {
  it("formats dates like .NET DateTime (Kind=Unspecified)", () => {
    expect(toEssDate(new Date("2026-07-28T12:15:00.000Z"))).toBe("2026-07-28T12:15:00");
    expect(toEssDate(new Date("2026-07-28T12:15:00.120Z"))).toBe("2026-07-28T12:15:00.12");
    expect(toEssDate(null)).toBeNull();
  });

  it("lowercases GUIDs and parses .NET GUID formats", () => {
    expect(toEssGuid("ABC")).toBe("abc");
    expect(parseGuid("5830879189FB45D18A9E72E430F8E677")).toBe("58308791-89fb-45d1-8a9e-72e430f8e677");
    expect(parseGuid("(58308791-89fb-45d1-8a9e-72e430f8e677)")).toBe("58308791-89fb-45d1-8a9e-72e430f8e677");
    expect(parseGuid("not-a-guid")).toBeNull();
  });
});
