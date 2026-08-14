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

  it("يحظر التعديل والتكليف والحذف والاستعادة وتغيير الحالة قبل أي وصول للبيانات", async () => {
    const caller = appRouter.createCaller(anonymousContext());
    const createWithoutPayload = caller.reviews.create as unknown as (input: unknown) => Promise<unknown>;
    await expect(createWithoutPayload({})).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.reviews.update({ id: 1 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.reviews.assign({ id: 1, employeeId: null })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.reviews.remove({ id: 1 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.reviews.restore({ id: 1 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.reviews.changeStatus({ id: 1, side: "employee", toStatusId: 1 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
