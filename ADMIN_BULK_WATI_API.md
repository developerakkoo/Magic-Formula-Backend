# Admin Bulk and WATI API Documentation

## 1. Base URL and admin auth

- **Base URL:** `https://api.moneycrafttrader.com` (or `http://localhost:5000` for local development)
- **Admin login:** `POST /api/admin/auth/login`  
  - **Body:** `{ "email", "password" }`  
  - **Response:** `{ "message", "token" }`
- All bulk routes require the header: **`Authorization: Bearer <adminToken>`**

---

## 2. Create single user (admin)

- **Route:** `POST /api/admin/users`
- **Auth:** Admin Bearer token
- **Content-Type:** `application/json`

**Body (JSON):**

| Field | Required | Notes |
|-------|----------|--------|
| `mobile` | Yes | Unique per user |
| `email` | Yes | Stored lowercased; must be unique |
| `password` | Yes | Plain text in transit only over HTTPS; **8–128 characters**; hashed with bcrypt server-side |
| `fullName` | No | |
| `whatsapp` | No | Digits normalized; `91` prepended when missing (same rules as bulk create) |
| `profilePic`, `firebaseToken` | No | |

**Responses:** `201` returns `{ success, message, data }` where `data` is the created user document **without** the `password` field. `400` validation errors; `409` if mobile, email, or WhatsApp already exists.

### 2.1 Get user by ID

- **Route:** `GET /api/admin/users/:id`
- **Auth:** Admin Bearer token
- **Response `data`:** Full user profile (no `password` field). Includes **`passwordSet`** (`boolean`): whether a bcrypt password exists. The current plaintext password cannot be returned.

### 2.2 Update user

- **Route:** `PATCH /api/admin/users/:id`
- **Auth:** Admin Bearer token
- **Content-Type:** `application/json`

**Body (JSON)** — all fields optional except when updating:

| Field | Notes |
|-------|--------|
| `fullName`, `profilePic`, `firebaseToken` | Standard updates |
| `email` | Trimmed and lowercased; must remain unique |
| `whatsapp` | Normalized like bulk create; empty clears value (subject to schema) |
| `password` | If provided: **8–128 characters**; replaces existing hash. Omit to leave password unchanged.

**Response:** `{ success, message, data }` with **`passwordSet`** on `data`; never includes `password`.

---

## 3. Bulk create users (with WATI)

- **Route:** `POST /api/admin/bulk-create-users`
- **Auth:** Admin Bearer token
- **Content-Type:** `multipart/form-data`
- **Body:** single field **`file`** – Excel file (`.xlsx` or `.xls`), max 5MB

**Excel columns (first sheet):**

| Column        | Required | Notes                                              |
|---------------|----------|----------------------------------------------------|
| Full Name     | Yes      |                                                    |
| Email         | Yes      | Accepted as **Email**, **EMAIL**, or **email**; stored lowercased |
| WhatsApp      | Yes      | Accepted as **WhatsApp** or **Whatsapp**; digits only; `91` prepended if 10 digits |
| Password      | Yes      | Min 8 characters                                   |

**Backend behaviour:** For each row: validate → skip if user already exists (by email or WhatsApp) → create user → send WATI template **buli_create_user_v5** with body parameters `[fullName, email]` and button URL = email (see `src/services/wati.service.js` → `sendBulkUserResetMessage(phone, fullName, email)`).

**Response (200):**

- `message`
- `summary`: `{ totalRows, created, skipped, failed }`
- `created[]`: `{ rowNumber, userId, email, whatsapp, resetLink, whatsappSent }`
- `skipped[]`: `{ rowNumber, email, reason }`
- `failed[]`: `{ rowNumber, reason }` or `{ rowNumber, email, whatsapp, reason }`

**Errors:** `400` (no file / empty file), `401` (admin auth required)

---

## 4. Bulk assign subscription (no WATI)

- **Route:** `POST /api/admin/bulk-subscription`
- **Auth:** Admin Bearer token
- **Content-Type:** `multipart/form-data`
- **Body:** single field **`file`** – Excel file (`.xlsx` or `.xls`), max 5MB

**Excel columns (first sheet):**

| Column    | Required | Notes |
|-----------|----------|--------|
| Email     | Optional* | *At least one of Email or Mobile required |
| Mobile    | Optional* | Accepted as **Mobile** or **WhatsApp** / **Whatsapp**; digits normalized |
| Plan Code | Yes      | Must match an active plan code in the DB |

**Backend behaviour:** For each row: find user by email or mobile → find plan by Plan Code → deactivate existing active subscriptions → create new UserSubscription → update `user.activePlan`. **No WhatsApp/WATI message is sent.**

**Response (200):**

- `message`
- `summary`: `{ totalRows, successCount, failedCount }`
- `success[]`: `{ rowNumber, userId, email, mobile, planCode, planName, startDate, expiryDate }`
- `failed[]`: `{ rowNumber, email, mobile, reason }` or `{ rowNumber, planCode, reason }`

**Errors:** `400` (no file / empty file), `401` (admin auth required)

---

## 5. Bulk remove subscription (no WATI)

- **Route:** `POST /api/admin/bulk-remove-subscription`
- **Auth:** Admin Bearer token
- **Content-Type:** `multipart/form-data`
- **Body:** single field **`file`** – Excel file (`.xlsx` or `.xls`), max 5MB

**Excel columns (first sheet):**

| Column | Required | Notes |
|--------|----------|--------|
| Email  | Optional* | *At least one of Email or Mobile required |
| Mobile | Optional* | Accepted as **Mobile** or **WhatsApp** / **Whatsapp**; digits normalized |

**Backend behaviour:** For each row: find user by email or mobile → fail if no active subscription → deactivate all active subscriptions → set `user.activePlan` to `null`. **No WhatsApp/WATI message is sent.**

**Response (200):**

- `message`
- `summary`: `{ totalRows, successCount, failedCount }`
- `success[]`: `{ rowNumber, userId, email, mobile, removedSubscriptionId, planId }`
- `failed[]`: `{ rowNumber, email, mobile, reason }`

**Errors:** `400` (no file / empty file), `401` (admin auth required)

---

## 6. Quick reference

| Route                      | Method | Auth   | Request           | WATI used        |
|----------------------------|--------|--------|-------------------|------------------|
| `/api/admin/auth/login`    | POST   | None   | JSON `email`, `password` | No  |
| `/api/admin/users`         | POST   | Bearer | JSON user + `password` (single create) | No  |
| `/api/admin/users/:id`     | GET    | Bearer | JSON user + `passwordSet` | No  |
| `/api/admin/users/:id`     | PATCH  | Bearer | JSON partial update; optional `password` | No  |
| `/api/admin/bulk-create-users` | POST | Bearer | multipart `file` (Excel) | Yes – **buli_create_user_v5** |
| `/api/admin/bulk-subscription` | POST | Bearer | multipart `file` (Excel) | No  |
| `/api/admin/bulk-remove-subscription` | POST | Bearer | multipart `file` (Excel) | No  |

---

## 7. Excel template (export)

- **Route:** `GET /api/admin/export-users` (Admin Bearer token)
- Returns **users_bulk_subscription.xlsx** with columns: **Full Name**, **Email**, **WhatsApp**, **Mobile**, **Password**, **Blocked**, **Created At**, **Plan Code**, **Duration**.
- This file can be used as a template for both **bulk create users** (fill **Password** for new rows) and **bulk subscription** (fill **Plan Code**; **Email** or **Mobile** identify the user).

---

## 7. Notes

- **WATI template for bulk user creation:** **buli_create_user_v5** (body: fullName, email; button: email). Ensure this template exists in the WATI dashboard.
- Bulk subscription does not send any WhatsApp message; add later if required.
- Phone format: backend normalizes to digits and adds `91` for 10-digit Indian numbers.
