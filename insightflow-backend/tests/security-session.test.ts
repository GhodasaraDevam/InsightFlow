import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import express from "express";
import cookieParser from "cookie-parser";
import app from "../src/app.js";
import { User } from "../src/modules/users/user.model.js";
import { Session } from "../src/modules/sessions/session.model.js";
import { UserRole, AccountStatus } from "../src/modules/users/user.constants.js";
import { authenticate } from "../src/middlewares/authenticate.middleware.js";
import { requireRole } from "../src/middlewares/authorize.middleware.js";
import { errorHandler } from "../src/middlewares/error-handler.middleware.js";
import { connectTestDb, disconnectTestDb, cleanupTestData } from "./test-helper.js";

// Helper to extract a named cookie value from set-cookie headers
const getCookieValue = (res: request.Response, name: string): string | undefined => {
  const cookies = res.headers["set-cookie"];
  if (!cookies) return undefined;
  const cookieList = Array.isArray(cookies) ? cookies : [cookies];
  for (const cookieStr of cookieList) {
    const match = cookieStr.match(new RegExp(`${name}=([^;]+)`));
    if (match) return match[1];
  }
  return undefined;
};

// Helper to extract the full raw Cookie string for forwarding
const getCookieHeader = (res: request.Response, name: string): string | undefined => {
  const val = getCookieValue(res, name);
  return val ? `${name}=${val}` : undefined;
};

describe("Milestone 2: Security, Token Reuse & Session Concurrency Tests", () => {
  const testRunId = Date.now();
  const testEmail = `sec_test_${testRunId}@example.com`;
  const testPassword = "SecPassword123!";
  let userId: string;

  before(async () => {
    await connectTestDb();
    await cleanupTestData(/sec_test_/);

    // Register test user
    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({
        fullName: "Security Tester",
        email: testEmail,
        password: testPassword,
      });
    userId = res.body.data.user.id;
  });

  after(async () => {
    await cleanupTestData(/sec_test_/);
    await disconnectTestDb();
  });

  describe("Token Rotation and Normal Refresh", () => {
    test("1. Login issues initial access token and HttpOnly refresh cookie", async () => {
      const loginRes = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: testEmail, password: testPassword });

      assert.equal(loginRes.status, 200);
      assert.ok(loginRes.body.data.accessToken);

      const cookieVal = getCookieValue(loginRes, "refreshToken");
      assert.ok(cookieVal);
    });

    test("2. Successfully refreshes access token and rotates refresh token cookie", async () => {
      // Step A: Login
      const loginRes = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: testEmail, password: testPassword });

      const initialCookie = getCookieHeader(loginRes, "refreshToken")!;
      assert.ok(initialCookie);

      // Step B: Refresh
      const refreshRes = await request(app)
        .post("/api/v1/auth/refresh")
        .set("Cookie", initialCookie)
        .set("Origin", "http://localhost:5173");

      assert.equal(refreshRes.status, 200);
      assert.equal(refreshRes.body.success, true);
      assert.ok(refreshRes.body.data.accessToken);

      const rotatedCookie = getCookieValue(refreshRes, "refreshToken");
      assert.ok(rotatedCookie);
      assert.notEqual(rotatedCookie, getCookieValue(loginRes, "refreshToken"));
    });
  });

  describe("Refresh Token Reuse Detection (Token Family Strategy)", () => {
    test("3. Presenting an already-consumed refresh token triggers immediate session revocation", async () => {
      // Step A: Login
      const loginRes = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: testEmail, password: testPassword });

      const firstRefreshTokenCookie = getCookieHeader(loginRes, "refreshToken")!;

      // Step B: First legitimate rotation (consumes first token, generates second token)
      const firstRefreshRes = await request(app)
        .post("/api/v1/auth/refresh")
        .set("Cookie", firstRefreshTokenCookie)
        .set("Origin", "http://localhost:5173");

      assert.equal(firstRefreshRes.status, 200);
      const secondRefreshTokenCookie = getCookieHeader(firstRefreshRes, "refreshToken")!;

      // Step C: ATTACK SIMULATION - An attacker attempts to replay the FIRST already-consumed token!
      const replayRes = await request(app)
        .post("/api/v1/auth/refresh")
        .set("Cookie", firstRefreshTokenCookie)
        .set("Origin", "http://localhost:5173");

      // Reuse detection must reject with 401
      assert.equal(replayRes.status, 401);
      assert.match(replayRes.body.message, /reuse detected/i);

      // Step D: Verify that the entire session was revoked in MongoDB
      const compromisedSession = await Session.findOne({ userId }).sort({ createdAt: -1 });
      assert.ok(compromisedSession?.revokedAt);

      // Step E: Even the legitimate second token can NO LONGER be refreshed because session is revoked
      const followUpRes = await request(app)
        .post("/api/v1/auth/refresh")
        .set("Cookie", secondRefreshTokenCookie)
        .set("Origin", "http://localhost:5173");

      assert.equal(followUpRes.status, 401);
      assert.match(followUpRes.body.message, /revoked/i);
    });
  });

  describe("Concurrent Refresh Prevention (Atomic Concurrency Strategy)", () => {
    test("4. Two simultaneous refresh requests with the same token are safely handled atomically", async () => {
      // Step A: Login to get a fresh token
      const loginRes = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: testEmail, password: testPassword });

      const refreshCookie = getCookieHeader(loginRes, "refreshToken")!;

      // Step B: Send 2 concurrent refresh requests simultaneously with the same refresh token
      const [res1, res2] = await Promise.all([
        request(app)
          .post("/api/v1/auth/refresh")
          .set("Cookie", refreshCookie)
          .set("Origin", "http://localhost:5173"),
        request(app)
          .post("/api/v1/auth/refresh")
          .set("Cookie", refreshCookie)
          .set("Origin", "http://localhost:5173"),
      ]);

      const statuses = [res1.status, res2.status].sort();

      // Exactly ONE request must succeed (200), and the other must be rejected (401)
      assert.equal(statuses[0], 200, "One concurrent request must succeed");
      assert.equal(statuses[1], 401, "The duplicate concurrent request must fail atomically");
    });
  });

  describe("Logout and Session Invalidation", () => {
    test("5. Logout revokes the session and clears refresh cookie", async () => {
      const loginRes = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: testEmail, password: testPassword });

      const accessToken = loginRes.body.data.accessToken;
      const refreshCookie = getCookieHeader(loginRes, "refreshToken")!;

      // Call logout
      const logoutRes = await request(app)
        .post("/api/v1/auth/logout")
        .set("Authorization", `Bearer ${accessToken}`)
        .set("Origin", "http://localhost:5173");

      assert.equal(logoutRes.status, 200);

      // Verify cookie cleared
      const clearedCookie = logoutRes.headers["set-cookie"];
      assert.ok(clearedCookie);
      const cookieStr = Array.isArray(clearedCookie) ? clearedCookie.join(";") : clearedCookie;
      assert.match(cookieStr, /refreshToken=;/);

      // Refreshing with the revoked session's cookie must fail
      const refreshAttempt = await request(app)
        .post("/api/v1/auth/refresh")
        .set("Cookie", refreshCookie)
        .set("Origin", "http://localhost:5173");

      assert.equal(refreshAttempt.status, 401);
    });

    test("6. Logout-all revokes all user sessions and increments tokenVersion", async () => {
      // Create session 1
      const login1 = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: testEmail, password: testPassword });

      // Create session 2
      const login2 = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: testEmail, password: testPassword });

      const token1 = login1.body.data.accessToken;
      const cookie1 = getCookieHeader(login1, "refreshToken")!;
      const token2 = login2.body.data.accessToken;
      const cookie2 = getCookieHeader(login2, "refreshToken")!;

      // User calls logout-all using session 2
      const logoutAllRes = await request(app)
        .post("/api/v1/auth/logout-all")
        .set("Authorization", `Bearer ${token2}`)
        .set("Origin", "http://localhost:5173");

      assert.equal(logoutAllRes.status, 200);

      // Verify neither token can access /me anymore
      const me1 = await request(app).get("/api/v1/users/me").set("Authorization", `Bearer ${token1}`);
      assert.equal(me1.status, 401);

      const me2 = await request(app).get("/api/v1/users/me").set("Authorization", `Bearer ${token2}`);
      assert.equal(me2.status, 401);

      // Verify neither cookie can refresh anymore
      const refresh1 = await request(app)
        .post("/api/v1/auth/refresh")
        .set("Cookie", cookie1)
        .set("Origin", "http://localhost:5173");
      assert.equal(refresh1.status, 401);

      const refresh2 = await request(app)
        .post("/api/v1/auth/refresh")
        .set("Cookie", cookie2)
        .set("Origin", "http://localhost:5173");
      assert.equal(refresh2.status, 401);
    });
  });

  describe("CSRF Protection", () => {
    test("7. Rejects cookie-authenticated refresh from untrusted Origin", async () => {
      const loginRes = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: testEmail, password: testPassword });

      const cookie = getCookieHeader(loginRes, "refreshToken")!;

      const csrfAttack = await request(app)
        .post("/api/v1/auth/refresh")
        .set("Cookie", cookie)
        .set("Origin", "https://malicious-attacker.com");

      assert.equal(csrfAttack.status, 403);
      assert.match(csrfAttack.body.message, /CSRF/i);
    });

    test("8. Allows cookie-authenticated refresh from trusted Frontend Origin", async () => {
      const loginRes = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: testEmail, password: testPassword });

      const cookie = getCookieHeader(loginRes, "refreshToken")!;

      const trustedReq = await request(app)
        .post("/api/v1/auth/refresh")
        .set("Cookie", cookie)
        .set("Origin", "http://localhost:5173");

      assert.equal(trustedReq.status, 200);
      assert.ok(trustedReq.body.data.accessToken);
    });
  });

  describe("Role-based Authorization Middleware", () => {
    test("9. Rejects non-admin users from admin-restricted routes with 403", async () => {
      // Create admin test route on dummy sub-app
      const adminApp = express();
      adminApp.use(cookieParser());
      adminApp.use(express.json());
      adminApp.get("/admin/dashboard", authenticate, requireRole(UserRole.ADMIN), (_req, res) => {
        res.json({ success: true, message: "Welcome Admin" });
      });
      adminApp.use(errorHandler);

      // Login as regular user
      const userLogin = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: testEmail, password: testPassword });

      const userToken = userLogin.body.data.accessToken;

      const forbiddenRes = await request(adminApp)
        .get("/admin/dashboard")
        .set("Authorization", `Bearer ${userToken}`);

      assert.equal(forbiddenRes.status, 403);
      assert.match(forbiddenRes.body.message, /Forbidden/i);
    });

    test("10. Grants access to users with ADMIN role", async () => {
      // Promote user to admin in DB
      await User.updateOne({ _id: userId }, { $set: { role: UserRole.ADMIN } });

      const adminApp = express();
      adminApp.use(cookieParser());
      adminApp.use(express.json());
      adminApp.get("/admin/dashboard", authenticate, requireRole(UserRole.ADMIN), (_req, res) => {
        res.json({ success: true, message: "Welcome Admin" });
      });
      adminApp.use(errorHandler);

      // Login to get token with ADMIN role
      const adminLogin = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: testEmail, password: testPassword });

      const adminToken = adminLogin.body.data.accessToken;

      const allowedRes = await request(adminApp)
        .get("/admin/dashboard")
        .set("Authorization", `Bearer ${adminToken}`);

      assert.equal(allowedRes.status, 200);
      assert.equal(allowedRes.body.message, "Welcome Admin");
    });
  });
});
