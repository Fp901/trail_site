# ⚠ STATUS — SUPERSEDED (read this first)

This standalone file has been **consolidated into `CLAUDE.md` Part 11**, the single source of truth. It is preserved here for reference/history and **nothing has been removed**, but **where it conflicts with `CLAUDE.md`, `CLAUDE.md` wins** — and on security, both files agree that **security wins all other conflicts**.

**Critical override:** this file describes a *static site with no server, no database, no payments, and "[BACKEND] later" items deferred*. That is **no longer true.** The site now **takes payments (Paystack) and stores personal data (Supabase)**, so every item this file marks **`[BACKEND]` (deferred)** is **ACTIVE NOW** — webhook signature verification, server-side validation, rate limiting, idempotency, RLS default-deny, secret storage, PCI SAQ-A scope, and the POPIA program for stored data. Read `CLAUDE.md` Part 11 (§11.1–11.10) as the live requirement set; treat the `[BACKEND]` tags below as "**now required**," not "future." See `CLAUDE.md` Part 16 items 1, 3, 4, 5, 12, 13.

---

# SECURITY.md — The Rooiberg Wander

Security baseline for the project, aligned to the **OWASP Top 10 (2021)** and OWASP secure-development guidance. Companion to `CLAUDE.md` and `TECHNICAL_SPEC.md`. Claude Code must keep the build compliant with this file; if a requirement here conflicts with a convenience elsewhere, **security wins**.

---

## 1. Scope & threat model

- **What this is:** a statically-generated Astro marketing site (no server, no database, no user accounts) with one client-side **inquiry form** that, in this conceptual phase, does not yet POST to a real backend.
  > ⚠ **SUPERSEDED by `CLAUDE.md` §11.1:** marketing pages stay static, but the site **now has dynamic SSR booking + API routes, a Supabase (Postgres) database storing bookings/inquiries, and Paystack payments.** The "no server / no database / form doesn't POST" description is historical. Threat model now includes webhook forgery, price tampering, double-booking, broken access control on booking data, and PII/payment-data handling.
- **Personal data collected:** the inquiry form gathers Name, Group Size, Target Dates, and Contact Details. This is **personal information** under South Africa's **POPIA** (and GDPR for international visitors), so privacy obligations apply even before a backend exists — see §9.
- **Primary risks today:** XSS via injected content, insecure configuration (missing headers), vulnerable dependencies, leaking secrets, and mishandling the personal data in the form.
- **Future risk surface:** when the form is wired to a real email/endpoint, server-side injection, email header injection, CSRF, spam/abuse, and secret management become live concerns (§6, §8).

Two states are flagged throughout: **[NOW]** = applies to the current static build; **[BACKEND]** = required before the form sends real data.

---

## 2. Security headers (configuration)

A static site's strongest, cheapest defense is correct headers. Set them at the platform edge **and** let Astro emit the CSP.

**CSP — use Astro's native support.** Enable `experimental.csp` in `astro.config.mjs` (Astro 5.9+; `security.csp` on Astro 6). Astro hashes its own inline scripts/styles and emits a `<meta http-equiv="content-security-policy">` that works for static output, so we avoid `'unsafe-inline'`. Do not hand-roll a permissive policy.

> Caveat: don't combine CSP with `prefetch`/`clientPrerender` without testing — injected speculation rules can violate the policy (known Astro issue).

**Edge headers** (things a `<meta>` CSP cannot set) live in `public/_headers` (Netlify/Cloudflare Pages). The committed file sets: HSTS (2y + preload), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (camera/mic/geo denied), `Cross-Origin-Opener-Policy: same-origin`.

**Vercel equivalent** — if deploying to Vercel, replicate via `vercel.json`:

```jsonc
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "Strict-Transport-Security", "value": "max-age=63072000; includeSubDomains; preload" },
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
        { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=()" },
        { "key": "Cross-Origin-Opener-Policy", "value": "same-origin" }
      ]
    }
  ]
}
```

Verify deployed headers with securityheaders.com / Mozilla Observatory before launch; target an A grade.

---

## 3. OWASP Top 10 (2021) — project mapping

- **A01 Broken Access Control** — No auth/admin surface exists. **[NOW]** Keep it that way: no hidden "admin" routes, no privileged client logic. **[BACKEND]** Any future form endpoint must not expose mailbox contents or accept arbitrary recipients.
- **A02 Cryptographic Failures** — **[NOW]** HTTPS only; HSTS on (§2). No PII stored client-side (no `localStorage`/cookies holding form data). **[BACKEND]** TLS in transit; never log full contact details in plaintext.
- **A03 Injection / XSS** — **[NOW]** Astro auto-escapes interpolated content in `.astro` templates. **Never** pass user input or unvetted external content to `set:html`. The SVG map is authored in-house; never inline untrusted SVG. Validate and length-cap all form inputs (§5). **[BACKEND]** Parameterize/encode everything server-side; treat the inbound payload as hostile.
- **A04 Insecure Design** — Minimal attack surface by design: static output, near-zero JS, two small islands. Don't add a backend, third-party widget, or analytics SDK without a security review entry here.
- **A05 Security Misconfiguration** — Headers + CSP (§2); custom 404; no source maps with secrets; `.env` git-ignored; no verbose error output shipped to the client.
- **A06 Vulnerable & Outdated Components** — §7.
- **A07 Identification & Auth Failures** — N/A now (no accounts). **[BACKEND]** if an admin/inbox is ever added, enforce strong auth + MFA; never roll custom crypto.
- **A08 Software & Data Integrity Failures** — Self-host fonts/assets (no CDN webfont link), so no third-party script integrity gap. If any external script is ever required, pin it and add Subresource Integrity (SRI). Commit and verify the lockfile; use `npm ci` in CI for reproducible installs.
- **A09 Logging & Monitoring Failures** — **[NOW]** Don't `console.log` PII in production (strip the dev-only payload log before launch, or gate it behind `import.meta.env.DEV`). **[BACKEND]** Log security-relevant events (submission rate, validation failures) **without** storing raw personal data; add uptime/error monitoring.
- **A10 SSRF** — N/A for static output. **[BACKEND]** any server function must never fetch user-supplied URLs.

---

## 4. Input handling & XSS rules [NOW]

1. Prefer Astro/JSX interpolation (auto-escaped). Audit every `set:html` — none should receive user or untrusted input.
2. Treat all form values as untrusted: validate type, format, and length on input; reject or truncate oversized input.
3. The conceptual route SVG and all icons are authored by us. Do not fetch or inline remote SVG/HTML at runtime.
4. No `eval`, no `new Function`, no dynamic `import()` of remote code.

---

## 5. Inquiry-form security

**[NOW] Client-side:**
> ⚠ **SUPERSEDED by `CLAUDE.md` Part 9 / §11.4–11.7:** `submitInquiry()` is no longer a no-network stub. Both the booking and inquiry paths go through **server-side Astro Actions** with **zod validation re-run on the server** (client validation is UX only). Booking **PII is intentionally persisted in Supabase under POPIA controls** (minimisation, consent notice, retention, processors, region) — the "do not store form data" rule below still applies to the **browser** (no `localStorage`/cookies/PII client-side), not to the server database. Price is **computed server-side only**; the client never sends a total.
- Validate each field: Name (non-empty, length cap ~100), Group Size (integer, sane range e.g. 1–10), Target Dates (date/text, capped), Contact Details (basic email/phone format check, length cap). Show accessible inline errors (`aria-invalid`, `aria-describedby`).
- Include a hidden **honeypot** field; silently drop submissions that fill it.
- Encode/escape any value before displaying it back (e.g. in the success state).
- Do **not** persist form data to `localStorage`/`sessionStorage` or cookies.
- The current `submitInquiry()` is a stub: validate, show success UI, and — only in dev — log the payload. Comment clearly that production must remove client logging and route server-side.

**[BACKEND] When wiring the real endpoint:**
- **Re-validate everything server-side** — client validation is UX, not security.
- **Email/header injection:** if composing an email, strip CR/LF (`\r`, `\n`) from all fields and never let user input set headers (To/From/Subject). Send to the fixed configured recipient only.
- **Rate limiting / abuse:** throttle by IP; consider a privacy-respecting CAPTCHA in addition to the honeypot.
- **CSRF:** if the endpoint is stateful/cookie-based, use anti-CSRF tokens and `SameSite` cookies; a stateless token-auth POST to a function avoids most CSRF.
- **Transport:** HTTPS only; reject non-TLS.
- **Secrets:** the email/API key lives in a server-side environment variable, never in client code or the repo.

---

## 6. Secrets & configuration management

- No secrets in the client bundle, the repo, or `astro.config.mjs`. Public `PUBLIC_*` env vars are world-readable — never put keys there.
- `.env`, `.env.*` (except `.env.example`) are git-ignored. Commit a documented `.env.example` only.
- Rotate any credential that is ever committed by accident; treat it as compromised.

---

## 7. Dependency & supply-chain hygiene

- Keep dependencies minimal (the build deliberately avoids heavy libraries).
- Run `npm audit` as part of `verify`/CI; fix high/critical before merge.
- Pin Tailwind v4 to an exact version (it can ship breaking changes in minors) and review changelogs before upgrading.
- Commit `package-lock.json`; use `npm ci` in CI for integrity.
- Enable Dependabot (or equivalent) for security updates.
- Vet any new dependency: maintenance, downloads, transitive footprint. A new package is a security decision — note it here.

---

## 8. Transport & deployment [NOW]

- HTTPS everywhere; HSTS with `preload` (§2). Redirect HTTP→HTTPS at the platform.
- No mixed content (self-hosted assets make this automatic).
- Ship a custom `404` page; ensure no stack traces or framework internals are exposed.
- Strip dev-only logging before production builds.

---

## 9. Privacy / POPIA & GDPR [NOW]

The form collects personal information, so even in the conceptual phase:
- **Data minimisation:** collect only the four specified fields — nothing more.
- **Notice & consent:** add a short, plain-language privacy note near the submit button stating what is collected, why (to respond to a booking inquiry), who receives it, and that it won't be used for anything else. Link to a Privacy page/section.
- **Lawful basis & retention:** [BACKEND] define a retention period and a contact for data requests; don't retain inquiries longer than needed.
- **Security of processing:** transmit over HTTPS; restrict who can read submissions.
- Mark these as Open Questions for the client (privacy contact, retention period) rather than inventing them.

---

## 10. Pre-deploy security checklist

- [ ] `experimental.csp` (or `security.csp`) enabled; no `'unsafe-inline'` needed; page loads with no CSP console violations.
- [ ] Edge headers live (`_headers` or `vercel.json`); securityheaders.com / Observatory grade A.
- [ ] HTTPS + HSTS active; HTTP redirects to HTTPS.
- [ ] No `set:html` receives untrusted input; no remote SVG/HTML inlined.
- [ ] Form: validation + length caps + honeypot; success state encodes values; **no production console logging of PII**; no PII in storage.
- [ ] Privacy notice + consent microcopy present on the form; Privacy section linked.
- [ ] `npm audit` clean of high/critical; lockfile committed; Tailwind pinned.
- [ ] No secrets in repo/bundle; `.env*` ignored; `.env.example` documented.
- [ ] Custom 404; no stack traces or framework internals exposed.
- [ ] [BACKEND, if wired] server-side validation, email-header-injection guards, rate limiting, CSRF protection, server-side secret storage.

---

**This file is binding. When adding any dependency, script, third-party embed, or backend, add a corresponding entry/justification here first.**