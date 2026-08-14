import { describe, expect, it } from "vitest";
import { buildReviewListPlan, reviewListInput } from "./routers/reviews";

describe("review list input", () => {
  it("يقبل معاملات البحث والفلاتر المركبة والفرز والترقيم ضمن الحدود المعلنة", () => {
    const result = reviewListInput.parse({
      fiscalYearId: 1,
      page: 2,
      pageSize: 50,
      query: "مرجع",
      operationTypeIds: [1, 2],
      reviewerStatusIds: [3],
      employeeStatusIds: [4],
      priorities: ["urgent", "critical"],
      assignedEmployeeId: 5,
      dueFrom: "2026-01-01",
      dueTo: "2026-12-31",
      sortBy: "dueDate",
      sortDirection: "asc",
    });
    expect(result).toMatchObject({ fiscalYearId: 1, page: 2, pageSize: 50, sortBy: "dueDate", sortDirection: "asc" });
  });

  it("يرفض النطاقات غير الصالحة التي قد تتجاوز حدود قائمة المراجعات", () => {
    expect(() => reviewListInput.parse({ fiscalYearId: 0 })).toThrow();
    expect(() => reviewListInput.parse({ fiscalYearId: 1, pageSize: 101 })).toThrow();
    expect(() => reviewListInput.parse({ fiscalYearId: 1, priorities: ["unknown"] })).toThrow();
    expect(() => reviewListInput.parse({ fiscalYearId: 1, dueFrom: "01/01/2026" })).toThrow();
  });

  it("يبني خطة الفلترة والترقيم والفرز ويهرب رموز البحث الخاصة", () => {
    const plan = buildReviewListPlan(reviewListInput.parse({
      fiscalYearId: 9,
      page: 3,
      pageSize: 25,
      query: "100%_",
      operationTypeIds: [2],
      reviewerStatusIds: [3],
      employeeStatusIds: [4],
      priorities: ["critical"],
      assignedEmployeeId: 5,
      dueFrom: "2026-01-01",
      dueTo: "2026-12-31",
      sortBy: "priority",
      sortDirection: "asc",
    }));
    expect(plan).toMatchObject({ fiscalYearId: 9, offset: 50, queryTerm: "%100\\%\\_%", sortBy: "priority", sortDirection: "asc" });
    expect(plan.dueFrom?.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(plan.dueTo?.toISOString()).toBe("2026-12-31T00:00:00.000Z");
  });
});
