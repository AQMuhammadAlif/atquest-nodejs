import { PrismaClient } from "../generated/sharepoint/index.js";

// SharePointDBEss (SHAREPOINT_DATABASE_URL).
export const sharepointPrisma = new PrismaClient();
