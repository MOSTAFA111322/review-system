import { describe, expect, it } from "vitest";
import { summarizeTeamProductivity } from "../client/src/lib/teamProductivity";

describe("مؤشرات إنتاجية الفريق", () => {
  it("يجمع عبء المراجعات والمهام اليومية حسب الموظف دون مزج الموظفين", () => {
    const summary = summarizeTeamProductivity(
      [{ id: 7, name: "عمر", total: 4, completed: 3, overdue: 1 }, { id: 9, name: "مصطفى", total: 2, completed: 2, overdue: 0 }],
      [{ employeeId: 7, employeeName: "عمر", total: 5, completed: 2, overdue: 2, unupdated: 1 }, { employeeId: 12, employeeName: "عادل", total: 1, completed: 1, overdue: 0, unupdated: 0 }],
    );

    expect(summary.totalWorkload).toBe(12);
    expect(summary.completedWork).toBe(8);
    expect(summary.attentionItems).toBe(4);
    expect(summary.employeesNeedingAttention).toBe(1);
    expect(summary.rows.map(row => row.employeeName)).toEqual(["عمر", "مصطفى", "عادل"]);
    expect(summary.rows[0]).toMatchObject({ reviewTotal: 4, dailyTotal: 5, totalWorkload: 9, completedWork: 5, attentionItems: 4, reviewCompletionRate: 75, dailyCompletionRate: 40 });
  });

  it("يعيد نسبًا آمنة عند غياب أي عمل من أحد المصدرين", () => {
    const summary = summarizeTeamProductivity([{ id: 4, name: "عادل", total: 0, completed: 0, overdue: 0 }], []);
    expect(summary.rows[0]).toMatchObject({ totalWorkload: 0, reviewCompletionRate: 0, dailyCompletionRate: 0, attentionItems: 0 });
  });
});
