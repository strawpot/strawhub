---
name: typescript-patterns
version: 1.0.0
description: "TypeScript coding patterns and conventions"
tags: [typescript, patterns]
author: strawpot
---

# TypeScript Patterns

## Type Safety

- Prefer `unknown` over `any` — narrow types explicitly
- Use discriminated unions for state modeling
- Avoid type assertions (`as`) — use type guards instead
- Enable `strict` mode in tsconfig

## Functions

- Use explicit return types for exported functions
- Prefer `readonly` arrays and objects when mutation is not needed
- Use `satisfies` for type-checked object literals

## Error Handling

- Throw `Error` subclasses, not strings
- Use `Result<T, E>` patterns for expected failures
- Keep try/catch blocks narrow

## Naming

- Interfaces: `PascalCase` (no `I` prefix)
- Types: `PascalCase`
- Variables/functions: `camelCase`
- Constants: `UPPER_SNAKE_CASE` for true constants
