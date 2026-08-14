import { describe, expect, it } from "vitest";
import { hashLocalPassword, normalizeLocalUsername, verifyLocalPassword } from "./localAuth";
import { sdk } from "./_core/sdk";

describe("local credential security", () => {
  it("hashes passwords with a unique salt and verifies only the correct password", async () => {
    const first = await hashLocalPassword("CorrectHorseBatteryStaple!2026");
    const second = await hashLocalPassword("CorrectHorseBatteryStaple!2026");

    expect(first).toMatch(/^scrypt\$16384\$8\$1\$/);
    expect(first).not.toBe(second);
    await expect(verifyLocalPassword("CorrectHorseBatteryStaple!2026", first)).resolves.toBe(true);
    await expect(verifyLocalPassword("incorrect-password", first)).resolves.toBe(false);
  });

  it("normalizes local usernames predictably without changing Arabic names", () => {
    expect(normalizeLocalUsername("  ReviewER.Ali  ")).toBe("reviewer.ali");
    expect(normalizeLocalUsername("مراجع.علي")).toBe("مراجع.علي");
  });

  it("keeps the local session version inside a signed, verifiable session", async () => {
    const token = await sdk.createSessionToken("local_test_account", { name: "حساب اختبار", expiresInMs: 60_000, sessionVersion: 7 });
    await expect(sdk.verifySession(token)).resolves.toMatchObject({ openId: "local_test_account", name: "حساب اختبار", sessionVersion: 7 });
  });
});
