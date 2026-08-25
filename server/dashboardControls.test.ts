import { describe, expect, it } from "vitest";
import { getDailyDelayAlert, resolveDashboardDateRange } from "../client/src/lib/dashboardControls";
import { sortTeamProductivityRows, type TeamProductivityMember } from "../client/src/lib/teamProductivity";

const members: TeamProductivityMember[] = [
  { employeeId: 1, employeeName: "عمر", reviewTotal: 4, reviewCompleted: 3, reviewOverdue: 1, dailyTotal: 2, dailyCompleted: 2, dailyOverdue: 0, dailyUnupdated: 0, totalWorkload: 6, completedWork: 5, attentionItems: 1, reviewCompletionRate: 75, dailyCompletionRate: 100 },
  { employeeId: 2, employeeName: "مصطفى", reviewTotal: 2, reviewCompleted: 2, reviewOverdue: 0, dailyTotal: 5, dailyCompleted: 2, dailyOverdue: 3, dailyUnupdated: 1, totalWorkload: 7, completedWork: 4, attentionItems: 4, reviewCompletionRate: 100, dailyCompletionRate: 40 },
];

describe("dashboard controls", () => {
  it("يقيد فترة الأيام الأخيرة داخل حدود السنة المالية", () => {
    expect(resolveDashboardDateRange({ preset: "last7", customStartDate: "", customEndDate: "", fiscalStartDate: "2026-08-23", fiscalEndDate: "2026-12-31", now: new Date("2026-08-25T12:00:00Z") })).toMatchObject({ startDate: "2026-08-23", endDate: "2026-08-25", isValid: true });
  });

  it("يرفض الفترة المخصصة خارج السنة أو المقلوبة", () => {
    expect(resolveDashboardDateRange({ preset: "custom", customStartDate: "2026-01-01", customEndDate: "2026-08-25", fiscalStartDate: "2026-08-01", fiscalEndDate: "2026-12-31" }).isValid).toBe(false);
    expect(resolveDashboardDateRange({ preset: "custom", customStartDate: "2026-09-10", customEndDate: "2026-09-01", fiscalStartDate: "2026-08-01", fiscalEndDate: "2026-12-31" }).isValid).toBe(false);
  });

  it("يفرز صفوف الإنتاجية ويصعّد التنبيه عند تجاوز عتبة التأخر", () => {
    expect(sortTeamProductivityRows(members, "totalWorkload", "asc").map(member => member.employeeName)).toEqual(["عمر", "مصطفى"]);
    expect(sortTeamProductivityRows(members, "attentionItems", "desc")[0].employeeName).toBe("مصطفى");
    expect(getDailyDelayAlert(3, 0).tone).toBe("escalate");
    expect(getDailyDelayAlert(1, 2).tone).toBe("monitor");
    expect(getDailyDelayAlert(2, 0, 2).tone).toBe("escalate");
    expect(getDailyDelayAlert(2, 0, 3).tone).toBe("monitor");
  });
});
