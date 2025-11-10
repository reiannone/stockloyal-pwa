# Save this as fix-bootstrap.ps1 in C:\xampp\htdocs\stockloyal-pwa\

$apiDir = "C:\xampp\htdocs\stockloyal-pwa\api"
$lineToRemove = "require_once '/home/bitnami/stockloyal_bootstrap.php';"

Get-ChildItem -Path $apiDir -Filter "*.php" -Recurse | ForEach-Object {
    $file = $_.FullName
    $content = Get-Content $file -Raw
    
    if ($content -match [regex]::Escape($lineToRemove)) {
        Write-Host "Fixing: $($_.Name)" -ForegroundColor Yellow
        
        # Remove the line
        $newContent = $content -replace [regex]::Escape($lineToRemove), ""
        
        # Save the file
        Set-Content -Path $file -Value $newContent -NoNewline
        
        Write-Host "  ✓ Fixed!" -ForegroundColor Green
    }
}

Write-Host "`nDone! All files processed." -ForegroundColor Cyan