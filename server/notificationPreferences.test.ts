import { readFileSync } from "node:fs";
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

  it("يبقي عداد الحرج والأرشفة اليدوية مقيدين بالحساب نفسه دون حذف السجل", () => {
    const source = readFileSync(new URL("./routers/extendedFeatures.ts", import.meta.url), "utf8");
    const section = source.slice(source.indexOf("notificationsRouter"), source.indexOf("rentalsRouter"));
    expect(section).toContain("criticalUnread");
    expect(section).toContain("archiveOlderThan30Days");
    expect(section).toContain("restoreArchived");
    expect(section).toContain("eq(notifications.userId, ctx.user.id)");
    expect(section).toContain("isNull(notifications.archivedAt)");
    expect(section).toContain("isNotNull(notifications.archivedAt)");
    expect(section).toContain("archivedAt: new Date()");
    expect(section).toContain("archivedAt: null");
  });

  it("يدعم البحث النصي داخل الأرشيف الشخصي فقط", () => {
    const source = readFileSync(new URL("./routers/extendedFeatures.ts", import.meta.url), "utf8");
    const section = source.slice(source.indexOf("notificationsRouter"), source.indexOf("rentalsRouter"));
    expect(section).toContain("search: z.string().trim().min(1).max(160).optional()");
    expect(section).toContain("like(notifications.title");
    expect(section).toContain("like(notifications.body");
    expect(section).toContain("eq(notifications.userId, ctx.user.id)");
    expect(section).toContain("archivedOnly");
  });

  it("يحفظ سجل بحث الأرشيف لكل حساب بحد أقصى ويعرض الاقتراحات الشخصية", () => {
    const preferences = readFileSync(new URL("./routers/dashboardPreferences.ts", import.meta.url), "utf8");
    expect(preferences).toContain("archiveSearchHistory: router");
    expect(preferences).toContain("archiveSearchText");
    expect(preferences).toContain("eq(userPreferences.userId, ctx.user.id)");
    expect(preferences).toContain("slice(0, 8)");
    expect(preferences).toContain("archiveSearchHistory: history");
    const ui = readFileSync(new URL("../client/src/pages/Notifications.tsx", import.meta.url), "utf8");
    expect(ui).toContain("dashboardPreferences.archiveSearchHistory.get");
    expect(ui).toContain("dashboardPreferences.archiveSearchHistory.record");
    expect(ui).toContain("اقتراحات البحث");
    expect(ui).toContain("عملياتك الأخيرة واقتراحات الفرق");
    expect(ui).toContain("onBlur={() => commitArchiveSearch()}");
  });
});
