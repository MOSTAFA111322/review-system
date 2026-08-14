import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function anonymousContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("protected review APIs", () => {
  it("rejects anonymous requests before querying reviews or fiscal-year data", async () => {
    const caller = appRouter.createCaller(anonymousContext());
    await expect(caller.reviews.list({ fiscalYearId: 1 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.fiscalYears.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
