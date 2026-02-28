# WATI Integration – API Reference for Frontend

This document describes all backend routes and payloads that use or relate to the WATI (WhatsApp) service, so the frontend can integrate with WhatsApp OTP login, penalty payment, and admin bulk user flows.

---

## Base URLs

- **Auth:** `POST /api/auth/...`
- **Admin:** `POST /api/admin/...` (admin auth required)
- **Notifications:** `POST /api/notifications/...` (admin auth required)

Use your deployed API base (e.g. `https://api.moneycrafttrader.com`) or `http://localhost:5000` for local dev.

---

## 1. WhatsApp OTP (Auth)

### 1.1 Send OTP

Sends a 6-digit OTP to the given WhatsApp number via WATI template `magic_formula_otp_v3`. Creates a user if not found. OTP expires in **5 minutes**.

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `/api/auth/whatsapp/send-otp` |
| **Auth** | None |

**Request body (JSON):**

```json
{
  "whatsapp": "9876543210"
}
```

- **whatsapp** (string, required): Phone number. Can include spaces/dashes; backend normalizes to digits. Must be 10–15 digits (India: e.g. `91` prefix optional; backend adds `91` if missing).

**Success (200):**

```json
{
  "success": true,
  "message": "OTP sent successfully"
}
```

**Errors:**

| Status | Body |
|--------|------|
| 400 | `{ "message": "Valid WhatsApp number is required" }` |
| 502 | `{ "message": "Failed to send OTP", "error": "<WATI error>" }` |
| 500 | `{ "message": "Server error" }` |

---

### 1.2 Resend OTP

Same as send-otp; use after a short cooldown (e.g. 30 seconds) to avoid abuse.

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `/api/auth/whatsapp/resend-otp` |
| **Auth** | None |

**Request body:** Same as **Send OTP** (`whatsapp`).

**Responses:** Same as **Send OTP**.

---

### 1.3 Verify OTP (WhatsApp login)

Verifies OTP and logs the user in. Returns JWT and user object. Enforces device binding when `deviceId` is already set for the user.

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `/api/auth/whatsapp/verify-otp` |
| **Auth** | None |

**Request body (JSON):**

```json
{
  "whatsapp": "9876543210",
  "otp": "123456",
  "deviceId": "device-uuid-from-capacitor"
}
```

- **whatsapp** (string, required): Same format as send-otp.
- **otp** (string, required): 6-digit OTP.
- **deviceId** (string, optional but recommended): From Capacitor Device API; required if user already has a device bound.

**Success (200):**

```json
{
  "message": "Login successful",
  "isBlocked": false,
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "_id": "...",
    "mobile": null,
    "fullName": "...",
    "email": "...",
    "whatsapp": "919876543210",
    "firebaseToken": null,
    "isBlocked": false,
    "activePlan": null,
    "planExpiry": null,
    "deviceChangeRequested": null,
    "deviceChangeRequestedAt": null,
    "profilePic": "https://api.example.com/api/users/..."
  }
}
```

**Errors:**

| Status | Body |
|--------|------|
| 400 | `{ "message": "WhatsApp number and OTP are required" }` |
| 400 | `{ "message": "No active OTP found" }` |
| 400 | `{ "message": "OTP expired" }` |
| 401 | `{ "message": "Invalid OTP" }` |
| 403 | `{ "message": "Login failed. This account is registered to another device. Contact admin.", "isBlocked": true, "isDeviceMismatch": true }` |
| 403 | `{ "message": "Your account has been blocked. Contact admin.", "isBlocked": true, "isDeviceMismatch": false }` |
| 500 | `{ "message": "Server error" }` |

**Frontend flow:**

1. Call **send-otp** with `whatsapp` (e.g. from Capacitor Device or user input).
2. User enters OTP; call **verify-otp** with `whatsapp`, `otp`, and `deviceId`.
3. Store `accessToken` and use in `Authorization: Bearer <accessToken>` for protected APIs.

---

## 2. Device mismatch & penalty (Auth)

Used when the user is on a different device than the one registered (403 with `isDeviceMismatch: true`). Frontend can offer “Pay penalty to unblock and reset device”.

### 2.1 Block user for device mismatch (admin/internal)

Not typically called from the user app; used to mark user as blocked due to device mismatch.

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `/api/auth/block-device-mismatch` |
| **Auth** | None |

**Request body (JSON):**

```json
{
  "email": "user@example.com",
  "deviceId": "current-device-id"
}
```

**Success (200):** `{ "success": true, "message": "User blocked due to device mismatch" }`  
**Errors:** 400 (validation / no mismatch), 404 (user not found), 500.

---

### 2.2 Create penalty payment order

Creates a Razorpay order for penalty amount (default ₹500). Frontend uses this `orderId` with Razorpay SDK, then calls **verify-penalty** with payment details.

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `/api/auth/penalty-payment-order` |
| **Auth** | None |

**Request body (JSON):**

```json
{
  "email": "user@example.com",
  "amount": 500
}
```

- **email** (string, required): User’s email (must exist).
- **amount** (number, optional): Penalty in INR; default `500`.

**Success (200):**

```json
{
  "success": true,
  "message": "Penalty payment order created",
  "data": {
    "orderId": "order_xxx",
    "amount": 50000,
    "currency": "INR"
  }
}
```

(`amount` is in paise, e.g. 50000 = ₹500.)

**Errors:** 400 (missing email), 404 (user not found), 500 (Razorpay/config error).

---

### 2.3 Verify penalty payment

Verifies Razorpay signature, then unblocks the user and clears `deviceId` so they can log in from the current device.

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `/api/auth/verify-penalty-payment` |
| **Auth** | None |

**Request body (JSON):**

```json
{
  "email": "user@example.com",
  "razorpay_order_id": "order_xxx",
  "razorpay_payment_id": "pay_xxx",
  "razorpay_signature": "signature_from_razorpay"
}
```

All four fields are required (Razorpay returns these after successful payment).

**Success (200):**

```json
{
  "success": true,
  "message": "Penalty paid successfully. Account unblocked and device reset."
}
```

**Errors:** 400 (missing fields or signature verification failed), 404 (user not found), 500.

**Frontend flow:**

1. On 403 with `isDeviceMismatch: true`, show “Pay penalty to unblock”.
2. Call **penalty-payment-order** with user `email`, get `orderId`.
3. Open Razorpay checkout with `orderId` and your Razorpay key.
4. On success, call **verify-penalty-payment** with `email`, `razorpay_order_id`, `razorpay_payment_id`, `razorpay_signature`.
5. On 200, redirect to login (email/password or WhatsApp OTP) and pass `deviceId`; user can log in from this device.

---

## 3. Email/password login (for reference)

Uses same response shape as WhatsApp verify-otp (JWT + user). Device ID is required when user has no device set, and must match when user already has a device.

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `/api/auth/login` |

**Request body (JSON):**

```json
{
  "email": "user@example.com",
  "password": "secret",
  "deviceId": "device-uuid-from-capacitor"
}
```

Alternatively `whatsapp` can be used instead of `email`. Both `deviceId` and either `email` or `whatsapp` are required for normal login.

**Success (200):** Same structure as **Verify OTP** (`accessToken`, `user`).  
**Errors:** 400, 401 (invalid credentials), 403 (blocked / device mismatch).

---

## 4. Logout

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `/api/auth/logout` |
| **Auth** | Required: `Authorization: Bearer <accessToken>` |

**Request body:** Empty or `{}`.

**Success (200):** `{ "success": true, "message": "Logged out successfully" }`

---

## 5. Admin – Bulk create users (WATI reset template)

Admin uploads an Excel file; backend creates users and sends each a WhatsApp message with template **usercreatebulk1** (parameters: full name, email; button: reset link).

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `/api/admin/bulk-create-users` |
| **Auth** | Admin: `Authorization: Bearer <adminToken>` (or your admin auth mechanism) |
| **Content-Type** | `multipart/form-data` |

**Request body (form data):**

- **file** (required): Excel file (`.xlsx`). First sheet, first row = headers.

**Expected Excel columns:**

| Column     | Required | Description                    |
|-----------|----------|--------------------------------|
| Full Name | Yes      | User’s full name               |
| Email     | Yes      | Unique, lowercased             |
| WhatsApp  | Yes      | Digits only; `91` added if missing |
| Password  | Yes      | Min 8 characters               |

**Success (200):**

```json
{
  "message": "Bulk profile creation completed",
  "summary": {
    "totalRows": 10,
    "created": 8,
    "skipped": 1,
    "failed": 1
  },
  "created": [
    {
      "rowNumber": 1,
      "userId": "...",
      "email": "...",
      "whatsapp": "919876543210",
      "resetLink": "https://api.moneycrafttrader.com/reset-password",
      "whatsappSent": true
    }
  ],
  "skipped": [
    { "rowNumber": 2, "email": "...", "whatsapp": "...", "reason": "User already exists" }
  ],
  "failed": [
    { "rowNumber": 3, "reason": "Full Name, Email, WhatsApp and Password are required" }
  ]
}
```

**Errors:** 400 (no file / empty file), 401/403 (admin auth), 500.

**Note:** Reset link sent in WhatsApp is static: `https://api.moneycrafttrader.com/reset-password`. Frontend or backend may need a separate “set password” / “reset with token” flow for that URL.

---

## 6. Notifications – Send WhatsApp (admin)

Sends pending notifications to users via WhatsApp. **Note:** Backend currently calls `sendWhatsAppMessage(phone, message)`, but the WATI service only exports template-based functions (`sendWhatsAppTemplate`, `sendOTPMessage`, `sendBulkUserResetMessage`). So this route may fail or need backend changes to use a WATI template or a new plain-text helper.

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `/api/notifications/send-whatsapp` |
| **Auth** | Admin (notification routes use admin auth) |

**Request body:** None (backend reads pending notifications from DB and uses `user.phone` and `notification.message`).

**Success (200):**

```json
{
  "success": true,
  "successCount": 5,
  "failedCount": 0,
  "message": "WhatsApp notifications processed"
}
```

Integrate only after backend implements a working WhatsApp send (template or message) for this endpoint.

---

## 7. WATI service summary (backend)

- **Environment:** `WATI_BASE_URL`, `WATI_ACCESS_TOKEN` (Bearer).
- **Phone format:** Digits only; backend adds `91` if not present.
- **Templates used:**
  - **magic_formula_otp_v3** – 1 parameter: OTP code (auth send/resend OTP).
  - **usercreatebulk1** – 2 body parameters: full name, email; 1 URL button: reset link (admin bulk create).

Frontend does not call WATI directly; all WhatsApp sending is done by the backend. Use the routes above for OTP, penalty, and admin bulk flows.

---

## Quick reference

| Action              | Method | URL                                      | Auth   |
|---------------------|--------|------------------------------------------|--------|
| Send WhatsApp OTP   | POST   | `/api/auth/whatsapp/send-otp`            | No     |
| Resend OTP          | POST   | `/api/auth/whatsapp/resend-otp`          | No     |
| Verify OTP (login)  | POST   | `/api/auth/whatsapp/verify-otp`           | No     |
| Penalty order       | POST   | `/api/auth/penalty-payment-order`         | No     |
| Verify penalty      | POST   | `/api/auth/verify-penalty-payment`       | No     |
| Logout              | POST   | `/api/auth/logout`                       | User   |
| Bulk create users   | POST   | `/api/admin/bulk-create-users`           | Admin  |
| Send WhatsApp notif | POST   | `/api/notifications/send-whatsapp`       | Admin  |
