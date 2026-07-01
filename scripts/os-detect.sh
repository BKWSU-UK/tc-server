#!/usr/bin/env bash
# Shared OS detection and helpers for Traffic Control build/deploy scripts.
#
# Sourced by run.sh (Docker/HA entrypoint) and deploy.sh (bare-metal installer)
# so that both support Debian/Ubuntu and Alpine Linux transparently.
#
# Design notes (see the working reference Alpine box):
#   * Alpine php-fpm keeps the distro default TCP listener 127.0.0.1:9000
#     (simpler and avoids unix-socket permission juggling). Debian uses the
#     distro default unix socket.
#   * The app needs ALSA access, which comes from "audio" group membership
#     (/dev/snd is root:audio 0660). We run php-fpm as a DEDICATED, low-priv
#     user (trafficcontrol) that is the only account added to "audio" — rather
#     than the shared "nobody" account. Debian keeps its www-data convention.
#
# After sourcing, the following variables are available:
#   TC_OS          - "alpine" | "debian"
#   PKG_MGR        - "apk" | "apt"
#   APP_USER       - php-fpm / cron / file-owner user (trafficcontrol | www-data)
#   APP_GROUP      - primary group for APP_USER
#   NGINX_USER     - user the nginx worker runs as (nginx | www-data)
#   TC_PHP_DOT     - PHP version with dot    (e.g. 8.5)
#   TC_PHP_NODOT   - PHP version without dot (e.g. 85)
#   PHP_FPM_BIN    - path to the php-fpm binary
#   PHP_FPM_POOL   - path to the php-fpm pool config (www.conf)
#   PHP_FPM_SOCK   - unix socket path (Debian only; empty on Alpine)
#   TC_FASTCGI_PASS- value for nginx fastcgi_pass (TCP addr or unix:socket)
#   NGINX_SITE_DIR - directory nginx loads server configs from
#
# And the following helper functions:
#   tc_add_audio_group <user>  - add <user> to the "audio" group (addgroup/usermod)
#   tc_create_app_user         - ensure APP_USER exists and is in "audio"

# --- Distro / package manager detection ---
if command -v apk >/dev/null 2>&1; then
  TC_OS="alpine"
  PKG_MGR="apk"
elif command -v apt-get >/dev/null 2>&1; then
  TC_OS="debian"
  PKG_MGR="apt"
else
  echo "os-detect: unsupported OS (neither apk nor apt-get found)" >&2
  return 1 2>/dev/null || exit 1
fi

# --- PHP version tokens (only meaningful once PHP is installed) ---
TC_PHP_DOT="$(php -r 'echo PHP_MAJOR_VERSION.".".PHP_MINOR_VERSION;' 2>/dev/null || true)"
TC_PHP_NODOT="${TC_PHP_DOT//./}"

# --- Per-distro paths and users ---
if [ "$TC_OS" = "alpine" ]; then
  APP_USER="trafficcontrol"
  APP_GROUP="trafficcontrol"
  NGINX_USER="nginx"
  PHP_FPM_BIN="/usr/sbin/php-fpm${TC_PHP_NODOT}"
  PHP_FPM_POOL="/etc/php${TC_PHP_NODOT}/php-fpm.d/www.conf"
  PHP_FPM_SOCK=""
  TC_FASTCGI_PASS="127.0.0.1:9000"
  NGINX_SITE_DIR="/etc/nginx/http.d"
else
  APP_USER="www-data"
  APP_GROUP="www-data"
  NGINX_USER="www-data"
  PHP_FPM_BIN="/usr/sbin/php-fpm${TC_PHP_DOT}"
  PHP_FPM_POOL="/etc/php/${TC_PHP_DOT}/fpm/pool.d/www.conf"
  PHP_FPM_SOCK="/run/php/php${TC_PHP_DOT}-fpm.sock"
  TC_FASTCGI_PASS="unix:${PHP_FPM_SOCK}"
  NGINX_SITE_DIR="/etc/nginx/sites-available"
fi

# Add an existing user to the "audio" group (ALSA access).
# Alpine's BusyBox uses addgroup; Debian uses usermod.
tc_add_audio_group() {
  local user="$1"
  if [ "$TC_OS" = "alpine" ]; then
    addgroup "$user" audio 2>/dev/null || true
  else
    usermod -aG audio "$user" 2>/dev/null || true
  fi
}

# Ensure APP_USER exists (create a dedicated nologin system user on Alpine) and
# is a member of the "audio" group. Idempotent.
tc_create_app_user() {
  if [ "$TC_OS" = "alpine" ]; then
    getent group "$APP_GROUP" >/dev/null 2>&1 || addgroup -S "$APP_GROUP"
    id "$APP_USER" >/dev/null 2>&1 || \
      adduser -S -D -H -s /sbin/nologin -G "$APP_GROUP" "$APP_USER"
  fi
  tc_add_audio_group "$APP_USER"
}
