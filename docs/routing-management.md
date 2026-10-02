# Routing Management: port of ESS_Backend to atquest-nodejs

This module is a 1-to-1 port of the Routing Management code in **ESS_Backend** (.NET 10, `uni10-ess-backend`, branch `dev`, commit `a74cf401`). It covers approval routing (start, approve or reject, rework, go-to, withdraw, cancel, re-assign, restart), the in-tray, the audit log, routing logs, process management and the custom workflow configuration.

**Rule for every change: Node must behave exactly like the .NET code.** That includes its bugs, the strings it returns, and the order of its database calls. Do not "fix" or simplify logic here unless the same change is made in ESS_Backend, or the team decides to drop parity. If you are unsure what the .NET code does, read the C# file listed in [File map](#file-map). The C# is the source of truth.

Approval Maintenance and Notification Maintenance (`/v1/approval-maintenance`, `/v1/notification-maintenance`) are a separate module. See [maintenance-cutover.md](maintenance-cutover.md).

## Endpoints

41 endpoints. Each is also served under `/v1.0`. Every response carries the `api-supported-versions: 1.0` header.

| Router | Path prefix | Endpoints |
| --- | --- | --- |
| RoutingManagement | `/v1/routingmanagement` | `POST /teststartrouting`, `GET /getintray`, `GET /getmyintraysummary`, `GET /getmyapprovalhistory`, `POST /perform-action`, `POST /goto-activity`, `POST /withdraw`, `POST /cancel`, `GET /allow-actions`, `GET /task/{id}`, `GET /audit-log`, `POST /workflow-history`, `POST /restartrouting` |
| RoutingLogs | `/v1/routinglogs` | `GET /listing`, `GET /detail/{id}`, `POST /restart/{id}` |
| Process | `/v1/process` | `GET/POST /processes`, `GET/DELETE /processes/{processId}`, `GET/POST /processes/{processId}/roles`, `GET/POST /processes/{processId}/routes`, `GET /roles`, `GET /routes`, `DELETE /roles/{processRoleId}`, `DELETE /routes/{processRouteId}`, `GET /processes-by-employee/{employeeId}`, `GET /tasks`, `GET /tasks/{taskId}` |
| ReAssignTask | `/v1/reassigntask` | `GET /processes`, `GET /search`, `POST /reassign` |
| CustomWorkflowConfig | `/v1/customworkflowconfig` | `GET /search`, `GET/PUT/DELETE /{id}`, `POST /`, `GET /flexibenefits-task/{requestId}` |

**Auth:** a valid atquest JWT only. ESS's `[RequirePermission]` checks (`MSS`, `ROUTING_LOGS`, `PROCESS_MANAGEMENT`, `TASK_REASSIGNMENT`, `CUSTOM_WORKFLOW_CONFIG`) are deliberately **not** ported. A missing or invalid token gets ESS's JwtBearer challenge: an empty 401 with `WWW-Authenticate: Bearer`.

## File map

Each layer has a `routingManagement/` subfolder. Shared ESS helpers stay at the layer root.

| ESS_Backend (C#) | atquest-nodejs |
| --- | --- |
| `Controllers/RoutingManagement/RoutingManagementController.cs` | `src/controllers/routingManagement/routingManagementController.ts` |
| `Controllers/RoutingManagement/RoutingLogsController.cs` | `src/controllers/routingManagement/routingLogsController.ts` |
| `Controllers/RoutingManagement/ProcessController.cs` | `src/controllers/routingManagement/processController.ts` |
| `Controllers/RoutingManagement/ReAssignTaskController.cs` | `src/controllers/routingManagement/reAssignTaskController.ts` |
| `Controllers/RoutingManagement/CustomWorkflowConfigController.cs` | `src/controllers/routingManagement/customWorkflowConfigController.ts` |
| `Services/RoutingManagement/RoutingManagementService.cs` | `src/services/routingManagement/routingManagementService.ts` |
| `Services/RoutingManagement/RoutingLogService.cs` | `src/services/routingManagement/routingLogService.ts` |
| `Services/RoutingManagement/ReRoutingService.cs` | `src/services/routingManagement/reRoutingService.ts` |
| `Services/RoutingManagement/CustomWorkflowConfigService.cs` | `src/services/routingManagement/customWorkflowConfigService.ts` |
| `Models/RoutingManagement/RoutingManagementModels.cs`, `Dtos/…/InTrayDto.cs`, EF queries | `src/models/routingManagement/routingManagement.ts` (types, row mappers, all SEPRoutingManagement SQL) |
| `Models/RoutingManagement/RoutingLogModels.cs` + its SQL | `src/models/routingManagement/routingLog.ts` |
| `[General].*` procs called by ReRouting / CustomWorkflowConfig | `src/models/routingManagement/reRouting.ts` |
| `Data/SEPRoutingManagementDbContext.cs` (scoped EF context) | `src/models/routingManagement/routingDbContext.ts` + `src/middleware/routingManagement/routingDbScope.ts` |
| `Requests/RoutingManagement/*.cs` | body specs at the top of each controller (`EssBodySpec`) |
| `[Route]` attributes | `src/routes/routingManagement/*.ts`, mounted by `routes/routingManagement/index.ts` |

Function names are the C# names in camelCase (`UpdateRoutingAsync` → `updateRoutingAsync`). Where C# has overloads, Node has separate functions, each commented with the C# signature:

- `GetApproverInfoAsync(sourceID, role)` → `getApproverInfoBySourceRoleAsync`; the 5-argument overload → `getApproverInfoAsync`.
- `SendCustomEmailByNotificationTypeAsync`: the overload with `routingRuleID` → `sendCustomEmailByNotificationTypeForRuleAsync`.
- `ConfigureEmailRecipientAsync`: the StartRouting overload → `configureEmailRecipientForStartAsync`.
- `ConfigureEmailContentAsync`: the overload with `db` → `configureEmailContentFromHistoryAsync`.
- The three `GetMyApprovalHistoryAsync` overloads → one function with optional arguments.

## How a request flows

```
routes/v1.ts
  requireEssAuth, essReportApiVersions
  routingManagementModuleRouter          ← mounted BEFORE essCurrentUser (ESS routing never reads ICurrentUserService)
    /<prefix> → routingDbScope → essEndpoint(router, path, { VERB: [controller] })
  essCurrentUser → maintenanceRouter
  essErrorHandler                        ← ProblemDetails 400/415, ESS 500 body
  empty 404
```

- **Controller:** binds and validates the input the way ASP.NET model binding does, calls the service, and wraps the result with `essOk` / `essFail` and `toEssJson`.
  - Binding helpers: `queryString` / `queryGuid` / `queryInt` / `queryDateTime` / `routeGuid`, and `bindEssJsonBody` for bodies.
  - Binding errors are thrown as `EssValidationError` and become a ProblemDetails 400 whose keys are the C# parameter names.
- **Service:** the C# method body, statement for statement.
- **Model:** raw SQL via Prisma. No business logic lives here.

## Database access

All database access goes through **Prisma**, with no `mssql` package. Timeout and cancellation parity with .NET is deliberately not reproduced.

| Prisma client | Database | Used for |
| --- | --- | --- |
| `routingPrisma` (`src/models/routingPrisma.ts`, schema `prisma/routing.prisma`) | SEPRoutingManagement | everything in `RoutingManagementService` and `RoutingLogService`, plus the `RM.Task` lookup for FlexiBenefits |
| `prisma` (`src/models/prisma.ts`) | SEPESS / TNBESSDB | the `[General].*` stored procedures of ReRouting and CustomWorkflowConfig |

Rules that keep the SQL identical to what EF Core / SqlClient send:

- **Reads use `$queryRaw` with the SQL that EF generates.**
  - `FirstOrDefault` without `OrderBy` → `SELECT TOP(1)` with no `ORDER BY`.
  - `Any` → `CASE WHEN EXISTS`.
  - `AsNoTracking` vs tracked reads matter; see the unit of work below.
- **Always wrap nullable values in `sqlParam(value)`.** Prisma binds a JS `null` as an *int-typed* NULL, which SQL Server cannot convert to `uniqueidentifier`.
- **Stored procedures** are `EXEC proc @Name = value, …`.
  - Prisma returns the **last** result set; C# readers take the **first**. All procs used today return one result set. Check this before calling a new proc that returns several.
  - `General.Process_Create` reads its OUTPUT parameter with a trailing `SELECT @ID`.
- **Reading rows:** use `read.*` from `src/models/essSql.ts`.
  - It reproduces EF materialisation: `Data is Null…` when NULL lands in a non-nullable property, and the "required column … not present" error.
  - For ADO.NET `GetString` / `GetStringSafe` use `getNetString` / `getNetStringSafe`. They produce `DateTime.ToString()` in en-MY, `True` / `False`, and lowercase GUIDs.
- **Errors:** Prisma errors are translated to `Microsoft.Data.SqlClient.SqlException` with SQL Server's own message (`runSql` / `translateSqlError`).
- **Prisma schemas:** `prisma/routing.prisma` (models `Task`, `TaskHistory`, plus the maintenance team's models) is used for writes only. **Never run `prisma db push` or `prisma migrate`.**

### Unit of work (EF `DbContext` emulation)

`routingDbScope` creates one `RoutingDbContext` per request (AsyncLocalStorage). Get it with `routingDb()`. It reproduces the EF behaviour the C# logic depends on:

- **Tracked task reads** (`db.trackTasks(...)` / `db.trackTask(...)`) return the *same object* for the same row within a request (identity resolution). Edits stay in memory.
- **Queries do not see unsaved edits.** A query run before `saveChanges()` reads the database, not pending changes. Some C# flows (Rework's repeat loop, skip-same-approver) depend on this.
- **Writes:**
  - `db.addTask`, `db.removeTask` and `db.addTaskHistory` queue inserts and deletes.
  - `db.saveChanges()` writes everything in one transaction. Updates write only the changed columns, and each update or delete must affect exactly one row.
  - Failures are thrown as `DbUpdateException` with EF's messages.
- **Non-tracking reads** go through `db.use(() => model.someQuery(...))`.
- **`db.dispose()`** reproduces `using var db = _db;` in `TaskReAssignAsync`. Any later use in the same request throws `ObjectDisposedException`.

When the C# calls `SaveChangesAsync`, Node calls `db.saveChanges()` at the same point, never earlier or later.

## .NET behaviour emulation helpers

Use these instead of plain JS. Plain JS differs from .NET in ways that change results.

| Need | Use | Why |
| --- | --- | --- |
| `string.IsNullOrWhiteSpace`, `Trim()` | `isNullOrWhiteSpace`, `netTrim` (`utils/essDotnet.ts`) | .NET whitespace includes U+0085 and excludes U+FEFF |
| `string.Replace(a, b)` | `netReplace` | `$` patterns in JS `replace`; .NET `Replace(x, null)` removes the match |
| `ToUpper()` | `netToUpper` | culture casing |
| `new Guid(s)` / `Guid.TryParse` | `newGuid` / `tryParseGuid` | same accepted formats and error messages (`Unrecognized Guid format.`) |
| GUID equality | `guidEquals`, or compare lowercase strings | all GUIDs in Node are lowercase |
| `DateTime.Now` | `netNow()` | wall-clock time in `TZ=Asia/Kuala_Lumpur` |
| `Convert.ToDateTime(Now.ToString("yyyy-MM-dd HH:mm:ss"))` | `truncateToSeconds(netNow())` | |
| `OrderBy(x => x.Name)` on strings | `orderByCulture` | en-MY culture compare, nulls first |
| `string.Equals(a, b, OrdinalIgnoreCase)` | `equalsOrdinalIgnoreCase` | |
| Throwing a .NET exception | `netErrors.*` / `new NetException(type, message)` | the 500 body exposes the .NET type name |
| JSON response | `toEssJson(value)` | System.Text.Json camelCase (`ID` → `id`, `RoutingRuleID` → `routingRuleID`), nulls kept, dates without `Z` |
| XML of `ApplicationInfo` | `serializeApplicationInfo` / `deserializeApplicationInfo` | XmlSerializer format stored in `RM.RoutingRestart.AppInfo` |

## Bugs kept on purpose

These exist in ESS_Backend and are reproduced. Don't fix them in Node alone.

1. **`RoutingElement` always has `NextNoStatus = ""`.** The 13-argument constructor assigns the property to itself (`_nextNoStatus = NextNoStatus`). See `routingElementFull`.
2. **`TaskReAssignAsync` disposes the request's shared context** (`using var db = _db;`). In `POST /reassigntask/reassign` with several task IDs, the second task fails with `ObjectDisposedException`, which becomes a 500.
3. **`GotoActivityAsync` swallows exceptions without setting `ErrMessage`.** A failure returns `result: false` with an empty message.
4. **Emails are sent before `SaveChanges`.** If the save then fails, the email has already gone out.
5. **An unreachable `Approve` check.** In `UpdateRoutingAsync`, the "no next rule" branch checks `RequestAction == Approve` inside a case group that does not include `Approve`, so that email is never sent from there.
6. **`CancelRequestAsync` always returns `true`** and logs a "Cancelled" history, even when no task was active. ESS comments this as intentional legacy behaviour.

## Things that look wrong but are correct

- **`GET /v1/routinglogs/detail/{id}` returns 404 for an existing log** when the log has no matching `RM.RoutingRestart` + `RM.vw_RoutingRestartConfig` row. The proc inner-joins both, so ESS returns 404 too.
- **`[General].Process_*`, `ReAssign_GetTasks`, `Task_GetTaskById` and `CustomWorkflowConfig*` fail with "Could not find stored procedure"** on databases that don't have them. ESS fails the same way.
- **Approver lookups return `[]` when the TVF returns NULL `ApproverLoginName` / `ApproverEmail`.** EF throws "Data is Null" and the C# catch returns an empty list.
- **Unused C# members are ported anyway** so nothing is missing: `ResolveRoutingRestartIdAsync`, `IsRestartNotFound`, `InTrayDto.FromEntity` (`inTrayDtoFromEntity`), and the entity types `App`, `AppType`, `AppSubType`, `Sy`, `SysDiagram`, `AvailableAction`, `CustomApprover`, `GetEmailTemplate`, `GetRoutingList` with their row mappers.

## Known small differences from .NET

These differences appear only on error paths. Business logic, database writes and success responses are identical.

- **`traceId`:**
  - On 500 bodies it is a random UUID, not Kestrel's `0HN…:00000001`.
  - On ProblemDetails 400/415 it has the same W3C format (values are random in both).
- **Error details in 500 responses:**
  - The stack trace in `error.detail` is a JS stack.
  - Details are shown unless `NODE_ENV=production`. .NET shows them only in Development or Staging. **Set `NODE_ENV=production` in production.**
- **Malformed-JSON 400 messages:** rare cases may be worded slightly differently (comments, nesting deeper than 64, invalid UTF-8). The common cases match word for word.
- **Unusual e-mail addresses:** addresses with non-ASCII characters or comments may be accepted or rejected differently from `System.Net.Mail`. Sending failures only set `EmailSent = false`; routing still completes.

## Configuration

`.env` (see `.env.example`):

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | SEPESS / TNBESSDB (`[General].*` procs) |
| `ROUTING_DATABASE_URL` | SEPRoutingManagement |
| `SHAREPOINT_DATABASE_URL` | SharePointDBEss (used by `essCurrentUser`, not by routing) |
| `MAIL_SERVER`, `MAIL_FROM`, `MAIL_SERVER_PORT`, `MAIL_CREDENTIAL_LOGIN`, `MAIL_CREDENTIAL_PASS` | ESS `Mail` section. STARTTLS when the port is not 25. |
| `TZ=Asia/Kuala_Lumpur` | required: database datetimes are UTC+8 wall-clock values |
| `ESS_PAGINATION_*` | defaults 1 / 10 / 100, as ESS `Pagination` |
| `NODE_ENV=production` | hides error details in 500 responses |

## Verification status

- **Automated tests:** `test/routingManagementHttp.test.ts` (HTTP contract, service mocked), `test/routingManagementService.test.ts` (service logic, model partly mocked), `test/essDotnet.test.ts` and `test/essInfra.test.ts` (emulation helpers). The full suite passes (223 tests).
- **Real database, read-only:** all read endpoints and the validation, 401, 405 and 415 paths matched ESS.
- **Not yet run against a real database:** the write paths (start, perform-action, goto-activity, withdraw, cancel, reassign, restart, workflow-history, process and custom workflow writes). Run each once on a test copy and compare the `RM.Task`, `RM.TaskHistory`, `RM.RoutingRestart` and `RM.RoutingLogs` rows with what ESS writes.

## Commands

```bash
npm install
npm run db:generate   # generate the 3 Prisma clients (no database changes)
npm run typecheck     # the build check; there is no separate build script
npm test
npm run dev           # serves on PORT (default 4000)
```

## Making a change

1. **Find the C# first.** Locate the method in ESS_Backend and the Node counterpart (same name in camelCase). If ESS_Backend changed, port the diff line for line.
2. **Keep the structure.** Keep the statement order, log lines, messages, `try/catch/finally` shape and `saveChanges()` points as in C#. Comments in Node quote the C# where the translation is not obvious; keep them up to date.
3. **New queries** go in the model file:
   - Write the SQL EF would generate.
   - Wrap nullable values in `sqlParam`.
   - Map rows with `read.*`.
   - Use `trackTask(s)` if the C# query is tracked and the entity is later modified.
4. **New endpoints:**
   - Add the route with `essEndpoint` in `src/routes/routingManagement/`. This gives 405 + `Allow` for other verbs.
   - Bind input with the `ess*` helpers. Use the C# parameter names as error keys.
   - Respond with `essOk` / `essFail` + `toEssJson`.
5. **Tests:** add or extend a test in `test/routingManagementHttp.test.ts` or `test/routingManagementService.test.ts`, then run `npm run typecheck` and `npm test`.

### Prompt template for an AI assistant

```text
Read docs/routing-management.md in atquest-nodejs first.
Task: <describe the change or bug>.
The .NET source of truth is uni10-ess-backend/ESS_Backend.Api/<C# file>, method <name>.
Keep behaviour identical to the C# (including its bugs) unless I say otherwise.
Use the existing ess* helpers, routingDb() unit of work and sqlParam(); do not add the mssql package;
never run prisma db push/migrate. Run `npm run typecheck` and `npm test` when done and
tell me which C# lines each change corresponds to.
```
