import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import app from "../src/app.js";
import { User } from "../src/modules/users/user.model.js";
import { Session } from "../src/modules/sessions/session.model.js";
import { UserRole, AccountStatus } from "../src/modules/users/user.constants.js";
import { generateAccessToken } from "../src/utils/jwt.util.js";
import { hashPassword } from "../src/utils/password.util.js";
import { connectTestDb, disconnectTestDb, cleanupTestData } from "./test-helper.js";

describe("Milestone 2: Authentication & User API Tests", () => {
  const testRunId = Date.now();
  const testEmail = `auth_test_${testRunId}@example.com`;
  const testPassword = "StrongPassword123!";
  let createdUserId: string;
  let validAccessToken: string;
  let testSessionId: string;

  before(async () => {
    await connectTestDb();
    await cleanupTestData(/auth_test_/);
  });

  after(async () => {
    await cleanupTestData(/auth_test_/);
    await disconnectTestDb();
  });

  describe("Registration Endpoint (POST /api/v1/auth/register)", () => {
    test("1. Successfully registers a new user", async () => {
      const res = await request(app)
        .post("/api/v1/auth/register")
        .send({
          fullName: "John Doe",
          email: testEmail,
          password: testPassword,
        });

      assert.equal(res.status, 201);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.user.email, testEmail);
      assert.equal(res.body.data.user.fullName, "John Doe");
      assert.equal(res.body.data.user.role, UserRole.USER);
      assert.equal(res.body.data.user.accountStatus, AccountStatus.ACTIVE);
      assert.equal(res.body.data.user.isEmailVerified, false);
      assert.equal(res.body.data.user.passwordHash, undefined);
      assert.ok(res.body.data.user.id);

      createdUserId = res.body.data.user.id;
    });

    test("2. Rejects registration with invalid email format", async () => {
      const res = await request(app)
        .post("/api/v1/auth/register")
        .send({
          fullName: "Jane Doe",
          email: "invalid-email-format",
          password: testPassword,
        });

      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
      assert.ok(res.body.errors.some((e: any) => e.field === "email"));
    });

    test("3. Rejects registration with weak password (missing special char or too short)", async () => {
      const res = await request(app)
        .post("/api/v1/auth/register")
        .send({
          fullName: "Jane Doe",
          email: `weak_${testRunId}@example.com`,
          password: "weak",
        });

      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
      assert.ok(res.body.errors.some((e: any) => e.field === "password"));
    });

    test("4. Prevents duplicate registration with existing email", async () => {
      const res = await request(app)
        .post("/api/v1/auth/register")
        .send({
          fullName: "Duplicate User",
          email: testEmail,
          password: testPassword,
        });

      assert.equal(res.status, 409);
      assert.equal(res.body.success, false);
      assert.match(res.body.message, /already exists/i);
    });

    test("5. Rejects registration with missing required fields", async () => {
      const res = await request(app)
        .post("/api/v1/auth/register")
        .send({
          email: `missing_${testRunId}@example.com`,
        });

      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
    });
  });

  describe("Login Endpoint (POST /api/v1/auth/login)", () => {
    test("6. Successfully logs in with valid credentials and sets HttpOnly cookie", async () => {
      const res = await request(app)
        .post("/api/v1/auth/login")
        .send({
          email: testEmail,
          password: testPassword,
        });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.ok(res.body.data.accessToken);
      assert.equal(res.body.data.user.email, testEmail);
      assert.equal(res.body.data.user.passwordHash, undefined);

      // Verify Set-Cookie header for refresh token
      const cookies = res.headers["set-cookie"];
      assert.ok(cookies);
      const cookieHeader = Array.isArray(cookies) ? cookies.join(";") : cookies;
      assert.match(cookieHeader, /refreshToken=/);
      assert.match(cookieHeader, /HttpOnly/i);
      assert.match(cookieHeader, /Path=\/api\/v1\/auth/i);

      validAccessToken = res.body.data.accessToken;

      // Find created session in database
      const session = await Session.findOne({ userId: createdUserId }).sort({ createdAt: -1 });
      assert.ok(session);
      testSessionId = session._id.toString();
    });

    test("7. Rejects login with incorrect password without revealing user existence", async () => {
      const res = await request(app)
        .post("/api/v1/auth/login")
        .send({
          email: testEmail,
          password: "WrongPassword123!",
        });

      assert.equal(res.status, 401);
      assert.equal(res.body.success, false);
      assert.equal(res.body.message, "Invalid email or password");
    });

    test("8. Rejects login with unknown email with generic error", async () => {
      const res = await request(app)
        .post("/api/v1/auth/login")
        .send({
          email: `unknown_${testRunId}@example.com`,
          password: testPassword,
        });

      assert.equal(res.status, 401);
      assert.equal(res.body.success, false);
      assert.equal(res.body.message, "Invalid email or password");
    });

    test("9. Rejects login for suspended accounts", async () => {
      const suspendedEmail = `suspended_${testRunId}@example.com`;
      const passHash = await hashPassword(testPassword);
      await User.create({
        fullName: "Suspended User",
        email: suspendedEmail,
        passwordHash: passHash,
        role: UserRole.USER,
        accountStatus: AccountStatus.SUSPENDED,
        isEmailVerified: false,
      });

      const res = await request(app)
        .post("/api/v1/auth/login")
        .send({
          email: suspendedEmail,
          password: testPassword,
        });

      assert.equal(res.status, 403);
      assert.equal(res.body.success, false);
      assert.match(res.body.message, /suspended/i);
    });
  });

  describe("Authentication Middleware", () => {
    test("10. Rejects protected request with missing Authorization header", async () => {
      const res = await request(app).get("/api/v1/users/me");
      assert.equal(res.status, 401);
      assert.equal(res.body.success, false);
    });

    test("11. Rejects protected request with malformed/invalid token", async () => {
      const res = await request(app)
        .get("/api/v1/users/me")
        .set("Authorization", "Bearer invalid.jwt.token");

      assert.equal(res.status, 401);
      assert.equal(res.body.success, false);
    });

    test("12. Allows protected request with valid access token", async () => {
      const res = await request(app)
        .get("/api/v1/users/me")
        .set("Authorization", `Bearer ${validAccessToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.id, createdUserId);
      assert.equal(res.body.data.email, testEmail);
    });
  });

  describe("User Profile Operations (/api/v1/users/me)", () => {
    test("13. Fetches full safe user profile", async () => {
      const res = await request(app)
        .get("/api/v1/users/me")
        .set("Authorization", `Bearer ${validAccessToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.data.fullName, "John Doe");
      assert.equal(res.body.data.role, UserRole.USER);
      assert.equal(res.body.data.accountStatus, AccountStatus.ACTIVE);
      assert.equal(res.body.data.isEmailVerified, false);
      assert.equal(res.body.data.passwordHash, undefined);
    });

    test("14. Updates allowed user profile fields (fullName, preferences)", async () => {
      const res = await request(app)
        .patch("/api/v1/users/me")
        .set("Authorization", `Bearer ${validAccessToken}`)
        .send({
          fullName: "Johnathan Doe",
          preferences: {
            theme: "dark",
            notificationsEnabled: false,
          },
        });

      assert.equal(res.status, 200);
      assert.equal(res.body.data.fullName, "Johnathan Doe");
      assert.equal(res.body.data.preferences.theme, "dark");
      assert.equal(res.body.data.preferences.notificationsEnabled, false);
    });

    test("15. Rejects modification of restricted fields (role, accountStatus, passwordHash)", async () => {
      const res = await request(app)
        .patch("/api/v1/users/me")
        .set("Authorization", `Bearer ${validAccessToken}`)
        .send({
          role: "admin",
          accountStatus: "suspended",
          passwordHash: "hacked",
        });

      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);

      // Verify DB was NOT modified
      const user = await User.findById(createdUserId);
      assert.equal(user?.role, UserRole.USER);
      assert.equal(user?.accountStatus, AccountStatus.ACTIVE);
    });
  });

  describe("Change Password Endpoint (POST /api/v1/users/change-password)", () => {
    const newPassword = "NewStrongPassword456!";

    test("16. Rejects change password with incorrect current password", async () => {
      const res = await request(app)
        .post("/api/v1/users/change-password")
        .set("Authorization", `Bearer ${validAccessToken}`)
        .send({
          currentPassword: "WrongCurrentPassword123!",
          newPassword,
        });

      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
      assert.match(res.body.message, /current password is incorrect/i);
    });

    test("17. Rejects change password when new password is identical to current", async () => {
      const res = await request(app)
        .post("/api/v1/users/change-password")
        .set("Authorization", `Bearer ${validAccessToken}`)
        .send({
          currentPassword: testPassword,
          newPassword: testPassword,
        });

      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
      const errorMsg = res.body.errors?.[0]?.message || res.body.message;
      assert.match(errorMsg, /cannot be the same/i);
    });

    test("18. Successfully changes password, revokes all sessions, and clears cookie", async () => {
      const res = await request(app)
        .post("/api/v1/users/change-password")
        .set("Authorization", `Bearer ${validAccessToken}`)
        .send({
          currentPassword: testPassword,
          newPassword,
        });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);

      // Verify sessions in DB have been revoked
      const activeSessions = await Session.find({
        userId: createdUserId,
        revokedAt: { $exists: false },
      });
      assert.equal(activeSessions.length, 0);

      // Verify old access token is now rejected because tokenVersion incremented
      const meRes = await request(app)
        .get("/api/v1/users/me")
        .set("Authorization", `Bearer ${validAccessToken}`);

      assert.equal(meRes.status, 401);
    });

    test("19. Can log in with new password but not old password", async () => {
      // Old password fails
      const oldRes = await request(app)
        .post("/api/v1/auth/login")
        .send({
          email: testEmail,
          password: testPassword,
        });
      assert.equal(oldRes.status, 401);

      // New password succeeds
      const newRes = await request(app)
        .post("/api/v1/auth/login")
        .send({
          email: testEmail,
          password: newPassword,
        });
      assert.equal(newRes.status, 200);
      assert.ok(newRes.body.data.accessToken);
    });
  });
});
