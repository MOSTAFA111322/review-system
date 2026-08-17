import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const reportsSource = readFileSync(path.resolve(process.cwd(), "client/src/pages/Reports.tsx"), "utf8");

describe("واجهة تصدير التقرير الأسبوعي", () => {
  it("تعرض زرًا مستقلًا للتقرير الأسبوعي مع حالة تحميل وإيقاف عند غياب البيانات", () => {
    expect(reportsSource).toContain("exportWeeklyData");
    expect(reportsSource).toContain("تصدير التقرير الأسبوعي");
    expect(reportsSource).toContain("جارٍ التصدير…");
    expect(reportsSource).toContain("!weeklyOverdue.data?.rows.length");
  });

  it("تُنشئ ملف CSV من البيانات التي أعادها التقرير الخادمي فقط", () => {
    expect(reportsSource).toContain("weeklyOverdue.refetch()");
    expect(reportsSource).toContain("التقرير-الأسبوعي-للمهام-المتأخرة.csv");
    expect(reportsSource).toContain("وفق نطاق صلاحيتك");
  });
});

