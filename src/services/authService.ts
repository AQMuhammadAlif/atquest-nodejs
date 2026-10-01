import bcrypt from "bcryptjs";
import { z } from "zod";
import { findUserByEmail } from "../models/user.js";
import { HttpError } from "../utils/errors.js";
import { signToken } from "../utils/token.js";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function login(input: unknown) {
  const body = loginSchema.parse(input);
  const email = body.email.toLowerCase();
  const user = await findUserByEmail(email);
  const passwordMatches = user ? await bcrypt.compare(body.password, user.passwordHash) : false;
  if (!user || !passwordMatches) {
    throw new HttpError(401, "Invalid email or password");
  }

  return {
    token: signToken(user.id),
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt,
    },
  };
}
