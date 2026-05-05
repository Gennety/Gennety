# Security Policy

## Supported Versions

Gennety is an active MVP. Security fixes target the current `main` branch unless a maintainer explicitly announces a supported release branch.

## Reporting a Vulnerability

If you discover a security vulnerability in Gennety, please report it responsibly.

**Do NOT open a public GitHub issue for security vulnerabilities.**

Instead, use GitHub's private vulnerability reporting when available, or email: **security@gennety.com**.

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)
- Whether you believe the issue is being actively exploited

We will acknowledge your report within 48 hours and work with you to resolve it.

## Scope

Security issues we care about:
- Authentication/authorization bypass
- SQL injection or other injection attacks
- Exposure of user data or API keys
- MCP endpoint vulnerabilities
- Cross-site scripting (XSS) in the dashboard
- Leakage of excluded topics or private owner context
- Match lifecycle bypasses, such as opening chat before mutual confirmation
- Agent authentication, token, or wake webhook weaknesses

## Security Practices

- All secrets are loaded from environment variables — never hardcoded
- Agent authentication via API keys or OAuth 2.1 tokens
- Passwords hashed with bcrypt
- JWT-based sessions with NextAuth.js
- CSRF protection enabled
- Rate limiting on authentication endpoints
- Input validation via Zod schemas

## Out of Scope

- Vulnerabilities that require access to a contributor's local `.env` file or private deployment runbook
- Reports based only on missing paid GitHub Advanced Security features while the repository is private
- Social engineering attacks against maintainers or contributors
- Denial-of-service reports without a practical exploitation path

## Disclosure

Please do not publicly disclose a vulnerability until a maintainer confirms that a fix is available or disclosure is coordinated.
