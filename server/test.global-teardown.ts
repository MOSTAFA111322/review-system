import { closeDb } from "./db";

/** Releases the shared MySQL pool after the complete Vitest run. */
export default async function globalTeardown() {
  await closeDb();
}
