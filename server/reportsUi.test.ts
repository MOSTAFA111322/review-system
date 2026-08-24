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


describe("عزل إعدادات التقارير عن الطباعة", () => {
  it("تستخدم صفحات التقارير حاويات طباعة وقسمًا نشطًا واضحًا", () => {
    expect(reportsSource).toContain("reports-print-root");
    expect(reportsSource).toContain("print-exclude rounded-2xl border-indigo-100");
    expect(reportsSource).toContain("print-exclude mb-4 rounded-xl");
  });

  it("تعزل صفحة المهام اليومية التقرير المختار وتخفي عناصر التحكم", () => {
    const dailyTasksSource = readFileSync(path.resolve(process.cwd(), "client/src/pages/DailyTasks.tsx"), "utf8");
    expect(dailyTasksSource).toContain("daily-tasks-print-root");
    expect(dailyTasksSource).toContain('print-section ${!reportOpen ? "print-active" : ""}');
    expect(dailyTasksSource).toContain("print-section print-active");
  });

  it("تخفي CSS عناصر الإعدادات والتحكم في نسخة الطباعة", () => {
    expect(stylesSource).toContain(".reports-print-root:has(.print-active)");
    expect(stylesSource).toContain(".daily-tasks-print-root .print-active fieldset");
    expect(stylesSource).toContain(".reports-print-root .print-active button");
  });
});


describe("تصدير سجل التدقيق الإداري", () => {
  it("يعرض بطاقة تصدير آمنة مع فلاتر الفترة والمنفذ والإجراء", () => {
    expect(reportsSource).toContain("trpc.activity.export.useQuery");
    expect(reportsSource).toContain("سجل التدقيق الإداري");
    expect(reportsSource).toContain("بداية سجل التدقيق");
    expect(reportsSource).toContain("اسم منفذ الحدث");
    expect(reportsSource).toContain("نوع الإجراء");
    expect(reportsSource).toContain("لا يتضمن كلمات المرور أو رموز الجلسات");
  });

  it("تربط أزرار CSV وExcel بنتائج الخادم فقط", () => {
    expect(reportsSource).toContain("audit.refetch()");
    expect(reportsSource).toContain("سجل-التدقيق.csv");
    expect(reportsSource).toContain("سجل-التدقيق.xls");
    expect(reportsSource).toContain('exportAudit("xls")');
    expect(reportsSource).toContain('exportAudit("csv")');
  });

  it("تفرض طبقة الخادم صلاحية التصدير وتضيّق النطاق لغير أصحاب الرؤية الشاملة", () => {
    const collaborationSource = readFileSync(path.resolve(process.cwd(), "server/routers/collaboration.ts"), "utf8");
    expect(collaborationSource).toContain("PERMISSIONS.REPORTS_EXPORT");
    expect(collaborationSource).toContain("userHasPermission(ctx.user, PERMISSIONS.REVIEWS_VIEW_ALL)");
    expect(collaborationSource).toContain("reviews.assignedEmployeeId");
    expect(collaborationSource).toContain("like(users.name");
  });
});
