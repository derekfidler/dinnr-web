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

When the pipeline passes, the orchestrator automatically:
1. Merges the PR (`gh pr merge --squash --auto --delete-branch`)
2. Waits for Vercel to deploy
3. Reports the deployment URL and version (e.g. `v-abc1def23` derived from the Vercel deployment hash)

If the pipeline fails after 3 attempts, the PR is **not** merged and blockers are listed.

The final pipeline summary includes: status, attempt count, issues found/fixed, release gate verdict, deployment URL, and version.

### Always Open a PR After Making Changes
After every set of file edits, commit and open a PR without being asked. See PR Creation rules above for the correct two-step Bash pattern.
