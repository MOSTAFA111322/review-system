import { describe, expect, it } from "vitest";
import { assertFiscalYearWritable } from "./rbac";

describe("fiscal year write rule", () => {
  it("يسمح بالكتابة في السنة المفتوحة", () => {
    expect(() => assertFiscalYearWritable("open")).not.toThrow();
  });

  it("يرفض الكتابة في السنة المغلقة برسالة وحالة API واضحتين", () => {
    try {
      assertFiscalYearWritable("closed");
      throw new Error("expected closed year to throw");
    } catch (error) {
      expect(error).toMatchObject({ code: "CONFLICT", message: "السنة المالية مغلقة ولا تقبل أي تعديل." });
    }
  });
});
