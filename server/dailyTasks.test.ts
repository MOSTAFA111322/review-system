import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dailyTasksRouter } from "./routers/dailyTasks";

describe("daily tasks import contract", () => {
  it("يسجل إجراءات الموظفين والاستيراد والتقرير الموحد", () => {
    const procedures = dailyTasksRouter._def.procedures;
    expect(procedures.employees).toBeDefined();
    expect(procedures.importBatch).toBeDefined();
    expect(procedures.unifiedReport).toBeDefined();
  });

  it("يحمي الاستيراد بصلاحية الإدارة والعزل المالي ويتحقق من الموظفين والتكرار", () => {
    const source = readFileSync(new URL("./routers/dailyTasks.ts", import.meta.url), "utf8");
    expect(source).toContain("PERMISSIONS.DAILY_TASKS_MANAGE");
    expect(source).toContain("requireFiscalYearAccess(ctx.user, input.fiscalYearId, true)");
    expect(source).toContain("يحتوي الملف على موظف غير موجود أو غير نشط");
    expect(source).toContain("يوجد تكرار داخل ملف الاستيراد");
    expect(source).toContain("يوجد ${repeatedRows.length} من المهام موجودة مسبقًا");
    expect(source).toContain("لم يتم استيراد أي صف لتجنب التكرار");
    expect(source).toContain('source: "imported"');
  });

  it("يبقي التقرير الموحد مقيدًا بتصريح التقارير وبالسنة المالية", () => {
    const source = readFileSync(new URL("./routers/dailyTasks.ts", import.meta.url), "utf8");
    const reportSection = source.slice(source.indexOf("unifiedReport:"));
    expect(reportSection).toContain("PERMISSIONS.REPORTS_VIEW");
    expect(reportSection).toContain("requireFiscalYearAccess(ctx.user, input.fiscalYearId)");
    expect(reportSection).toContain("reviews.fiscalYearId");
  });
});

