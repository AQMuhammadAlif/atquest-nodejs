import { z } from "zod";
import {
  deleteEmailTemplate,
  emailTemplateTypeExists,
  findEmailTemplate,
  findEmailTemplateView,
  insertEmailTemplate,
  listAvailableActions,
  listRoutingRuleLookups,
  routingRuleExists,
  searchEmailTemplates,
  updateEmailTemplate,
  type EmailTemplateViewRow,
} from "../../models/maintenance/notificationMaintenance.js";
import { randomUUID } from "node:crypto";
import { HttpError } from "../../utils/errors.js";
import { toEssGuid } from "../../utils/essFormat.js";
import type { PagedResult } from "../../utils/essResponse.js";
import { essField, parseEssBody } from "../../utils/essValidation.js";

// Port of ESS_Backend NotificationMaintenanceService (+ controller result branches).

const SYSTEM_ACTOR_ID = "00000000-0000-0000-0000-000000000001";
const DUPLICATE_TYPE_MESSAGE =
  "A notification template with the same notification type already exists for this activity.";

const createSchema = z.object({
  routingRuleId: essField.guid(),
  notificationType: essField.requiredString("NotificationType", 50),
  subject: essField.requiredString("Subject"),
  assignTo: essField.requiredString("AssignTo"),
  cc: essField.optionalString(),
  bcc: essField.optionalString(),
  bodyMessage: essField.requiredString("BodyMessage"),
  enableNotification: essField.bool(true),
  isHtmlBody: essField.bool(true),
});

const updateSchema = z.object({
  notificationType: essField.requiredString("NotificationType", 50),
  subject: essField.requiredString("Subject"),
  assignTo: essField.requiredString("AssignTo"),
  cc: essField.optionalString(),
  bcc: essField.optionalString(),
  bodyMessage: essField.requiredString("BodyMessage"),
  // NotificationMaintenanceUpdateRequest has no initializer here, so it defaults to false.
  enableNotification: essField.bool(false),
  isHtmlBody: essField.bool(true),
  // FE sends these for display; ignored on update.
  approvalName: essField.optionalString(),
  activityName: essField.optionalString(),
});

export type NotificationMaintenanceDto = {
  id: string;
  approvalName: string;
  activityName: string;
  notificationType: string;
  subject: string;
  assignTo: string;
  cc: string;
  bcc: string;
  bodyMessage: string;
  enableNotification: boolean;
};

function toDto(row: EmailTemplateViewRow): NotificationMaintenanceDto {
  return {
    id: toEssGuid(row.EmailTemplateID)!,
    approvalName: row.RoutingName,
    activityName: row.ApprovalTitle,
    notificationType: row.NotificationType,
    subject: row.Subject,
    assignTo: row.EmailTo,
    cc: row.EmailCC ?? "",
    bcc: row.EmailBCC ?? "",
    bodyMessage: row.ContentTemplate,
    enableNotification: row.SendEmail,
  };
}

function nullIfBlank(value: string | undefined) {
  return value && value.trim() ? value.trim() : null;
}

function templateFields(body: z.output<typeof updateSchema> | z.output<typeof createSchema>) {
  return {
    sendEmail: body.enableNotification,
    notificationType: body.notificationType.trim(),
    isHtmlBody: body.isHtmlBody,
    subject: body.subject.trim(),
    contentTemplate: body.bodyMessage,
    emailTo: body.assignTo.trim(),
    emailCc: body.cc?.trim() ?? null,
    emailBcc: body.bcc?.trim() ?? null,
  };
}

export async function getAssignToDropdown() {
  const actions = await listAvailableActions();
  return actions.map((action) => ({
    id: action.ActionName,
    code: action.ActionName,
    name: action.ActionType ?? action.ActionName,
  }));
}

export async function getAll(params: {
  approvalName?: string;
  activityName?: string;
  subject?: string;
  routingId?: string;
  routingRuleId?: string;
  page: number;
  pageSize: number;
}): Promise<PagedResult<NotificationMaintenanceDto>> {
  const rows = await searchEmailTemplates({
    routingId: params.routingId ?? null,
    routingRuleId: params.routingRuleId ?? null,
    approvalName: nullIfBlank(params.approvalName),
    activityName: nullIfBlank(params.activityName),
    subject: nullIfBlank(params.subject),
    offset: (params.page - 1) * params.pageSize,
    pageSize: params.pageSize,
  });

  return {
    items: rows.map(toDto),
    page: params.page,
    pageSize: params.pageSize,
    totalCount: rows.length > 0 ? Number(rows[0].TotalCount) : 0,
  };
}

export async function getById(id: string) {
  const row = await findEmailTemplateView(id);
  return row ? toDto(row) : null;
}

export async function getRoutingRuleDdl(routingId?: string) {
  const rules = await listRoutingRuleLookups(routingId ?? null);
  return rules.map((rule) => ({
    id: toEssGuid(rule.id)!,
    approvalName: rule.routing.routingName,
    activityName: rule.approvalTitle,
  }));
}

export async function create(input: unknown, employeeId: string | undefined) {
  const body = parseEssBody(createSchema, input);

  if (!(await routingRuleExists(body.routingRuleId))) {
    throw new HttpError(404, "Routing rule not found.");
  }

  const fields = templateFields(body);
  if (await emailTemplateTypeExists(body.routingRuleId, fields.notificationType)) {
    throw new HttpError(409, DUPLICATE_TYPE_MESSAGE);
  }

  const id = randomUUID();
  await insertEmailTemplate({
    ...fields,
    id,
    routingRuleId: body.routingRuleId,
    actorId: employeeId ?? SYSTEM_ACTOR_ID,
    now: new Date(),
  });

  const created = await getById(id);
  if (!created) {
    throw new HttpError(500, "Failed to create notification template.");
  }
  return created;
}

export async function update(id: string, input: unknown, employeeId: string | undefined) {
  const body = parseEssBody(updateSchema, input);

  const entity = await findEmailTemplate(id);
  if (!entity) {
    throw new HttpError(404, "Notification template not found.");
  }

  const fields = templateFields(body);
  if (await emailTemplateTypeExists(entity.routingRuleId, fields.notificationType, id)) {
    throw new HttpError(409, DUPLICATE_TYPE_MESSAGE);
  }

  await updateEmailTemplate(id, { ...fields, actorId: employeeId ?? SYSTEM_ACTOR_ID, now: new Date() });

  const updated = await getById(id);
  if (!updated) {
    throw new HttpError(500, "Failed to update notification template.");
  }
  return updated;
}

export async function remove(id: string) {
  if (!(await findEmailTemplate(id))) {
    throw new HttpError(404, "Notification template not found.");
  }
  await deleteEmailTemplate(id);
}
