#!/usr/bin/with-contenv bashio
set -euo pipefail

APP_DIR=/var/www/html/trafficcontrol

# Detect OS (Alpine/Debian) and load per-distro paths, users and helpers
# shellcheck source=scripts/os-detect.sh
source "${APP_DIR}/scripts/os-detect.sh"

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

# Copy default playlist on first run
if [ ! -f /data/playListDb.JSON ]; then
    cp /app-defaults/playListDbDefault.JSON /data/playListDb.JSON
fi

# Replace Music dir with symlink to media
if [ -d "$APP_DIR/Music" ] && [ ! -L "$APP_DIR/Music" ]; then
    rm -rf "$APP_DIR/Music"
fi
ln -sf /media/trafficcontrol "$APP_DIR/Music"

# --- Dedicated app user (ALSA access via the audio group) ---
# On Alpine we run php-fpm as a low-priv "trafficcontrol" user rather than the
# shared "nobody"; on Debian this is a no-op (APP_USER is www-data).
tc_create_app_user

# --- PHP-FPM ---
mkdir -p /run/php

# Run the pool as APP_USER. On Alpine keep the distro default TCP listener
# (127.0.0.1:9000); on Debian the default unix socket is used unchanged.
# NOTE: patterns match the active (uncommented) lines only, so they work with
# BusyBox sed (no GNU \s / \? extensions).
if [ "$TC_OS" = "alpine" ] && [ -f "$PHP_FPM_POOL" ]; then
    sed -i \
        -e "s|^user = .*|user = ${APP_USER}|" \
        -e "s|^group = .*|group = ${APP_GROUP}|" \
        "$PHP_FPM_POOL"
fi

# Install nginx site config into the distro's config dir and patch fastcgi_pass
mkdir -p "$NGINX_SITE_DIR"
if [ "$TC_OS" = "alpine" ]; then
    NGINX_SITE="${NGINX_SITE_DIR}/trafficcontrol.conf"
else
    NGINX_SITE="${NGINX_SITE_DIR}/trafficcontrol"
    ln -sf "$NGINX_SITE" /etc/nginx/sites-enabled/trafficcontrol
fi
cp /app-defaults/trafficcontrol.conf "$NGINX_SITE"
sed -i "s|PHP_FPM_PASS|${TC_FASTCGI_PASS}|g" "$NGINX_SITE"

# --- Permissions ---
# Files are owned by APP_USER (php-fpm) and world-readable so the nginx worker
# (a different user on Alpine) can still serve static assets and media.
chown -R "${APP_USER}:${APP_GROUP}" "$APP_DIR"
chown -R "${APP_USER}:${APP_GROUP}" /data
chown -R "${APP_USER}:${APP_GROUP}" /media/trafficcontrol

# --- Cron (runs as APP_USER, matching php-fpm so file ownership is consistent) ---
if [ "$TC_OS" = "alpine" ]; then
    # BusyBox crond reads per-user crontabs from /etc/crontabs/<user> (no user field)
    mkdir -p /etc/crontabs
    echo "* * * * * /usr/bin/php ${APP_DIR}/php/cron.php >> /data/cron.log 2>&1" \
        > "/etc/crontabs/${APP_USER}"
    chmod 600 "/etc/crontabs/${APP_USER}"
else
    echo "* * * * * ${APP_USER} /usr/bin/php ${APP_DIR}/php/cron.php >> /data/cron.log 2>&1" \
        > /etc/cron.d/trafficcontrol
    chmod 644 /etc/cron.d/trafficcontrol
fi

# --- Start services ---
"$PHP_FPM_BIN" --nodaemonize &

# Wait for PHP-FPM to be ready before starting nginx (up to 10s)
for i in $(seq 1 40); do
  if [ -n "$PHP_FPM_SOCK" ]; then
    [ -S "$PHP_FPM_SOCK" ] && break
  else
    (exec 3<>/dev/tcp/127.0.0.1/9000) 2>/dev/null && break
  fi
  sleep 0.25
done

if [ "$TC_OS" = "alpine" ]; then
    crond -b -L /dev/stdout
else
    cron
fi
exec nginx -g "daemon off;"
