import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { buildWeeklyTeamCompliance, dailyTasksRouter, matchesRecurrence } from "./routers/dailyTasks";

describe("daily tasks import contract", () => {
  it("يسجل إجراءات الموظفين والاستيراد والتقرير الموحد", () => {
    const procedures = dailyTasksRouter._def.procedures;
    expect(procedures.employees).toBeDefined();
    expect(procedures.importBatch).toBeDefined();
    expect(procedures.unifiedReport).toBeDefined();
    expect(procedures.operationalIndicators).toBeDefined();
    expect(procedures.weeklyTeamCompliance).toBeDefined();
    expect(procedures.weeklyTeamComplianceExport).toBeDefined();
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

  it("يطبق أنماط التكرار وفق تقويم العمل العربي والأيام المحددة", () => {
    expect(matchesRecurrence(new Date("2026-08-16T00:00:00Z"), "daily")).toBe(true);
    expect(matchesRecurrence(new Date("2026-08-16T00:00:00Z"), "workdays")).toBe(true);
    expect(matchesRecurrence(new Date("2026-08-14T00:00:00Z"), "workdays")).toBe(false);
    expect(matchesRecurrence(new Date("2026-08-16T00:00:00Z"), "weekly", "0,2,4")).toBe(true);
    expect(matchesRecurrence(new Date("2026-08-17T00:00:00Z"), "weekly", "0,2,4")).toBe(false);
  });

  it("يبقي مؤشرات الأداء مقيدة بالعرض والعزل المالي وبنطاق الموظف", () => {
    const source = readFileSync(new URL("./routers/dailyTasks.ts", import.meta.url), "utf8");
    const section = source.slice(source.indexOf("operationalIndicators:"), source.indexOf("unifiedReport:"));
    expect(section).toContain("PERMISSIONS.DAILY_TASKS_VIEW");
    expect(section).toContain("requireFiscalYearAccess(ctx.user, input.fiscalYearId)");
    expect(section).toContain("completionRate");
    expect(section).toContain("byEmployee");
  });

  it("يؤمن callback التنبيهات ويمنع تكرار الإشعارات ويقصر التقرير الأسبوعي على المديرين", () => {
    const source = readFileSync(new URL("./scheduledDailyTaskAlerts.ts", import.meta.url), "utf8");
    expect(source).toContain("user.isCron");
    expect(source).toContain("scheduleCronTaskUid");
    expect(source).toContain("daily_task.unupdated");
    expect(source).toContain("daily_task.weekly_report");
    expect(source).toContain("reports.view");
    expect(source).toContain("isNull(notifications.readAt)");
    expect(source).toContain("today.getUTCDay() === 6");
  });

  it("يتضمن عقد طباعة المهام فلاتر الكل والمتأخر والتصنيف", () => {
    const source = readFileSync(new URL("../client/src/pages/DailyTasks.tsx", import.meta.url), "utf8");
    expect(source).toContain("printScope");
    expect(source).toContain("طباعة الكل");
    expect(source).toContain("طباعة المتأخرة");
    expect(source).toContain("تصنيف الطباعة حسب الأولوية");
    expect(source).toContain("window.print()");
  });

  it("يبقي التقرير الموحد مقيدًا بتصريح التقارير وبالسنة المالية", () => {
    const source = readFileSync(new URL("./routers/dailyTasks.ts", import.meta.url), "utf8");
    const reportSection = source.slice(source.indexOf("unifiedReport:"));
    expect(reportSection).toContain("PERMISSIONS.REPORTS_VIEW");
    expect(reportSection).toContain("requireFiscalYearAccess(ctx.user, input.fiscalYearId)");
    expect(reportSection).toContain("reviews.fiscalYearId");
  });

  it("يجمع التزام الفرق بصورة آمنة ويطبق العتبة الخاصة ثم العامة", () => {
    const teams = buildWeeklyTeamCompliance([
      { teamName: "المراجعة", taskDate: new Date("2026-08-23T00:00:00Z"), status: "pending", notes: null },
      { teamName: "المراجعة", taskDate: new Date("2026-08-24T00:00:00Z"), status: "completed", notes: "تم" },
      { teamName: null, taskDate: new Date("2026-08-25T00:00:00Z"), status: "in_progress", notes: "قيد المتابعة" },
    ], 2, [{ teamName: "المراجعة", overdueThreshold: 1 }], new Date("2026-08-25T09:00:00Z"));
    expect(teams).toEqual(expect.arrayContaining([
      expect.objectContaining({ teamName: "المراجعة", total: 2, completed: 1, overdue: 1, unupdated: 1, completionRate: 50, threshold: 1, exceedsThreshold: true }),
      expect.objectContaining({ teamName: "بدون فريق", total: 1, completed: 0, overdue: 0, unupdated: 0, threshold: 2, exceedsThreshold: false }),
    ]));
  });

  it("يحمي تقرير الفرق بالتصريح الإداري وعزل السنة وصلاحية التصدير", () => {
    const source = readFileSync(new URL("./routers/dailyTasks.ts", import.meta.url), "utf8");
    const reportSection = source.slice(source.indexOf("weeklyTeamCompliance:"), source.indexOf("unifiedReport:"));
    expect(reportSection).toContain("PERMISSIONS.REPORTS_VIEW");
    expect(reportSection).toContain("PERMISSIONS.REPORTS_EXPORT");
    expect(reportSection).toContain("PERMISSIONS.DAILY_TASKS_MANAGE");
    expect(source).toContain("await requireFiscalYearAccess(user, input.fiscalYearId)");
  });

  it("يبني مقارنة الأسبوع السابق من بيانات الفرق الفعلية ويعرضها في التصدير", () => {
    const source = readFileSync(new URL("./routers/dailyTasks.ts", import.meta.url), "utf8");
    const reportSection = source.slice(source.indexOf("getWeeklyTeamComplianceReport"), source.indexOf("export const dailyTasksRouter"));
    expect(reportSection).toContain("previousWeekStart");
    expect(reportSection).toContain("completionRateDelta");
    expect(reportSection).toContain("overdueDelta");
    const uiSource = readFileSync(new URL("../client/src/pages/WeeklyTeamCompliance.tsx", import.meta.url), "utf8");
    expect(uiSource).toContain("مقارنة الإنجاز بالأسبوع السابق");
    expect(uiSource).toContain("previousCompletionRate");
    expect(uiSource).toContain("فرق الإنجاز");
  });

  it("يعرض التقرير الموحد وصف المهمة ووقتها وتاريخ إنجازها من الحقول المخزنة", () => {
    const source = readFileSync(new URL("./routers/dailyTasks.ts", import.meta.url), "utf8");
    const reportSection = source.slice(source.indexOf("unifiedReport:"));
    expect(reportSection).toContain("description: dailyTasks.description");
    expect(reportSection).toContain("dueTime: dailyTasks.dueTime");
    expect(reportSection).toContain("completedAt: dailyTasks.completedAt");
    const uiSource = readFileSync(new URL("../client/src/pages/DailyTasks.tsx", import.meta.url), "utf8");
    expect(uiSource).toContain("المهمة والتفاصيل");
    expect(uiSource).toContain("تاريخ الإنجاز");
    expect(uiSource).toContain("sourceLabel(task.source)");
  });
});
