import { getNetString } from "../../models/essSql.js";
import { executeEssProc, queryEssProc } from "../../models/routingManagement/reRouting.js";
import { routingDb } from "../../models/routingManagement/routingDbContext.js";
import { firstTaskIdBySourceOrderByCreated } from "../../models/routingManagement/routingManagement.js";
import { netErrors, tryParseGuid } from "../../utils/essDotnet.js";

// Port of ESS_Backend Services/RoutingManagement/CustomWorkflowConfigService.cs (legacy
// CustomWorkflowConfig.Service). The [General].[CustomWorkflowConfig*] stored procedures live in the
// main ESS database (RbacDb / TNBESSDB); the FlexiBenefits task lookup uses SEPRoutingManagement.

const log = (message: string) => console.info(`[CustomWorkflowConfigService] ${message}`);

// Models/RoutingManagement/WFConfig.cs (every property is string?).
export type WFConfig = {
  Id: string | null;
  AreaCode: string | null;
  AreaName: string | null;
  SubAreaCode: string | null;
  SubAreaName: string | null;
  StartDate: string | null;
  EndDate: string | null;
  IMStaffID: string | null;
  IMOfIMStaffID: string | null;
  IMStaffName: string | null;
  IMOfIMStaffName: string | null;
  IMOfIMStaffEmailAddress: string | null;
  CompanyCode: string | null;
};

export function newWFConfig(): WFConfig {
  return {
    Id: null,
    AreaCode: null,
    AreaName: null,
    SubAreaCode: null,
    SubAreaName: null,
    StartDate: null,
    EndDate: null,
    IMStaffID: null,
    IMOfIMStaffID: null,
    IMStaffName: null,
    IMOfIMStaffName: null,
    IMOfIMStaffEmailAddress: null,
    CompanyCode: null,
  };
}

const GetString = getNetString;

export async function getConfigListAsync(
  dateFrom: string | null,
  dateTo: string | null,
  _companyCode: string | null,
  departmentCode: string | null,
  unitSectionCode: string | null,
): Promise<WFConfig[]> {
  log("GetConfigListAsync started.");

  const rows = await queryEssProc(
    "[General].[CustomWorkflowConfigList]",
    [
      ["AreaCode", departmentCode ?? ""],
      ["SubAreaCode", unitSectionCode ?? ""],
      ["StartDate", dateFrom ?? ""],
      ["EndDate", dateTo ?? ""],
    ],
  );
  return rows.map((row) => {
    const config = newWFConfig();
    config.Id = GetString(row, "ID");
    config.AreaName = GetString(row, "AreaName");
    config.SubAreaName = GetString(row, "SubAreaName");
    config.StartDate = GetString(row, "StartDate");
    config.EndDate = GetString(row, "EndDate");
    config.IMStaffID = GetString(row, "IMStaffID");
    config.IMOfIMStaffID = GetString(row, "IMOfIMStaffID");
    config.IMStaffName = GetString(row, "IMStaffName");
    config.IMOfIMStaffName = GetString(row, "IMOfIMStaffName");
    config.IMOfIMStaffEmailAddress = GetString(row, "IMOfIMEmailAddress");
    return config;
  });
}

export async function getConfigByIdAsync(id: string): Promise<WFConfig | null> {
  log(`GetConfigByIdAsync started for id: ${id}.`);

  const list = await queryEssProc("[General].[CustomWorkflowConfigSelect]", [["ID", id]]);
  const mapped = list.map((row) => {
    const config = newWFConfig();
    config.Id = GetString(row, "ID");
    config.AreaName = GetString(row, "AreaName");
    config.AreaCode = GetString(row, "AreaCode");
    config.SubAreaCode = GetString(row, "SubAreaCode");
    config.SubAreaName = GetString(row, "SubAreaName");
    config.StartDate = GetString(row, "StartDate");
    config.EndDate = GetString(row, "EndDate");
    config.IMStaffID = GetString(row, "IMStaffID");
    config.IMOfIMStaffID = GetString(row, "IMOfIMStaffID");
    config.IMStaffName = GetString(row, "IMStaffName");
    config.IMOfIMStaffName = GetString(row, "IMOfIMStaffName");
    config.IMOfIMStaffEmailAddress = GetString(row, "IMOfIMEmailAddress");
    config.CompanyCode = GetString(row, "CompanyCode");
    return config;
  });

  return mapped[0] ?? null;
}

export function addConfigAsync(model: WFConfig) {
  log("AddConfigAsync started.");

  return executeEssProc(
    "[General].[CustomWorkflowConfigInsert]",
    [
      ["AreaCode", model.AreaCode ?? ""],
      ["SubAreaCode", model.SubAreaCode ?? ""],
      ["IMStaffID", model.IMStaffID ?? ""],
      ["IMofIMStaffID", model.IMOfIMStaffID ?? ""],
      ["StartDate", model.StartDate ?? ""],
      ["EndDate", model.EndDate ?? ""],
      ["CompanyCode", model.CompanyCode ?? ""],
      ["ApplicationName", "Training"],
    ],
  );
}

export function updateConfigAsync(model: WFConfig) {
  log(`UpdateConfigAsync started for id: ${model.Id}.`);

  return executeEssProc(
    "[General].[CustomWorkflowConfigUpdate]",
    [
      ["ID", model.Id ?? ""],
      ["AreaCode", model.AreaCode ?? ""],
      ["SubAreaCode", model.SubAreaCode ?? ""],
      ["IMStaffID", model.IMStaffID ?? ""],
      ["IMofIMStaffID", model.IMOfIMStaffID ?? ""],
      ["StartDate", model.StartDate ?? ""],
      ["EndDate", model.EndDate ?? ""],
      ["CompanyCode", model.CompanyCode ?? ""],
    ],
  );
}

export function deleteConfigAsync(id: string) {
  log(`DeleteConfigAsync started for id: ${id}.`);

  return executeEssProc("[General].[CustomWorkflowConfigDelete]", [["ID", id]]);
}

export async function getTaskIdForFlexiBenefitsAsync(requestId: string): Promise<string> {
  log(`GetTaskIdForFlexiBenefitsAsync started for requestId: ${requestId}.`);

  const sourceId = tryParseGuid(requestId);
  if (sourceId === null) {
    throw netErrors.invalidOperation("No task associated with this Request was found.");
  }

  const taskId = await routingDb().use(() => firstTaskIdBySourceOrderByCreated(sourceId));

  if (taskId === null) {
    throw netErrors.invalidOperation("No task associated with this Request was found.");
  }

  return taskId;
}
