# Agenctic-AI-Powered-Workflows

Hello World test repo for the PR Auto-Summary workflow.

## What it does

When you open a pull request, GitHub Actions will:
1. Fetch the PR diff, changed files, and commit messages
2. Send them to `openai/gpt-4o-mini` via the GitHub Models API
3. Append an **AI-Generated Summary** section to the PR body

## Setup

1. Create a GitHub classic PAT with `repo` + `workflow` scopes
2. Add it as a repo secret named `GH_PAT_TOKEN`
3. Push this repo, create a branch, open a PR — summary appears automatically
