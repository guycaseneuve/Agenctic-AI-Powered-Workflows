[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-AgentBaseEndpoint {
    param([Parameter(Mandatory)][string]$Endpoint)

    return ($Endpoint -split "\?", 2)[0].TrimEnd("/")
}

function Get-AzureAgentToken {
    $token = az account get-access-token --resource https://ai.azure.com --query accessToken --output tsv
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($token)) {
        throw "Could not acquire an Azure AI access token."
    }
    return $token.Trim()
}

function Invoke-AgentPost {
    param(
        [Parameter(Mandatory)][string]$Endpoint,
        [Parameter(Mandatory)][hashtable]$Payload,
        [string]$SessionId
    )

    $headers = @{ Authorization = "Bearer $(Get-AzureAgentToken)" }
    $body = $Payload | ConvertTo-Json -Depth 20 -Compress
    $query = "api-version=v1"
    if (-not [string]::IsNullOrWhiteSpace($SessionId)) {
        $query += "&agent_session_id=$([Uri]::EscapeDataString($SessionId))"
    }
    return Invoke-RestMethod -Method Post -Uri "$(Get-AgentBaseEndpoint $Endpoint)?$query" -Headers $headers -ContentType "application/json" -Body $body
}

function Get-AgentInvocation {
    param(
        [Parameter(Mandatory)][string]$Endpoint,
        [Parameter(Mandatory)][string]$SessionId,
        [Parameter(Mandatory)][string]$InvocationId
    )

    $headers = @{ Authorization = "Bearer $(Get-AzureAgentToken)" }
    $uri = "$(Get-AgentBaseEndpoint $Endpoint)/$InvocationId?agent_session_id=$SessionId&api-version=v1"
    return Invoke-RestMethod -Method Get -Uri $uri -Headers $headers
}

function Wait-AgentInvocation {
    param(
        [Parameter(Mandatory)][string]$Endpoint,
        [Parameter(Mandatory)][string]$SessionId,
        [Parameter(Mandatory)][string]$InvocationId,
        [int]$TimeoutSeconds = 1800
    )

    $deadline = (Get-Date).ToUniversalTime().AddSeconds($TimeoutSeconds)
    do {
        $state = Get-AgentInvocation -Endpoint $Endpoint -SessionId $SessionId -InvocationId $InvocationId
        if ($state.status -ne "running") {
            return $state
        }
        Start-Sleep -Seconds 5
    } while ((Get-Date).ToUniversalTime() -lt $deadline)

    throw "Timed out waiting for hosted-agent invocation $InvocationId."
}

function Invoke-AgentAndWait {
    param(
        [Parameter(Mandatory)][string]$Endpoint,
        [Parameter(Mandatory)][hashtable]$Payload,
        [string]$SessionId,
        [int]$TimeoutSeconds = 1800
    )

    $accepted = Invoke-AgentPost -Endpoint $Endpoint -Payload $Payload -SessionId $SessionId
    $sessionId = if ([string]::IsNullOrWhiteSpace($SessionId)) { [string]$accepted.session_id } else { $SessionId }
    $invocationId = [string]$accepted.invocation_id
    if ([string]::IsNullOrWhiteSpace($sessionId) -or [string]::IsNullOrWhiteSpace($invocationId)) {
        throw "Hosted agent did not return session_id and invocation_id."
    }

    $state = Wait-AgentInvocation -Endpoint $Endpoint -SessionId $sessionId -InvocationId $invocationId -TimeoutSeconds $TimeoutSeconds
    return [pscustomobject]@{
        SessionId = $sessionId
        InvocationId = $invocationId
        State = $state
    }
}

function Get-CurrentGate {
    param([Parameter(Mandatory)][pscustomobject]$State)

    $gate = $State.State.output.gate
    if ($null -eq $gate) {
        throw "The hosted agent did not return a pending approval gate."
    }
    if ([string]::IsNullOrWhiteSpace([string]$gate.invocation_id) -or [string]::IsNullOrWhiteSpace([string]$gate.token)) {
        throw "The hosted agent returned an invalid approval gate."
    }
    return $gate
}

function Invoke-AgentApproval {
    param(
        [Parameter(Mandatory)][string]$Endpoint,
        [Parameter(Mandatory)][string]$SessionId,
        [Parameter(Mandatory)][object]$Gate,
        [int]$TimeoutSeconds = 1800
    )

    $token = [string]$Gate.token
    Write-Host "::add-mask::$token"
    $payload = @{
        action = "approve_action"
        gate = @{
            invocation_id = [string]$Gate.invocation_id
            step_index = [int]$Gate.step_index
            token = $token
        }
    }
    return Invoke-AgentAndWait -Endpoint $Endpoint -Payload $payload -SessionId $SessionId -TimeoutSeconds $TimeoutSeconds
}

function Write-IncidentSummary {
    param(
        [Parameter(Mandatory)][string]$Title,
        [Parameter(Mandatory)][pscustomobject]$State,
        [string]$NextAction = "Review the current workflow state."
    )

    $output = $State.State.output
    $status = if ($null -ne $output -and $output.status) { [string]$output.status } else { [string]$State.State.status }
    $issueUrl = if ($null -ne $output -and $null -ne $output.issue) { [string]$output.issue.url } else { "" }
    $pullRequestUrl = if ($null -ne $output -and $null -ne $output.pullRequest) { [string]$output.pullRequest.url } else { "" }
    $branch = if ($null -ne $output) { [string]$output.branch } else { "" }
    $planHash = if ($null -ne $output) { [string]$output.planHash } else { "" }
    $summary = @(
        "## $Title",
        "",
        "- Status: ``$status``",
        "- Session ID: ``$($State.SessionId)``",
        "- Invocation ID: ``$($State.InvocationId)``",
        "- Next action: $NextAction"
    )
    if ($issueUrl) { $summary += "- Issue: $issueUrl" }
    if ($pullRequestUrl) { $summary += "- Pull request: $pullRequestUrl" }
    if ($branch) { $summary += "- Branch: ``$branch``" }
    if ($planHash) { $summary += "- Plan hash: ``$planHash``" }
    $summary -join "`n" | Out-File -FilePath $env:GITHUB_STEP_SUMMARY -Encoding utf8 -Append
}

