import { describe, expect, it } from "vitest";
import { isNotificationMuted, readNotificationMuteUntil } from "./notificationPreferences";

describe("تفضيلات كتم الإشعارات", () => {
  const now = new Date("2026-08-25T09:00:00.000Z");

  it("يقبل وقت ISO صحيحًا فقط ويحفظ التفضيلات الأخرى دون افتراضات", () => {
    expect(readNotificationMuteUntil({ notificationMuteUntil: "2026-08-25T10:00:00.000Z", dashboardPeriod: "month" })?.toISOString()).toBe("2026-08-25T10:00:00.000Z");
    expect(readNotificationMuteUntil({ notificationMuteUntil: "غير صالح" })).toBeNull();
    expect(readNotificationMuteUntil(null)).toBeNull();
  });

  it("يعد الكتم نشطًا قبل وقت الانتهاء فقط", () => {
    expect(isNotificationMuted({ notificationMuteUntil: "2026-08-25T10:00:00.000Z" }, now)).toBe(true);
    expect(isNotificationMuted({ notificationMuteUntil: "2026-08-25T09:00:00.000Z" }, now)).toBe(false);
    expect(isNotificationMuted({}, now)).toBe(false);
  });
});
