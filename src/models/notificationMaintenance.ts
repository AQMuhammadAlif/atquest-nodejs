import { routingPrisma, sqlParam } from "./routingPrisma.js";

// Row shapes returned by SEPRoutingManagement. GUIDs come back uppercase; map with toEssGuid.

export type EmailTemplateViewRow = {
  EmailTemplateID: string;
  RoutingName: string;
  ApprovalTitle: string;
  NotificationType: string;
  Subject: string;
  EmailTo: string;
  EmailCC: string | null;
  EmailBCC: string | null;
  ContentTemplate: string;
  SendEmail: boolean;
};

export type EmailTemplateSearchRow = EmailTemplateViewRow & { TotalCount: number };

export async function searchEmailTemplates(params: {
  routingId: string | null;
  routingRuleId: string | null;
  approvalName: string | null;
  activityName: string | null;
  subject: string | null;
  offset: number;
  pageSize: number;
}) {
  return routingPrisma.$queryRaw<EmailTemplateSearchRow[]>`
    EXEC [RM].[SearchNotificationMaintenanceTemplates]
      ${sqlParam(params.routingId)},
      ${sqlParam(params.routingRuleId)},
      ${sqlParam(params.approvalName)},
      ${sqlParam(params.activityName)},
      ${sqlParam(params.subject)},
      ${params.offset},
      ${params.pageSize}`;
}

// [RM].[GetEmailTemplate] view (inner-joins Routing, RoutingRule and Common.*).
export async function findEmailTemplateView(emailTemplateId: string) {
  const rows = await routingPrisma.$queryRaw<EmailTemplateViewRow[]>`
    SELECT TOP 1 EmailTemplateID, RoutingName, ApprovalTitle, NotificationType, Subject,
                 EmailTo, EmailCC, EmailBCC, ContentTemplate, SendEmail
    FROM [RM].[GetEmailTemplate]
    WHERE EmailTemplateID = ${emailTemplateId}`;
  return rows[0] ?? null;
}

// EF: OrderBy(action => action.ActionType ?? action.ActionName)
export async function listAvailableActions() {
  return routingPrisma.$queryRaw<{ ActionName: string; ActionType: string | null }[]>`
    SELECT ActionName, ActionType
    FROM [RM].[AvailableAction]
    ORDER BY COALESCE(ActionType, ActionName)`;
}

export async function listRoutingRuleLookups(routingId: string | null) {
  return routingPrisma.routingRule.findMany({
    where: routingId ? { routingId } : undefined,
    select: { id: true, approvalTitle: true, routing: { select: { routingName: true } } },
    orderBy: [{ routing: { routingName: "asc" } }, { approvalLevel: "asc" }],
  });
}

export async function routingRuleExists(routingRuleId: string) {
  return (await routingPrisma.routingRule.count({ where: { id: routingRuleId } })) > 0;
}

export async function findEmailTemplate(id: string) {
  return routingPrisma.emailTemplate.findUnique({
    where: { id },
    select: { id: true, routingRuleId: true },
  });
}

export async function emailTemplateTypeExists(routingRuleId: string, notificationType: string, excludeId?: string) {
  const count = await routingPrisma.emailTemplate.count({
    where: { routingRuleId, notificationType, ...(excludeId ? { NOT: { id: excludeId } } : {}) },
  });
  return count > 0;
}

export type EmailTemplateFields = {
  sendEmail: boolean;
  notificationType: string;
  isHtmlBody: boolean;
  subject: string;
  contentTemplate: string;
  emailTo: string;
  emailCc: string | null;
  emailBcc: string | null;
};

export async function insertEmailTemplate(
  data: EmailTemplateFields & { id: string; routingRuleId: string; actorId: string; now: Date },
) {
  const { actorId, now, ...columns } = data;
  await routingPrisma.emailTemplate.create({
    data: { ...columns, createdDate: now, modifiedDate: now, createdBy: actorId, modifiedBy: actorId },
  });
}

export async function updateEmailTemplate(id: string, data: EmailTemplateFields & { actorId: string; now: Date }) {
  const { actorId, now, ...columns } = data;
  await routingPrisma.emailTemplate.update({
    where: { id },
    data: { ...columns, modifiedBy: actorId, modifiedDate: now },
  });
}

export async function deleteEmailTemplate(id: string) {
  await routingPrisma.emailTemplate.delete({ where: { id } });
}
