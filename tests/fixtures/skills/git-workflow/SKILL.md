---
name: git-workflow
description: "Git branching and commit conventions for Strawpot agents"
---

# Git Workflow

## Branch Naming

Use the pattern: `lt/{plan-id}/{task-id}/a{attempt}`

Example: `lt/p-042/t-003/a1`

## Commit Messages

Follow conventional commits:

- `feat:` new features
- `fix:` bug fixes
- `refactor:` code restructuring
- `test:` test changes
- `docs:` documentation

Always include the task ID in the commit body.

## Before Committing

1. Run the project's check pipeline
2. Ensure no untracked files are left behind
3. Review your own diff before committing
4. Stage files explicitly — avoid `git add .`
