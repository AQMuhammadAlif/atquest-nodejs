import { prisma, sqlParam } from "../prisma.js";

export type IntegrationModuleRow = { ModuleCode: string | null; ModuleName: string | null };

export type IntegrationTransactionRow = {
  RequestID: string | null;
  RequestNo: string | null;
  RequestCategory: string | null;
  RequestType: string | null;
  IntegrationStatus: string | null;
  LastIntegrationDate: Date | null;
  ErrorMessage: string | null;
  EmployeeCode: string | null;
  EmployeeName: string | null;
  ModuleName: string | null;
  ModuleCode: string | null;
  FormPath: string | null;
  RequestStatus: string | null;
};

export async function getIntegrationModules() {
  return prisma.$queryRaw<IntegrationModuleRow[]>`EXEC [General].[GetIntegrationModule]`;
}

export async function getIntegrationTransactions(params: {
  integrationStatus: string | null;
  startDate: Date | null;
  endDate: Date | null;
  module: string | null;
  requestStatus: string | null;
}) {
  return prisma.$queryRaw<IntegrationTransactionRow[]>`
    EXEC [General].[GetIntegrationTransaction]
      ${sqlParam(params.integrationStatus)},
      ${params.startDate === null ? sqlParam(null) : params.startDate},
      ${params.endDate === null ? sqlParam(null) : params.endDate},
      ${sqlParam(params.module)},
      ${sqlParam(params.requestStatus)}`;
}

export async function updateIntegrationStatus(requestId: string | null, module: string) {
  await prisma.$executeRaw`EXEC [General].[UpdateIntegrationStatus] ${sqlParam(requestId)}, ${module}`;
}
