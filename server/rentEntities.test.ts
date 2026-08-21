import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("rent entities API contract", () => {
  const routerSource = readFileSync(resolve(process.cwd(), "server/routers/rentEntities.ts"), "utf8");
  const followUpsSource = readFileSync(resolve(process.cwd(), "server/routers/rentFollowUps.ts"), "utf8");

  it("enforces permission and fiscal-year checks on every entity operation", () => {
    expect(routerSource).toContain("requirePermission(ctx.user, PERMISSIONS.RENT_FOLLOWUPS_VIEW)");
    expect(routerSource).toContain("requirePermission(ctx.user, PERMISSIONS.RENT_FOLLOWUPS_CREATE)");
    expect(routerSource).toContain("requirePermission(ctx.user, PERMISSIONS.RENT_FOLLOWUPS_UPDATE)");
    expect(routerSource).toContain("requireFiscalYearAccess(ctx.user, input.fiscalYearId)");
    expect(routerSource).toContain("requireFiscalYearAccess(ctx.user, input.fiscalYearId, true)");
  });

  it("keeps duplicate guards for buildings, units, and internal contract numbers", () => {
    expect(routerSource).toContain("اسم العمارة موجود مسبقًا في هذه السنة المالية.");
    expect(routerSource).toContain("رقم الوحدة موجود مسبقًا في هذه العمارة.");
    expect(routerSource).toContain("رقم العقد الداخلي مكرر لهذه الوحدة في السنة المالية.");
    expect(routerSource).toContain('code: "CONFLICT"');
  });

  it("preserves legacy payment rows through optional entity references and validates linked ids server-side", () => {
    expect(followUpsSource).toContain("buildingId");
    expect(followUpsSource).toContain("unitId");
    expect(followUpsSource).toContain("contractId");
    expect(followUpsSource).toContain("rentBuildings");
    expect(followUpsSource).toContain("rentUnits");
    expect(followUpsSource).toContain("rentContracts");
  });
});
