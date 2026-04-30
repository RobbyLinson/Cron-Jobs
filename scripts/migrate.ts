import { Client } from "@neondatabase/serverless";
import { readFileSync } from "fs";
import { join } from "path";

async function migrate() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local and fill in your values.");
  }

  const client = new Client(url);
  await client.connect();

  const schema = readFileSync(join(process.cwd(), "scripts/schema.sql"), "utf-8");

  console.log("Running schema migration…");
  await client.query(schema);
  await client.end();
  console.log("Migration complete.");
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
