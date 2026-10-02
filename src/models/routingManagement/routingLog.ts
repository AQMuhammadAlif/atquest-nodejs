import { Prisma } from "../../generated/routing/index.js";
import { read, runSql, SqlRow } from "../essSql.js";
import { routingPrisma, sqlParam } from "../routingPrisma.js";

// SEPRoutingManagement access (Prisma) for RoutingLogService (ESS_Backend). Types follow
// Models/RoutingManagement/RoutingLogModels.cs.

export type RoutingLogListItem = {
  ID: string;
  SourceID: string | null;
  RoutingRestartID: string | null;
  Result: boolean | null;
  ErrMessage: string | null;
  RoutingCreated: boolean | null;
  RoutingRuleCreated: boolean | null;
  EmailEnabled: boolean | null;
  EmailSent: boolean | null;
  ApproverFound: boolean | null;
  Status: string | null;
  CurrentStageCompleted: boolean | null;
  NextApprovalLevel: number | null;
  NextRoutingRuleID: string | null;
  NextYesStatus: string | null;
  NextNoStatus: string | null;
  CreatedDate: Date | null;
  ReferenceNo: string | null;
  SystemName: string | null;
  ApplicationName: string | null;
  ApplicationTypeName: string | null;
  ApplicationSubTypeName: string | null;
  FormLink: string | null;
};

export type RoutingLogDetailItem = RoutingLogListItem & { Restarted: boolean | null };

function mapListItem(row: SqlRow): RoutingLogListItem {
  return {
    ID: read.guid(row, "ID"),
    SourceID: read.guidOrNull(row, "SourceID"),
    RoutingRestartID: read.guidOrNull(row, "RoutingRestartID"),
    Result: read.boolOrNull(row, "Result"),
    ErrMessage: read.stringOrNull(row, "ErrMessage"),
    RoutingCreated: read.boolOrNull(row, "RoutingCreated"),
    RoutingRuleCreated: read.boolOrNull(row, "RoutingRuleCreated"),
    EmailEnabled: read.boolOrNull(row, "EmailEnabled"),
    EmailSent: read.boolOrNull(row, "EmailSent"),
    ApproverFound: read.boolOrNull(row, "ApproverFound"),
    Status: read.stringOrNull(row, "Status"),
    CurrentStageCompleted: read.boolOrNull(row, "CurrentStageCompleted"),
    NextApprovalLevel: read.intOrNull(row, "NextApprovalLevel"),
    NextRoutingRuleID: read.guidOrNull(row, "NextRoutingRuleID"),
    NextYesStatus: read.stringOrNull(row, "NextYesStatus"),
    NextNoStatus: read.stringOrNull(row, "NextNoStatus"),
    CreatedDate: read.dateOrNull(row, "CreatedDate"),
    ReferenceNo: read.stringOrNull(row, "ReferenceNo"),
    SystemName: read.stringOrNull(row, "SystemName"),
    ApplicationName: read.stringOrNull(row, "ApplicationName"),
    ApplicationTypeName: read.stringOrNull(row, "ApplicationTypeName"),
    ApplicationSubTypeName: read.stringOrNull(row, "ApplicationSubTypeName"),
    FormLink: read.stringOrNull(row, "FormLink"),
  };
}

// EXEC [RM].[GetRoutingLogsListing] @StartDate, @EndDate, @ID, @RefNo, @Result
// (@ID is always string.Empty; null values are DBNull.Value.)
export async function selectRoutingLogs(startDate: Date | null, endDate: Date | null, referenceNo: string | null, result: string | null) {
  const rows = await runSql(() =>
    routingPrisma.$queryRaw<SqlRow[]>(Prisma.sql`EXEC [RM].[GetRoutingLogsListing]
    @StartDate = ${startDate},
    @EndDate = ${endDate},
    @ID = ${""},
    @RefNo = ${sqlParam(referenceNo)},
    @Result = ${sqlParam(result)}`),
  );
  return rows.map(mapListItem);
}

// EXEC [RM].[GetRoutingLogDetail] @ID
export async function selectRoutingLogDetail(id: string) {
  const rows = await runSql(() => routingPrisma.$queryRaw<SqlRow[]>(Prisma.sql`EXEC [RM].[GetRoutingLogDetail] @ID = ${id}`));
  return rows.map((row): RoutingLogDetailItem => ({ ...mapListItem(row), Restarted: read.boolOrNull(row, "Restarted") }));
}
