# HttpOnly Session Cookies

**Status:** Implemented · **Threat:** FE-02 (Information Disclosure) · **Issue:** [#67](https://github.com/Stellar-kraal/stellar-kraal-backend/issues/67) · **Origin:** Threat model [#40](https://github.com/Stellar-kraal/stellar-kraal-backend/issues/40)

## Problem

`POST /api/auth/login` previously returned the session JWT **only** in the JSON
response body. The frontend therefore had to persist it somewhere
JavaScript-accessible — matching the `localStorage` pattern already used for the
wallet address (`frontend/src/hooks/useWallet.ts`). With the token reachable
from JS, **any single XSS anywhere in the frontend yields full session
takeover**, with no `HttpOnly` boundary to fall back on.

Residual risk before this change: 🔴 **HIGH**.

## Change

`login` now **also** sets the JWT as a cookie with hardened attributes:

| Attribute  | Value | Why |
|------------|-------|-----|
| `HttpOnly` | always | JS (and therefore XSS) cannot read the token |
| `Secure`   | `COOKIE_SECURE` (default: on in production) | never sent over plain HTTP |
| `SameSite` | `COOKIE_SAME_SITE` (default `lax`) | mitigates CSRF on state-changing requests |
| `Max-Age`  | derived from the JWT `exp` claim | cookie and token expire together |
| `Path`     | `/` | valid for the whole API |
| `Domain`   | `COOKIE_DOMAIN` (default host-only) | optional cross-subdomain scope |

Cookie name: `sk_session`. Configuration lives in `src/config/env.ts`; helpers
in `src/lib/authCookie.ts`.

### Auth resolution order

`requireAuth` (`src/middleware/requireAuth.ts`) now resolves the token in this
order:

1. **`sk_session` HttpOnly cookie** — the browser session path (XSS-safe).
2. **`Authorization: Bearer <token>` header** — retained for non-browser API
   clients (CLI, server-to-server, tests).

### Logout

`POST /api/auth/logout` clears the `sk_session` cookie. It is idempotent and
requires no authentication (safe to call whether or not a session exists). JWTs
are stateless, so there is no server-side session to destroy.

## Frontend guidance (follow-up in the frontend repo)

- Send requests with credentials so the cookie rides along
  (`fetch(url, { credentials: 'include' })` / `axios` `withCredentials: true`).
- **Stop persisting the JWT in `localStorage`.** The body token remains only for
  non-browser clients; browser code must rely on the cookie.
- Call `POST /api/auth/logout` to end the session instead of clearing storage.

The API's CORS layer already sets `credentials: true` with an explicit
allow-list of origins (`src/app.ts`), which is required for cross-origin cookie
auth.

## Residual risk & compensating controls

Moving the token into an `HttpOnly` cookie removes the XSS **token-exfiltration**
path. XSS can still ride the cookie to make same-origin requests, so it is not a
total mitigation — defense-in-depth still matters:

- Keep `helmet` security headers enabled and add a strict CSP in the frontend.
- Audit output-encoding to prevent XSS in the first place.
- `SameSite=lax` plus the CORS origin allow-list limit CSRF exposure. If the
  deployment must use `SameSite=none` (frontend on a different site), add an
  explicit CSRF token for state-changing endpoints.

Residual risk after this change: 🟡 **MEDIUM** (token no longer exfiltratable;
in-page abuse still requires CSP/output-encoding hardening tracked separately).
