param(
  [Parameter(Mandatory=$true)] [string] $Pem,
  [Parameter(Mandatory=$true)] [string] $Box,          # ec2-user@3.150.49.91
  [Parameter(Mandatory=$true)] [string] $ProjectRoot,  # C:\xampp\htdocs\stockloyal-pwa
  [Parameter(Mandatory=$true)] [string] $WebRoot       # /var/www/html/stockloyal-pwa
)

$ErrorActionPreference = "Stop"

Write-Host "🚀 Building React/Vite frontend..."
Push-Location $ProjectRoot
npm ci --silent | Out-Null
npm run build
Pop-Location

if (!(Test-Path (Join-Path $ProjectRoot "dist"))) { throw "dist/ not found" }

$stamp   = (Get-Date).ToString("yyyyMMdd-HHmmss")
$pkgName = "dist-$stamp.tgz"
$pkgPath = Join-Path $ProjectRoot $pkgName
if (Test-Path $pkgPath) { Remove-Item $pkgPath -Force }
tar -czf $pkgPath -C (Join-Path $ProjectRoot "dist") .

Write-Host "⬆️ Uploading tarball to server staging..."
ssh -i $Pem $Box "mkdir -p ~/deploy_frontend_tmp/$stamp"
scp -i $Pem $pkgPath "$Box:`~/deploy_frontend_tmp/$stamp/`"

Write-Host "🔁 Activating release on server..."
$remote = @"
set -e
TMP="\$HOME/deploy_frontend_tmp/$stamp"
PKG="$pkgName"
ROOT="$WebRoot"
STAGE="/var/www/html/.stage-$stamp"

sudo mkdir -p "\$ROOT" "\$STAGE"
sudo tar -xzf "\$TMP/\$PKG" -C "\$STAGE"

# Make index.html revalidate to defeat PWA/app-shell cache during dev
if [ -f "\$STAGE/index.html" ]; then
  cat > /tmp/.htaccess <<EOF
<IfModule mod_headers.c>
  Header set Cache-Control "no-store, must-revalidate"
</IfModule>
EOF
  sudo mv /tmp/.htaccess "\$STAGE/.htaccess"
fi

# Backup current
if [ -d "\$ROOT" ] && [ "\$(ls -A "\$ROOT" 2>/dev/null)" ]; then
  sudo mkdir -p /var/www/backups
  sudo rsync -a --delete "\$ROOT/" "/var/www/backups/stockloyal-pwa-\$(
    date +%Y%m%d-%H%M%S)/"
fi

# Swap atomically via rsync
sudo rsync -a --delete "\$STAGE/" "\$ROOT/"

# Ownership & perms (ec2-user:apache)
sudo chown -R ec2-user:apache "\$ROOT"
sudo find "\$ROOT" -type d -exec chmod 775 {} \;
sudo find "\$ROOT" -type f -exec chmod 664 {} \;

# Clean stage
sudo rm -rf "\$STAGE"
"@

ssh -i $Pem $Box "$remote"

Write-Host "🔄 Graceful Apache reload..."
ssh -i $Pem $Box "sudo apachectl -k graceful || true"

Write-Host "✅ Done. Hard-reload the browser (Ctrl+F5). If you use a service worker, you may need one extra refresh."
