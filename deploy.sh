#!/bin/bash

# Traffic Control Deployment Script
# This script deploys the application to /var/www/html/trafficcontrol

set -e

DEST_DIR="/var/www/html/trafficcontrol"
WEB_USER="www-data"
WEB_GROUP="www-data"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Starting deployment to $DEST_DIR..."

# 1. Install required packages
echo "Installing required packages..."
sudo apt update
sudo apt install -y nginx php-fpm php-cli mplayer alsa-utils bc

# Determine installed PHP version
PHP_VERSION=$(php -r 'echo PHP_MAJOR_VERSION.".".PHP_MINOR_VERSION;')
echo "Detected PHP version: $PHP_VERSION"

# 2. Create destination directory if it doesn't exist
if [ ! -d "$DEST_DIR" ]; then
    echo "Creating destination directory..."
    sudo mkdir -p "$DEST_DIR"
fi

# 3. Sync files (excluding git, system files, and local persistent data)
echo "Syncing files..."
sudo rsync -av --delete \
    --exclude '.git/' \
    --exclude '.tcsys/' \
    --exclude 'README.md' \
    --exclude 'deploy.sh' \
    ./ "$DEST_DIR/"

# 4. Ensure system directory exists
if [ ! -d "$DEST_DIR/.tcsys" ]; then
    echo "Creating .tcsys directory..."
    sudo mkdir -p "$DEST_DIR/.tcsys"
fi

# 5. Ensure Music directory exists
if [ ! -d "$DEST_DIR/Music" ]; then
    echo "Creating Music directory..."
    sudo mkdir -p "$DEST_DIR/Music"
fi

# 6. Set ownership and permissions
echo "Setting permissions..."
sudo chown -R $WEB_USER:$WEB_GROUP "$DEST_DIR"
sudo chmod -R 755 "$DEST_DIR"
sudo chmod -R 775 "$DEST_DIR/.tcsys"
sudo chmod -R 775 "$DEST_DIR/Music"

# 7. Ensure www-data is in audio group for ALSA access
if getent group audio >/dev/null 2>&1; then
    if ! id -nG "$WEB_USER" 2>/dev/null | tr ' ' '\n' | grep -qx audio; then
        echo "Adding $WEB_USER to audio group..."
        sudo usermod -aG audio "$WEB_USER"
    else
        echo "$WEB_USER is already in audio group"
    fi
fi

# 8. Verify required dependencies
echo "Verifying dependencies..."
for cmd in mplayer amixer bc php; do
    if ! command -v $cmd &> /dev/null; then
        echo "Error: $cmd is not installed. Installation may have failed."
        exit 1
    fi
done
echo "All dependencies verified."

# 9. Install nginx configuration
echo "Installing nginx configuration..."
sudo sed "s/php8.4-fpm.sock/php${PHP_VERSION}-fpm.sock/" "$SCRIPT_DIR/trafficcontrol.nginx.conf" \
    | sudo tee /etc/nginx/sites-available/trafficcontrol > /dev/null

if [ ! -L /etc/nginx/sites-enabled/trafficcontrol ]; then
    sudo ln -s /etc/nginx/sites-available/trafficcontrol /etc/nginx/sites-enabled/
fi

echo "Testing nginx configuration..."
sudo nginx -t

# 10. Set up system cron job for www-data
echo "Setting up cron job..."
CRON_FILE="/etc/cron.d/trafficcontrol"

sudo tee "$CRON_FILE" > /dev/null << EOF
# Traffic Control scheduler - runs as www-data
# Uses ALSA directly for audio output (works on headless servers)
SHELL=/bin/bash
* * * * * $WEB_USER /usr/bin/php $DEST_DIR/php/cron.php >> $DEST_DIR/.tcsys/cron.log 2>&1
EOF

sudo chmod 644 "$CRON_FILE"
echo "Created system cron at $CRON_FILE"

# 11. Add trafficcontrol.local to hosts file
if ! grep -q "trafficcontrol.local" /etc/hosts; then
    echo "Adding trafficcontrol.local to /etc/hosts..."
    echo "127.0.0.1 trafficcontrol.local" | sudo tee -a /etc/hosts > /dev/null
fi

# 12. Restart services to apply changes
echo "Restarting services..."
sudo systemctl reload nginx
sudo systemctl restart "php${PHP_VERSION}-fpm"

echo ""
echo "Deployment complete."
echo ""
echo "The application is available at: http://trafficcontrol.local/"
echo "To access from other devices, add '$(hostname -I | awk '{print $1}') trafficcontrol.local' to their /etc/hosts"
echo ""
echo "Audio output uses ALSA directly (works on headless servers)."
echo "If this is the first deployment, reboot for www-data audio group to take effect."
