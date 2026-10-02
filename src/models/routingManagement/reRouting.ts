import { Prisma } from "@prisma/client";
import { prisma } from "../prisma.js";
import { runSql, SqlRow } from "../essSql.js";

// TNBESSDB (RbacDb connection, the team's Prisma client) stored procedures behind ReRoutingService
// and CustomWorkflowConfigService: SqlCommand with CommandType.StoredProcedure and AddWithValue
// parameters, read with an IDataRecord (first result set).

export type ProcParams = [name: string, value: string][];

// EXEC <proc> @Name = value, ... (AddWithValue binds by parameter name).
function execSql(storedProcedure: string, params: ProcParams) {
  const assignments = params.map(([name, value]) => Prisma.sql`${Prisma.raw(`@${name} = `)}${value}`);
  return params.length
    ? Prisma.sql`EXEC ${Prisma.raw(storedProcedure)} ${Prisma.join(assignments, ", ")}`
    : Prisma.sql`EXEC ${Prisma.raw(storedProcedure)}`;
}

// QueryAsync: ExecuteReaderAsync + while (reader.Read()) over the first result set.
export function queryEssProc(storedProcedure: string, params: ProcParams): Promise<SqlRow[]> {
  return runSql(() => prisma.$queryRaw<SqlRow[]>(execSql(storedProcedure, params)));
}

// ExecuteAsync: ExecuteNonQueryAsync.
export async function executeEssProc(storedProcedure: string, params: ProcParams): Promise<void> {
  await runSql(() => prisma.$executeRaw(execSql(storedProcedure, params)));
}

// General.Process_Create with @ID NVARCHAR(250) OUTPUT; null when the procedure leaves it NULL.
export async function execProcessCreate(processName: string, description: string, userId: string): Promise<string | null> {
  const rows = await runSql(() =>
    prisma.$queryRaw<SqlRow[]>(Prisma.sql`DECLARE @ID NVARCHAR(250);
EXEC General.Process_Create @ProcessName = ${processName}, @Description = ${description}, @UserID = ${userId}, @ID = @ID OUTPUT;
SELECT @ID AS [ID];`),
  );
  const id = rows[0]?.ID;
  return id === null || id === undefined ? null : String(id);
}
