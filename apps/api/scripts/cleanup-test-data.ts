import { loadConfig } from "../src/config";
import { createDatabase } from "../src/db";

const config = loadConfig();
const db = createDatabase(config.databaseUrl);

const deleted = await db.user.deleteMany({
  where: { email: { startsWith: "e2e-", endsWith: "@example.com" } },
});

console.log(`Deleted ${deleted.count} e2e test user(s) and all their data.`);
await db.$disconnect();
