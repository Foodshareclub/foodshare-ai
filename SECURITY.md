# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability, please email security@foodshare.ai instead of using the issue tracker.

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Security Measures

### Authentication & Authorization
- Supabase Auth with RLS policies
- Passkey support for passwordless authentication
- API key authentication for programmatic access

### Data Protection
- All data encrypted at rest (Supabase)
- TLS 1.3 for data in transit
- Environment variables for secrets
- No sensitive data in logs

### Rate Limiting
- API endpoints protected with rate limiting
- Configurable per-endpoint limits
- IP-based tracking

### Input Validation
- Zod schemas for all API inputs
- SQL injection prevention via Supabase client
- XSS protection via React

### Monitoring
- Structured logging for audit trails
- Health check endpoints
- Error tracking and alerting

## Best Practices

1. Never commit secrets to the repository
2. Use environment variables for configuration
3. Keep dependencies updated
4. Review security advisories regularly
5. Enable 2FA on all accounts
