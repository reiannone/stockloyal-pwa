# deploy-backend.ps1
# Deploy all PHP API files to EC2
# Usage: powershell -ExecutionPolicy Bypass -File deploy-backend.ps1

$KEY  = "C:\Users\reian\.ssh\stockloyal-pwa-key-pair.pem"
$SRC  = "C:\xampp\htdocs\stockloyal-pwa\api"
$EC2  = "ec2-user@3.150.49.91"
$DEST = "/home/ec2-user/api_upload"
$API  = "/var/www/html/api"

# Get all PHP files in the api directory (exclude backups and utility scripts)
$files = Get-ChildItem -Path $SRC -Filter "*.php" -File | Where-Object {
    $_.DirectoryName -eq $SRC -and
    $_.Name -notmatch "^(scan_member_id|fix_member_id)\.php$"
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  StockLoyal Backend Deploy" -ForegroundColor Cyan
Write-Host "  Files: $($files.Count) PHP files" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Create staging directory on EC2
Write-Host "Creating staging directory on EC2..." -ForegroundColor Yellow
ssh -i $KEY $EC2 "mkdir -p $DEST"

# Step 2: Upload all files via scp
Write-Host "Uploading $($files.Count) files..." -ForegroundColor Yellow
$uploaded = 0
foreach ($f in $files) {
    scp -i $KEY $f.FullName "${EC2}:${DEST}/$($f.Name)"
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  OK  $($f.Name)" -ForegroundColor Green
        $uploaded++
    } else {
        Write-Host "  FAIL  $($f.Name)" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "Uploaded: $uploaded / $($files.Count)" -ForegroundColor Cyan

# Step 3: Move files into place, set ownership and permissions
Write-Host ""
Write-Host "Moving files to $API and setting permissions..." -ForegroundColor Yellow
ssh -i $KEY $EC2 @"
sudo mv ${DEST}/*.php ${API}/
sudo chown apache:apache ${API}/*.php
sudo chmod 644 ${API}/*.php
rm -rf ${DEST}
"@

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Deploy complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
