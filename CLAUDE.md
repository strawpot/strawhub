# Claude Code Instructions

## Git workflow

- **Never push directly to `main`.** Always create a new branch and open a PR.
- Use the branch naming convention `claude/<branch-name>`.
- Do not bypass branch protection rules or skip required checks.

## After completing any code change

1. Show me the full `git diff` for review
2. Wait for my explicit approval before proceeding
3. Once approved:
   - Rebase from `main` before committing (`git fetch origin && git rebase origin/main`)
   - **Always create a fresh branch from `main`** for each new change. Never push additional commits to an existing PR branch.
   - Commit, push, and open a new PR with a descriptive title and summary.
   - **Never reuse a branch that already has a PR** (open or merged). Each PR gets its own branch.
