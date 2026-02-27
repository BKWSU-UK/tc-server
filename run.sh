#!/usr/bin/with-contenv bashio

APP_DIR=/var/www/html/trafficcontrol

# --- Persistent data (.tcsys -> /data) ---
if [ -d "$APP_DIR/.tcsys" ] && [ ! -L "$APP_DIR/.tcsys" ]; then
    rm -rf "$APP_DIR/.tcsys"
fi
ln -sf /data "$APP_DIR/.tcsys"
chmod 775 /data

# --- Media (Music -> /media/trafficcontrol) ---
mkdir -p /media/trafficcontrol
chmod 775 /media/trafficcontrol

# Copy chime files on first run
if [ ! -f /media/trafficcontrol/.system/Chime_start.flac ]; then
    mkdir -p /media/trafficcontrol/.system
    cp /app-defaults/.system/* /media/trafficcontrol/.system/
fi

# Replace Music dir with symlink to media
if [ -d "$APP_DIR/Music" ] && [ ! -L "$APP_DIR/Music" ]; then
    rm -rf "$APP_DIR/Music"
fi
ln -sf /media/trafficcontrol "$APP_DIR/Music"

# --- PHP-FPM ---
PHP_VERSION=$(php -r 'echo PHP_MAJOR_VERSION.".".PHP_MINOR_VERSION;')
PHP_FPM_SOCK="/run/php/php${PHP_VERSION}-fpm.sock"
PHP_FPM_BIN="/usr/sbin/php-fpm${PHP_VERSION}"

mkdir -p /run/php

# Patch nginx config with the actual socket path
sed -i "s|PHP_FPM_SOCK|${PHP_FPM_SOCK}|g" /etc/nginx/sites-available/trafficcontrol

# --- Permissions ---
chown -R www-data:www-data "$APP_DIR"
chown -R www-data:www-data /data
chown -R www-data:www-data /media/trafficcontrol

# Add www-data to the audio group for ALSA access
usermod -aG audio www-data 2>/dev/null || true

# --- Cron ---
echo "* * * * * www-data /usr/bin/php ${APP_DIR}/php/cron.php >> /data/cron.log 2>&1" \
    > /etc/cron.d/trafficcontrol
chmod 644 /etc/cron.d/trafficcontrol

# --- Start services ---
"$PHP_FPM_BIN" --nodaemonize &
cron
exec nginx -g "daemon off;"
