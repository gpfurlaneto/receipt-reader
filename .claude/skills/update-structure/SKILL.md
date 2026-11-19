---
name: update-structure
description: Updates the Structure section of AGENTS.md so it matches the repository. Run it after moving, adding or removing files, or after changing what a file or folder is responsible for.
disable-model-invocation: true
---

# Update the Structure section

The Structure section of `AGENTS.md` is loaded into every session, so a wrong line misleads
every future task. Keep it short and true, and change nothing else in the file.

## Steps

1. **List what exists.** Run `git ls-files --cached --others --exclude-standard` and read the
   current section. Git doesn't list empty folders, so also run
   `find . -type d -empty -not -path './.git/*' -not -path './node_modules/*' -not -path './dist/*'`.
   Trust these listings over memory or older documents.
2. **Add planned items only when they guide upcoming work.** Take them from `specs/` and label
   them as not existing yet, such as "(created with the first adapter)". Remove the label once
   the path exists.
3. **Keep only what an agent can't infer.** Leave out files whose purpose is obvious, such as
   `tsconfig.json`. Every line costs attention on every task, whether it's relevant or not.
4. **Describe responsibilities.** Say what belongs in each entry and, when it matters, what
   doesn't. Don't describe how the code works, because that goes stale quickly. If you can't
   tell an entry's responsibility from the code or `specs/`, ask the developer instead of
   guessing.
5. **Check every line against the repository.** Confirm each path exists, unless it's labeled
   as planned. Confirm each rule by reading the code or running `npm run typecheck`. If a rule
   turns out to be false, tell the developer instead of rewording it to look true.
6. **Keep copies in sync.** If a file in `specs/` contains a copy of `AGENTS.md`, apply the same
   change there.

## Finish

Show the developer what changed and why, or say the section is already correct. Don't commit.
