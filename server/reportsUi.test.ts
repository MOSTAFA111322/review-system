import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const reportsSource = readFileSync(path.resolve(process.cwd(), "client/src/pages/Reports.tsx"), "utf8");
const stylesSource = readFileSync(path.resolve(process.cwd(), "client/src/index.css"), "utf8");

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
    expect(reportsSource).toContain("التقرير-الأسبوعي-للمهام-المتأخرة.xls");
    expect(reportsSource).toContain('exportWeeklyData("xls")');
    expect(reportsSource).toContain('exportWeeklyData("csv")');
    expect(reportsSource).toContain("وفق نطاق صلاحيتك");
  });

  it("تدعم اختيار أعمدة التقرير وتمنع التصدير عند عدم اختيار أي عمود", () => {
    expect(reportsSource).toContain("selectedExportKeys");
    expect(reportsSource).toContain("selectedWeeklyKeys");
    expect(reportsSource).toContain("اختر عمودًا واحدًا على الأقل قبل التصدير");
    expect(reportsSource).toContain("أعمدة التقرير الأسبوعي");
  });
});


  it("تتيح استعراض وطباعة التقرير العام والتقرير الأسبوعي مع تحديد القسم المطلوب للطباعة", () => {
    expect(reportsSource).toContain("printReport");
    expect(reportsSource).toContain('printTarget === "reviews"');
    expect(reportsSource).toContain('printTarget === "weekly"');
    expect(reportsSource).toContain("طباعة التقرير");
    expect(stylesSource).toContain("main:has(.print-active)");
  });
