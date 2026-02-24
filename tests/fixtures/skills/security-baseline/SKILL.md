---
name: security-baseline
version: 1.0.0
description: "OWASP security checklist for code changes"
tags: [security, owasp]
author: strawpot
---

# Security Baseline

When writing or reviewing code, check for these common vulnerabilities.

## Input Validation

- Validate and sanitize all user input at system boundaries
- Use parameterised queries — never string-concatenate SQL
- Escape output for the target context (HTML, shell, URL)

## Authentication & Authorization

- Never store plaintext passwords
- Check authorization on every request, not just at the UI layer
- Use constant-time comparison for secrets

## Data Handling

- Never log secrets, tokens, or credentials
- Use environment variables or secret managers for sensitive config
- Set appropriate file permissions on config files

## Dependencies

- Pin dependency versions
- Check for known vulnerabilities before adding new packages
- Keep dependencies up to date
