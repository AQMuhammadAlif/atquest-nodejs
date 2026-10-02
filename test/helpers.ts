import { signToken, type TokenClaims } from "../src/utils/token.js";

export const EMPLOYEE_ID = "58308791-89fb-45d1-8a9e-72e430f8e677";

export function authHeader(userId = "1", claims: TokenClaims = { userName: "jdoe", employeeId: EMPLOYEE_ID }) {
  return { Authorization: `Bearer ${signToken(userId, claims)}` };
}
