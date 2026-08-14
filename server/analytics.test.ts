import { describe, expect, it } from "vitest";
import { calculateOverview, reportRows } from "./analytics";

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
});
