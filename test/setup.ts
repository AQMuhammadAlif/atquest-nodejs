import { vi } from "vitest";

// Unit tests mock the model layer, so no real PrismaClient is ever needed. Replace all three
// client modules with inert stubs that fail loudly if a test reaches a real database call.
function unusableClient(name: string) {
  return new Proxy(
    {},
    {
      get: (_target, property) => {
        if (property === "then") return undefined;
        return () => {
          throw new Error(`${name}.${String(property)} called in a unit test; mock the model module instead.`);
        };
      },
    },
  );
}

const sqlParam = (value: unknown) => value;

vi.mock("../src/models/prisma.js", () => ({ prisma: unusableClient("prisma"), sqlParam }));
vi.mock("../src/models/routingPrisma.js", () => ({ routingPrisma: unusableClient("routingPrisma"), sqlParam }));
vi.mock("../src/models/sharepointPrisma.js", () => ({ sharepointPrisma: unusableClient("sharepointPrisma") }));
