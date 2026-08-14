import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const usersPage = readFileSync(new URL("../client/src/pages/Users.tsx", import.meta.url), "utf8");
const dashboardLayout = readFileSync(new URL("../client/src/components/DashboardLayout.tsx", import.meta.url), "utf8");

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
});
