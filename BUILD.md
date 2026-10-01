# Build a Node.js backend (Prisma)

Express + TypeScript (ESM) + Prisma + MySQL. One request always walks:

```
route → controller → service → model → MySQL
```

Routes own HTTP and auth. Controllers wrap `ok` / `created`. Services own Zod and rules. Models own Prisma queries only.

The rest of this guide uses **`User`** as the only table. Repeat the same four files for every later table.

## Stack

| Piece       | Choice                         |
| ----------- | ------------------------------ |
| Runtime     | Node.js 20+                    |
| Language    | TypeScript, `"type": "module"` |
| HTTP        | Express 5                      |
| Data access | Prisma → MySQL                 |
| Validation  | Zod                            |
| Dev runner  | `tsx watch`                    |

Imports use the `.js` suffix (NodeNext).

## Folder tree

```
prisma/
  schema.prisma
src/
  index.ts
  middleware/
    auth.ts
    errors.ts
  routes/
    users.ts
  controllers/
    usersController.ts
  services/
    usersService.ts
  models/
    prisma.ts          # shared PrismaClient
    user.ts            # queries for User only
  utils/
    response.ts        # ok, created, fail
    asyncHandler.ts
    errors.ts          # HttpError
```

Do not import `@prisma/client` in a controller. Do not put `res.json` in a service.

## 1. Scaffold

```bash
mkdir app && cd app
npm init -y
npm i express cors dotenv zod @prisma/client
npm i -D typescript tsx prisma @types/node @types/express @types/cors
npx prisma init
```

`"type": "module"`. Scripts:

```json
{
  "dev": "tsx watch src/index.ts",
  "db:generate": "prisma generate",
  "db:push": "prisma db push"
}
```

`tsconfig.json`: `"module": "NodeNext"`, `"moduleResolution": "NodeNext"`.

`.env`:

```
DATABASE_URL="mysql://USER:PASSWORD@localhost:3306/assessment"
PORT=4000
```

## 2. Envelope and errors

Every response is `{ success, status, message, data }`.

- `ok(res, data)` → 200
- `created(res, data)` → 201
- `fail(res, status, message)`
- Service throws `HttpError(409, "Email already in use")`
- `asyncHandler` forwards rejections to `errorHandler`

## 3. Shared client (`src/models/prisma.ts`)

```ts
import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();
```

One client for the process. Models import this file, not `@prisma/client` from a controller.

## 4. `User` table

`prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}

model User {
  id           String   @id @default(uuid())
  email        String   @unique
  name         String
  passwordHash String
  createdAt    DateTime @default(now())

  @@map("user")
}
```

```bash
npx prisma generate
npx prisma db push
```

## 5. Four files for `User`

**Model** — Prisma only.

```ts
import { prisma } from "./prisma.js";

export async function listUsers() {
  return prisma.user.findMany({
    select: { id: true, email: true, name: true, createdAt: true },
    orderBy: { name: "asc" },
  });
}

export async function findUserByEmail(email: string) {
  return prisma.user.findUnique({ where: { email } });
}

export async function insertUser(data: {
  name: string;
  email: string;
  passwordHash: string;
}) {
  return prisma.user.create({
    data,
    select: { id: true, email: true, name: true, createdAt: true },
  });
}
```

**Service** — Zod + rules. No Prisma.

```ts
import { z } from "zod";
import { HttpError } from "../utils/errors.js";
import { findUserByEmail, insertUser, listUsers } from "../models/user.js";

const createSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
});

export async function list() {
  return { users: await listUsers() };
}

export async function create(input: unknown) {
  const body = createSchema.parse(input);
  const email = body.email.toLowerCase();
  if (await findUserByEmail(email)) {
    throw new HttpError(409, "Email already in use");
  }
  const user = await insertUser({
    name: body.name,
    email,
    passwordHash: body.password, // hash in a real app
  });
  return { user };
}
```

**Controller** — params in, envelope out.

```ts
import { Request, Response } from "express";
import { created, ok } from "../utils/response.js";
import * as usersService from "../services/usersService.js";

export async function listUsers(_req: Request, res: Response) {
  ok(res, await usersService.list());
}

export async function createUser(req: Request, res: Response) {
  created(res, await usersService.create(req.body));
}
```

**Route** — verb, path, handler.

```ts
import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { createUser, listUsers } from "../controllers/usersController.js";

export const usersRouter = Router();
usersRouter.get("/", asyncHandler(listUsers));
usersRouter.post("/", asyncHandler(createUser));
```

## 6. Mount

`src/index.ts`: `dotenv`, `express.json()`, CORS, `GET /api/health`, `app.use("/api/users", usersRouter)`, 404, `errorHandler`, `listen`.

## 7. One request

`POST /api/users`:

1. Route calls `createUser`
2. Controller calls `usersService.create(req.body)` → `created`
3. Service parses body, rejects duplicate email with 409, inserts
4. Model runs `prisma.user.create`
5. Envelope: `{ success: true, status: 201, message: "success", data: { user } }`

## 8. Run

```bash
npx prisma generate
npx prisma db push
npx tsx src/index.ts
```

`GET /api/users` and `POST /api/users` with `{ "name", "email", "password" }`.
