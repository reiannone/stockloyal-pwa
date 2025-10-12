Start XAMPP Control Panel

 	Start Apache

 	Start MySQL (MariaDB)



Launch CMD prompt as Admin

 	Starts in this Dir: PS C:\\Users\\reian>

 	cd\\

 	cd xampp/htdocs/stockloyal-pwa



ctl-C to kill active session

npx kill-port 5173 (5173 and/or 5174 if necessary)

npm run dev -- --host



Open new Incognito browser window



http://localhost:5173 (root dir is localhost:5173/stockloyal-pwa, progressive web app (PWA))



directory structure fr app:

 	C:\\xampp\\htdocs\\stockloyal-pwa ()

 		1. C:\\xampp\\htdocs\\stockloyal-pwa\\api (php modules for MySQL database access)

 		2. C:\\xampp\\htdocs\\stockloyal-pwa\\img

 		3. C:\\xampp\\htdocs\\stockloyal-pwa\\node\_modules (React and Vite)

 		4. C:\\xampp\\htdocs\\stockloyal-pwa\\public (icons and logos)

 		5. C:\\xampp\\htdocs\\stockloyal-pwa\\src (top level .jsx and .css files)

 			5a. C:\\xampp\\htdocs\\stockloyal-pwa\\src\\assets (react.svg)

 			5b. C:\\xampp\\htdocs\\stockloyal-pwa\\src\\pages (stockloyal-pwa web app modules)











Brand Gold Palette



Base (logo star) → #D5A928

RGB: (213, 169, 40)



Lighter (highlight / background fill) → #E6C95A

RGB: (230, 201, 90)



Lightest (soft hover / background tint) → #F2DEA0

RGB: (242, 222, 160)



Darker (hover / border) → #B4881F

RGB: (180, 136, 31)



Darkest (active / pressed state) → #8A6916

RGB: (138, 105, 22)



StockLoyal MySQL MariaDB:



Export from phpMyAdin (Export)

 	- goes to browser Downlods

 	- saved to stockloyal-pwa/src/sql/stockloyal\_schema.sql



GitHub: user id: reiannone



Repo token: ghp\_cASCfWug0SjZgjnsPlPmpe6uBr68hs0H0cfr



git remote -v



git remote set-url origin https://reiannone:ghp\_cASCfWug0SjZgjnsPlPmpe6uBr68hs0H0cfr@github.com/YOUR-USERNAME/stockloyal-pwa.git



git push -u origin main



GitHub workflow:

git add .

git commit -m "Describe your change"

git push



AWS:

Account NAme: StockLoyal

email Robert.iannone@icloud.com

PW Nickname !! Old

Account ID: 426789113634

ARN, arn:aws:account::426789113634:account

Conical User ID: 2d04417f345b27b1e60f2c5ab50c2b4e1fbb40883ece736182ecae389f9d29f0





Key Pair

* Name:stockloyal-key-pair
* Type: rsa
* Created: 2025/09/21 10:54 GMT-4
* Figure Print: bb:45:e7:99:aa:0c:31:47:81:1a:1d:8f:2a:52:67:25:60:d8:dd:3e
* ID: key-04d39ea3a9a81424e



EC2 Instance ID: i-0f89f9474167df3c8



ssh -i "C:\\Users\\reian\\AWS\\stockloyal.pem" ec2-user@3.15.233.106

ssh -i "C:\\Users\\reian\\AWS\\stockloyal.pem" ec2-user@3.143.207.226





Go to AWS Console → RDS → Databases → stockloyal-db



RDS Endpoint (stockloyal-db.ctms60ci403w.us-east-2.rds.amazonaws.com).



Port is 3306.



sudo tee /var/www/html/api/.env > /dev/null <<EOF

DB\_HOST=stockloyal-db.ctms60ci403w.us-east-2.rds.amazonaws.com

DB\_NAME=stockloyal

DB\_USER=admin

DB\_PASS=StockLoyal2025!





~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

NEW stockloyal-pwa

~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~



AWC Console

Account ID: 5015-5777-7393

AWS account name: stockloyal-aws

Root PW: Nickname @ old



Amazon Linux 2

t3.micro

RSA .pem

stockloyal-key-pair:

Instance ID: i-0aef4a0c0ca478ce1

Security Group rule:

 	HTTP (80) from Anywhere

 	HTTPS (443) from Anywhere

 	SSH (22) only from your IP



Hostname type

 	IP name: ip-172-31-46-243.us-east-2.compute.internal

Private IP DNS name (IPv4 only): ip-172-31-46-243.us-east-2.compute.internal

Public IPv4 address: 18.221.139.140

Auto-assigned IP address: 18.221.139.140 \[Public IP]

VPC ID: vpc-00acd622149e5bef3

Subnet ID: subnet-0e12106af3de02554

Instance ARN: arn:aws:ec2:us-east-2:501557777393:instance/i-0aef4a0c0ca478ce1

AMI ID: ami-0ca4d5db4872d0c28

AMI name: al2023-ami-2023.8.20250915.0-kernel-6.1-x86\_64



Elastic IP addresses:

 	Allocation IPv4 address: 3.150.49.91

 	Allocation ID: eipalloc-0c6b3abaa09f12938



Step 2: Install Stack on EC2

 	ssh -i "C:\\Users\\reian\\AWS\\stockloyal.pem" ec2-user@3.150.49.91



PS C:\\xampp\\htdocs\\stockloyal-pwa> ssh -i "C:\\Users\\reian\\AWS\\stockloyal.pem" ec2-user@3.150.49.91



sudo nano /etc/httpd/conf/httpd.conf



scp -i C:\\Users\\reian\\AWS\\stockloyal.pem -r dist/\* ec2-user@3.150.49.91:/var/www/html/stockloyal-pwa/





PowerShell to StockLoyal Deployment Script (PowerShell)



cd C:\\Users\\reian\\AWS

.\\deploy.ps1



stockloyal-db is still StockLoyal2025!

Restart AWS server in EC2: 	sudo systemctl stop httpd
Shutdown AWS server in EC2: 	sudo systemctl stop httpd
EC2 Shell:			ssh -i C:/Users/reian/AWS/stockloyal.pem ec2-user@3.150.49.91
	Amazon Linux 2023
	https://aws.amazon.com/linux/amazon-linux-2023


FULL Rebuild including frontend and backend
	scp -i "C:\Users\reian\AWS\stockloyal.pem" -r api ec2-user@3.150.49.91:/home/ec2-user/tmp-api
	ssh -i "C:\Users\reian\AWS\stockloyal.pem" ec2-user@3.150.49.91
	sudo mv /home/ec2-user/tmp-api /var/www/html/stockloyal-pwa/api
	sudo chown -R apache:apache /var/www/html/stockloyal-pwa/api
	sudo chmod -R 755 /var/www/html/stockloyal-pwa/api

