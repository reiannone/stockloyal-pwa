# Find-JsxToTables.ps1
# Traces: JSX file(s) -> PHP endpoints -> included PHP files -> DB tables + CRUD access.
#
# Usage: .\Find-JsxToTables.ps1
# Usage: .\Find-JsxToTables.ps1 -JsxFile "WalletAdmin"
# Usage: .\Find-JsxToTables.ps1 -PhpFile "get-payments"
# Usage: .\Find-JsxToTables.ps1 -Table "orders"
# Usage: .\Find-JsxToTables.ps1 -Mode table

param(
    [string]$SrcDir  = "C:\xampp\htdocs\stockloyal-pwa\src",
    [string]$ApiDir  = "C:\xampp\htdocs\stockloyal-pwa\api",
    [string]$JsxFile = "",
    [string]$PhpFile = "",
    [string]$Table   = "",
    [ValidateSet("jsx","table")]
    [string]$Mode    = "jsx"
)

$q = [char]34  # "
$s = [char]39  # '

$apiPattern     = "(?:apiPost|apiGet|fetch)\s*\(\s*[$q$s]([^$q$s]+\.php)[$q$s]"
$includePattern = "(?i)(?:require_once|require|include_once|include)[^$q$s]+[$q$s]([^$q$s]+\.php)[$q$s]"

# CRUD patterns: capture (verb, tablename)
# C: INSERT INTO tbl
# R: FROM tbl / JOIN tbl
# U: UPDATE tbl
# D: DELETE FROM tbl / TRUNCATE TABLE tbl
$crudPatterns = @(
    @{ verb = 'C'; pattern = '(?i)INSERT\s+(?:INTO\s+)?`?([a-z_][a-z0-9_]*)`?' },
    @{ verb = 'R'; pattern = '(?i)(?:FROM|JOIN)\s+`?([a-z_][a-z0-9_]*)`?' },
    @{ verb = 'U'; pattern = '(?i)UPDATE\s+`?([a-z_][a-z0-9_]*)`?' },
    @{ verb = 'D'; pattern = '(?i)(?:DELETE\s+FROM|TRUNCATE\s+(?:TABLE\s+)?)`?([a-z_][a-z0-9_]*)`?' },
    @{ verb = 'S'; pattern = '(?i)CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?`?([a-z_][a-z0-9_]*)`?' }
)

$skipWords = [System.Collections.Generic.HashSet[string]]@(
    "select","where","set","values","null","not","exists","dual","from","table",
    "and","or","in","is","by","on","as","if","do","to","at","be","it","an",
    "the","for","use","see","get","let","can","all","any","new","old","one",
    "two","has","had","its","via","per","was","are","but","nor","yet","so",
    "with","this","that","each","both","only","then","when","than","into",
    "also","some","such","more","used","will","have","been","into","your",
    "name","note","type","list","data","info","code","time","date","file",
    "json","true","false","void","bool","int","str","key","val","row","col",
    "end","add","run","try","log","id","no","db","php","sql","api"
)
$minTableLen = 4

function Remove-PhpComments([string]$content) {
    $content = [regex]::Replace($content, '/\*[\s\S]*?\*/', '')
    $content = [regex]::Replace($content, '//[^\r\n]*', '')
    $content = [regex]::Replace($content, '#[^\r\n]*', '')
    return $content
}

# Returns hashtable: tableName -> [C,R,U,D,S] set
function Get-TableCrud([string]$clean) {
    $crud = @{}
    foreach ($cp in $crudPatterns) {
        $matches = [regex]::Matches($clean, $cp.pattern)
        foreach ($m in $matches) {
            $tbl = $m.Groups[1].Value.ToLower()
            if ($skipWords.Contains($tbl)) { continue }
            if ($tbl.Length -lt $minTableLen) { continue }
            if (-not $crud.ContainsKey($tbl)) {
                $crud[$tbl] = [System.Collections.Generic.HashSet[string]]::new()
            }
            [void]$crud[$tbl].Add($cp.verb)
        }
    }
    return $crud
}

function Get-PhpData {
    param([string]$FileName, [ref]$Visited)

    if ($Visited.Value.Contains($FileName)) { return $null }
    [void]$Visited.Value.Add($FileName)

    $fullPath = Join-Path $ApiDir $FileName
    if (-not (Test-Path $fullPath)) {
        return @{ missing = $true; crud = @{}; includes = @{} }
    }

    $raw   = Get-Content $fullPath -Raw -ErrorAction SilentlyContinue
    if (-not $raw) { return @{ crud = @{}; includes = @{} } }

    $clean = Remove-PhpComments $raw
    $crud  = Get-TableCrud $clean

    $includedFiles = [regex]::Matches($raw, $includePattern) |
                     ForEach-Object { [System.IO.Path]::GetFileName($_.Groups[1].Value) } |
                     Sort-Object -Unique

    $includes = @{}
    foreach ($inc in $includedFiles) {
        $child = Get-PhpData -FileName $inc -Visited $Visited
        if ($child) { $includes[$inc] = $child }
    }

    return @{ crud = $crud; includes = $includes }
}

# Flatten all table->crud from a node recursively (merged)
function Get-AllCrud($Node) {
    if (-not $Node) { return @{} }
    $merged = @{}
    foreach ($entry in $Node.crud.GetEnumerator()) {
        if (-not $merged.ContainsKey($entry.Key)) {
            $merged[$entry.Key] = [System.Collections.Generic.HashSet[string]]::new()
        }
        foreach ($v in $entry.Value) { [void]$merged[$entry.Key].Add($v) }
    }
    foreach ($child in $Node.includes.Values) {
        $childCrud = Get-AllCrud $child
        foreach ($entry in $childCrud.GetEnumerator()) {
            if (-not $merged.ContainsKey($entry.Key)) {
                $merged[$entry.Key] = [System.Collections.Generic.HashSet[string]]::new()
            }
            foreach ($v in $entry.Value) { [void]$merged[$entry.Key].Add($v) }
        }
    }
    return $merged
}

function Format-Crud($verbSet) {
    $label = ""
    $label += if ($verbSet.Contains('C')) { "C" } else { "-" }
    $label += if ($verbSet.Contains('R')) { "R" } else { "-" }
    $label += if ($verbSet.Contains('U')) { "U" } else { "-" }
    $label += if ($verbSet.Contains('D')) { "D" } else { "-" }
    if ($verbSet.Contains('S')) { $label += " +DDL" }
    return $label
}

function Get-CrudColor($verbSet) {
    if ($verbSet.Contains('D')) { return "Red" }
    if ($verbSet.Contains('C') -and $verbSet.Contains('U')) { return "Yellow" }
    if ($verbSet.Contains('C') -or $verbSet.Contains('U')) { return "DarkYellow" }
    return "White"
}

#  Step 1: scan JSX files for PHP calls 
$jsxFiles = Get-ChildItem -Path $SrcDir -Filter "*.jsx" -Recurse -File |
    Where-Object { $JsxFile -eq "" -or $_.Name -like "*$JsxFile*" }

$jsxToPhp = @{}
foreach ($f in $jsxFiles) {
    $content = Get-Content $f.FullName -Raw -ErrorAction SilentlyContinue
    if (-not $content) { continue }
    $eps = [regex]::Matches($content, $apiPattern) |
           ForEach-Object { $_.Groups[1].Value } |
           Where-Object { $PhpFile -eq "" -or $_ -like "*$PhpFile*" } |
           Sort-Object -Unique
    if ($eps.Count -gt 0) { $jsxToPhp[$f.Name] = $eps }
}

#  Step 2: build PHP data tree 
$phpData    = @{}
$phpAllCrud = @{}   # endpoint -> merged table->crud

$allEndpoints = $jsxToPhp.Values | ForEach-Object { $_ } | Sort-Object -Unique
foreach ($ep in $allEndpoints) {
    $visited = [System.Collections.Generic.HashSet[string]]::new()
    $phpData[$ep]    = Get-PhpData -FileName $ep -Visited ([ref]$visited)
    $phpAllCrud[$ep] = Get-AllCrud $phpData[$ep]
}

#  Step 3: apply table filter 
if ($Table -ne "") {
    $keep = @{}
    foreach ($entry in $jsxToPhp.GetEnumerator()) {
        $matching = $entry.Value | Where-Object { $phpAllCrud[$_].ContainsKey($Table.ToLower()) }
        if ($matching.Count -gt 0) { $keep[$entry.Key] = $matching }
    }
    $jsxToPhp = $keep
}

if ($jsxToPhp.Count -eq 0) {
    Write-Host "No results found." -ForegroundColor Yellow
    exit
}

#  Helpers 
function Write-Divider { Write-Host ("-" * 70) -ForegroundColor DarkGray }

function Write-IncludeTree {
    param($Node, [string]$Name, [int]$Depth = 0)
    if (-not $Node) { return }

    $indent    = "      " + ("    " * $Depth)
    $tFilter   = $Table.ToLower()
    $isMissing = $Node.missing -eq $true

    if ($Depth -gt 0) {
        $fileColor = if ($isMissing) { "Red" } else { "DarkCyan" }
        $label     = if ($isMissing) { "$Name  (not found)" } else { $Name }
        Write-Host "${indent}[inc] $label" -ForegroundColor $fileColor
    }

    if ($Node.includes.Count -gt 0) {
        $importList = ($Node.includes.Keys | Sort-Object) -join " | "
        Write-Host "$indent      imports: $importList" -ForegroundColor DarkGray
    }

    $crudEntries = if ($Table -ne "") {
        $Node.crud.GetEnumerator() | Where-Object { $_.Key -eq $tFilter }
    } else {
        $Node.crud.GetEnumerator()
    }

    foreach ($entry in ($crudEntries | Sort-Object Key)) {
        $tag   = Format-Crud $entry.Value
        $color = Get-CrudColor $entry.Value
        Write-Host "$indent      [$tag] $($entry.Key)" -ForegroundColor $color
    }

    foreach ($childEntry in ($Node.includes.GetEnumerator() | Sort-Object Key)) {
        Write-IncludeTree -Node $childEntry.Value -Name $childEntry.Key -Depth ($Depth + 1)
    }
}

#  Header 
$totalPhp    = ($jsxToPhp.Values | ForEach-Object { $_ } | Sort-Object -Unique).Count
$allTables   = $phpAllCrud.Values | ForEach-Object { $_.Keys } | Sort-Object -Unique
$totalTables = @($allTables).Count

Write-Host ""
Write-Host ("=" * 70) -ForegroundColor Cyan
Write-Host "  JSX -> PHP -> (includes) -> TABLES [CRUD]" -ForegroundColor Cyan
Write-Host "  C=Insert  R=Select  U=Update  D=Delete  S=DDL(CREATE TABLE)" -ForegroundColor DarkGray
Write-Host ("=" * 70) -ForegroundColor Cyan
Write-Host "  Src : $SrcDir" -ForegroundColor Gray
Write-Host "  Api : $ApiDir" -ForegroundColor Gray
Write-Host "  JSX : $($jsxToPhp.Count) file(s)  |  PHP : $totalPhp endpoint(s)  |  Tables : $totalTables" -ForegroundColor Gray
if ($Table   -ne "") { Write-Host "  Filter - table : $Table"   -ForegroundColor DarkYellow }
if ($JsxFile -ne "") { Write-Host "  Filter - jsx   : $JsxFile" -ForegroundColor DarkYellow }
if ($PhpFile -ne "") { Write-Host "  Filter - php   : $PhpFile" -ForegroundColor DarkYellow }
Write-Host ("=" * 70) -ForegroundColor Cyan

#  Mode: group by JSX 
if ($Mode -eq "jsx") {
    foreach ($jsxEntry in ($jsxToPhp.GetEnumerator() | Sort-Object Key)) {
        Write-Host ""
        Write-Host "  >> $($jsxEntry.Key)" -ForegroundColor Yellow

        foreach ($ep in ($jsxEntry.Value | Sort-Object)) {
            Write-Host ""
            Write-Host "      -> $ep" -ForegroundColor Cyan
            $node = $phpData[$ep]
            if (-not $node) {
                Write-Host "            (file not found)" -ForegroundColor Red
            } else {
                Write-IncludeTree -Node $node -Name $ep -Depth 0
                if ($phpAllCrud[$ep].Count -eq 0) {
                    Write-Host "            (no table references found)" -ForegroundColor DarkGray
                }
            }
        }
        Write-Divider
    }
}

#  Mode: group by table 
else {
    # table -> { php -> { jsx[], crud } }
    $tableMap = @{}
    foreach ($jsxEntry in $jsxToPhp.GetEnumerator()) {
        foreach ($ep in $jsxEntry.Value) {
            foreach ($tblEntry in $phpAllCrud[$ep].GetEnumerator()) {
                $tbl = $tblEntry.Key
                if (-not $tableMap.ContainsKey($tbl)) { $tableMap[$tbl] = @{} }
                if (-not $tableMap[$tbl].ContainsKey($ep)) {
                    $tableMap[$tbl][$ep] = @{ jsxFiles = [System.Collections.Generic.HashSet[string]]::new(); crud = $tblEntry.Value }
                }
                [void]$tableMap[$tbl][$ep].jsxFiles.Add($jsxEntry.Key)
                foreach ($v in $tblEntry.Value) { [void]$tableMap[$tbl][$ep].crud.Add($v) }
            }
        }
    }

    foreach ($tblEntry in ($tableMap.GetEnumerator() | Sort-Object Key)) {
        Write-Host ""
        foreach ($epEntry in ($tblEntry.Value.GetEnumerator() | Sort-Object Key)) {
            $tag   = Format-Crud $epEntry.Value.crud
            $color = Get-CrudColor $epEntry.Value.crud
            Write-Host "  >> $($tblEntry.Key)" -ForegroundColor Green -NoNewline
            Write-Host "  [$tag]" -ForegroundColor $color
            Write-Host "      -> $($epEntry.Key)" -ForegroundColor Cyan
            foreach ($jsx in ($epEntry.Value.jsxFiles | Sort-Object)) {
                Write-Host "            * $jsx" -ForegroundColor White
            }
        }
        Write-Divider
    }
}