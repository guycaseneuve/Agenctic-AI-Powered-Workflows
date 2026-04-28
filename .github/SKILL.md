---
name: "pr-changelog-composer-skill"
title: "PR Description & Changelog Composer (Repo Skill)"
description: "Generate human-friendly PR descriptions, release notes, and changelog entries from commit diffs, workflow changes, and OpenAPI diffs."
audience:
  - "AI-agent"
  - "Developer"
  - "Release-manager"
owner: "team-platform@example.com"
stability: "experimental"
tags:
  - "changelog"
  - "release-notes"
  - "automation"
last_updated: "2026-04-22"
inputs:
  - name: "pr_number"
    type: "string"
    required: false
    description: "Pull request number to summarize (if omitted, summarize current PR)"
  - name: "changelog_level"
    type: "string"
    required: false
    description: "minor|major|patch — used to classify the change for changelog"
  - name: "include_openapi_diff"
    type: "string"
    required: false
    description: "true|false — include OpenAPI diffs in the summary"
secrets: []
outputs:
  - name: "pr_body"
    type: "string"
    description: "Suggested PR description"
  - name: "changelog_fragment"
    type: "string"
    description: "Changelog entry fragment suitable for appending to CHANGELOG.md"
---

### PR Description & Changelog Composer (Repo Skill)

Your goal is to synthesize commit diffs, changed files, and API contract diffs into a concise, human-readable PR description and a changelog fragment useful for releases.
### Template format (required)

Title (one line): `JIRA-ID: Short descriptive title`  

## Summary

One-paragraph summary of the change and intent.

## Changes identified

Grouped list of changed files/areas with short bullet summaries. Use subheadings for files or components, for example:

### `path/to/file.yml`

- Brief bullet describing the modification.

### `another/file` (optional)

- Bullet points showing specific edits.

## Why this matters

- Short bullets describing risk, benefits, and impact.

## Validation notes

- Summary of steps taken to validate the change (tests run, files reviewed, constraints checked).

---

### Example (filled)

Title: `CMT-21033: Add CODEOWNERS protections and isolate Azure CLI runner state`

## Summary

This change adds repository ownership rules and hardens the reusable deployment workflow for self-hosted runners.

## Changes identified

### `CODEOWNERS`

- Added a root-level `CODEOWNERS` file.
- Defined a default catch-all ownership rule using `*` for the main repository contributors:
  - `@jinpatel_smbc`
  - `@klux_smbc`
  - `@vchavan_smbc`
  - `@lfestin_smbc`
  - `@sfathima_smbc`
  - `@vmuppidi_smbc`
  - `@gcaseneuve_smbc`
- Added an administrator-only override for changes under `/.github/**`.
- Added an administrator-only override for `/CODEOWNERS` itself.
- Documented the branch protection settings needed for required code owner review.

### `.github/workflows/cd-deploy-azure-appconfig-feature-flags.yml`

- Added a job-level `env` block for `deploy-feature-flags`.
- Set `AZURE_CONFIG_DIR` to `$RUNNER_TEMP/azure-cli-${{ github.run_id }}-${{ github.job }}`.
- Prevented Azure CLI credentials and cache from being shared across self-hosted runners using the same VM user profile.
- Improved deployment safety for concurrent or successive workflow runs on shared runners.

## Why this matters

- Protects sensitive repository areas with explicit code owner approval.
- Establishes default code ownership for the rest of the repository.
- Reduces the risk of Azure authentication state leaking between workflow runs on self-hosted infrastructure.

## Validation notes

- Reviewed the repository changes currently present in source control.
- Confirmed the `CODEOWNERS` rules are ordered so specific paths override the default `*` rule.
- Confirmed the workflow change is limited to Azure CLI state isolation and does not alter deployment logic.

---

### How the skill uses this format

- When invoked on a PR the skill should produce the Title and sections above as the suggested `pr_body` output and generate a `changelog_fragment` suitable for appending to `CHANGELOG.md`.
- The skill must not include secrets or internal URLs in outputs and should mark any uncertain breaking changes as requiring reviewer confirmation.

### Branch -> Title behavior

- The skill MUST inspect the source branch name (or PR branch) and attempt to extract a CMT/JIRA identifier to prefix the Title. Extraction rules (in order):
  1. Primary: if the branch contains an explicit `CMT-` token followed by digits (case-insensitive), extract `CMT-<digits>` and use it.
  2. Secondary: if the branch contains patterns like `cmt/<digits>`, `cmt-<digits>`, or a standalone numeric ticket (e.g., `21033` at start), normalize to `CMT-<digits>`.
  3. If no identifier is found, the skill should suggest a title without a prefix and include a one-line note `(no CMT id found in branch)` in the draft.

- Recommended regexes for implementation:
  - Primary: `(?i)\bCMT-(\d+)\b`
  - Secondary: `(?i)\b(?:cmt[\/-]|)(\d{3,6})\b`

- Normalization and precedence:
  - If primary regex matches, use `CMT-<digits>` with uppercase `CMT`.
  - Otherwise, if secondary matches, normalize to `CMT-<digits>`.
  - If multiple matches occur, prefer the left-most match in the branch string.

- Examples:
  - `feature/CMT-21033-codeowners` → `CMT-21033:`
  - `cmt/21033-add-codeowners` → `CMT-21033:`
  - `21033/add-codeowners` → `CMT-21033:`
  - `devops/gcaseneuve/cmt-21033/separate-regional-deployments` → `CMT-21033:` (user example)

- Title formatting enforcement:
  - Title output must be: `<PREFIX> <Short descriptive title>` (single space after colon). Example: `CMT-21033: Add CODEOWNERS protections and isolate Azure CLI runner state`.
  - If no prefix is found, include the `(no CMT id found in branch)` note immediately below the title in `pr_body`.

- Title descriptive text rules:
  - The descriptive part of the title (after the `CMT-XXXXX:` prefix) MUST be derived from analysis of the actual code changes (diff, changed files, commit messages).
  - Do NOT copy the branch name, original PR title, or commit message verbatim. Synthesize a concise description that captures the primary intent of the changes.
  - The description should be a short imperative phrase (e.g., "Add", "Fix", "Update", "Remove", "Refactor") summarizing what the PR accomplishes as a whole.
  - If the PR contains multiple unrelated changes, summarize the most significant one and add "and related updates" or similar.
  - Keep the descriptive text under 72 characters.


 