import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const reviewBoardSource = readFileSync(
  path.resolve(process.cwd(), "client/src/pages/ReviewBoard.tsx"),
  "utf8"
);

describe("واجهة لوحة المراجعات المتجاوبة", () => {
  it("تعرض بطاقات على الجوال بدل جدول سطح المكتب", () => {
    expect(reviewBoardSource).toContain('className="hidden overflow-x-auto md:block"');
    expect(reviewBoardSource).toContain('className="space-y-3 p-4 md:hidden"');
    expect(reviewBoardSource).toContain("setLocation(`/reviews/${review.id}`)");
    expect(reviewBoardSource).toContain("review.internalRef");
    expect(reviewBoardSource).toContain("review.reviewerStatusName");
    expect(reviewBoardSource).toContain("review.employeeStatusName");
  });

  it("يوفر حالات تحميل وفراغ وخطأ قابلة لإعادة المحاولة", () => {
    expect(reviewBoardSource).toContain("list.isLoading");
    expect(reviewBoardSource).toContain('className="h-48 animate-pulse rounded-xl bg-slate-100"');
    expect(reviewBoardSource).toContain("<EmptyState");
    expect(reviewBoardSource).toContain("لا توجد مراجعات لعرضها");
    expect(reviewBoardSource).toContain("list.isError");
    expect(reviewBoardSource).toContain("<QueryError");
    expect(reviewBoardSource).toContain('role="alert"');
    expect(reviewBoardSource).toContain("إعادة المحاولة");
    expect(reviewBoardSource).toContain("list.refetch()");
  });

  it("يفصل قائمة العمل اليومية عن الأرشيف دون تغيير الفلاتر المالية", () => {
    expect(reviewBoardSource).toContain('useState<"active" | "archived" | "cancelled">("active")');
    expect(reviewBoardSource).toContain("archiveScope,");
    expect(reviewBoardSource).toContain('setArchiveScope("active")');
    expect(reviewBoardSource).toContain('setArchiveScope("archived")');
    expect(reviewBoardSource).toContain('setArchiveScope("cancelled")');
    expect(reviewBoardSource).toContain("أرشيف عمليات المراجعة");
    expect(reviewBoardSource).toContain("المراجعات الملغاة");
    expect(reviewBoardSource).toContain("قائمة العمل");
  });

  it("يوفر مرشحات متابعة سريعة للخطر التشغيلي دون تجاوز قائمة الخادم", () => {
    expect(reviewBoardSource).toContain('useState<"all" | "overdue" | "dueSoon" | "unassigned" | "critical">("all")');
    expect(reviewBoardSource).toContain("attention: attention === \"all\" ? undefined : attention");
    expect(reviewBoardSource).toContain("تحتاج متابعة");
    expect(reviewBoardSource).toContain("خلال 3 أيام");
    expect(reviewBoardSource).toContain("دون تكليف");
    expect(reviewBoardSource).toContain("متأخرة");
  });

  it("يبقي دليل المسار التشغيلي قريبًا من قائمة العمل دون فرضه على المستخدم", () => {
    expect(reviewBoardSource).toContain("دليل المسار السريع للعمل");
    expect(reviewBoardSource).toContain("لا تُعد العملية مكتملة حتى يكتمل مسارا الموظف والمراجع");
    expect(reviewBoardSource).toContain("أرشف المكتمل، وألغِ غير الصالح");
    expect(reviewBoardSource).toContain("<details");
  });

  it("يوضح قرب الاستحقاق في صفوف القائمة وبطاقات الجوال", () => {
    expect(reviewBoardSource).toContain("<DueHint dueDate={review.dueDate} />");
    expect(reviewBoardSource).toContain('count === 1 ? "يوم"');
    expect(reviewBoardSource).toContain('count === 2 ? "يومين"');
    expect(reviewBoardSource).toContain("${count} أيام");
    expect(reviewBoardSource).toContain("متأخرة ${dayLabel(Math.abs(days))}");
    expect(reviewBoardSource).toContain("خلال ${dayLabel(days)}");
  });
});
