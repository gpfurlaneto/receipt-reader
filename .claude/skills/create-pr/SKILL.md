---
name: create-pr
description: Creates a pull request for the current branch, or updates the title and description of its open pull request. Checks that everything is committed and pushed first, and asks before pushing and before writing the pull request.
disable-model-invocation: true
allowed-tools: Bash(git status:*), Bash(git branch:*), Bash(git fetch:*), Bash(git rev-parse:*), Bash(git rev-list:*), Bash(git log:*), Bash(git switch -c:*), Bash(git push:*), Bash(gh pr view:*), Bash(gh api:*), Bash(gh pr create:*), Bash(gh pr edit:*), AskUserQuestion
---

# Create or update a pull request

Follow the steps in order. Run only the commands listed here, exactly as written, replacing
`<branch>` with the branch name from step 2. Don't skip, reorder or merge steps.

**Abort** means: tell the user why in one or two sentences, then stop. Don't run any more
commands, don't offer workarounds and don't fix things on your own. Any command that fails
unexpectedly also aborts the flow; show its error.

Never use `git push --force`, `git commit` (except as written in step 0b), `git stash` or any command not listed here.

## Step 0a: create a branch for uncommitted changes

```bash
git status --porcelain
```

- Empty output: nothing to commit. Go to step 1.
- Any output: continue.

```bash
git branch --show-current
```

- Empty output (detached HEAD): **abort**. Changes are committed on a feature branch.
- `main`: suggest a short kebab-case branch name based on the changed files (e.g.
  `add-receipt-contracts`) and ask with `AskUserQuestion`: "You're on `main` with uncommitted
  changes. Can I create branch `<new-branch>` from it?" with the options **Create** and
  **Abort**. The user can pick "Other" to give a different name; use it as `<new-branch>`
  and ask again.
  - Create: run `git switch -c <new-branch>`. Continue to step 0b.
  - Abort: **abort**.
- Otherwise: continue to step 0b.

## Step 0b: commit the changes

Show the files listed in step 0a and suggest a commit message: one imperative sentence, at
most 70 characters, no trailing period, followed by a blank line and
`Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Ask with `AskUserQuestion`:
"Commit these files on `<current-branch>` with this message?" with the options **Commit**
and **Abort**. If the user picks "Other" and asks for changes, apply them, show the result
and ask again.

- Commit: run these commands, passing the approved message exactly as confirmed:

  ```bash
  git add -A
  ```

  ```bash
  git commit -F - <<'COMMIT_MSG_EOF'
  <message>
  COMMIT_MSG_EOF
  ```

  If the pre-commit hook fails, show its error and **abort**. Never use `--no-verify`.
  Continue to step 1.
- Abort: **abort**.

## Step 1: check for uncommitted changes

```bash
git status --porcelain
```

- Empty output: continue.
- Any output: show the listed files, ask the user to commit them first, and **abort**.

## Step 2: get the branch

```bash
git branch --show-current
```

- Empty output (detached HEAD): **abort**. Pull requests are opened from a feature branch.
- `main`: pull requests are opened from a feature branch. List the local commits with
  `git log --oneline origin/main..HEAD`, suggest a short kebab-case branch name based on
  them (e.g. `add-receipt-contracts`) and ask with `AskUserQuestion`:
  "You're on `main`. Can I create branch `<new-branch>` from it?" with the options
  **Create** and **Abort**. The user can pick "Other" to give a different name; use it
  as `<new-branch>` and ask again.
  - Create: run `git switch -c <new-branch>`. `<new-branch>` is now `<branch>`. Continue.
  - Abort: **abort**.
- Otherwise this is `<branch>`. Continue.

## Step 3: update the view of the remote

```bash
git fetch --prune origin
```

This only updates the `origin/*` references; it doesn't change local files.

## Step 4: check that the branch exists on GitHub

```bash
git rev-parse --verify --quiet origin/<branch>
```

- Prints a commit hash: continue to step 5.
- Prints nothing: the branch was never pushed. List the commits with
  `git log --oneline origin/main..HEAD` and ask with `AskUserQuestion`:
  "Branch `<branch>` isn't on GitHub yet. Can I push it (N commits)?" with the options
  **Push** and **Abort**.
  - Push: run `git push -u origin <branch>`, then go to step 6.
  - Abort: **abort**.

## Step 5: check for unpushed or missing commits

```bash
git rev-list --count HEAD..origin/<branch>
```

- Greater than `0`: GitHub has commits that aren't local. Ask the user to sync the branch
  (pull or rebase) themselves and **abort**.
- `0`: continue.

```bash
git rev-list --count origin/<branch>..HEAD
```

- `0`: everything is pushed. Continue to step 6.
- Greater than `0`: list the commits with `git log --oneline origin/<branch>..HEAD` and ask
  with `AskUserQuestion`: "N commits on `<branch>` aren't on GitHub yet. Can I push them?"
  with the options **Push** and **Abort**.
  - Push: run `git push -u origin <branch>`. The `-u` also sets the upstream if it's missing.
  - Abort: **abort**.

## Step 6: check for an existing pull request

```bash
gh pr view <branch> --json number,url,state,title,body
```

- Fails with "no pull requests found", or `state` is `CLOSED` or `MERGED`: use **create mode**.
- `state` is `OPEN`: show its number, URL and current title, then ask with `AskUserQuestion`:
  "Pull request #N is already open for `<branch>`. Can I overwrite its title and description
  with new ones?" with the options **Overwrite** and **Abort**.
  - Overwrite: use **update mode** for pull request #N. Keep its current title and body for
    step 8.
  - Abort: **abort**.

## Step 7: read the changes from GitHub

```bash
gh api 'repos/{owner}/{repo}/compare/main...<branch>' --jq '{ahead_by, commits: [.commits[].commit.message], files: [.files[] | {filename, status, additions, deletions, patch}]}'
```

`gh` fills in `{owner}` and `{repo}` itself; keep them literally. This reads exactly what was
pushed, not the local state.

- `ahead_by` is `0`: the branch has nothing that isn't already on `main`. **Abort**.
- Otherwise continue.

## Step 8: write the title and description, and confirm

Write them in English, based only on the output of step 7. Don't invent changes, tests or
motivations that the commits and diff don't show.

- **Title:** one imperative sentence, at most 70 characters, no trailing period
  (e.g. `Add receipt output contracts`).
- **Description:** exactly this template. Omit nothing; if a section has nothing to say,
  write `None.`

```markdown
## Summary
<1–3 sentences: what changed and why>

## Changes
- <one bullet per meaningful change, grouped by file or area>

## How to test
- `npm run check`
- <any extra manual step the changes need>

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

Show the full title and description to the user. In update mode, show the current title and
description first, then the new ones. Then ask with `AskUserQuestion`:

- Create mode: "Create the pull request with this title and description?"
- Update mode: "Replace the title and description of pull request #N with these?"

Options: **Confirm** and **Abort**. If the user picks "Other" and asks for changes, apply
them, show the result and ask again. Abort: **abort**.

## Step 9: apply

Pass the approved text exactly as confirmed. Put the title in single quotes (write each `'`
in it as `'\''`). Pass the description through a quoted heredoc so nothing in it is expanded.

Create mode:

```bash
gh pr create --base main --head <branch> --title '<title>' --body-file - <<'PR_BODY_EOF'
<description>
PR_BODY_EOF
```

Update mode (changes only the title and description; commits, reviewers, labels and comments
stay as they are):

```bash
gh pr edit <N> --title '<title>' --body-file - <<'PR_BODY_EOF'
<description>
PR_BODY_EOF
```

Finish by showing the pull request URL.
