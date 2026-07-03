#!/bin/bash

# Traffic Control Deployment Script
# This script deploys the application to /var/www/html/trafficcontrol

set -e

DEST_DIR="/var/www/html/trafficcontrol"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Detect OS (Alpine/Debian) and load per-distro paths, users and helpers.
# shellcheck source=scripts/os-detect.sh
source "$SCRIPT_DIR/scripts/os-detect.sh"

# Use sudo only when not already root (Alpine minimal has no sudo).
if [ "$(id -u)" -eq 0 ]; then SUDO=""; else SUDO="sudo"; fi

echo "Starting deployment to $DEST_DIR (OS: $TC_OS, app user: $APP_USER, nginx: $NGINX_USER)..."

# 1. Install required packages
echo "Installing required packages..."
if [ "$TC_OS" = "alpine" ]; then
    $SUDO apk update
    # Pick the newest available PHP 8.x package series
    PHPV=""
    for v in 85 84 83 82 81; do
        if $SUDO apk add --no-cache --simulate "php$v" >/dev/null 2>&1; then PHPV="$v"; break; fi
    done
    [ -n "$PHPV" ] || PHPV=83
    echo "Using PHP package series: php${PHPV}"
    # nginx, PHP + required extensions, audio tools, and the GNU toolchain
    # (coreutils, grep w/ PCRE, procps, bash, util-linux) so exec() commands
    # behave like GNU rather than BusyBox. dcron provides crond + /etc/crontabs.
    $SUDO apk add --no-cache \
        nginx rsync \
        "php${PHPV}" "php${PHPV}-fpm" "php${PHPV}-cli" \
        "php${PHPV}-mbstring" "php${PHPV}-session" \
        "php${PHPV}-ctype" "php${PHPV}-fileinfo" "php${PHPV}-calendar" \
        "php${PHPV}-phar" "php${PHPV}-openssl" \
        mplayer alsa-utils pulseaudio-utils bc \
        coreutils grep procps bash util-linux tzdata dcron
    $SUDO ln -sf "/usr/bin/php${PHPV}" /usr/bin/php
else
    $SUDO apt update
    $SUDO apt install -y nginx php-fpm php-cli php-mbstring php-calendar \
        mplayer alsa-utils bc rsync cron
fi

# Re-source now that PHP is installed so version-derived paths are populated.
# shellcheck source=scripts/os-detect.sh
source "$SCRIPT_DIR/scripts/os-detect.sh"
echo "Detected PHP version: $TC_PHP_DOT"

# 2. Create destination directory if it doesn't exist
if [ ! -d "$DEST_DIR" ]; then
    echo "Creating destination directory..."
    $SUDO mkdir -p "$DEST_DIR"
fi

# 3. Sync files (excluding git, system files, and local persistent data)
echo "Syncing files..."
$SUDO rsync -av --delete \
    --exclude '.git/' \
    --exclude '.tcsys/' \
    --exclude 'README.md' \
    --exclude 'deploy.sh' \
    ./ "$DEST_DIR/"

# 4. Ensure system and Music directories exist
$SUDO mkdir -p "$DEST_DIR/.tcsys" "$DEST_DIR/Music"

# 5. Create the dedicated app user (Alpine) and grant it ALSA access.
# php-fpm/cron run as this low-priv user; it is the only account in "audio".
if [ "$TC_OS" = "alpine" ]; then
    getent group "$APP_GROUP" >/dev/null 2>&1 || $SUDO addgroup -S "$APP_GROUP"
    id "$APP_USER" >/dev/null 2>&1 || \
        $SUDO adduser -S -D -H -s /sbin/nologin -G "$APP_GROUP" "$APP_USER"
fi
if getent group audio >/dev/null 2>&1; then
    if ! id -nG "$APP_USER" 2>/dev/null | tr ' ' '\n' | grep -qx audio; then
        echo "Adding $APP_USER to audio group..."
        if [ "$TC_OS" = "alpine" ]; then
            $SUDO addgroup "$APP_USER" audio
        else
            $SUDO usermod -aG audio "$APP_USER"
        fi
    else
        echo "$APP_USER is already in audio group"
    fi
fi

# 6. Set ownership and permissions.
# Files are owned by APP_USER (php-fpm) and world-readable so the nginx worker
# (a different user on Alpine) can still serve static assets and media.
echo "Setting permissions..."
$SUDO chown -R "$APP_USER:$APP_GROUP" "$DEST_DIR"
$SUDO chmod -R 755 "$DEST_DIR"
$SUDO chmod -R 775 "$DEST_DIR/.tcsys" "$DEST_DIR/Music"

# 7. Verify required dependencies
echo "Verifying dependencies..."
for cmd in mplayer amixer bc php bash grep ps date; do
    if ! command -v "$cmd" >/dev/null 2>&1; then
        echo "Error: $cmd is not installed. Installation may have failed."
        exit 1
    fi
done
echo "All dependencies verified."

# 8. Install nginx configuration (patch the fastcgi_pass target)
echo "Installing nginx configuration..."
TMP_CONF="$(mktemp)"
sed "s|PHP_FPM_PASS|${TC_FASTCGI_PASS}|g" "$SCRIPT_DIR/trafficcontrol.nginx.conf" > "$TMP_CONF"
if [ "$TC_OS" = "alpine" ]; then
    $SUDO mkdir -p /etc/nginx/http.d
    $SUDO cp "$TMP_CONF" /etc/nginx/http.d/trafficcontrol.conf
    $SUDO chmod 644 /etc/nginx/http.d/trafficcontrol.conf
    # Remove Alpine's default site (the port-80 default_server) so requests by
    # localhost/IP reach trafficcontrol instead of returning 404.
    $SUDO rm -f /etc/nginx/http.d/default.conf
    # Run the php-fpm pool as APP_USER; keep the distro default TCP listener.
    # Patterns match active (uncommented) lines only, so they work with BusyBox sed.
    if [ -f "$PHP_FPM_POOL" ]; then
        $SUDO sed -i \
            -e "s|^user = .*|user = ${APP_USER}|" \
            -e "s|^group = .*|group = ${APP_GROUP}|" \
            "$PHP_FPM_POOL"
    fi
else
    $SUDO cp "$TMP_CONF" /etc/nginx/sites-available/trafficcontrol
    [ -L /etc/nginx/sites-enabled/trafficcontrol ] || \
        $SUDO ln -s /etc/nginx/sites-available/trafficcontrol /etc/nginx/sites-enabled/
    # Disable the default nginx site so trafficcontrol becomes the default server
    if [ -L /etc/nginx/sites-enabled/default ]; then
        echo "Disabling default nginx site..."
        $SUDO rm /etc/nginx/sites-enabled/default
    fi
fi
rm -f "$TMP_CONF"

echo "Testing nginx configuration..."
$SUDO nginx -t

# 9. Set up the scheduler cron job
echo "Setting up cron job..."
if [ "$TC_OS" = "alpine" ]; then
    # BusyBox/dcron reads per-user crontabs from /etc/crontabs/<user> (no user field)
    $SUDO mkdir -p /etc/crontabs
    printf '* * * * * /usr/bin/php %s/php/cron.php >> %s/.tcsys/cron.log 2>&1\n' \
        "$DEST_DIR" "$DEST_DIR" | $SUDO tee "/etc/crontabs/${APP_USER}" > /dev/null
    $SUDO chmod 600 "/etc/crontabs/${APP_USER}"
    echo "Created crontab at /etc/crontabs/${APP_USER}"
else
    CRON_FILE="/etc/cron.d/trafficcontrol"
    $SUDO tee "$CRON_FILE" > /dev/null << EOF
# Traffic Control scheduler - runs as $APP_USER
# Uses ALSA directly for audio output (works on headless servers)
SHELL=/bin/bash
* * * * * $APP_USER /usr/bin/php $DEST_DIR/php/cron.php >> $DEST_DIR/.tcsys/cron.log 2>&1
EOF
    $SUDO chmod 644 "$CRON_FILE"
    echo "Created system cron at $CRON_FILE"
fi

# 10. Add trafficcontrol.local to hosts file
if ! grep -q "trafficcontrol.local" /etc/hosts; then
    echo "Adding trafficcontrol.local to /etc/hosts..."
    echo "127.0.0.1 trafficcontrol.local" | $SUDO tee -a /etc/hosts > /dev/null
fi

# 11. Enable and (re)start services to apply changes
echo "Restarting services..."
if [ "$TC_OS" = "alpine" ]; then
    $SUDO rc-update add "php-fpm${TC_PHP_NODOT}" default 2>/dev/null || \
        $SUDO rc-update add php-fpm default 2>/dev/null || true
    $SUDO rc-update add nginx default 2>/dev/null || true
    $SUDO rc-update add crond default 2>/dev/null || true
    $SUDO rc-service "php-fpm${TC_PHP_NODOT}" restart 2>/dev/null || \
        $SUDO rc-service php-fpm restart 2>/dev/null || true
    $SUDO rc-service nginx restart
    $SUDO rc-service crond restart 2>/dev/null || $SUDO rc-service dcron restart 2>/dev/null || true
else
    $SUDO systemctl reload nginx
    $SUDO systemctl restart "php${TC_PHP_DOT}-fpm"
fi

echo ""
echo "Deployment complete."
echo ""
# Determine the primary LAN IP in a way that works on both BusyBox (Alpine)
# and GNU/iproute2 (Debian); hostname -I is not available on BusyBox.
LAN_IP="$(ip route get 1.1.1.1 2>/dev/null | awk '{print $7; exit}')"
[ -n "$LAN_IP" ] || LAN_IP="$(ip -4 -o addr show scope global 2>/dev/null | awk '{print $4}' | cut -d/ -f1 | head -1)"
echo "The application is available at: http://trafficcontrol.local/"
echo "To access from other devices, add '${LAN_IP} trafficcontrol.local' to their /etc/hosts"
echo ""
echo "Audio output uses ALSA directly (works on headless servers)."
echo "If this is the first deployment, restart php-fpm (done above) for the $APP_USER audio group to take effect."
