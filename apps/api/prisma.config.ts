import "dotenv/config";
import { defineConfig } from "prisma/config";

/**
 * `prisma generate` runs during builds and never connects to the database, so
 * fall back to a placeholder when DATABASE_URL is not present at build time
 * (e.g. a PaaS that only injects it at runtime). Real commands such as
 * `prisma migrate deploy` still require a reachable DATABASE_URL and will fail
 * with a connection error if it is missing.
 */
const databaseUrl =
  process.env.DATABASE_URL?.trim() ||
  "postgresql://placeholder:placeholder@localhost:5432/placeholder";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: databaseUrl,
  },
});
