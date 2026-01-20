# Security Guidelines for BuildRelay

This document outlines critical security considerations for deploying BuildRelay in production.

## Environment Configuration (CRITICAL)

Before deploying to production, you MUST update these environment variables in `.env`:

### Required Changes
- JWT_SECRET - Must be set to a strong, random value (minimum 32 characters)
  ```
  JWT_SECRET=<generate with: openssl rand -base64 32>
  ```

- API_KEY - Must be set to a strong, random value
  ```
  API_KEY=<generate with: openssl rand -base64 24>
  ```

- VALKEY_PASSWORD - Must be changed from `change_in_production`
  ```
  VALKEY_PASSWORD=<strong password, minimum 16 characters>
  ```

- DEFAULT_USERNAME and DEFAULT_PASSWORD - Must be set to secure values
  ```
  DEFAULT_USERNAME=<secure username>
  DEFAULT_PASSWORD=<very strong password>
  ```

- Remove or secure the webhook URLs:
  ```
  # Comment out or use environment variable from secure config management
  # SLACK_WEBHOOK_URL=...
  # DISCORD_WEBHOOK_URL=...
  ```

### NEVER commit `.env` to version control
- Add `.env` to `.gitignore`
- Use environment variables or secure secret management in production

## Network Security

### HTTPS/TLS (REQUIRED for production)
- Always run behind a reverse proxy (nginx, Apache) with SSL/TLS
- Uncomment HSTS header in `next.config.js` once HTTPS is enabled:
  ```javascript
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  ```

### Authentication
- API endpoints require either:
  - Valid `x-api-key` header matching `API_KEY`
  - Valid JWT token from session
- Keep API_KEY secret and rotate regularly
- JWT tokens expire after 24 hours

## File System Security

### Build Directory Permissions
- Restrict access to `BUILD_INGEST_PATH` (/builds) to the application user only
- Ensure no other users can read/write to this directory
- Regular backups of builds directory if you care about the data in there

### Path Validation
- ingestPath parameter is validated to prevent directory traversal
- Only alphanumeric, hyphens, underscores, and forward slashes allowed
- Cannot start with `/` or contain `..`, null bytes, or `~`

## Database Security

### Valkey (Redis) Configuration
- Change `VALKEY_PASSWORD` to a strong value (required)
- Enable SSL/TLS for Valkey connections in production (`VALKEY_USE_SSL=true`)
- Restrict network access to Valkey to localhost or internal network only
- Never expose Valkey ports to the internet

## API Key Management

### API Key Storage
- Never log or expose API keys in error messages
- API keys are validated against environment variable only
- If compromised, rotate immediately by changing `API_KEY` env var

### Rate Limiting
- Consider implementing rate limiting on API endpoints (not currently implemented)
- Monitor for unusual patterns or brute force attempts

## Logging & Monitoring

### What is NOT logged (sensitive data)
- API keys
- JWT tokens
- Passwords
- File paths (generic error messages used instead)

### What IS logged
- Authentication failures
- Job processing errors (without sensitive details)
- Stream errors and reconnections

## Deployment Checklist

- [ ] All environment variables set to production values
- [ ] `.env` not committed to version control
- [ ] HTTPS/TLS configured
- [ ] Valkey running with authentication

## Security Reporting

If you discover a security vulnerability:
1. Do NOT post it publicly
2. Do NOT commit it to version control
3. Report privately to the maintainers
4. Allow time for a patch before public disclosure
