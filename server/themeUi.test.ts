import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = (relativePath: string) => readFileSync(path.resolve(process.cwd(), relativePath), "utf8");
const appSource = source("client/src/App.tsx");
const themeSource = source("client/src/contexts/ThemeContext.tsx");
const cssSource = source("client/src/index.css");

describe("الوضع الليلي", () => {
  it("يُفعّل المظهر القابل للتبديل في جذر التطبيق ويحفظ الاختيار", () => {
    expect(appSource).toContain("switchable");
    expect(themeSource).toContain('localStorage.getItem("theme")');
    expect(themeSource).toContain('localStorage.setItem("theme", theme)');
    expect(themeSource).toContain('root.classList.add("dark")');
    expect(themeSource).toContain('root.classList.remove("dark")');
  });

  it("يوفر طبقة ألوان داكنة للبطاقات والنصوص والحقول والرسوم البيانية", () => {
    expect(cssSource).toContain(".dark {");
    expect(cssSource).toContain("color-scheme: dark");
    expect(cssSource).toContain(".dark .bg-white");
    expect(cssSource).toContain(".dark .text-slate-900");
    expect(cssSource).toContain(".dark input");
    expect(cssSource).toContain(".dark .recharts-text");
    expect(cssSource).toContain("prefers-reduced-motion: no-preference");
  });

  it("يُغلف جميع المسارات الإدارية بمزود السمة العام وطبقة الألوان المشتركة", () => {
    expect(appSource).toContain("<ThemeProvider");
    expect(appSource).toContain("<Router />");
    expect(appSource).toContain('path="/dashboard" component={Dashboard}');
    expect(appSource).toContain('path="/reports" component={Reports}');
    expect(appSource).toContain('path="/settings" component={Settings}');
    expect(appSource).toContain('path="/users" component={Users}');
    expect(cssSource).toContain(".dark .bg-white");
    expect(cssSource).toContain(".dark .border-slate-200");
    expect(cssSource).toContain(".dark .text-slate-900");
  });
});
