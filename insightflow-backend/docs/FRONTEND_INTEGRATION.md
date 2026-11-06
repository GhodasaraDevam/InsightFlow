# InsightFlow — Frontend Authentication Integration Guide

> **Document Type:** Integration Specification for Frontend Engineering
> **Backend Base URL:** `http://localhost:5000/api/v1`
> **Frontend Origin:** `http://localhost:5173`
> **Last Updated:** 2026-11-06

---

## 1. Overview & Architecture Principles

The InsightFlow backend implements a secure token-pair authentication architecture:

1. **Access Token:**
   - Lifetime: ~15 minutes.
   - Purpose: Bearer authorization for protected REST endpoints.
   - Storage: Store in frontend application memory (e.g. React state, Zustand, Pinia, or an in-memory auth context). **NEVER store the access token in `localStorage`, `sessionStorage`, or JavaScript cookies** (vulnerable to XSS).
2. **Refresh Token:**
   - Lifetime: 7 days.
   - Purpose: Obtains a new access token when the current access token expires.
   - Storage: Automatically handled by the browser via an `HttpOnly`, `SameSite: Lax` cookie named `refreshToken`.
   - Security: Inaccessible to JavaScript; sent automatically by the browser to `/api/v1/auth/*` endpoints when credentials are enabled.

---

## 2. Axios / HTTP Client Configuration

### 2.1 Credentials & CORS Requirements
The backend allows cross-origin requests from `http://localhost:5173` with credentials.
Your HTTP client **must** include credentials (`withCredentials: true`) on all requests so that the `refreshToken` cookie is sent and received.

Example Axios instance setup:

```typescript
import axios from "axios";

export const api = axios.create({
  baseURL: "http://localhost:5000/api/v1",
  withCredentials: true, // MANDATORY: allows receiving and sending HttpOnly cookies
  headers: {
    "Content-Type": "application/json",
    "X-Requested-With": "XMLHttpRequest", // Anti-CSRF protection header
  },
});
```

---

## 3. Endpoints & Request Workflows

### 3.1 Registration (`POST /auth/register`)
- **URL:** `POST http://localhost:5000/api/v1/auth/register`
- **Headers:** `Content-Type: application/json`
- **Request Body:**
  ```json
  {
    "fullName": "John Doe",
    "email": "john@example.com",
    "password": "StrongPassword123!"
  }
  ```
- **Password Rules:** Minimum 8 characters, maximum 128 characters, at least 1 uppercase, 1 lowercase, 1 number, and 1 special character.
- **Success Response (201 Created):**
  ```json
  {
    "success": true,
    "message": "User registered successfully",
    "data": {
      "user": {
        "id": "6aedb140f89290a8872f3704",
        "fullName": "John Doe",
        "email": "john@example.com",
        "role": "user",
        "accountStatus": "active",
        "isEmailVerified": false,
        "preferences": {
          "theme": "system",
          "language": "en",
          "notificationsEnabled": true
        },
        "createdAt": "2026-11-06T10:00:00.000Z"
      }
    }
  }
  ```

---

### 3.2 Login (`POST /auth/login`)
- **URL:** `POST http://localhost:5000/api/v1/auth/login`
- **Headers:** `Content-Type: application/json`
- **Request Body:**
  ```json
  {
    "email": "john@example.com",
    "password": "StrongPassword123!"
  }
  ```
- **Success Response (200 OK):**
  - **Set-Cookie Header:** `refreshToken=<jwt>; Path=/api/v1/auth; HttpOnly; SameSite=Lax`
  - **Response Body:**
    ```json
    {
      "success": true,
      "message": "Login successful",
      "data": {
        "user": {
          "id": "6aedb140f89290a8872f3704",
          "fullName": "John Doe",
          "email": "john@example.com",
          "role": "user",
          "accountStatus": "active",
          "isEmailVerified": false,
          "preferences": {},
          "createdAt": "2026-11-06T10:00:00.000Z",
          "lastLoginAt": "2026-11-06T10:05:00.000Z"
        },
        "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
      }
    }
    ```
- **Action:** Store `accessToken` in memory and save user details in state.

---

### 3.3 Silent Token Refresh (`POST /auth/refresh`)
- **URL:** `POST http://localhost:5000/api/v1/auth/refresh`
- **Headers:** `Content-Type: application/json`, `X-Requested-With: XMLHttpRequest`
- **Cookies Sent:** Browser automatically sends `refreshToken` cookie.
- **Success Response (200 OK):**
  - **Set-Cookie Header:** Rotated `refreshToken=<new-jwt>; Path=/api/v1/auth; HttpOnly; SameSite=Lax`
  - **Response Body:**
    ```json
    {
      "success": true,
      "message": "Token refreshed successfully",
      "data": {
        "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
      }
    }
    ```
- **Action:** Update the in-memory access token with the newly returned token.

---

### 3.4 Get Current User Profile (`GET /users/me`)
- **URL:** `GET http://localhost:5000/api/v1/users/me`
- **Headers:**
  - `Authorization: Bearer <accessToken>`
- **Success Response (200 OK):**
  ```json
  {
    "success": true,
    "message": "Profile retrieved successfully",
    "data": {
      "id": "6aedb140f89290a8872f3704",
      "fullName": "John Doe",
      "email": "john@example.com",
      "role": "user",
      "accountStatus": "active",
      "isEmailVerified": false,
      "preferences": {
        "theme": "dark",
        "language": "en",
        "notificationsEnabled": true
      },
      "createdAt": "2026-11-06T10:00:00.000Z",
      "lastLoginAt": "2026-11-06T10:05:00.000Z"
    }
  }
  ```

---

### 3.5 Logout (`POST /auth/logout`)
- **URL:** `POST http://localhost:5000/api/v1/auth/logout`
- **Headers:**
  - `Authorization: Bearer <accessToken>`
- **Cookies Sent:** `refreshToken`
- **Success Response (200 OK):**
  - Clears `refreshToken` cookie.
  - Revokes the session on the backend.
- **Action:** Clear in-memory access token, clear user state, redirect to `/login`.

---

### 3.6 Logout From All Devices (`POST /auth/logout-all`)
- **URL:** `POST http://localhost:5000/api/v1/auth/logout-all`
- **Headers:**
  - `Authorization: Bearer <accessToken>`
- **Success Response (200 OK):**
  - Revokes all sessions belonging to the user across all devices.
  - Clears local `refreshToken` cookie.

---

### 3.7 Change Password (`POST /users/change-password`)
- **URL:** `POST http://localhost:5000/api/v1/users/change-password`
- **Headers:**
  - `Authorization: Bearer <accessToken>`
  - `Content-Type: application/json`
- **Request Body:**
  ```json
  {
    "currentPassword": "StrongPassword123!",
    "newPassword": "NewStrongPassword456!"
  }
  ```
- **Success Response (200 OK):**
  ```json
  {
    "success": true,
    "message": "Password changed successfully. All other sessions have been revoked. Please log in again."
  }
  ```
- **Action:** Clear local state and prompt user to log in again.

---

## 4. Handling Expired Access Tokens (Axios Interceptor Pattern)

Because access tokens expire after 15 minutes, configure an Axios response interceptor that transparently refreshes expired tokens and replays failed requests.

```typescript
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (err: unknown) => void;
}> = [];

const processQueue = (error: unknown, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else if (token) {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

// 1. Request Interceptor: Attach in-memory access token
api.interceptors.request.use((config) => {
  const token = getInMemoryAccessToken();
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 2. Response Interceptor: Catch 401 and refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Do not attempt refresh on login or register endpoints
    if (
      originalRequest.url?.includes("/auth/login") ||
      originalRequest.url?.includes("/auth/register")
    ) {
      return Promise.reject(error);
    }

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((newToken) => {
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            return api(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const { data } = await api.post("/auth/refresh");
        const newAccessToken = data.data.accessToken;
        setInMemoryAccessToken(newAccessToken);

        processQueue(null, newAccessToken);
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        clearInMemoryAccessToken();
        window.location.href = "/login";
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);
```

---

## 5. Authentication Failure Handling

1. **401 Unauthorized on `/auth/refresh`:**
   - Cause: Session has expired (7 days), was revoked (logout), or a refresh-token reuse was detected.
   - Action: Clear user state and navigate to `/login?session_expired=true`.
2. **403 Forbidden on API endpoints:**
   - Cause: User account is suspended or lacks required role.
   - Action: Display an account status banner informing the user to contact support.
3. **429 Too Many Requests:**
   - Cause: Rate limit exceeded (e.g. >10 login attempts in 15 minutes).
   - Action: Display a countdown timer or message asking the user to wait before retrying.
