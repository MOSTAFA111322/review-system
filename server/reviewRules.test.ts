import { describe, expect, it } from "vitest";
import { completedAtForTransition, isReviewComplete } from "./reviewRules";

describe("review completion rules", () => {
  it("لا يعد العملية مكتملة إلا عندما تكون حالتا المراجع والموظف نهائيتين", () => {
    expect(isReviewComplete(false, false)).toBe(false);
    expect(isReviewComplete(true, false)).toBe(false);
    expect(isReviewComplete(false, true)).toBe(false);
    expect(isReviewComplete(true, true)).toBe(true);
  });

  it("لا يسجل تاريخ الإكمال في الانتقال أحادي الطرف", () => {
    const now = new Date("2026-08-14T12:00:00.000Z");
    expect(completedAtForTransition(false, true, now)).toBeNull();
    expect(completedAtForTransition(true, true, now)).toBe(now);
  });
});
