import { routingDb } from "../../models/routingManagement/routingDbContext.js";
import * as model from "../../models/routingManagement/routingLog.js";
import { isNullOrWhiteSpace, netTrim } from "../../utils/essDotnet.js";

// Port of ESS_Backend Services/RoutingManagement/RoutingLogService.cs.

export async function getRoutingLogsAsync(
  startDate: Date | null,
  endDate: Date | null,
  referenceNo: string | null,
  result: string | null,
) {
  console.info("[RoutingLogService] GetRoutingLogsAsync started.");

  const rows = await routingDb().use(() =>
    model.selectRoutingLogs(startDate, endDate, toNullableString(referenceNo), toNullableString(result)),
  );

  return rows;
}

export async function getRoutingLogDetailAsync(id: string) {
  console.info(`[RoutingLogService] GetRoutingLogDetailAsync started for id: ${id}.`);

  const rows = await routingDb().use(() => model.selectRoutingLogDetail(id));

  return rows[0] ?? null;
}

// string.IsNullOrWhiteSpace(value) ? DBNull.Value : value.Trim()
function toNullableString(value: string | null) {
  return isNullOrWhiteSpace(value) ? null : netTrim(value as string);
}
