# Incident Remediation PoC: End-to-End Diagrams

These diagrams describe the checked-in Python Incident Intake and Incident Remediation agents and their configured MCP connections. They are logical views, not proof that a specific deployment, identity, connection, or GitHub approval environment is live.

## 1. Incident Intake Sequence

This diagram covers incident preparation, evidence lookup, exact-preview confirmation, and the handoff boundary. The checked-in configuration disables automatic handoff; the dispatch messages are conditional on completing the required rollout checks.

```mermaid
sequenceDiagram
    autonumber
    actor Dev as Developer / Operator
    participant Intake as Incident Intake (Responses)
    participant State as User-isolated Intake State
    participant Tools as Intake Toolbox
    participant MCP as App Insights MCP
    participant LA as Log Analytics Workspace
    participant Model as Foundry Model
    participant Rem as Incident Remediation

    Dev->>Intake: Submit sanitized exception, portal link, or /lookup request
    Intake->>State: Load or create draft for this user and conversation
    Note over Intake,Tools: For /lookup only, query configured application and UTC time window
    Intake->>Tools: Query failures for mapped application and bounded window
    Tools->>MCP: query_application_insights_failures
    MCP->>LA: Read requests, exceptions, and traces
    LA-->>MCP: Matching telemetry rows
    MCP-->>Tools: Normalized and redacted evidence
    Tools-->>Intake: Candidate exceptions
    Note over Intake,Dev: If multiple exact-role exceptions match, developer selects one
    Dev->>Intake: Optional /select index
    Note over Intake,Model: If context or expected behavior is missing and a model is configured
    Intake->>Model: Request constrained context suggestion
    Model-->>Intake: Unconfirmed context suggestion only
    Intake-->>Dev: Ask for missing application, repository, ref, time window, or expected behavior
    Dev->>Intake: Provide or confirm incident context
    Intake->>State: Save draft, provenance, and incremented revision
    Intake-->>Dev: Preview, revision, incident hash, and exact confirmation command
    Dev->>Intake: /submit exact-revision exact-incident-hash
    Intake->>State: Verify latest preview and reserve submission
    Note over Intake,Rem: Current config: handoff is disabled, so Intake rejects submission and stops here
    Note over Intake,Rem: If handoff is enabled after rollout checks, continue with the following messages
    Intake->>State: Reserve stable remediation session and submission ID
    Intake->>Rem: POST investigate with incident and submission proof
    Rem->>Rem: Validate identity, allowlists, hash, feature flag, and deduplication
    Rem-->>Intake: 202 Accepted with session and invocation IDs
    Intake-->>Dev: Return submitted status and remediation session
```

The `/submit` confirmation approves sending the reviewed incident preview. It does not approve a fix. If dispatch is ambiguous, check the reserved session and status rather than automatically sending a second request.

## 2. Incident Remediation Sequence

This diagram begins when the remediation service receives an `investigate` request. The caller can be Intake after handoff is enabled, or a separate authorized invocation for a demo. Incident investigation requires a configured Foundry model for fix generation and static review.

```mermaid
sequenceDiagram
    autonumber
    actor Dev as Developer / Operator
    participant Caller as Intake or authorized caller
    participant Rem as Incident Remediation (Invocations)
    participant State as Durable Remediation State
    participant Tools as Remediation Toolbox
    participant MCP as App Insights MCP (read-only)
    participant LA as Log Analytics Workspace
    participant GitMCP as GitHub MCP
    participant Repo as GitHub Issue / Repository / PR
    participant Model as Foundry Model

    Caller->>Rem: POST investigate with normalized incident
    Note over Caller,Rem: Handoff requests additionally validate identity, submission proof, allowlists, and deduplication
    Rem->>State: Create or resume durable session and invocation
    Rem-->>Caller: 202 Accepted with invocation ID
    Caller->>Rem: Poll current invocation or status
    Rem->>Rem: Validate incident fields, allowed repository/ref, and time window
    Note over Rem,Dev: If expected behavior is missing, ask for clarification and make no telemetry or GitHub calls
    Rem->>Tools: Query incident telemetry for up to 20 failures
    Tools->>MCP: query_application_insights_failures
    MCP->>LA: Read bounded incident window and optional correlation ID
    LA-->>MCP: Matching failure evidence
    MCP-->>Tools: Normalized and redacted evidence
    Tools-->>Rem: Evidence
    Rem->>GitMCP: Find or create incident issue
    GitMCP->>Repo: Search issue marker and create if absent
    Repo-->>GitMCP: Issue number and URL
    GitMCP-->>Rem: Incident issue
    Rem->>GitMCP: Search and read allowlisted source and test files
    GitMCP->>Repo: Read target-ref source and file revisions
    Repo-->>GitMCP: Repository context
    GitMCP-->>Rem: Bounded source context and base SHAs
    Note over Rem,Dev: If required source context is unavailable, comment on issue and stop without proposing a fix
    Rem->>Model: Propose exact edits, tests, and risks from captured evidence
    Model-->>Rem: Candidate fix plan
    Rem->>Model: Independently review failure path and expected behavior
    Model-->>Rem: Static review verdict, not test results
    Rem->>State: Persist fix plan, planHash, and checkpoint
    Rem->>GitMCP: Comment proposed plan and hash on issue
    GitMCP->>Repo: Add plan comment
    Rem-->>Dev: Return plan summary, files, suggested tests, risks, and planHash
    Dev->>Rem: Approve exact planHash, edit plan, or reject
    Rem->>State: Verify approval matches current plan hash
    Note over Rem,Dev: Each irreversible repository operation requires a separate current gate token
    Rem-->>Dev: Gate 1: approve isolated branch and approved file changes
    Dev->>Rem: approve_action with current gate
    Rem->>GitMCP: Recheck base SHAs, create branch, and push approved files
    GitMCP->>Repo: Apply approved changes on isolated branch
    Repo-->>Rem: Branch and commit result
    Rem-->>Dev: Gate 2: approve draft pull request creation
    Dev->>Rem: approve_action with current gate
    Rem->>GitMCP: Create or reuse draft PR
    GitMCP->>Repo: Open draft PR against approved target ref
    Repo-->>Rem: Draft PR identity
    Note over Rem,Repo: Poll GitHub checks until success, failure, or timeout
    Rem->>GitMCP: Read check status
    GitMCP->>Repo: Get PR check runs
    Repo-->>Rem: Pending, success, or failure
    Note over Rem,Dev: On check failure or timeout, leave PR draft and stop
    Rem-->>Dev: Gate 3: after checks pass, approve PR ready-for-review transition
    Dev->>Rem: approve_action with current gate
    Rem->>GitMCP: Mark PR ready and update incident issue
    GitMCP->>Repo: Set draft=false and add issue comment
    Repo-->>Rem: Ready-for-review result
    Rem-->>Dev: PR ready for human review, agent does not merge or deploy
```

The remediation workflow persists checkpoints and resumes long-running execution from durable state. Rejected gates stop subsequent actions. GitHub check results are the validation signal; the model's proposed test commands are not proof that tests ran.

## 3. High-Level Process Flow: Incident Intake

```mermaid
flowchart LR
    Start([Incident reported]) --> Sanitize[Sanitize exception and remove credentials or personal data]
    Sanitize --> Input{Choose incident input}
    Input -->|Exception export or text| Parse[Parse one exception and extract evidence]
    Input -->|Portal URL| ParseLink[Parse supported URL locally, do not fetch it]
    Input -->|Telemetry lookup| Lookup[Query mapped application and bounded UTC window]
    Lookup --> MCP[Read telemetry through intake toolbox and App Insights MCP]
    MCP --> Select{How many exact-role exceptions matched?}
    Select -->|None| Clarify[Adjust lookup window or provide exception export]
    Clarify --> Input
    Select -->|Several| Pick[Developer selects one exception]
    Select -->|One| Parse
    Pick --> Parse
    ParseLink --> Context[Collect application, repository, deployed ref, time window, and expected behavior]
    Parse --> Context
    Context --> Suggest{Missing context and model configured?}
    Suggest -->|Yes| Proposal[Model suggests context or expected behavior only]
    Proposal --> ConfirmSuggestion[Developer confirms or replaces suggestion]
    Suggest -->|No| Validate
    ConfirmSuggestion --> Validate[Validate required fields, role mapping, allowlists, and time window]
    Validate --> Complete{Valid incident context?}
    Complete -->|No| ClarifyContext[Ask for missing or corrected context]
    ClarifyContext --> Context
    Complete -->|Yes| Preview[Save draft and show preview, provenance, revision, and incident hash]
    Preview --> Review[Developer reviews every preview field]
    Review --> Decision{Confirm exact current revision and hash?}
    Decision -->|Revise| Context
    Decision -->|Decline| Declined([Stop with no submission])
    Decision -->|Confirm| HandoffEnabled{Intake handoff enabled?}
    HandoffEnabled -->|No, current checked-in configuration| Boundary([Stop at preview boundary, no remediation dispatch])
    HandoffEnabled -->|Yes, after rollout checks| Reserve[Reserve incident and stable session once]
    Reserve --> Dispatch[Send investigate request with proof and platform call context]
    Dispatch --> Accepted{Accepted and identifiers verified?}
    Accepted -->|Yes| Submitted([Return session and invocation status])
    Accepted -->|No or ambiguous| Reconcile[Inspect reserved session and status, do not blindly retry]
    Reconcile --> Status[Use read-only status or operator reconciliation]
```

Intake confirmation authorizes submission of the incident preview only. It does not approve a fix. Handoff is disabled in the checked-in intake configuration.

## 4. High-Level Process Flow: Incident Remediation

```mermaid
flowchart LR
    Start([Investigate request received]) --> Admission{Intake handoff request?}
    Admission -->|Yes| ValidateAdmission[Check feature flag, user identity, submission proof, and deduplication]
    Admission -->|No, direct authorized invocation| ValidateIncident[Validate incident fields, repository/ref allowlists, and time window]
    ValidateAdmission --> Admit{Admission accepted?}
    Admit -->|No or conflict| Reject([Reject or reconcile original session])
    Admit -->|Yes| ValidateIncident
    ValidateIncident --> Expected{Expected behavior supplied?}
    Expected -->|No| Ask[Ask for observable expected behavior]
    Ask --> Clarification([Stop before telemetry and GitHub calls])
    Expected -->|Yes| Evidence[Query up to 20 failures through read-only App Insights MCP]
    Evidence --> Issue[Find or create the incident GitHub issue]
    Issue --> Source[Search and capture bounded source/test context on allowed ref]
    Source --> Grounded{Required source context captured?}
    Grounded -->|No| CommentStop[Comment on issue and stop without a fix]
    Grounded -->|Yes| Generate[Generate exact edits, tests, and risks with Foundry model]
    Generate --> Review[Independently review failure path and expected behavior]
    Review --> Supported{Proposal supported by captured evidence?}
    Supported -->|No, retry exhausted or insufficient evidence| CommentStop
    Supported -->|No, correction available| Correct[Correct candidate once from review feedback]
    Correct --> Review
    Supported -->|Yes| Publish[Persist plan and post exact planHash to issue]
    Publish --> HumanPlan{Human decision on current planHash}
    HumanPlan -->|Reject| Stop([Stop, no repository changes])
    HumanPlan -->|Edit| Rehash[Revalidate edits and calculate new planHash]
    Rehash --> Publish
    HumanPlan -->|Approve exact hash| BranchGate{Approve branch and file write?}
    BranchGate -->|Reject| Stop
    BranchGate -->|Approve| CheckBase[Verify captured base revisions are still current]
    CheckBase -->|Stale| Stale([Fail safely, request a new investigation/plan])
    CheckBase -->|Current| Branch[Create isolated branch and apply approved files]
    Branch --> PRGate{Approve draft PR creation?}
    PRGate -->|Reject| Stop
    PRGate -->|Approve| DraftPR[Create or reuse draft PR]
    DraftPR --> CI[Poll GitHub PR checks]
    CI --> Checks{Checks all successful before timeout?}
    Checks -->|No| DraftStop([Leave PR draft, report validation failure])
    Checks -->|Yes| ReadyGate{Approve ready-for-review transition?}
    ReadyGate -->|Reject| Stop
    ReadyGate -->|Approve| Ready[Mark PR ready and update issue]
    Ready --> ReviewPR([Human reviews and merges outside the agent])
```

The agent persists workflow checkpoints and can resume long-running execution. Model-proposed test commands are not proof of execution; GitHub check runs provide the validation signal. The agent does not merge or deploy.

## Configuration Facts To Verify Before Demo

- `INCIDENT_INTAKE_HANDOFF_ENABLED` is set to `false` in the checked-in `azure.yaml`; `ALLOW_INTAKE_HANDOFF` is `true` for the remediation service. The intake flag and required platform identity/admission checks must also pass before the end-to-end dispatch is available.
- Incident `investigate` requires a configured Foundry model for fix generation and static review. The generic offline `action=plan` fallback is not an offline incident-fix flow.
- Verify deployed service versions, application/repository/ref mappings, telemetry and GitHub connections, GitHub permissions, required checks, and human approval configuration separately. The diagrams do not establish live deployment status.
- The agent can prepare a PR for human review; it does not merge or deploy.
