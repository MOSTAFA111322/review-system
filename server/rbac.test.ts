import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({ getDb: vi.fn() }));

import type { User } from "../drizzle/schema";
import { getDb } from "./db";
import { ensurePlatformAdmin, PERMISSIONS, requireFiscalYearAccess, requirePermission, userHasPermission } from "./rbac";

function userWithRole(role: "admin" | "user", isActive = true): User {
  return { id: 7, openId: "test-user", name: "Test User", email: "test@example.com", loginMethod: "manus", role, isActive, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() };
}

function permissionQuery(rows: unknown[]) {
  const chain = { from: () => chain, innerJoin: () => chain, where: () => Promise.resolve(rows) };
  return chain;
}

function limitQuery(rows: unknown[]) {
  const chain = { from: () => chain, where: () => ({ limit: () => Promise.resolve(rows) }) };
  return chain;
}

describe("RBAC platform guard", () => {
  beforeEach(() => vi.clearAllMocks());

  it("allows the platform administrator to initialize system configuration", () => {
    expect(() => ensurePlatformAdmin(userWithRole("admin"))).not.toThrow();
  });

  it("rejects ordinary accounts from administrator-only operations", () => {
    expect(() => ensurePlatformAdmin(userWithRole("user"))).toThrow(TRPCError);
  });

  it("gives the platform administrator every permission but rejects disabled accounts", async () => {
    await expect(userHasPermission(userWithRole("admin"), PERMISSIONS.REVIEWS_DELETE)).resolves.toBe(true);
    await expect(userHasPermission(userWithRole("admin", false), PERMISSIONS.REVIEWS_DELETE)).resolves.toBe(false);
  });

  it("uses role-permission assignments for ordinary users and denies missing permissions", async () => {
    const select = vi.fn().mockReturnValueOnce(permissionQuery([{ permission: PERMISSIONS.COMMENTS_CREATE }])).mockReturnValueOnce(permissionQuery([]));
    vi.mocked(getDb).mockResolvedValue({ select } as never);
    await expect(userHasPermission(userWithRole("user"), PERMISSIONS.COMMENTS_CREATE)).resolves.toBe(true);
    await expect(requirePermission(userWithRole("user"), PERMISSIONS.REPORTS_EXPORT)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects a non-administrator from an administrative backend permission without writing data", async () => {
    const select = vi.fn().mockReturnValue(permissionQuery([]));
    vi.mocked(getDb).mockResolvedValue({ select } as never);
    await expect(requirePermission(userWithRole("user"), PERMISSIONS.USERS_MANAGE)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(select).toHaveBeenCalledTimes(1);
  });

  it("blocks all write access to a closed fiscal year, including for the platform administrator", async () => {
    const select = vi.fn().mockReturnValue(limitQuery([{ id: 44, status: "closed" }]));
    vi.mocked(getDb).mockResolvedValue({ select } as never);
    await expect(requireFiscalYearAccess(userWithRole("admin"), 44, true)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("blocks an ordinary account from a year outside its assigned scope", async () => {
    const select = vi.fn().mockReturnValueOnce(limitQuery([{ id: 44, status: "open" }])).mockReturnValueOnce(limitQuery([]));
    vi.mocked(getDb).mockResolvedValue({ select } as never);
    await expect(requireFiscalYearAccess(userWithRole("user"), 44, false)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("defines distinct permissions for reviewer and employee state transitions", () => {
    expect(PERMISSIONS.REVIEWER_STATUS_CHANGE).not.toBe(PERMISSIONS.EMPLOYEE_STATUS_CHANGE);
  });
});
