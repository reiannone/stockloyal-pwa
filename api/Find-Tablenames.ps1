# Find-TableNames.ps1
# Searches all .php files for SQL table references and reports which files use each table.
# Usage: .\Find-TableNames.ps1
# Usage: .\Find-TableNames.ps1 -Table "orders"          # filter to one table
# Usage: .\Find-TableNames.ps1 -File "journal-sweep"    # filter to one file
 
param(
    [string]$Dir   = "C:\xampp\htdocs\stockloyal-pwa\api",
    [string]$Table = "",   # optional: show only this table
    [string]$File  = ""    # optional: show only files matching this name
)
 
# Regex captures the word after FROM, JOIN, INTO, UPDATE, TABLE (case-insensitive)
$pattern = '(?i)(?:FROM|JOIN|INTO|UPDATE|TABLE)\s+`?([a-z_][a-z0-9_]*)`?'
 
$phpFiles = Get-ChildItem -Path $Dir -Filter "*.php" -File |
    Where-Object { $File -eq "" -or $_.Name -like "*$File*" }
 
# Build: table -> list of files
$tableMap = @{}
 
foreach ($f in $phpFiles) {
    $content = Get-Content $f.FullName -Raw -ErrorAction SilentlyContinue
    if (-not $content) { continue }
 
    $matches = [regex]::Matches($content, $pattern)
    foreach ($m in $matches) {
        $tbl = $m.Groups[1].Value.ToLower()
        # Skip SQL keywords that get caught
        if ($tbl -in @("select","where","set","values","null","not","exists","dual","from")) { continue }
        if ($Table -ne "" -and $tbl -ne $Table.ToLower()) { continue }
 
        if (-not $tableMap.ContainsKey($tbl)) { $tableMap[$tbl] = [System.Collections.Generic.HashSet[string]]::new() }
        [void]$tableMap[$tbl].Add($f.Name)
    }
}
 
if ($tableMap.Count -eq 0) {
    Write-Host "No table references found." -ForegroundColor Yellow
    exit
}
 
# ── Output ────────────────────────────────────────────────────────────────────
$sorted = $tableMap.GetEnumerator() | Sort-Object Key
 
Write-Host ""
Write-Host ("=" * 70) -ForegroundColor Cyan
Write-Host "  TABLE REFERENCES IN PHP FILES" -ForegroundColor Cyan
Write-Host ("=" * 70) -ForegroundColor Cyan
Write-Host "  Dir : $Dir" -ForegroundColor Gray
Write-Host "  PHP : $($phpFiles.Count) files scanned" -ForegroundColor Gray
Write-Host "  Tables found: $($tableMap.Count)" -ForegroundColor Gray
Write-Host ("=" * 70) -ForegroundColor Cyan
Write-Host ""
 
foreach ($entry in $sorted) {
    $fileList = $entry.Value | Sort-Object
    Write-Host "  $($entry.Key)" -ForegroundColor Green -NoNewline
    Write-Host "  ($($fileList.Count) file$(if($fileList.Count -ne 1){'s'}))" -ForegroundColor Gray
    foreach ($fn in $fileList) {
        Write-Host "      $fn" -ForegroundColor White
    }
    Write-Host ""
}