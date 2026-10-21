
For the complete local-to-Foundry walkthrough, see [`POC-RUN-GUIDE.md`](POC-RUN-GUIDE.md).
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

## Foundry agent commands

Run these commands from the repository root:

```text
npm test
npm start
npm run submit:failure
npm run mcp:test
npm run mcp:start
```

The Foundry agent implementation lives under `foundry-agent/`, and the read-only telemetry MCP server lives under `app-insights-mcp/`. The root scripts delegate to those packages.

## Hosted Incident Remediation Agent

The separate Python 3.13 hosted-agent implementation lives under `foundry-agent-python/incident-remediation-hosted/`. It reuses the existing Foundry project, `gpt-5-mini` deployment, App Insights MCP, and GitHub MCP connection. It does not modify the existing prompt agent `gray-agent-5k66sznl0y` or the original JavaScript scaffold.

The workflow validates and allowlists incidents, reads bounded telemetry and a small set of source files, creates or reuses a marked GitHub issue, and proposes a size-limited fix. It pauses for approval of the exact `planHash`, then gates branch writes, draft PR creation, and PR readiness separately. Failed checks leave the PR draft. The agent never merges or deploys.

Merging approved changes to `main` triggers `.github/workflows/deploy-foundry-agent.yml`, which pauses at the protected `foundry-production` GitHub Environment. Configure its reviewers, Azure OIDC identity, and project/model/toolbox variables as documented in the hosted-agent README. The previously exposed App Insights MCP key has been rotated and is stored only in Azure App Service and the Foundry project connection.
