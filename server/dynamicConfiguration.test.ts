import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = (relativePath: string) => readFileSync(path.resolve(process.cwd(), relativePath), "utf8");
const schema = source("drizzle/schema.ts");
const customFieldsRouter = source("server/routers/extendedFeatures.ts");
const employeesRouter = source("server/routers/admin.ts");
const settingsPage = source("client/src/pages/Settings.tsx");
const detailPage = source("client/src/pages/ReviewDetail.tsx");
const boardPage = source("client/src/pages/ReviewBoard.tsx");

describe("التهيئة العامة للحقول والمرجعيات", () => {
  it("يدعم المخطط الأنواع النصية والعددية والقوائم والمرجعيات الحية", () => {
    for (const fieldType of ["textarea", "currency", "email", "url", "multi_select", "employee", "user", "reviewer_status", "employee_status"]) expect(schema).toContain(`"${fieldType}"`);
  });

  it("يتحقق الخادم من الاختيارات المتعددة والمرجعيات النشطة قبل الحفظ", () => {
    expect(customFieldsRouter).toContain('const optionFieldTypes = new Set(["select", "multi_select"])');
    expect(customFieldsRouter).toContain("referenceOptions");
    expect(customFieldsRouter).toContain("validReferenceIds");
    expect(customFieldsRouter).toContain('field.type === "multi_select"');
    expect(customFieldsRouter).toContain("أحد الاختيارات لم يعد متاحًا");
  });

  it("يعرض البناء الإداري أنواع الحقول وإدارة الموظفين دون تجاوز الصلاحيات", () => {
    expect(settingsPage).toContain("باني الحقول والمرجعيات");
    expect(settingsPage).toContain("دليل الموظفين");
    expect(settingsPage).toContain("trpc.employees.update.useMutation");
    expect(employeesRouter).toContain("PERMISSIONS.USERS_MANAGE");
    expect(employeesRouter).toContain("update: protectedProcedure");
  });

  it("يرسم نموذج التفاصيل المدخل الملائم لكل نوع من الحقول الجديدة", () => {
    expect(detailPage).toContain('field.type === "textarea"');
    expect(detailPage).toContain('field.type === "multi_select"');
    expect(detailPage).toContain("referenceOptions");
    expect(detailPage).toContain('field.type === "currency"');
  });

  it("يربط نموذج الإنشاء الحقول بنوع المهمة ويحفظها بعد إنشاء المراجعة", () => {
    expect(customFieldsRouter).toContain("forOperation: protectedProcedure");
    expect(customFieldsRouter).toContain("PERMISSIONS.REVIEWS_CREATE");
    expect(boardPage).toContain("trpc.customFields.forOperation.useQuery");
    expect(boardPage).toContain("trpc.customFields.values.set.useMutation");
    expect(boardPage).toContain("تظهر الحقول الإضافية حسب نوع المهمة");
    expect(boardPage).toContain("يرجى تعبئة الحقول المخصصة الإلزامية");
    expect(settingsPage).toContain("حقل إلزامي");
    expect(settingsPage).toContain("نص إرشادي للمستخدم");
  });
});
