import { randomUUID } from "node:crypto";
import { routingPrisma, sqlParam } from "../routingPrisma.js";

export type ApprovalRuleSearchRow = {
  ID: string;
  RoutingName: string;
  ApprovalTitle: string;
  ApprovalLevel: number;
  ApprovalRole: string;
  RequiredEveryOneAction: boolean;
  SkipSameApprover: boolean;
  CreatedDate: Date | null;
  ModifiedDate: Date | null;
  TotalCount: number;
};

export async function searchApprovalRules(params: {
  routingId: string | null;
  routingRuleId: string | null;
  approvalName: string | null;
  activityName: string | null;
  assignTo: string | null;
  offset: number;
  pageSize: number;
}) {
  return routingPrisma.$queryRaw<ApprovalRuleSearchRow[]>`
    EXEC [RM].[SearchApprovalMaintenanceRules]
      ${sqlParam(params.routingId)},
      ${sqlParam(params.routingRuleId)},
      ${sqlParam(params.approvalName)},
      ${sqlParam(params.activityName)},
      ${sqlParam(params.assignTo)},
      ${params.offset},
      ${params.pageSize}`;
}

export async function findRuleWithRouting(id: string) {
  return routingPrisma.routingRule.findUnique({
    where: { id },
    include: { routing: { select: { routingName: true } } },
  });
}

export type RoutingRuleWithRouting = NonNullable<Awaited<ReturnType<typeof findRuleWithRouting>>>;

export async function listCustomApproverIds(routingRuleId: string) {
  const rows = await routingPrisma.customApprover.findMany({
    where: { routingRuleId },
    select: { approverId: true },
  });
  return rows.map((row) => row.approverId);
}

// [RM].[GetRoutingList] view, active routings only.
export async function listActiveRoutings() {
  return routingPrisma.$queryRaw<{ RoutingID: string; RoutingName: string }[]>`
    SELECT RoutingID, RoutingName
    FROM [RM].[GetRoutingList]
    WHERE Active = 1
    ORDER BY RoutingName`;
}

export async function listRuleLookups(routingId: string | null) {
  return routingPrisma.routingRule.findMany({
    where: routingId ? { routingId } : undefined,
    select: { id: true, approvalTitle: true, routing: { select: { routingName: true } } },
    orderBy: [{ routing: { routingName: "asc" } }, { approvalLevel: "asc" }, { approvalTitle: "asc" }],
  });
}

export async function activeRoutingExists(routingId: string) {
  return (await routingPrisma.routing.count({ where: { id: routingId, active: true } })) > 0;
}

export async function hasAvailableActions() {
  return (await routingPrisma.availableAction.count()) > 0;
}

export async function availableActionExists(actionName: string) {
  return (await routingPrisma.availableAction.count({ where: { actionName } })) > 0;
}

export async function emailTemplateExistsForRule(routingRuleId: string) {
  return (await routingPrisma.emailTemplate.count({ where: { routingRuleId } })) > 0;
}

export async function taskExistsForRule(routingRuleId: string) {
  return (await routingPrisma.task.count({ where: { routingRuleId } })) > 0;
}

export type RoutingRuleColumns = {
  routingId: string;
  approvalTitle: string;
  approvalLevel: number;
  approvalRole: string;
  currentStatus: string | null;
  optionalApproval: boolean;
  requiredEveryOneAction: boolean;
  yesLabel: string;
  yesActionLogLabel: string;
  yesStatus: string | null;
  noLabel: string;
  noActionLogLabel: string;
  noStatus: string | null;
  reworkLabel: string | null;
  reworkActionLogLabel: string | null;
  reworkStatus: string | null;
  changeProcessAfter: number | null;
  changeProcessStatus: string | null;
  escalateAfter: number | null;
  escalateTo: string | null;
  endProcessAfter: number | null;
  endProcessStatus: string | null;
  skipSameApprover: boolean;
};

function approverRows(routingRuleId: string, approverIds: string[], actorId: string | null, now: Date) {
  return approverIds.map((approverId) => ({
    id: randomUUID(),
    routingRuleId,
    approverId,
    createdDate: now,
    modifiedDate: now,
    createdBy: actorId,
  }));
}

export async function insertRuleWithApprovers(
  id: string,
  columns: RoutingRuleColumns,
  approverIds: string[],
  actorId: string | null,
  now: Date,
) {
  await routingPrisma.$transaction([
    routingPrisma.routingRule.create({
      data: { ...columns, id, createdDate: now, modifiedDate: now, createdBy: actorId, modifiedBy: actorId },
    }),
    routingPrisma.customApprover.createMany({ data: approverRows(id, approverIds, actorId, now) }),
  ]);
}

// `approverIds === null` leaves custom approvers untouched; an array replaces them.
export async function updateRuleAndApprovers(
  id: string,
  changes: Partial<RoutingRuleColumns>,
  approverIds: string[] | null,
  actorId: string | null,
  now: Date,
) {
  await routingPrisma.$transaction([
    routingPrisma.routingRule.update({
      where: { id },
      data: { ...changes, modifiedDate: now, modifiedBy: actorId },
    }),
    ...(approverIds === null
      ? []
      : [
          routingPrisma.customApprover.deleteMany({ where: { routingRuleId: id } }),
          routingPrisma.customApprover.createMany({ data: approverRows(id, approverIds, actorId, now) }),
        ]),
  ]);
}

export async function deleteRuleAndApprovers(id: string) {
  await routingPrisma.$transaction([
    routingPrisma.customApprover.deleteMany({ where: { routingRuleId: id } }),
    routingPrisma.routingRule.delete({ where: { id } }),
  ]);
}
