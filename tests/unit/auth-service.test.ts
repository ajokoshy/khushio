import { beforeEach, describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";

const mocks = vi.hoisted(() => ({
  findUserByEmail: vi.fn(),
  findUserById: vi.fn(),
  touchLastLogin: vi.fn(),
  logAudit: vi.fn(),
  checkLoginAllowed: vi.fn(),
  recordFailedLogin: vi.fn(),
  clearLoginFailures: vi.fn(),
}));
vi.mock("@/core/auth/repository", () => ({
  findUserByEmail: (...a: unknown[]) => mocks.findUserByEmail(...a),
  findUserById: (...a: unknown[]) => mocks.findUserById(...a),
  touchLastLogin: (...a: unknown[]) => mocks.touchLastLogin(...a),
}));
vi.mock("@/core/audit", () => ({ logAudit: (...a: unknown[]) => mocks.logAudit(...a) }));
vi.mock("@/core/auth/login-throttle", () => ({
  checkLoginAllowed: (...a: unknown[]) => mocks.checkLoginAllowed(...a),
  recordFailedLogin: (...a: unknown[]) => mocks.recordFailedLogin(...a),
  clearLoginFailures: (...a: unknown[]) => mocks.clearLoginFailures(...a),
}));

import { authenticate, getFreshAccess } from "@/core/auth/service";
import { ALL_PERMISSION_KEYS } from "@/core/permissions/keys";

const PASSWORD = "correct horse battery staple";
const row = (overrides: Record<string, unknown> = {}) => ({
  id: "u1",
  email: "owner@khushio.test",
  name: "Owner",
  passwordHash: bcrypt.hashSync(PASSWORD, 4),
  isActive: true,
  ...overrides,
});

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.touchLastLogin.mockResolvedValue(undefined);
  mocks.logAudit.mockResolvedValue(undefined);
  mocks.checkLoginAllowed.mockResolvedValue({ allowed: true });
  mocks.recordFailedLogin.mockResolvedValue(undefined);
  mocks.clearLoginFailures.mockResolvedValue(undefined);
});

describe("authenticate (credentials come from the users table)", () => {
  it("signs in an active user with the right password and gives full owner access", async () => {
    mocks.findUserByEmail.mockResolvedValue(row());
    const user = await authenticate({ email: "Owner@Khushio.test ", password: PASSWORD });
    expect(mocks.findUserByEmail).toHaveBeenCalledWith("owner@khushio.test"); // trimmed and lower-cased
    expect(user).toMatchObject({ id: "u1", email: "owner@khushio.test", roles: ["super_admin"] });
    expect(user?.permissions).toEqual(ALL_PERMISSION_KEYS);
    expect(mocks.touchLastLogin).toHaveBeenCalledWith("u1");
  });

  it("writes an auth.login_success audit row on success", async () => {
    mocks.findUserByEmail.mockResolvedValue(row());
    await authenticate({ email: "owner@khushio.test", password: PASSWORD });
    expect(mocks.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ actor: "u1", action: "auth.login_success", entityType: "user", entityId: "u1" }),
    );
  });

  it("still signs in when the audit write fails", async () => {
    mocks.findUserByEmail.mockResolvedValue(row());
    mocks.logAudit.mockRejectedValue(new Error("db down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(authenticate({ email: "owner@khushio.test", password: PASSWORD })).resolves.not.toBeNull();
  });

  it("rejects a wrong password without touching last login or the audit log", async () => {
    mocks.findUserByEmail.mockResolvedValue(row());
    expect(await authenticate({ email: "owner@khushio.test", password: "not the password" })).toBeNull();
    expect(mocks.touchLastLogin).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it("rejects an inactive user even with the right password", async () => {
    mocks.findUserByEmail.mockResolvedValue(row({ isActive: false }));
    expect(await authenticate({ email: "owner@khushio.test", password: PASSWORD })).toBeNull();
  });

  it("rejects an unknown email, and still spends a bcrypt comparison doing it", async () => {
    mocks.findUserByEmail.mockResolvedValue(null);
    const compare = vi.spyOn(bcrypt, "compare");
    expect(await authenticate({ email: "nobody@khushio.test", password: PASSWORD })).toBeNull();
    expect(compare).toHaveBeenCalledTimes(1);
    compare.mockRestore();
  });

  it("rejects malformed input before querying the database", async () => {
    for (const bad of [null, {}, { email: "nope", password: "x" }, { email: "a@b.co", password: "" }]) {
      expect(await authenticate(bad)).toBeNull();
    }
    expect(mocks.findUserByEmail).not.toHaveBeenCalled();
  });
});

describe("authenticate (login rate limiting, Release 2C)", () => {
  const ctx = { ip: "203.0.113.7" };

  it("checks the limiter with the normalised email and the client IP before looking at the password", async () => {
    mocks.findUserByEmail.mockResolvedValue(row());
    await authenticate({ email: " Owner@Khushio.test", password: PASSWORD }, ctx);
    expect(mocks.checkLoginAllowed).toHaveBeenCalledWith("owner@khushio.test", "203.0.113.7");
  });

  it("refuses a blocked email or IP even with the right password, without any user lookup or bcrypt work", async () => {
    mocks.checkLoginAllowed.mockResolvedValue({ allowed: false, reason: "email", retryAt: new Date() });
    mocks.findUserByEmail.mockResolvedValue(row());
    const compare = vi.spyOn(bcrypt, "compare");
    expect(await authenticate({ email: "owner@khushio.test", password: PASSWORD }, ctx)).toBeNull();
    expect(mocks.findUserByEmail).not.toHaveBeenCalled();
    expect(compare).not.toHaveBeenCalled();
    expect(mocks.recordFailedLogin).not.toHaveBeenCalled(); // blocked attempts do not extend the block
    expect(mocks.touchLastLogin).not.toHaveBeenCalled();
    compare.mockRestore();
  });

  it("records a failure for a wrong password, an unknown email and an inactive user", async () => {
    mocks.findUserByEmail.mockResolvedValueOnce(row());
    await authenticate({ email: "owner@khushio.test", password: "wrong password 1" }, ctx);
    mocks.findUserByEmail.mockResolvedValueOnce(null);
    await authenticate({ email: "nobody@khushio.test", password: PASSWORD }, ctx);
    mocks.findUserByEmail.mockResolvedValueOnce(row({ isActive: false }));
    await authenticate({ email: "owner@khushio.test", password: PASSWORD }, ctx);
    expect(mocks.recordFailedLogin.mock.calls).toEqual([
      ["owner@khushio.test", "203.0.113.7"],
      ["nobody@khushio.test", "203.0.113.7"], // unknown emails are counted too: nothing reveals which exist
      ["owner@khushio.test", "203.0.113.7"],
    ]);
  });

  it("does not record anything for malformed input", async () => {
    await authenticate({ email: "nope", password: "x" }, ctx);
    expect(mocks.checkLoginAllowed).not.toHaveBeenCalled();
    expect(mocks.recordFailedLogin).not.toHaveBeenCalled();
  });

  it("clears the email's failures on success", async () => {
    mocks.findUserByEmail.mockResolvedValue(row());
    await authenticate({ email: "owner@khushio.test", password: PASSWORD }, ctx);
    expect(mocks.clearLoginFailures).toHaveBeenCalledWith("owner@khushio.test");
    expect(mocks.recordFailedLogin).not.toHaveBeenCalled();
  });

  it("still signs in when clearing the counters fails, and still returns null when recording a failure fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.findUserByEmail.mockResolvedValue(row());
    mocks.clearLoginFailures.mockRejectedValue(new Error("db down"));
    expect(await authenticate({ email: "owner@khushio.test", password: PASSWORD }, ctx)).not.toBeNull();
    mocks.recordFailedLogin.mockRejectedValue(new Error("db down"));
    expect(await authenticate({ email: "owner@khushio.test", password: "wrong password 1" }, ctx)).toBeNull();
  });

  it("fails closed when the limiter cannot be read", async () => {
    mocks.checkLoginAllowed.mockRejectedValue(new Error("db down"));
    await expect(authenticate({ email: "owner@khushio.test", password: PASSWORD }, ctx)).rejects.toThrow("db down");
  });
});

describe("getFreshAccess", () => {
  it("returns owner access for an active user and null once deactivated or deleted", async () => {
    mocks.findUserById.mockResolvedValueOnce({ id: "u1", email: "a@b.co", name: null, isActive: true });
    expect((await getFreshAccess("u1"))?.roles).toEqual(["super_admin"]);
    mocks.findUserById.mockResolvedValueOnce({ id: "u1", email: "a@b.co", name: null, isActive: false });
    expect(await getFreshAccess("u1")).toBeNull();
    mocks.findUserById.mockResolvedValueOnce(null);
    expect(await getFreshAccess("u1")).toBeNull();
  });
});
