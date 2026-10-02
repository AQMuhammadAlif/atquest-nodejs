import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/models/routingManagement/routingManagement.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/models/routingManagement/routingManagement.js")>();
  return {
    ...actual,
    firstActiveRouting: vi.fn(),
    firstRoutingRuleByLevel: vi.fn(),
    selectApproversByRole: vi.fn(),
    selectApproversBySource: vi.fn(),
    selectEmailTemplates: vi.fn(),
    selectEmailTemplatesByType: vi.fn(),
    firstTaskHistory: vi.fn(),
    persistRoutingChanges: vi.fn(),
    execRoutingRestartInsert: vi.fn(),
    execRoutingLogInsert: vi.fn(),
    selectTasksBySourceLevel: vi.fn(),
    selectCurrentTasksBySource: vi.fn(),
    anyOwnedCurrentTask: vi.fn(),
    firstTaskById: vi.fn(),
    firstRoutingRuleCurrentStatus: vi.fn(),
    firstApplicationName: vi.fn(),
  };
});

import * as model from "../src/models/routingManagement/routingManagement.js";
import type { RoutingRule, RoutingTask } from "../src/models/routingManagement/routingManagement.js";
import { read, translateSqlError } from "../src/models/essSql.js";
import { routingDb, runWithRoutingDb } from "../src/models/routingManagement/routingDbContext.js";
import * as service from "../src/services/routingManagement/routingManagementService.js";
import { EMPTY_GUID, NetException } from "../src/utils/essDotnet.js";

const SOURCE = "c69f618d-8314-44f1-96c5-d8161ab267e2";
const ACTIONER = "58308791-89fb-45d1-8a9e-72e430f8e677";
const RULE = "11111111-1111-1111-1111-111111111111";
const ROUTING = "22222222-2222-2222-2222-222222222222";
const TASK = "33333333-3333-3333-3333-333333333333";

function task(overrides: Partial<RoutingTask> = {}): RoutingTask {
  const base: Record<string, unknown> = {
    ID: TASK,
    RoutingRuleID: RULE,
    SourceID: SOURCE,
    ApplicationID: SOURCE,
    ApplicantID: ACTIONER,
    ApprovalTitle: "Approval",
    ApplicationRefNo: "REF",
  };
  for (let i = 1; i <= 20; i++) base[`DisplayText${i}`] = null;
  Object.assign(base, {
    ApprovalLevel: 1,
    CurrentApproval: true,
    ApproverID: ACTIONER,
    ApproverAction: null,
    Comment: null,
    SkipApproval: null,
    CreatedDate: null,
    ModifiedDate: null,
    CreatedBy: null,
    ModifiedBy: null,
  });
  return { ...(base as RoutingTask), ...overrides };
}

function rule(overrides: Partial<RoutingRule> = {}): RoutingRule {
  return {
    ID: RULE,
    RoutingID: ROUTING,
    ApprovalTitle: "Level 1",
    ApprovalLevel: 1,
    ApprovalRole: "IM",
    CurrentStatus: "Pending",
    OptionalApproval: false,
    RequiredEveryOneAction: false,
    YesLabel: "Agree",
    YesActionLogLabel: "Agreed",
    YesStatus: "Agreed",
    NoStatus: "Declined",
    NoLabel: "Decline",
    NoActionLogLabel: "Declined",
    ReworkLabel: null,
    ReworkActionLogLabel: null,
    ReworkStatus: null,
    ChangeProcessAfter: null,
    ChangeProcessStatus: null,
    EndProcessAfter: null,
    EndProcessStatus: null,
    EscalateAfter: null,
    EscalateTo: null,
    SkipSameApprover: false,
    CreatedDate: null,
    ModifiedDate: null,
    CreatedBy: null,
    ModifiedBy: null,
    ...overrides,
  };
}

const startArgs = () =>
  [ACTIONER, ROUTING, SOURCE, ROUTING, ROUTING, SOURCE, ACTIONER, ACTIONER, model.newApplicationInfo()] as const;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(model.selectEmailTemplates).mockResolvedValue([]);
  vi.mocked(model.persistRoutingChanges).mockResolvedValue();
});

describe("EF Core materialization", () => {
  it("throws Data is Null for a NULL in a non-nullable column", () => {
    expect(() => read.string({ ApproverEmail: null }, "ApproverEmail")).toThrow(
      "Data is Null. This method or property cannot be called on Null values.",
    );
    expect(read.stringOrNull({ ApproverEmail: null }, "ApproverEmail")).toBeNull();
  });

  it("surfaces SQL Server's message from a Prisma raw-query error, like SqlException", () => {
    const prismaError = Object.assign(new Error("Raw query failed. Code: `8169`. Message: `Conversion failed when converting from a character string to uniqueidentifier.`"), {
      name: "PrismaClientKnownRequestError",
      code: "P2010",
      meta: { code: "8169", message: "Conversion failed when converting from a character string to uniqueidentifier." },
    });
    const translated = translateSqlError(prismaError) as Error;
    expect(translated.name).toBe("Microsoft.Data.SqlClient.SqlException");
    expect(translated.message).toBe("Conversion failed when converting from a character string to uniqueidentifier.");
  });

  it("requires every mapped column", () => {
    expect(() => read.string({}, "ApproverEmail")).toThrow(
      "The required column 'ApproverEmail' was not present in the results of a 'FromSql' operation.",
    );
  });
});

describe("SEPRoutingManagementDbContext unit of work", () => {
  it("returns the tracked instance for a re-queried row and saves only changed columns", async () => {
    vi.mocked(model.selectTasksBySourceLevel).mockImplementation(async () => [task()]);

    await runWithRoutingDb(async () => {
      const db = routingDb();
      const [first] = await db.trackTasks(() => model.selectTasksBySourceLevel(SOURCE, 1));
      first.CurrentApproval = false;

      const [again] = await db.trackTasks(() => model.selectTasksBySourceLevel(SOURCE, 1));
      expect(again).toBe(first);
      expect(again.CurrentApproval).toBe(false);

      await db.saveChanges();
    });

    expect(model.persistRoutingChanges).toHaveBeenCalledWith([{ kind: "updateTask", id: TASK, values: { CurrentApproval: false } }]);
  });

  it("throws ObjectDisposedException after Dispose", async () => {
    await runWithRoutingDb(async () => {
      const db = routingDb();
      db.dispose();
      await expect(db.use(async () => 1)).rejects.toThrow("Cannot access a disposed context instance.");
    });
  });

  it("wraps a Prisma error during SaveChanges in DbUpdateException", async () => {
    vi.mocked(model.persistRoutingChanges).mockRejectedValue(Object.assign(new Error("value too long"), { name: "PrismaClientKnownRequestError" }));

    await runWithRoutingDb(async () => {
      const db = routingDb();
      db.addTask(task());
      await expect(db.saveChanges()).rejects.toThrow("An error occurred while saving the entity changes. See the inner exception for details.");
    });
  });

  it("wraps a SQL error during SaveChanges in DbUpdateException", async () => {
    vi.mocked(model.persistRoutingChanges).mockRejectedValue(new NetException("Microsoft.Data.SqlClient.SqlException", "String or binary data would be truncated."));

    await runWithRoutingDb(async () => {
      const db = routingDb();
      db.addTask(task());
      await expect(db.saveChanges()).rejects.toThrow("An error occurred while saving the entity changes. See the inner exception for details.");
    });
  });
});

describe("StartRoutingAsync", () => {
  it("succeeds without saving when no active routing exists", async () => {
    vi.mocked(model.firstActiveRouting).mockResolvedValue(null);

    const re = await runWithRoutingDb(() => service.startRoutingAsync(...startArgs()));

    expect(re).toMatchObject({ Result: true, RoutingCreated: false, Status: "NEW", NextApprovalLevel: 0, NextRoutingRuleID: EMPTY_GUID });
    expect(model.persistRoutingChanges).not.toHaveBeenCalled();
    expect(model.execRoutingRestartInsert).not.toHaveBeenCalled();
  });

  it("creates tasks and history; NextNoStatus stays empty like the C# constructor", async () => {
    vi.mocked(model.firstActiveRouting).mockResolvedValue({ ID: ROUTING } as never);
    vi.mocked(model.firstRoutingRuleByLevel).mockResolvedValue(rule());
    vi.mocked(model.selectApproversByRole).mockResolvedValue([
      { ApproverID: ACTIONER, ApproverLoginName: "tnb\\x", ApproverName: "X", ApproverEmail: "x@tnb.com.my" },
    ]);

    const re = await runWithRoutingDb(() => service.startRoutingAsync(...startArgs()));

    expect(re).toMatchObject({ Result: true, ApproverFound: true, NextApprovalLevel: 1, NextRoutingRuleID: RULE, NextYesStatus: "Agreed", NextNoStatus: "" });
    const changes = vi.mocked(model.persistRoutingChanges).mock.calls[0][0];
    expect(changes.map((change) => change.kind)).toEqual(["insertTask", "insertTaskHistory"]);
    expect(changes[1]).toMatchObject({ history: { ActivityAction: "Submitted", ActivityName: "Submission", TaskID: null } });
  });

  it("logs a restartable failure when no approver is found", async () => {
    vi.mocked(model.firstActiveRouting).mockResolvedValue({ ID: ROUTING } as never);
    vi.mocked(model.firstRoutingRuleByLevel).mockResolvedValue(rule());
    vi.mocked(model.selectApproversByRole).mockResolvedValue([]);

    const re = await runWithRoutingDb(() => service.startRoutingAsync(...startArgs()));

    expect(re).toMatchObject({ Result: false, ErrMessage: "Approver or staff is not found/inactive, please check with administrator." });
    expect(model.persistRoutingChanges).not.toHaveBeenCalled();
    const restart = vi.mocked(model.execRoutingRestartInsert).mock.calls[0][0];
    expect(restart).toMatchObject({ RoutingType: "Start Routing", ActivityName: "Submission", RoutingRuleID: RULE, OptionalApproverRequired: null });
    expect(restart.AppInfo.startsWith('<?xml version="1.0" encoding="utf-16"?><ApplicationInfo')).toBe(true);
    expect(vi.mocked(model.execRoutingLogInsert).mock.calls[0][0]).toMatchObject({ RoutingRestartID: restart.ID, Result: false });
  });
});

describe("UpdateRoutingAsync", () => {
  it("reports the in-tray message when the actioner does not own the task", async () => {
    vi.mocked(model.anyOwnedCurrentTask).mockResolvedValue(false);

    const re = await runWithRoutingDb(() =>
      service.updateRoutingAsync(ACTIONER, ROUTING, SOURCE, ROUTING, ROUTING, TASK, SOURCE, ACTIONER, ACTIONER, "Agreed", "Agreed", 0, RULE, model.newApplicationInfo(), false, EMPTY_GUID),
    );

    expect(re.Result).toBe(false);
    expect(re.ErrMessage).toBe(
      "Task not found. The item has been removed from your in-tray. Please contact the System Administrator if this item should still be in your in-tray.",
    );
    expect(vi.mocked(model.execRoutingRestartInsert).mock.calls[0][0]).toMatchObject({ RoutingType: "Update Routing", TaskID: TASK, RequestAction: 0 });
  });
});

describe("Withdraw / Cancel / Re-assign", () => {
  it("Withdraw returns false and writes nothing when no task is current", async () => {
    vi.mocked(model.selectCurrentTasksBySource).mockResolvedValue([]);
    const result = await runWithRoutingDb(() => service.withdrawRequestAsync(ACTIONER, EMPTY_GUID, EMPTY_GUID, EMPTY_GUID, EMPTY_GUID, SOURCE, "c"));
    expect(result).toBe(false);
    expect(model.persistRoutingChanges).not.toHaveBeenCalled();
  });

  it("Cancel parses the actioner before anything else", async () => {
    await expect(
      runWithRoutingDb(() => service.cancelRequestAsync("", EMPTY_GUID, EMPTY_GUID, EMPTY_GUID, EMPTY_GUID, SOURCE, "c")),
    ).rejects.toThrow("Unrecognized Guid format.");
  });

  it("re-assigns one task, then fails on the next because the shared context was disposed", async () => {
    vi.mocked(model.firstTaskById).mockImplementation(async () => task());
    vi.mocked(model.firstRoutingRuleCurrentStatus).mockResolvedValue("Pending");
    vi.mocked(model.firstApplicationName).mockResolvedValue("Leave");
    vi.mocked(model.selectApproversByRole).mockResolvedValue([]);

    await runWithRoutingDb(async () => {
      await expect(service.taskReAssignAsync(ACTIONER, TASK, SOURCE, "c")).resolves.toBe(true);
      await expect(service.taskReAssignAsync(ACTIONER, TASK, SOURCE, "c")).rejects.toThrow("Cannot access a disposed context instance.");
    });

    const kinds = vi.mocked(model.persistRoutingChanges).mock.calls.map((call) => call[0][0].kind);
    expect(kinds).toEqual(["updateTask", "insertTaskHistory"]);
  });
});
