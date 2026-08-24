import { describe, expect, it } from "vitest";
import { calculateOverview, reportRows } from "./analytics";
import { analyticsRouter, mondayOf, summarizeUserStats } from "./routers/analytics";

const now = new Date("2026-01-10T12:00:00.000Z");

describe("analytics", () => {
  it("يعرض مؤشرات صفرية سليمة عندما لا توجد مراجعات حقيقية ضمن النطاق", () => {
    const result = calculateOverview([], new Set(), now);
    expect(result.metrics).toEqual({ total: 0, completed: 0, completionRate: 0, averageAgeDays: 0, overdue: 0, rework: 0 });
    expect(result.priorityBreakdown).toEqual([{ priority: "normal", count: 0 }, { priority: "urgent", count: 0 }, { priority: "critical", count: 0 }]);
    expect(result.trend).toEqual([]);
    expect(result.employeePerformance).toEqual([]);
  });

  it("يصدر تقريرًا خاليًا دون اختراع سجلات مراجعة للاختبار", () => {
    expect(reportRows([], new Set(), now)).toEqual([]);
  });

  it("يحسب بداية الأسبوع وفق معيار الاثنين ويعالج الأحد ضمن الأسبوع السابق", () => {
    expect(mondayOf("2026-08-17")).toBe("2026-08-17");
    expect(mondayOf("2026-08-23")).toBe("2026-08-17");
  });

  it("يحسب إحصائيات المستخدمين حسب الدور وحالة التنشيط دون كشف بيانات الحساب", () => {
    expect(summarizeUserStats([{ id: 1, isActive: true }, { id: 2, isActive: false }, { id: 3, isActive: true }], [{ userId: 1, roleName: "مدير" }, { userId: 2, roleName: "موظف" }])).toEqual({ total: 3, active: 2, inactive: 1, roles: [{ name: "مدير", count: 1 }, { name: "موظف", count: 1 }, { name: "بدون دور", count: 1 }] });
  });

  it("يسجل التقرير الأسبوعي والتصدير وإحصائيات المستخدمين كإجراءات تحليلية محمية", () => {
    const procedures = analyticsRouter._def.procedures;
    expect(procedures.weeklyOverdue).toBeDefined();
    expect(procedures.export).toBeDefined();
    expect(procedures.userStats).toBeDefined();
  });
});
