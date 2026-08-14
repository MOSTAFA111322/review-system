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
});
