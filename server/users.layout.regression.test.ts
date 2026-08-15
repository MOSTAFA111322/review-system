import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const usersPage = readFileSync(new URL("../client/src/pages/Users.tsx", import.meta.url), "utf8");
const dashboardLayout = readFileSync(new URL("../client/src/components/DashboardLayout.tsx", import.meta.url), "utf8");
const homePage = readFileSync(new URL("../client/src/pages/Home.tsx", import.meta.url), "utf8");
const reviewBoard = readFileSync(new URL("../client/src/pages/ReviewBoard.tsx", import.meta.url), "utf8");

describe("غلاف صفحة إدارة المستخدمين", () => {
  it("يعرض صفحة المستخدمين وسجل تسجيل الدخول داخل غلاف لوحة التحكم في حالتي السماح والرفض", () => {
    expect(usersPage).toContain('import DashboardLayout from "@/components/DashboardLayout";');
    expect(usersPage.match(/<DashboardLayout>/g)).toHaveLength(2);
    expect(usersPage.match(/<\/DashboardLayout>/g)).toHaveLength(2);
  });

  it("يبقي بطاقة الحساب وخيار تسجيل الخروج ضمن الغلاف المشترك", () => {
    expect(dashboardLayout).toContain("user?.name || \"مستخدم النظام\"");
    expect(dashboardLayout).toContain("تسجيل الخروج");
    expect(dashboardLayout).toContain("onClick={logout}");
  });

  it("يوجه زر الدخول العام غير الموثق إلى شاشة الاعتمادات المحلية", () => {
    expect(homePage).toContain('setLocation("/login")');
    expect(homePage).not.toContain("onClick={() => startLogin()}");
  });

  it("يعرض رسالة عربية موجزة عند رفض اسم مستخدم يحوي مسافة بدل تفاصيل JSON الخادمية", () => {
    expect(usersPage).toContain("اسم المستخدم يجب أن يتكون من أحرف أو أرقام أو النقطة أو الشرطة فقط، من دون مسافات.");
    expect(usersPage).toContain('role="alert"');
    expect(usersPage).not.toContain("{createLocal.error.message}");
  });

  it("لا يفرض اتجاهًا لاتينيًا على اسم المستخدم الذي يدعم العربية واللاتينية", () => {
    expect(usersPage).toContain('id="local-username" dir="auto"');
    expect(usersPage).toContain('<p dir="auto" className="mt-1 text-xs text-slate-500">{account.username');
    expect(homePage).not.toContain('id="username" dir="ltr"');
  });

  it("يوفر رابطًا واضحًا من الحسابات إلى دليل الموظفين لتعديل الاسم", () => {
    expect(usersPage).toContain('setLocation("/settings")');
    expect(usersPage).toContain("تعديل أسماء الموظفين من دليل الموظفين");
  });

  it("يلون عناصر الفرز فوق جدول المراجعات بالبرتقالي محليًا دون تغيير حقول نموذج الإنشاء", () => {
    expect(reviewBoard).toContain('const filterControlClass');
    expect(reviewBoard).toContain("bg-orange-50");
    expect(reviewBoard).toContain('className={filterControlClass}');
  });
});
