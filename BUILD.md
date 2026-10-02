# Build a Node.js backend (Prisma)

Express + TypeScript (ESM) + Prisma + SQL Server. One request always walks:

```
route → controller → service → model → SQL Server
```

Routes own HTTP and auth. Controllers wrap the response helpers. Services own Zod and rules. Models own Prisma queries only.

This backend shares its databases with **ESS_Backend** (.NET). It started as a single `User` table and now also hosts modules migrated from ESS (see [ESS-contract modules](#7-ess-contract-modules-v1)).

## Stack

| Piece       | Choice                         |
| ----------- | ------------------------------ |
| Runtime     | Node.js 20+                    |
| Language    | TypeScript, `"type": "module"` |
| HTTP        | Express 5                      |
| Data access | Prisma → SQL Server            |
| Validation  | Zod                            |
| Dev runner  | `tsx watch`                    |
| Tests       | Vitest + Supertest             |

Imports use the `.js` suffix (NodeNext).

## Databases

Three SQL Server databases, all owned by ESS and all on the same instance. Each has its own Prisma schema and client:

| Schema file                 | Env var                   | Database             | Client import                    |
| --------------------------- | ------------------------- | -------------------- | -------------------------------- |
| `prisma/schema.prisma`      | `DATABASE_URL`            | SEPESS / TNBESSDB    | `src/models/prisma.ts`           |
| `prisma/routing.prisma`     | `ROUTING_DATABASE_URL`    | SEPRoutingManagement | `src/models/routingPrisma.ts`    |
| `prisma/sharepoint.prisma`  | `SHAREPOINT_DATABASE_URL` | SharePointDBEss      | `src/models/sharepointPrisma.ts` |

Rules:

- **Never run `prisma db push` or `prisma migrate`.** The schemas declare only the tables atquest uses, so Prisma would try to drop every other ESS table. There is no `db:push` script on purpose. Schema changes go through ESS's SQL scripts.
- Models map to existing tables with `@map` / `@@map` / `@@schema`, and may declare a subset of columns (read-only models).
- Some queries cross databases with 3-part names over the main connection (`[SharePointDBEss].[uniten].[IsInGroup]`, `[SEPRoutingManagement].[RM].[GetApprovalAuditLog]`). They require the databases to stay on one instance.
- Stored procedures are called with `$queryRaw` / `$executeRaw`. Pass nullable values through `sqlParam()` (exported next to each client): Prisma binds a JS `null` as an int-typed NULL, which SQL Server refuses to convert to `uniqueidentifier`.

## Folder tree

```
prisma/
  schema.prisma            # SEPESS: rbac.*, General.*, Employee.*
  routing.prisma           # SEPRoutingManagement: RM.*
  sharepoint.prisma        # SharePointDBEss: uniten.*
src/
  index.ts                 # listen
  app.ts                   # express app (imported by tests)
  generated/               # routing + sharepoint clients (git-ignored, `npm run db:generate`)
  middleware/
    auth.ts                # requireAuth (JWT)
    errors.ts              # atquest envelope errors
    essCurrentUser.ts      # req.employeeId (+ X-Act-As-Employee-Id)
    essErrors.ts           # ESS-contract errors for /v1
  routes/
    auth.ts
    users.ts
    v1.ts                  # /v1: requireAuth + one router per module
    maintenance/           # one folder per module
      index.ts             # module router: owns the module's /v1 paths
      notificationMaintenance.ts
      ...
  controllers/
    authController.ts
    usersController.ts
    maintenance/
  services/
    authService.ts
    usersService.ts
    peoplePickerService.ts # shared ESS helper
    maintenance/
  models/
    prisma.ts / routingPrisma.ts / sharepointPrisma.ts
    user.ts / employee.ts / spGroup.ts
    peoplePicker.ts / orgDropdown.ts   # shared ESS lookups
    maintenance/
  utils/
    response.ts            # atquest envelope: ok, created, fail
    essResponse.ts         # ESS envelope: essOk, essCreated, essFail, PagedResult
    essRequest.ts          # ASP.NET-style query binding, paging, GUID routes, dates
    essValidation.ts       # ASP.NET-style body binding + ProblemDetails errors
    essFormat.ts           # .NET date / GUID serialization
    asyncHandler.ts
    errors.ts              # HttpError
    password.ts            # PBKDF2 (ESS-compatible)
    token.ts               # JWT
test/
  setup.ts                 # stubs all Prisma clients
  helpers.ts               # authHeader()
  *.test.ts
  maintenance/
```

Do not import a Prisma client in a controller. Do not put `res.json` in a service.

## 1. Setup

```bash
npm install
cp .env.example .env       # fill in the three connection strings and JWT_SECRET
npm run db:generate        # generates all three Prisma clients
npm run dev
```

Scripts:

| Script                | Does                                   |
| --------------------- | -------------------------------------- |
| `npm run dev`         | `tsx watch src/index.ts`               |
| `npm run db:generate` | `prisma generate` for all three schemas |
| `npm test`            | Vitest, once                           |
| `npm run typecheck`   | `tsc --noEmit`                         |

`.env.example` lists every variable: the three connection strings, `JWT_SECRET` / `JWT_EXPIRES_IN`, login lockout (`AUTH_MAX_FAILED_LOGINS`, `AUTH_LOCK_MINUTES`) and ESS paging (`ESS_PAGINATION_*`).

## 2. Two response contracts

**atquest routes** (`/api/...`) use `{ success, status, message, data }`:

- `ok(res, data)` → 200, `created(res, data)` → 201, `fail(res, status, message)`
- Services throw `HttpError(409, "Email already in use")`; `asyncHandler` forwards rejections to `errorHandler`.

**ESS-contract routes** (`/v1/...`) reproduce ESS_Backend exactly, so the ESS frontend can switch base URL without changes:

- `essOk(res, data, message)` / `essCreated(res, data, message, location?)` → `{ status: "success", message, data }`
- `HttpError` → `{ status: "error", message, data: null }`
- Body/query binding failures → ASP.NET ProblemDetails (`{ type, title, status, errors, traceId }`)
- Anything else → ESS's 500 body (`message` shows the real error unless `NODE_ENV=production`)

## 3. Auth and identity

- `POST /api/auth/login` checks `rbac.Users` like ESS: username or email, PBKDF2 password, inactive / non-LOCAL / locked checks, lockout after `AUTH_MAX_FAILED_LOGINS` failures for `AUTH_LOCK_MINUTES`.
- On success it resolves the employee (`General.Employee.LoginName = rbac.Users.UserName`) and issues a JWT with `sub`, `unique_name`, `email` and `employeeId`.
- `requireAuth` verifies the JWT. On `/v1`, `essCurrentUser` sets `req.employeeId` from the claim, or from `X-Act-As-Employee-Id` when the caller is in the SharePoint group "Support Team - Account Simulator".
- ESS's per-module RBAC checks (`RequirePermission`) are **not** ported: any authenticated user can call `/v1`.

## 4. Adding a table (four files)

**Model**: Prisma only.

```ts
import { prisma } from "./prisma.js";

export async function listUsers() {
  return prisma.user.findMany({
    select: { userId: true, email: true, displayName: true },
    orderBy: { displayName: "asc" },
  });
}
```

**Service**: Zod and rules. No Prisma.

```ts
export async function create(input: unknown) {
  const body = createSchema.parse(input);
  if (await emailExists(body.email)) {
    throw new HttpError(409, "UserPrincipalName, UserName, or Email already exists.");
  }
  // ...
}
```

**Controller**: params in, envelope out.

```ts
export async function createUser(req: Request, res: Response) {
  created(res, await usersService.create(req.body));
}
```

**Route**: verb, path, middleware, handler.

```ts
usersRouter.post("/", requireAuth, asyncHandler(createUser));
```

Map the table in the right schema file (with `@@schema`), then `npm run db:generate`. Columns that are `bigint` come back as `BigInt`: convert them (`String(id)`) before `res.json`.

## 5. Mount

`src/app.ts`: `express.json()`, CORS, `GET /api/health`, `/api/auth`, `/api/users`, `/v1`, 404, `errorHandler`. `src/index.ts` only calls `listen`.

## 6. Run

```bash
npm run db:generate
npm run dev
```

## 7. ESS-contract modules (/v1)

Each module migrated from ESS gets its own subfolder in every layer (`routes/<module>/`, `controllers/<module>/`, `services/<module>/`, `models/<module>/`, `test/<module>/`). `routes/<module>/index.ts` exports one router that mounts the module's ESS paths, and `routes/v1.ts` adds it with one line. Helpers shared by several modules (people picker, org dropdowns) stay at the top level.

When porting a controller, keep ESS's observable behaviour:

- Paths, query names (case-insensitive) and messages exactly as ESS. Use `queryString` / `queryInt` / `queryGuid` / `queryBool` and `guidParam("id")` for `{id:guid}` routes.
- Paging via `resolvePaging` (defaults 1 / 10, max 100; some screens use `MAINTENANCE_MAX_PAGE_SIZE` = 500 and legacy `_page` / `_limit`).
- Request bodies via `parseEssBody(schema, req.body)` with `essField.*` builders. They reproduce `[Required]` (including implicit required for non-nullable strings), `[MaxLength]`, `Guid.Empty` for missing GUIDs, and property-initializer defaults.
- Serialize with `toEssGuid` (lowercase), `toEssDate` (.NET `DateTime`, no `Z`) or `toEssRoundTripUtc` (`ToString("o")`), matching what the ESS DTO did.
- Multi-step writes go in one `$transaction` when ESS used one (or a single `SaveChanges`).

The maintenance module (`docs/maintenance-cutover.md`) is the reference implementation.

## 8. Tests

```bash
npm test
```

- Tests import `app` and call it with Supertest. Each file `vi.mock`s the model modules it touches, so tests never reach a database. `test/setup.ts` replaces all three Prisma clients with stubs that throw if anything gets through.
- `authHeader(userId, claims)` in `test/helpers.ts` signs a token (by default with an `employeeId` claim).
- Known issue: on Windows with Node 24, a Vitest worker occasionally dies with native error `0xC0000409` in a random file (about 1 run in 10, either pool). It is runner-specific: the app itself stays up under sustained load. Re-run if a run dies without a failing test.
