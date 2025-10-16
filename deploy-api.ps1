# deploy-api.ps1
$ErrorActionPreference = "Stop"

# 1) Config
$Pem = "C:\Users\reian\AWS\stockloyal.pem"
$Remote = "ec2-user@3.150.49.91"

# 2) Prep remote tmp dir (clean slate)
ssh -i $Pem $Remote "rm -rf ~/deploy_api_tmp && mkdir -p ~/deploy_api_tmp"

# 3) Upload the entire local ./api folder to remote tmp (WRAP user@host:dest!)
scp -i $Pem -r .\api "${Remote}:~/deploy_api_tmp/"

# 4) Atomically sync into live /var/www/html/api and set perms
ssh -i $Pem $Remote @'
set -e
if command -v rsync >/dev/null 2>&1; then
  sudo rsync -a --delete ~/deploy_api_tmp/api/ /var/www/html/api/
else
  sudo mkdir -p /var/www/html/api
  sudo cp -a ~/deploy_api_tmp/api/. /var/www/html/api/
fi
sudo chown -R ec2-user:apache /var/www/html/api
sudo find /var/www/html/api -type d -exec chmod 775 {} \;
sudo find /var/www/html/api -type f -exec chmod 664 {} \;
'@

# 5) Quick smoke test
ssh -i $Pem $Remote "ls -l /var/www/html/api/get-faqs.php && curl -i http://localhost/api/get-faqs.php"
