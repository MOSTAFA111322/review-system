import { describe, expect, it } from "vitest";
import { transitionInput } from "./routers/settings";

describe("status transition input", () => {
  it("يتطلب جانب انتقال صحيحًا وحالتين موجبتين وصلاحية مطلوبة", () => {
    expect(transitionInput.parse({ side: "reviewer", fromStatusId: 1, toStatusId: 2, requiredPermission: "reviews.status.reviewer" })).toMatchObject({ side: "reviewer" });
    expect(transitionInput.parse({ side: "employee", fromStatusId: 3, toStatusId: 4, requiredPermission: "reviews.status.employee" })).toMatchObject({ side: "employee" });
  });

  it("يرفض انتقالًا بلا جانب أو حالات أو صلاحية صالحة", () => {
    expect(() => transitionInput.parse({ side: "both", fromStatusId: 1, toStatusId: 2, requiredPermission: "reviews.status" })).toThrow();
    expect(() => transitionInput.parse({ side: "reviewer", fromStatusId: 0, toStatusId: 2, requiredPermission: "reviews.status" })).toThrow();
    expect(() => transitionInput.parse({ side: "employee", fromStatusId: 1, toStatusId: 0, requiredPermission: "reviews.status" })).toThrow();
    expect(() => transitionInput.parse({ side: "employee", fromStatusId: 1, toStatusId: 2, requiredPermission: "x" })).toThrow();
  });
});
