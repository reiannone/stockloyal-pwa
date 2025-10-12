## =========================================
# StockLoyal Full Deployment Script
# (Frontend + PHP API backend)
# =========================================

$EC2_IP  = "3.150.49.91"   # <- Elastic IP
$PEM     = "C:\Users\reian\AWS\stockloyal.pem"
$REMOTE_FRONTEND = "/var/www/html/stockloyal-pwa/"
$REMOTE_API      = "/var/www/html/stockloyal-pwa/api/"

Write-Host "🚀 Building React/Vite frontend..." -ForegroundColor Cyan
npm run build

Write-Host "⬆️ Uploading frontend dist/ to EC2..." -ForegroundColor Cyan
scp -i $PEM -r dist\* $( "ec2-user@{0}:{1}" -f $EC2_IP, $REMOTE_FRONTEND )

Write-Host "⬆️ Uploading PHP API backend to EC2..." -ForegroundColor Cyan
scp -i $PEM -r api\* $( "ec2-user@{0}:{1}" -f $EC2_IP, $REMOTE_API )

Write-Host "🔄 Restarting Apache..." -ForegroundColor Cyan
ssh -i $PEM ec2-user@$EC2_IP "sudo systemctl restart httpd"

Write-Host "✅ Deployment complete! Visit http://app.stockloyal.com/" -ForegroundColor Green
