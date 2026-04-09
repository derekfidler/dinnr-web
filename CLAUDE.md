# Dinnr Web — Claude Conventions

## Workflow Rules

### PR Creation
Always run `git push` and `gh pr create` as **separate Bash calls** — never chain them with `&&`. This ensures the PostToolUse hook fires correctly on the `gh pr create` command to trigger the QA pipeline.

**Correct:**
```bash
git push -u origin branch-name
```
```bash
gh pr create --title "..." --body "..."
```

**Incorrect (hook won't fire):**
```bash
git push -u origin branch-name && gh pr create --title "..." --body "..."
```

### QA Pipeline (automated self-healing loop)
After every `gh pr create`, the QA pipeline runs automatically via hook (up to 3 attempts):

1. **qa-reviewer** — reviews changes for correctness, regressions, edge cases
2. **qa-tester** — validates behavior through targeted testing
3. **release-gate** — issues APPROVED / APPROVED WITH RISKS / BLOCKED verdict
4. **If BLOCKED** → **minimal-builder** applies the required fixes → commits → pushes → pipeline restarts from step 1
5. **Loop ends** when APPROVED or after 3 failed attempts

When the loop ends, a pipeline summary is displayed in the session showing:
- Final status and attempt count
- Issues found / fixed / remaining
- Release gate verdict
- Vercel preview deployment URL
- Version identifier (derived from Vercel deployment hash, e.g. `v-abc123`)

### Always Open a PR After Making Changes
After every set of file edits, commit and open a PR without being asked. See PR Creation rules above for the correct two-step Bash pattern.
