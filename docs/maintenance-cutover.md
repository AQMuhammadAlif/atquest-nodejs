# Maintenance module: cutover from ESS_Backend to atquest-nodejs

The maintenance endpoints of ESS_Backend now also run in atquest-nodejs, with the same paths, query parameters, request bodies, status codes, messages and response shapes. A frontend can switch these calls to the atquest base URL without code changes, apart from the points under [What changes for callers](#what-changes-for-callers).

## Endpoints

40 endpoints, all under `/v1`. Code: `src/{routes,controllers,services,models}/maintenance/`.

| ESS controller | Path prefix | Endpoints |
| --- | --- | --- |
| NotificationMaintenance | `/v1/notification-maintenance` | `GET /`, `GET /routing-rule-ddl`, `GET /assign-to-ddl`, `GET /{id}`, `POST /`, `PUT /{id}`, `DELETE /{id}` |
| ApprovalMaintenance | `/v1/approval-maintenance` | `GET /`, `GET /routing-ddl`, `GET /routing-rule-ddl`, `GET /assign-to-ddl`, `GET /approval-step-ddl`, `GET /employee-picker`, `GET /{id}`, `POST /`, `PUT /{id}`, `DELETE /{id}` |
| ApproverRoleMaintenance | `/v1/approver-role-maintenance` | `GET /module-ddl`, `GET /role-ddl`, `GET /role-members`, `POST /role-members/single`, `POST /role-members/multiple`, `DELETE /role-members/single`, `DELETE /role-members/multiple`, `GET /division-ddl`, `GET /department-ddl`, `GET /unit-section-ddl`, `GET /people-picker` |
| IntegrationStatusMaintenance | `/v1/integration-status-maintenance` | `GET /module-ddl`, `GET /integration-status-ddl`, `GET /request-status-ddl`, `GET /`, `POST /retrigger` |
| MaintenanceHistory | `/v1/employee` | `GET /maintenance-category-ddl`, `GET /maintenance-type-ddl`, `GET /maintenance-status-ddl`, `GET /maintenance-history`, `GET /maintenance-history/{requestId}`, `GET /maintenance-history/{requestId}/details`, `GET /maintenance-history/{requestId}/audit-logs`, `GET /maintenance-history/{requestId}/employee` |

**Not migrated:** `POST /v1/employee/maintenance-history/{requestId}/withdraw` stays on ESS_Backend. It depends on the MSS Employee Profile in-tray workflow, which is outside maintenance. atquest returns 404 for it.

SPR Maintenance Category (`/v1/spr/maintenance-category`) was out of scope and stays on ESS.

## What changes for callers

- **Tokens.** Calls need an atquest JWT from `POST /api/auth/login`. ESS tokens are not accepted. Login uses the same `rbac.Users` accounts and passwords as ESS and accepts `userNameOrEmail` + `password`. The token carries the caller's `employeeId`, so users must log in to atquest once.
- **No per-module permissions.** ESS checks RBAC module permissions (`APPROVAL_MAINTENANCE`, `NOTIFICATION_MAINTENANCE`, `APPROVER_ROLE_MAINTENANCE`, `INTEGRATION_STATUS_MAINTENANCE`, `EMPLOYEE_HISTORY`) on every endpoint. atquest only requires a valid token, so **any logged-in user can call every maintenance endpoint, including writes.** Restrict access at the frontend or gateway until permissions are ported.
- **Act-as.** `X-Act-As-Employee-Id` works as in ESS: honoured only for members of the SharePoint group "Support Team - Account Simulator".
- **Unknown routes** under `/v1` (including non-GUID ids) return atquest's 404 body `{ success, status, message, data }` instead of ASP.NET's empty 404. Every defined endpoint returns ESS's `{ status, message, data }`.

## Deployment prerequisites

atquest needs three connection strings (see `.env.example`):

| Env var | Database |
| --- | --- |
| `DATABASE_URL` | SEPESS / TNBESSDB |
| `ROUTING_DATABASE_URL` | SEPRoutingManagement |
| `SHAREPOINT_DATABASE_URL` | SharePointDBEss |

All three databases must be on the **same SQL Server instance**, and atquest's login must be able to read across them. The IsEssAdmin check and the history audit log use cross-database 3-part names.

The databases need the ESS objects these endpoints use. They exist wherever ESS's maintenance screens already work. A fresh environment needs these ESS scripts, run with the target database selected (several have no `USE` statement):

| Database | Objects |
| --- | --- |
| SEPRoutingManagement | `RM.AvailableAction` (+ `ApprovalMaintenanceAvailableActionSeeder_001`), `RM.SearchNotificationMaintenanceTemplates`, `RM.SearchApprovalMaintenanceRules` |
| SharePointDBEss | `uniten.IsInGroup` |
| SEPESS | `General.Role_GetModules`, `Role_GetRoles`, `GetRoleMembers2`, `RoleMember_Save`, `RoleMember_Delete`; `Employee.Company` / `Division` / `UnitSection` (+ dropdown seeders); `General.GetIntegrationModule`, `GetIntegrationTransaction`, `UpdateIntegrationStatus`; `General.MaintenanceCategory` / `MaintenanceType` / `MaintenanceStatus` (+ seeders); `Employee.Request`, `Employee.RequestDetail`; `Employee.Request_ProfileHistory_UNITEN`, `Request_Query_UNITEN`, `RequestDetail_List_UNITEN`; `General.GetPeoplePicker` |

Never run `prisma db push` or `prisma migrate` against these databases.

## Verification status

- **Automated tests:** 173 tests cover every endpoint and every ESS result branch (validation, 400/404/409/500, paging, serialization), with the database layer mocked.
- **Against a local copy of the databases:** every read endpoint was exercised end to end and returned real data in ESS's format.
- **Not yet verified against a real database:** create / update / delete / retrigger (Notification and Approval maintenance writes, role-member add/delete, integration retrigger). These are covered only by the mocked tests. Before switching writes over, run each once in a non-production environment and compare the resulting rows with what ESS writes.
- The history detail endpoints were only exercised for "not found", because the local `Employee.Request` table was empty.
