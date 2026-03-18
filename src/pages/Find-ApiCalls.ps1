# Find-ApiCalls.ps1
# Searches .jsx files for apiGet/apiPost/fetch calls to .php endpoints.
# Usage: .\Find-ApiCalls.ps1
# Usage: .\Find-ApiCalls.ps1 -JsxFile "WalletAdmin"        # one JSX file
# Usage: .\Find-ApiCalls.ps1 -PhpFile "get-payments"       # who calls this PHP
# Usage: .\Find-ApiCalls.ps1 -Mode php                     # group by PHP file instead of JSX
 
param(
    [string]$SrcDir  = "C:\xampp\htdocs\stockloyal-pwa\src",
    [string]$JsxFile = "",   # filter to JSX files matching this name
    [string]$PhpFile = "",   # filter to PHP endpoints matching this name
    [ValidateSet("jsx","php")]
    [string]$Mode    = "jsx" # "jsx" = group by JSX file | "php" = group by PHP endpoint
)
 
# Matches: apiPost("some-file.php", ...) | apiGet("some-file.php") | fetch("...some-file.php")
$pattern = '(?:apiPost|apiGet|fetch)\s*\(\s*[`"'']([^`"'']+\.php)[`"'']'
 
$jsxFiles = Get-ChildItem -Path $SrcDir -Filter "*.jsx" -Recurse -File |
    Where-Object { $JsxFile -eq "" -or $_.Name -like "*$JsxFile*" }
 
# Build two maps simultaneously
$byJsx = @{}   # jsx filename -> list of php endpoints
$byPhp = @{}   # php endpoint -> list of jsx filenames
 
foreach ($f in $jsxFiles) {
    $content = Get-Content $f.FullName -Raw -ErrorAction SilentlyContinue
    if (-not $content) { continue }
 
    $matches = [regex]::Matches($content, $pattern)
    $endpoints = $matches | ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique
 
    foreach ($ep in $endpoints) {
        if ($PhpFile -ne "" -and $ep -notlike "*$PhpFile*") { continue }
 
        # by JSX
        if (-not $byJsx.ContainsKey($f.Name)) { $byJsx[$f.Name] = [System.Collections.Generic.HashSet[string]]::new() }
        [void]$byJsx[$f.Name].Add($ep)
 
        # by PHP
        if (-not $byPhp.ContainsKey($ep)) { $byPhp[$ep] = [System.Collections.Generic.HashSet[string]]::new() }
        [void]$byPhp[$ep].Add($f.Name)
    }
}
 
if ($byJsx.Count -eq 0) {
    Write-Host "No .php API calls found." -ForegroundColor Yellow
    exit
}
 
# ── Helpers ───────────────────────────────────────────────────────────────────
function Write-Header($title, $scanned, $found) {
    Write-Host ""
    Write-Host ("=" * 70) -ForegroundColor Cyan
    Write-Host "  $title" -ForegroundColor Cyan
    Write-Host ("=" * 70) -ForegroundColor Cyan
    Write-Host "  Src : $SrcDir" -ForegroundColor Gray
    Write-Host "  JSX : $scanned file(s) scanned" -ForegroundColor Gray
    Write-Host "  $found" -ForegroundColor Gray
    Write-Host ("=" * 70) -ForegroundColor Cyan
    Write-Host ""
}
 
# ── Mode: group by JSX ────────────────────────────────────────────────────────
if ($Mode -eq "jsx") {
    $totalCalls = ($byJsx.Values | ForEach-Object { $_.Count } | Measure-Object -Sum).Sum
    Write-Header "PHP API CALLS BY JSX FILE" $jsxFiles.Count "Unique PHP endpoints called: $($byPhp.Count)  |  Total call-sites: $totalCalls"
 
    foreach ($entry in ($byJsx.GetEnumerator() | Sort-Object Key)) {
        $eps = $entry.Value | Sort-Object
        Write-Host "  $($entry.Key)" -ForegroundColor Yellow -NoNewline
        Write-Host "  ($($eps.Count) endpoint$(if($eps.Count -ne 1){'s'}))" -ForegroundColor Gray
        foreach ($ep in $eps) {
            Write-Host "      $ep" -ForegroundColor White
        }
        Write-Host ""
    }
}
 
# ── Mode: group by PHP ────────────────────────────────────────────────────────
else {
    $totalCallers = ($byPhp.Values | ForEach-Object { $_.Count } | Measure-Object -Sum).Sum
    Write-Header "JSX CALLERS BY PHP ENDPOINT" $jsxFiles.Count "Unique PHP endpoints: $($byPhp.Count)  |  Total call-sites: $totalCallers"
 
    foreach ($entry in ($byPhp.GetEnumerator() | Sort-Object Key)) {
        $callers = $entry.Value | Sort-Object
        Write-Host "  $($entry.Key)" -ForegroundColor Green -NoNewline
        Write-Host "  ($($callers.Count) caller$(if($callers.Count -ne 1){'s'}))" -ForegroundColor Gray
        foreach ($c in $callers) {
            Write-Host "      $c" -ForegroundColor White
        }
        Write-Host ""
    }
}