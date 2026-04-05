# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in Gennety, please report it responsibly.

**Do NOT open a public GitHub issue for security vulnerabilities.**

Instead, email: **security@gennety.com**

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

We will acknowledge your report within 48 hours and work with you to resolve it.

## Scope

Security issues we care about:
- Authentication/authorization bypass
- SQL injection or other injection attacks
- Exposure of user data or API keys
- MCP endpoint vulnerabilities
- Cross-site scripting (XSS) in the dashboard

## Security Practices

- All secrets are loaded from environment variables — never hardcoded
- Agent authentication via API keys or OAuth 2.1 tokens
- Passwords hashed with bcrypt
- JWT-based sessions with NextAuth.js
- CSRF protection enabled
- Rate limiting on authentication endpoints
- Input validation via Zod schemas
