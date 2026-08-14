import { describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";
import { join } from "node:path";

const projectRoot = join(import.meta.dirname, "..");
const reviewsSource = readFileSync(join(projectRoot, "server/routers/reviews.ts"), "utf8");
const collaborationSource = readFileSync(join(projectRoot, "server/routers/collaboration.ts"), "utf8");
const attachmentsSource = readFileSync(join(projectRoot, "server/routers/extendedFeatures.ts"), "utf8");

describe("closed fiscal-year write coverage", () => {
  it("يمرر كل مسار مراجعة كاتب عبر حارس السنة بوضع الكتابة", () => {
    for (const procedure of ["create:", "update:", "assign:", "remove:", "restore:", "changeStatus:"]) {
      const start = reviewsSource.indexOf(procedure);
      expect(start, procedure).toBeGreaterThanOrEqual(0);
      const next = reviewsSource.indexOf("\n  }),", start);
      expect(reviewsSource.slice(start, next)).toContain("true");
    }
    expect(reviewsSource).toContain("await requireFiscalYearAccess(ctx.user, input.fiscalYearId, true)");
    expect(reviewsSource).toContain("await requireFiscalYearAccess(ctx.user, review.fiscalYearId, true)");
  });

  it("يمرر التعليقات والمرفقات الكاتبة عبر الحارس نفسه قبل الكتابة", () => {
    expect(collaborationSource).toContain("await resolveReview(ctx.user, input.reviewId, true)");
    expect(attachmentsSource).toContain("const review = await resolveReview(ctx.user, input.reviewId, true)");
    expect(attachmentsSource).toContain("await resolveReview(ctx.user, attachment.reviewId, true)");
  });
});
