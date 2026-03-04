# Admin Bulk and WATI API Documentation

## 1. Base URL and admin auth

- **Base URL:** `https://api.moneycrafttrader.com` (or `http://localhost:5000` for local development)
- **Admin login:** `POST /api/admin/auth/login`  
  - **Body:** `{ "email", "password" }`  
  - **Response:** `{ "message", "token" }`
- All bulk routes require the header: **`Authorization: Bearer <adminToken>`**

---

## 2. Bulk create users (with WATI)

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

## 3. Bulk assign subscription (no WATI)

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

## 4. Quick reference

| Route                      | Method | Auth   | Request           | WATI used        |
|----------------------------|--------|--------|-------------------|------------------|
| `/api/admin/auth/login`    | POST   | None   | JSON `email`, `password` | No  |
| `/api/admin/bulk-create-users` | POST | Bearer | multipart `file` (Excel) | Yes – **buli_create_user_v5** |
| `/api/admin/bulk-subscription` | POST | Bearer | multipart `file` (Excel) | No  |

---

## 5. Excel template (export)

- **Route:** `GET /api/admin/export-users` (Admin Bearer token)
- Returns **users_bulk_subscription.xlsx** with columns: **Full Name**, **Email**, **WhatsApp**, **Mobile**, **Password**, **Blocked**, **Created At**, **Plan Code**, **Duration**.
- This file can be used as a template for both **bulk create users** (fill **Password** for new rows) and **bulk subscription** (fill **Plan Code**; **Email** or **Mobile** identify the user).

---

## 6. Notes

- **WATI template for bulk user creation:** **buli_create_user_v5** (body: fullName, email; button: email). Ensure this template exists in the WATI dashboard.
- Bulk subscription does not send any WhatsApp message; add later if required.
- Phone format: backend normalizes to digits and adds `91` for 10-digit Indian numbers.
