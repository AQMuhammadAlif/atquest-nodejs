import bcrypt from "bcryptjs";
import { z } from "zod";
import { findUserByEmail, insertUser, listUsers } from "../models/user.js";
import { HttpError } from "../utils/errors.js";
import { signToken } from "../utils/token.js";

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
    passwordHash: await bcrypt.hash(body.password, 10),
  });
  return { token: signToken(user.id), user };
}
