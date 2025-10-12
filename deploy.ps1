param(
  [switch]$SkipBuild,   # use when only backend/PHP changed
  [switch]$SkipApache   # skip trying to restart Apache
)

$ErrorActionPreference = "Stop"

# Adjust if your project path is different
$root = "C:\xampp\htdocs\stockloyal-pwa"
Set-Location $root

# 1) Build frontend (unless skipped)
if (-not $SkipBuild) {
  Write-Host "Running: npm run build"
  npm run build
}

# 2) Detect build output folder (Vite=dist, CRA=build, others=out)
$buildDir = @("dist","build","out") |
  Where-Object { Test-Path (Join-Path $root "$_\index.html") } |
  Select-Object -First 1

if (-not $buildDir) {
  Write-Host "No build output found (dist/, build/, or out/)."
  Write-Host "Re-run 'npm run build' and check the output directory."
  exit 1
}

Write-Host ("Using build output: {0}" -f $buildDir)

# 3) Ensure SPA routing for React Router (idempotent)
$htaccess = @"
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /stockloyal-pwa/

  # Let API calls through
  RewriteRule ^api/ - [L]

  # Serve existing files directly
  RewriteCond %{REQUEST_FILENAME} -f [OR]
  RewriteCond %{REQUEST_FILENAME} -d
  RewriteRule ^ - [L]

  # Everything else -> index.html
  RewriteRule . /stockloyal-pwa/index.html [L]
</IfModule>
"@

$htPath = Join-Path $root ".htaccess"
if (-not (Test-Path $htPath)) {
  $htaccess | Out-File -Encoding utf8 $htPath
}

# 4) Copy top-level files (do NOT mirror the root to avoid overwriting api/)
$topFiles = @("index.html","asset-manifest.json","manifest.json","favicon.ico","robots.txt")
foreach ($f in $topFiles) {
  $src = Join-Path $root "$buildDir\$f"
  $dst = Join-Path $root $f
  if (Test-Path $src) {
    Copy-Item $src $dst -Force
    Write-Host ("Copied: {0}" -f $f)
  }
}

# 5) Mirror asset folders safely
$assetFolders = @("assets","static")
foreach ($folder in $assetFolders) {
  $srcFolder = Join-Path $root "$buildDir\$folder"
  $dstFolder = Join-Path $root $folder
  if (Test-Path $srcFolder) {
    Write-Host ("Mirroring folder: {0}" -f $folder)
    robocopy $srcFolder $dstFolder /MIR | Out-Null
  }
}

# 6) Optionally restart Apache if a Windows service exists
if (-not $SkipApache) {
  Write-Host "Attempting to restart Apache service (if installed)..."
  $candidates = @("Apache2.4","Apache24","xamppapache","Apache")
  $svc = $null

  foreach ($name in $candidates) {
    try {
      $found = Get-Service -Name $name -ErrorAction Stop
      if ($found) { $svc = $found; break }
    } catch {
      # ignore and continue
    }
  }

  if ($svc) {
    try {
      if ($svc.Status -eq 'Running') {
        Stop-Service -Name $svc.Name -Force -ErrorAction SilentlyContinue
      }
      Start-Sleep -Seconds 1
      Start-Service -Name $svc.Name -ErrorAction SilentlyContinue
      Write-Host ("Restarted service: {0}" -f $svc.Name)
    } catch {
      Write-Host ("Could not restart service: {0}. Restart via XAMPP Control Panel if needed." -f $svc.Name)
    }
  } else {
    Write-Host "No Apache Windows service found. If you use XAMPP Control Panel, stop/start Apache there."
  }
}

Write-Host "Deploy complete."
