---
name: code-review
description: "Code review checklist and structured review output"
metadata:
  strawpot:
    dependencies:
      - security-baseline
---

# Code Review

## Review Structure

When reviewing code, produce a structured review with:

- **Blocking findings**: Must be fixed before merge
- **Non-blocking findings**: Suggestions for improvement
- **Risk score**: 0.0 (no risk) to 1.0 (high risk)

## Checklist

- Does the code satisfy the acceptance criteria?
- Are there adequate tests?
- Does the code follow project conventions?
- Are there security concerns? (refer to security-baseline skill)
- Is error handling appropriate?
- Are there performance implications?

## Output Format

```
## Review: <task-id>

### Blocking
- [B1] <description> — <file>:<line>

### Non-blocking
- [N1] <description> — <file>:<line>

### Risk: <score>
<rationale>
```
