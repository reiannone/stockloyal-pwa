# deploy-frontend.ps1
# Usage:
#   ./deploy-frontend.ps1
#   (optional) set env vars first: $env:AMPLIFY_APP_ID="d123abc456def"; $env:AMPLIFY_BRANCH="main"

$ErrorActionPreference = "Stop"

# ---- SETTINGS ----
$Branch = $env:mail
if (-not $Branch) { $Branch = "main" }    # default branch if not set
$AppId  = $env:d3m4upe8dxa3lr            # set this to your Amplify App Id to auto-trigger build

Write-Host "==> Checking Git status..."
git rev-parse --is-inside-work-tree | Out-Null

Write-Host "==> Switching to $Branch and pulling latest..."
git fetch origin
git checkout $Branch
git pull --rebase origin $Branch

Write-Host "==> Installing dependencies (npm ci)..."
npm ci

Write-Host "==> Building (npm run build)..."
npm run build

# Ensure a new commit even if nothing changed (touch a build stamp that's ignored by the app)
$stampFile = "deploy.buildstamp"
(Get-Date -Format "yyyy-MM-ddTHH:mm:ss.ffffK") | Out-File -Encoding utf8 $stampFile

Write-Host "==> Committing and pushing..."
git add -A
git commit -m "Deploy: frontend $(Get-Date -Format s)" --allow-empty
git push origin $Branch

# ---- Optionally trigger Amplify build via AWS CLI (requires `aws configure` and proper IAM perms) ----
if ($AppId) {
  Write-Host "==> Starting Amplify job for AppId=$AppId branch=$Branch..."
  $start = aws amplify start-job --app-id $AppId --branch-name $Branch --job-type RELEASE | ConvertFrom-Json
  $jobId = $start.jobSummary.jobId
  Write-Host "Amplify job started: $jobId"

  # Simple poll loop until SUCCEED or FAILED
  do {
    Start-Sleep -Seconds 8
    $job = aws amplify get-job --app-id $AppId --branch-name $Branch --job-id $jobId | ConvertFrom-Json
    $status = $job.job.summary.status
    Write-Host ("   ...status: {0}" -f $status)
  } while ($status -in @("PENDING","PROVISIONING","RUNNING","CANCELLING"))

  if ($status -ne "SUCCEED") {
    throw "Amplify job failed with status: $status"
  }

  Write-Host "✅ Amplify deploy finished: $status"
} else {
  Write-Host "ℹ️  AMPLIFY_APP_ID not set. Relying on GitHub webhook to trigger Amplify."
  Write-Host "    (Set `$env:AMPLIFY_APP_ID` and optionally `$env:AMPLIFY_BRANCH` to trigger via AWS CLI.)"
}

Write-Host "==> Done."
