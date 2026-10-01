import { signToken } from "../src/utils/token.js";

export function authHeader(userId = "1") {
  return { Authorization: `Bearer ${signToken(userId)}` };
}
