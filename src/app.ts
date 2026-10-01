import express from "express";
import cors from "cors";
import { authRouter } from "./routes/auth.js";
import { usersRouter } from "./routes/users.js";
import { v1Router } from "./routes/v1.js";
import { errorHandler } from "./middleware/errors.js";
import { fail, ok } from "./utils/response.js";

export const app = express();

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  ok(res, { ok: true });
});

app.use("/api/auth", authRouter);
app.use("/api/users", usersRouter);
app.use("/v1", v1Router);

app.use((_req, res) => {
  fail(res, 404, "Not found");
});

app.use(errorHandler);
