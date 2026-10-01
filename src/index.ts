import "dotenv/config";
import express from "express";
import cors from "cors";
import { authRouter } from "./routes/auth.js";
import { usersRouter } from "./routes/users.js";
import { errorHandler } from "./middleware/errors.js";
import { fail, ok } from "./utils/response.js";

const app = express();
const port = Number(process.env.PORT) || 4000;

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  ok(res, { ok: true });
});

app.use("/api/auth", authRouter);
app.use("/api/users", usersRouter);

app.use((_req, res) => {
  fail(res, 404, "Not found");
});

app.use(errorHandler);

app.listen(port, () => {
  console.log(`listening on ${port}`);
});
