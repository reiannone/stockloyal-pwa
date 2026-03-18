# Find-Jsx-APIs-Tables-Columns.ps1
# Traces: JSX -> PHP endpoints -> included PHP files -> DB tables + CRUD + columns/keys
#
# Usage: .\Find-Jsx-APIs-Tables-Columns.ps1
# Usage: .\Find-Jsx-APIs-Tables-Columns.ps1 -JsxFile "PrepareOrders"
# Usage: .\Find-Jsx-APIs-Tables-Columns.ps1 -PhpFile "get-payments"
# Usage: .\Find-Jsx-APIs-Tables-Columns.ps1 -Table "orders"
# Usage: .\Find-Jsx-APIs-Tables-Columns.ps1 -Mode table
# Usage: .\Find-Jsx-APIs-Tables-Columns.ps1 -ShowColumns        # show column-level detail

param(
    [string]$SrcDir      = "C:\xampp\htdocs\stockloyal-pwa\src",
    [string]$ApiDir      = "C:\xampp\htdocs\stockloyal-pwa\api",
    [string]$JsxFile     = "",
    [string]$PhpFile     = "",
    [string]$Table       = "",
    [ValidateSet("jsx","table")]
    [string]$Mode        = "jsx",
    [switch]$ShowColumns               # show column detail under each table
)

$q = [char]34
$s = [char]39

$apiPattern     = "(?:apiPost|apiGet|fetch)\s*\(\s*[$q$s]([^$q$s]+\.php)[$q$s]"
$includePattern = "(?i)(?:require_once|require|include_once|include)[^$q$s]+[$q$s]([^$q$s]+\.php)[$q$s]"

$crudPatterns = @(
    @{ verb='C'; pattern='(?i)INSERT\s+(?:INTO\s+)?`?([a-z_][a-z0-9_]*)`?' },
    @{ verb='R'; pattern='(?i)(?:FROM|JOIN)\s+`?([a-z_][a-z0-9_]*)`?' },
    @{ verb='U'; pattern='(?i)UPDATE\s+`?([a-z_][a-z0-9_]*)`?' },
    @{ verb='D'; pattern='(?i)(?:DELETE\s+FROM|TRUNCATE\s+(?:TABLE\s+)?)`?([a-z_][a-z0-9_]*)`?' },
    @{ verb='S'; pattern='(?i)CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?`?([a-z_][a-z0-9_]*)`?' }
)

$skipWords = [System.Collections.Generic.HashSet[string]]@(
    "select","where","set","values","null","not","exists","dual","from","table",
    "and","or","in","is","by","on","as","if","do","to","at","be","it","an",
    "the","for","use","see","get","let","can","all","any","new","old","one",
    "two","has","had","its","via","per","was","are","but","nor","yet","so",
    "with","this","that","each","both","only","then","when","than","into",
    "also","some","such","more","used","will","have","been","your",
    "name","note","type","list","data","info","code","time","date","file",
    "json","true","false","void","bool","int","str","key","val","row","col",
    "end","add","run","try","log","id","no","db","php","sql","api",
    "case","when","else","then","count","sum","max","min","avg","coalesce",
    "concat","ifnull","isnull","now","date","cast","convert","group","order",
    "limit","offset","having","distinct","between","like","regexp","match"
)
$skipCols = [System.Collections.Generic.HashSet[string]]@(
    "null","true","false","now","count","sum","max","min","avg","coalesce",
    "concat","date","cast","convert","distinct","case","when","then","else","end",
    "interval","year","month","day","hour","minute","second","values","limit",
    "offset","asc","desc","and","not","or","in","is","like","between","exists"
)
$minLen = 4

function Remove-PhpComments([string]$content) {
    $content = [regex]::Replace($content, '/\*[\s\S]*?\*/', ' ')
    $content = [regex]::Replace($content, '//[^\r\n]*', ' ')
    $content = [regex]::Replace($content, '#[^\r\n]*', ' ')
    return $content
}

#  Column extraction per table 
# Returns: tableName -> { colName -> HashSet(R/W) }
function Get-ColumnAccess([string]$clean, [string[]]$tableNames) {
    $allCols = @{}   # table -> { col -> Set(R/W) }
    foreach ($t in $tableNames) { $allCols[$t] = @{} }

    $re = [System.Text.RegularExpressions.Regex]
    $ro = [System.Text.RegularExpressions.RegexOptions]::IgnoreCase -bor
          [System.Text.RegularExpressions.RegexOptions]::Singleline

    foreach ($tbl in $tableNames) {
        $esc = [regex]::Escape($tbl)
        $cols = $allCols[$tbl]

        #  INSERT INTO tbl (col1, col2, ...) 
        $insRx = $re::Matches($clean, "INSERT\s+(?:INTO\s+)?`?$esc`?\s*\(([^)]+)\)", $ro)
        foreach ($m in $insRx) {
            $m.Groups[1].Value -split ',' | ForEach-Object {
                $c = $_.Trim().Trim('`"''').ToLower()
                if ($c -match '^[a-z_][a-z0-9_]*$' -and $c.Length -ge 2 -and -not $skipCols.Contains($c)) {
                    if (-not $cols.ContainsKey($c)) { $cols[$c] = [System.Collections.Generic.HashSet[string]]::new() }
                    [void]$cols[$c].Add('W')
                }
            }
        }

        #  UPDATE tbl SET col=val, col2=val 
        $updRx = $re::Matches($clean, "UPDATE\s+`?$esc`?\s+SET\s+([\s\S]+?)(?=WHERE|ORDER|LIMIT|$re::Escape(';')|$re::Escape('`')(?!$esc))", $ro)
        foreach ($m in $updRx) {
            $setClause = $m.Groups[1].Value
            $re::Matches($setClause, '`?([a-z_][a-z0-9_]*)`?\s*=', $ro) | ForEach-Object {
                $c = $_.Groups[1].Value.ToLower()
                if ($c.Length -ge 2 -and -not $skipCols.Contains($c)) {
                    if (-not $cols.ContainsKey($c)) { $cols[$c] = [System.Collections.Generic.HashSet[string]]::new() }
                    [void]$cols[$c].Add('W')
                }
            }
        }

        #  SELECT cols FROM tbl (simple, no multi-table join attribution) 
        # Grab SELECT...FROM blocks then check if tbl is the FROM target
        $selRx = $re::Matches($clean, "SELECT\s+([\s\S]+?)\s+FROM\s+`?(\w+)`?", $ro)
        foreach ($m in $selRx) {
            $fromTbl = $m.Groups[2].Value.ToLower()
            if ($fromTbl -ne $tbl) { continue }
            $selPart = $m.Groups[1].Value.Trim()
            if ($selPart -eq '*') {
                if (-not $cols.ContainsKey('*')) { $cols['*'] = [System.Collections.Generic.HashSet[string]]::new() }
                [void]$cols['*'].Add('R')
                continue
            }
            $selPart -split ',' | ForEach-Object {
                $part = $_.Trim()
                # strip alias:  col AS alias  or  tbl.col AS alias
                $part = $re::Replace($part, '(?i)\s+AS\s+\S+', '').Trim()
                # strip table prefix:  tbl.col -> col
                $part = $re::Replace($part, '^[a-z_][a-z0-9_]*\.', '').Trim()
                $c = $part.Trim('`"'' ').ToLower()
                if ($c -match '^[a-z_][a-z0-9_]*$' -and $c.Length -ge 2 -and -not $skipCols.Contains($c)) {
                    if (-not $cols.ContainsKey($c)) { $cols[$c] = [System.Collections.Generic.HashSet[string]]::new() }
                    [void]$cols[$c].Add('R')
                }
            }
        }

        #  WHERE / AND / OR conditions referencing this table 
        # Find WHERE clauses in statements that mention this table
        $stmtRx = $re::Matches($clean, "(?:FROM|UPDATE|JOIN)\s+`?$esc`?[\s\S]{0,800}?WHERE\s+([\s\S]+?)(?=ORDER\s+BY|GROUP\s+BY|HAVING|LIMIT|;|\))", $ro)
        foreach ($m in $stmtRx) {
            $whereClause = $m.Groups[1].Value
            # col = val  or  col IS  or  col IN  or  col LIKE
            $re::Matches($whereClause, '(?:^|AND\s+|OR\s+)(?:[a-z_]+\.)?`?([a-z_][a-z0-9_]*)`?\s*(?:=|!=|<|>|IS\s|IN\s|LIKE\s|NOT\s)', $ro) | ForEach-Object {
                $c = $_.Groups[1].Value.ToLower()
                if ($c.Length -ge 2 -and -not $skipCols.Contains($c) -and -not $skipWords.Contains($c)) {
                    if (-not $cols.ContainsKey($c)) { $cols[$c] = [System.Collections.Generic.HashSet[string]]::new() }
                    [void]$cols[$c].Add('R')
                }
            }
        }
    }
    return $allCols
}

function Get-TableCrud([string]$clean) {
    $crud = @{}
    foreach ($cp in $crudPatterns) {
        [regex]::Matches($clean, $cp.pattern) | ForEach-Object {
            $tbl = $_.Groups[1].Value.ToLower()
            if ($skipWords.Contains($tbl) -or $tbl.Length -lt $minLen) { return }
            if (-not $crud.ContainsKey($tbl)) { $crud[$tbl] = [System.Collections.Generic.HashSet[string]]::new() }
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
    if (-not (Test-Path $fullPath)) { return @{ missing=$true; crud=@{}; columns=@{}; includes=@{} } }

    $raw   = Get-Content $fullPath -Raw -ErrorAction SilentlyContinue
    if (-not $raw) { return @{ crud=@{}; columns=@{}; includes=@{} } }

    $clean   = Remove-PhpComments $raw
    $crud    = Get-TableCrud $clean
    $columns = if ($ShowColumns -and $crud.Count -gt 0) {
        Get-ColumnAccess $clean @($crud.Keys)
    } else { @{} }

    $includedFiles = [regex]::Matches($raw, $includePattern) |
                     ForEach-Object { [System.IO.Path]::GetFileName($_.Groups[1].Value) } |
                     Sort-Object -Unique

    $includes = @{}
    foreach ($inc in $includedFiles) {
        $child = Get-PhpData -FileName $inc -Visited $Visited
        if ($child) { $includes[$inc] = $child }
    }
    return @{ crud=$crud; columns=$columns; includes=$includes }
}

function Get-AllCrud($Node) {
    if (-not $Node) { return @{} }
    $merged = @{}
    foreach ($e in $Node.crud.GetEnumerator()) {
        if (-not $merged.ContainsKey($e.Key)) { $merged[$e.Key] = [System.Collections.Generic.HashSet[string]]::new() }
        foreach ($v in $e.Value) { [void]$merged[$e.Key].Add($v) }
    }
    foreach ($child in $Node.includes.Values) {
        foreach ($e in (Get-AllCrud $child).GetEnumerator()) {
            if (-not $merged.ContainsKey($e.Key)) { $merged[$e.Key] = [System.Collections.Generic.HashSet[string]]::new() }
            foreach ($v in $e.Value) { [void]$merged[$e.Key].Add($v) }
        }
    }
    return $merged
}

function Get-AllColumns($Node) {
    if (-not $Node) { return @{} }
    $merged = @{}
    foreach ($tblEntry in $Node.columns.GetEnumerator()) {
        if (-not $merged.ContainsKey($tblEntry.Key)) { $merged[$tblEntry.Key] = @{} }
        foreach ($colEntry in $tblEntry.Value.GetEnumerator()) {
            if (-not $merged[$tblEntry.Key].ContainsKey($colEntry.Key)) {
                $merged[$tblEntry.Key][$colEntry.Key] = [System.Collections.Generic.HashSet[string]]::new()
            }
            foreach ($v in $colEntry.Value) { [void]$merged[$tblEntry.Key][$colEntry.Key].Add($v) }
        }
    }
    foreach ($child in $Node.includes.Values) {
        foreach ($tblEntry in (Get-AllColumns $child).GetEnumerator()) {
            if (-not $merged.ContainsKey($tblEntry.Key)) { $merged[$tblEntry.Key] = @{} }
            foreach ($colEntry in $tblEntry.Value.GetEnumerator()) {
                if (-not $merged[$tblEntry.Key].ContainsKey($colEntry.Key)) {
                    $merged[$tblEntry.Key][$colEntry.Key] = [System.Collections.Generic.HashSet[string]]::new()
                }
                foreach ($v in $colEntry.Value) { [void]$merged[$tblEntry.Key][$colEntry.Key].Add($v) }
            }
        }
    }
    return $merged
}

function Format-Crud($verbSet) {
    $l  = if ($verbSet.Contains('C')) { "C" } else { "-" }
    $l += if ($verbSet.Contains('R')) { "R" } else { "-" }
    $l += if ($verbSet.Contains('U')) { "U" } else { "-" }
    $l += if ($verbSet.Contains('D')) { "D" } else { "-" }
    if ($verbSet.Contains('S')) { $l += " +DDL" }
    return $l
}

function Get-CrudColor($verbSet) {
    if ($verbSet.Contains('D')) { return "Red" }
    if ($verbSet.Contains('C') -and $verbSet.Contains('U')) { return "Yellow" }
    if ($verbSet.Contains('C') -or $verbSet.Contains('U')) { return "DarkYellow" }
    return "White"
}

function Write-ColumnDetail($tblName, $colMap, $indent) {
    if (-not $colMap -or -not $colMap.ContainsKey($tblName)) { return }
    $cols = $colMap[$tblName]
    if ($cols.Count -eq 0) { return }

    $rCols = ($cols.GetEnumerator() | Where-Object { $_.Value.Contains('R') -and -not $_.Value.Contains('W') } | Sort-Object Key | ForEach-Object { $_.Key })
    $wCols = ($cols.GetEnumerator() | Where-Object { $_.Value.Contains('W') -and -not $_.Value.Contains('R') } | Sort-Object Key | ForEach-Object { $_.Key })
    $rwCols= ($cols.GetEnumerator() | Where-Object { $_.Value.Contains('R') -and $_.Value.Contains('W') }  | Sort-Object Key | ForEach-Object { $_.Key })

    if ($rCols)  { Write-Host "$indent          R  : $($rCols  -join ', ')" -ForegroundColor DarkBlue   }
    if ($wCols)  { Write-Host "$indent          W  : $($wCols  -join ', ')" -ForegroundColor DarkYellow }
    if ($rwCols) { Write-Host "$indent          RW : $($rwCols -join ', ')" -ForegroundColor DarkCyan   }
}

#  Step 1: scan JSX 
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
$phpData       = @{}
$phpAllCrud    = @{}
$phpAllColumns = @{}

$allEndpoints = $jsxToPhp.Values | ForEach-Object { $_ } | Sort-Object -Unique
foreach ($ep in $allEndpoints) {
    $visited = [System.Collections.Generic.HashSet[string]]::new()
    $phpData[$ep]       = Get-PhpData -FileName $ep -Visited ([ref]$visited)
    $phpAllCrud[$ep]    = Get-AllCrud    $phpData[$ep]
    $phpAllColumns[$ep] = Get-AllColumns $phpData[$ep]
}

#  Step 3: table filter 
if ($Table -ne "") {
    $keep = @{}
    foreach ($entry in $jsxToPhp.GetEnumerator()) {
        $matching = $entry.Value | Where-Object { $phpAllCrud[$_].ContainsKey($Table.ToLower()) }
        if ($matching.Count -gt 0) { $keep[$entry.Key] = $matching }
    }
    $jsxToPhp = $keep
}

if ($jsxToPhp.Count -eq 0) { Write-Host "No results found." -ForegroundColor Yellow; exit }

#  Helpers 
function Write-Divider { Write-Host ("-" * 70) -ForegroundColor DarkGray }

function Write-IncludeTree {
    param($Node, [string]$Name, [int]$Depth=0, $InheritedColumns=$null)
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
    } else { $Node.crud.GetEnumerator() }

    foreach ($entry in ($crudEntries | Sort-Object Key)) {
        $tag   = Format-Crud $entry.Value
        $color = Get-CrudColor $entry.Value
        Write-Host "$indent      [$tag] $($entry.Key)" -ForegroundColor $color
        if ($ShowColumns) {
            Write-ColumnDetail $entry.Key $Node.columns $indent
        }
    }

    foreach ($childEntry in ($Node.includes.GetEnumerator() | Sort-Object Key)) {
        Write-IncludeTree -Node $childEntry.Value -Name $childEntry.Key -Depth ($Depth+1)
    }
}

#  Header 
$totalPhp    = ($jsxToPhp.Values | ForEach-Object { $_ } | Sort-Object -Unique).Count
$totalTables = @($phpAllCrud.Values | ForEach-Object { $_.Keys } | Sort-Object -Unique).Count

Write-Host ""
Write-Host ("=" * 70) -ForegroundColor Cyan
Write-Host "  JSX -> PHP -> (includes) -> TABLES [CRUD] $(if($ShowColumns){'+ COLUMNS'})" -ForegroundColor Cyan
Write-Host "  C=Insert  R=Select  U=Update  D=Delete  S=DDL  |  R=col read  W=col write" -ForegroundColor DarkGray
Write-Host ("=" * 70) -ForegroundColor Cyan
Write-Host "  Src : $SrcDir" -ForegroundColor Gray
Write-Host "  Api : $ApiDir" -ForegroundColor Gray
Write-Host "  JSX : $($jsxToPhp.Count) file(s)  |  PHP : $totalPhp endpoint(s)  |  Tables : $totalTables" -ForegroundColor Gray
if ($Table)   { Write-Host "  Filter - table : $Table"   -ForegroundColor DarkYellow }
if ($JsxFile) { Write-Host "  Filter - jsx   : $JsxFile" -ForegroundColor DarkYellow }
if ($PhpFile) { Write-Host "  Filter - php   : $PhpFile" -ForegroundColor DarkYellow }
if ($ShowColumns) { Write-Host "  Column detail  : ON  (R=read  W=write  RW=both)" -ForegroundColor DarkGray }
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
    $tableMap = @{}
    foreach ($jsxEntry in $jsxToPhp.GetEnumerator()) {
        foreach ($ep in $jsxEntry.Value) {
            foreach ($tblEntry in $phpAllCrud[$ep].GetEnumerator()) {
                $tbl = $tblEntry.Key
                if (-not $tableMap.ContainsKey($tbl)) { $tableMap[$tbl] = @{} }
                if (-not $tableMap[$tbl].ContainsKey($ep)) {
                    $tableMap[$tbl][$ep] = @{
                        jsxFiles = [System.Collections.Generic.HashSet[string]]::new()
                        crud     = [System.Collections.Generic.HashSet[string]]::new()
                        columns  = if ($phpAllColumns[$ep].ContainsKey($tbl)) { $phpAllColumns[$ep][$tbl] } else { @{} }
                    }
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
            if ($ShowColumns -and $epEntry.Value.columns.Count -gt 0) {
                Write-ColumnDetail $tblEntry.Key @{$tblEntry.Key = $epEntry.Value.columns} "      "
            }
        }
        Write-Divider
    }
}