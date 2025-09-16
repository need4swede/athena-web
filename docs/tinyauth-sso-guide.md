# TinyAuth SSO Integration Guide

This document explains how to integrate any Codex-managed Node/Express app with TinyAuth (our Heimdall instance). Follow these steps whenever you need to add TinyAuth SSO or audit an existing service.

## 1. Components and Requirements
- **TinyAuth instance**: Heimdall, exposed through `forward_auth` in Caddy.
- **Reverse proxy**: Must inject the TinyAuth headers `Remote-User`, `Remote-Name`, and `Remote-Email` into every upstream request.
- **Backend**: Node/Express server that issues its own JWTs for browser clients.
- **Roles**: `super-admin`, `admin`, `user`. The first authenticated user is automatically promoted to `super-admin` unless the app overrides this behavior.
- **Access policy**: Primary allow/deny rules live in TinyAuth. Only add app-side filters when a project has extra needs.

## 2. Proxy Configuration (Caddy example)
Add a reusable snippet that forwards authentication to Heimdall and copies the TinyAuth headers:

```
(heimdall_sso) {
    forward_auth heimdall-host:3881 {
        uri /api/auth/caddy
        copy_headers Remote-Email Remote-Name Remote-User Remote-Groups
    }
}
```

When publishing an app, import the snippet before the reverse proxy block:

```
app.example.net {
    import heimdall_sso
    reverse_proxy app-backend-host:PORT {
        header_up X-Forwarded-Proto https
    }
}
```

Replace `app-backend-host:PORT` with the service's internal address. The backend must sit behind this proxy so every request carries the TinyAuth headers.

## 3. Backend Integration Steps
1. **Trust proxy headers**: In Express, call `app.set('trust proxy', 1);` so rate limiting and protocol detection work correctly.
2. **Read TinyAuth headers**: In the Auth route/middleware, read `req.headers['remote-email']`, `remote-name`, and `remote-user`. Reject requests if the headers are missing (unless dev override is enabled).
3. **Access control (optional)**: TinyAuth already enforces global policies. If the app needs extra filters (for example, to enforce an internal allow-list), perform them here before issuing a JWT.
4. **Create or update the user**: Call a shared database helper to upsert the user, storing the TinyAuth provider label and updating `last_login` timestamps. If no user exists yet, promote the first account to `super-admin`.
5. **Issue JWT**: After the user is persisted, sign a short JSON payload (`userId`, `email`, `role`, `isAdmin`) with your service's JWT secret and return it to the frontend.
6. **Format response**: Send back both the JWT and a normalized user object (`id`, `name`, `email`, `role`, `isAdmin`, `isSuperAdmin`, `provider`, `lastLogin`).
7. **Verify endpoint**: In the `/auth/verify` handler, decode the JWT, re-fetch the user from the database, and resend the normalized user object. This keeps the client in sync with backend role changes.

## 4. Frontend Integration Steps
1. **Session bootstrap**: On load, call a helper such as `authenticateWithTinyAuth()` that POSTs to `/auth/sso-login`. If TinyAuth returns a JWT, cache it in `localStorage`.
2. **Auth provider**: Maintain a React context (`SSOProvider`) that:
   - Auto-attempts TinyAuth login when no token is present.
   - Stores login errors (access denied, missing headers, etc.).
   - Calls `/auth/verify` to populate the current user when a token exists.
   - Exposes `login()` and `logout()` helpers for manual retry and cleanup.
3. **Login screen**: Replace traditional OAuth buttons with a passive status card. Show a spinner while TinyAuth is verifying, and present retry/refresh buttons if login fails. Use normal app branding—no separate SSO config file is required.
4. **Role awareness**: Downstream components should rely on `user.role`, `isAdmin`, and `isSuperAdmin` from the auth context. These map directly to the `super-admin`, `admin`, `user` convention.

## 5. Environment and Access Control
- **Primary policy**: Configure domains, groups, and user access inside TinyAuth (Heimdall). That policy applies to every downstream app automatically.
- **Optional per-app filters**: If a service needs additional checks (e.g., beta access, campus-specific rules), implement them after header parsing and before the JWT is minted.
- **First-login promotion**: The database helper should detect whether any users exist and, if none do, assign the first login a `super-admin` role. Override this if the application has custom onboarding.
- **Developer override**: If `ALLOW_DEV_AUTH=true` is set (development only), provide a fallback identity to aid local testing. Make sure production environments keep this flag `false` so TinyAuth remains the single source of truth.

## 6. Validation Checklist
- [ ] Proxy forwards TinyAuth headers and requests reach the backend only through the forward-auth gate.
- [ ] `/auth/sso-login` denies requests without headers (unless dev override) and logs clear messages for denied emails.
- [ ] Users are created/updated with provider metadata and `last_login` timestamps.
- [ ] JWTs are issued with the correct secret and expiry, and `/auth/verify` returns consistent user data.
- [ ] Frontend automatically retries TinyAuth login and displays actionable errors when access is blocked.
- [ ] Access control rules (in TinyAuth and any optional app filters) support the `super-admin`/`admin`/`user` convention by default.
- [ ] Any optional OAuth providers are disabled or treated separately; TinyAuth remains the canonical authentication path.

Following this guide keeps our services aligned: Heimdall handles identity, Caddy injects headers, and each app is responsible for authorization, JWT issuance, and frontend session management.
