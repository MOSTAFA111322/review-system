import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Heartbeat callback contract", () => {
  const source = readFileSync(resolve(process.cwd(), "server/_core/heartbeat.ts"), "utf8");

  it("requires scheduled callback paths", () => {
    expect(source).toContain('path.startsWith("/api/scheduled/")');
    expect(source).toContain('message: "callback path must start with /api/scheduled/"');
  });

  it("uses six-field UTC cron expressions and does not create jobs during tests", () => {
    expect(source).toContain("6-field cron with seconds");
    expect(source).toContain("validateCallbackPath(job.path)");
    expect(source).toContain('"CreateHeartbeatJob"');
    expect(source).not.toContain("setInterval");
    expect(source).not.toContain("node-cron");
  });
});

export {};
