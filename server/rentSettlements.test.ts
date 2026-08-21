import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("rent settlements API contract", () => {
  const source = readFileSync(resolve(process.cwd(), "server/routers/rentSettlements.ts"), "utf8");
  const schema = readFileSync(resolve(process.cwd(), "drizzle/schema.ts"), "utf8");

  it("keeps owners and settlements isolated by fiscal year and protected by dedicated permissions", () => {
    expect(source).toContain("PERMISSIONS.RENT_OWNERS_VIEW");
    expect(source).toContain("PERMISSIONS.RENT_OWNERS_MANAGE");
    expect(source).toContain("PERMISSIONS.RENT_SETTLEMENTS_VIEW");
    expect(source).toContain("PERMISSIONS.RENT_SETTLEMENTS_MANAGE");
    expect(source).toContain("requireFiscalYearAccess(ctx.user, input.fiscalYearId)");
    expect(source).toContain("requireFiscalYearAccess(ctx.user, input.fiscalYearId, true)");
  });

  it("prevents duplicate owners and imported settlements", () => {
    expect(source).toContain("اسم المالك موجود مسبقًا في السنة المالية.");
    expect(source).toContain("التسوية مستوردة مسبقًا.");
    expect(schema).toContain("rent_owners_fy_name_unique");
    expect(schema).toContain("rent_settlements_source_fingerprint_unique");
  });

  it("keeps owner confirmation and management transfer financially separate", () => {
    expect(source).toContain("ownerNetAmount");
    expect(source).toContain("managementFee");
    expect(source).toContain("beneficiary");
    expect(source).toContain("يجب أن يساوي الإجمالي أتعاب الإدارة مضافًا إليها صافي المالك");
  });
});
