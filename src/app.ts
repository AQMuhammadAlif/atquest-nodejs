import express from "express";
import cors from "cors";
import { authRouter } from "./routes/auth.js";
import { usersRouter } from "./routes/users.js";
import { v1Router } from "./routes/v1.js";
import { errorHandler } from "./middleware/errors.js";
import { essJsonBody } from "./middleware/essJsonBody.js";
import { fail, ok } from "./utils/response.js";

// ESS_Backend routes are "v{version:apiVersion}/...", which matches both v1 and v1.0.
const ESS_PATHS = ["/v1", "/v1.0"];

export const app = express();

app.use(cors());
app.use(ESS_PATHS, essJsonBody);
app.use(express.json());

app.get("/api/health", (_req, res) => {
  ok(res, { ok: true });
});

app.use("/api/auth", authRouter);
app.use("/api/users", usersRouter);
app.use(ESS_PATHS, v1Router);

app.use((_req, res) => {
  fail(res, 404, "Not found");
});

app.use(errorHandler);
