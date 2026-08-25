import { describe, expect, it } from "vitest";
import { buildTeamThresholdRecipients } from "./teamOverdueAlerts";
import { buildComplianceDeclines } from "./teamComplianceDeclineAlerts";

describe("عتبات تنبيه فرق العمل", () => {
  it("يستخدم العتبة المستقلة للفريق ولا يستهدف أعضاء فريق غير متأثر", () => {
    const recipients = buildTeamThresholdRecipients({
      defaultThreshold: 3,
      thresholdsByTeam: [{ teamName: "المراجعة", overdueThreshold: 2 }],
      overdueByTeam: new Map([["المراجعة", 2], ["المحاسبة", 1]]),
      teamMembers: [{ userId: 10, teamName: "المراجعة" }, { userId: 11, teamName: "المحاسبة" }, { userId: null, teamName: "المراجعة" }],
    });

    expect(recipients).toEqual([{ userId: 10, teamName: "المراجعة", threshold: 2 }]);
  });

  it("يعتمد العتبة العامة عندما لا يملك الفريق إعدادًا مستقلًا", () => {
    const recipients = buildTeamThresholdRecipients({
      defaultThreshold: 3,
      thresholdsByTeam: [],
      overdueByTeam: new Map([["المحاسبة", 3]]),
      teamMembers: [{ userId: 11, teamName: "المحاسبة" }],
    });

    expect(recipients).toEqual([{ userId: 11, teamName: "المحاسبة", threshold: 3 }]);
  });

  it("لا ينبه إلا عن تراجع فعلي تجاوز العتبة مع وجود مهام في الفترتين", () => {
    const declines = buildComplianceDeclines({
      threshold: 15,
      previous: [
        { teamName: "المراجعة", status: "completed" },
        { teamName: "المراجعة", status: "completed" },
        { teamName: "المحاسبة", status: "completed" },
      ],
      current: [
        { teamName: "المراجعة", status: "pending" },
        { teamName: "المراجعة", status: "completed" },
        { teamName: "المحاسبة", status: "completed" },
        { teamName: "فريق جديد", status: "pending" },
      ],
    });

    expect(declines).toEqual([{ teamName: "المراجعة", completionRate: 50, previousCompletionRate: 100, completionRateDelta: -50 }]);
  });
});
