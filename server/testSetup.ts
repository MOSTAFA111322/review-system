import { afterAll } from "vitest";
import { closeDb } from "./db";

// Each test file gets a clean database pool lifecycle. This prevents remote
// integration tests from exhausting connections when the full suite runs.
afterAll(async () => {
  await closeDb();
});

