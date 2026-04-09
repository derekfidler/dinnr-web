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

### QA Pipeline (automated)
After every `gh pr create`, the QA pipeline runs automatically via hook:
1. **qa-reviewer** — reviews changes for correctness, regressions, edge cases
2. **qa-tester** — validates behavior through targeted testing
3. **release-gate** — issues APPROVED / APPROVED WITH RISKS / BLOCKED verdict

If the release gate returns **BLOCKED**, use the **minimal-builder** agent to fix the reported issues, push the fix to the branch, and the pipeline will re-run automatically.

### Always Open a PR After Making Changes
After every set of file edits, commit and open a PR without being asked. See PR Creation rules above for the correct two-step Bash pattern.
