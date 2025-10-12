#!/bin/bash

# ===== CONFIG =====
AWS_USER=ubuntu
AWS_HOST=3.143.207.226
AWS_KEY=~/AWS/stockloyal.pem
DEPLOY_DIR=/var/www/html/stockloyal-pwa
ZIP_NAME=stockloyal-full-deploy.zip
DB_NAME=stockloyal
DB_USER=admin
DB_PASS="***REMOVED***"  # ⚠️ better: read from .env.production
LOCAL_SCHEMA_FILE=migrations/full_schema.sql

# ===== 1: Build frontend =====
echo "👉 Building React app..."
npm run build || { echo "❌ Build failed"; exit 1; }

# ===== 2: Package everything =====
echo "👉 Packaging dist + api + src + migrations..."
rm -f $ZIP_NAME
zip -r $ZIP_NAME dist api src migrations package.json vite.config.* .env.production || { echo "❌ Zip failed"; exit 1; }

# ===== 3: Upload =====
echo "👉 Uploading to server..."
scp -i $AWS_KEY $ZIP_NAME $AWS_USER@$AWS_HOST:/tmp/ || { echo "❌ Upload failed"; exit 1; }

# ===== 4: Deploy on server =====
ssh -i $AWS_KEY $AWS_USER@$AWS_HOST << EOF
  set -e
  echo "📦 Unzipping..."
  sudo mkdir -p $DEPLOY_DIR
  sudo unzip -o /tmp/$ZIP_NAME -d /tmp/stockloyal-build

  echo "🧹 Cleaning old deployment..."
  sudo rm -rf $DEPLOY_DIR/*

  echo "🚚 Moving new files..."
  sudo mv /tmp/stockloyal-build/* $DEPLOY_DIR/
  sudo rm -rf /tmp/stockloyal-build /tmp/$ZIP_NAME

  echo "🗄️ Resetting database schema..."
  mysql -u$DB_USER -p$DB_PASS $DB_NAME < $DEPLOY_DIR/migrations/full_schema.sql

  echo "🔄 Restarting Apache..."
  sudo systemctl restart apache2

  echo "✅ Full redeploy + DB reset complete!"
EOF

echo "🎉 Visit http://$AWS_HOST/stockloyal-pwa/"
