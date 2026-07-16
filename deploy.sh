#!/bin/bash

# Traffic Control Deployment Script
# This script deploys the application to /var/www/html/trafficcontrol

set -e

# Ensure git checks out world-readable files (644) and traversable dirs (755)
# regardless of the invoking shell's umask; nginx must be able to read them.
umask 022

DEST_DIR="/var/www/html/trafficcontrol"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Git source for the deployed app. The repo is public, so no auth is needed.
# Override via environment if deploying a fork/branch:
#   TC_REPO_URL=... TC_BRANCH=... sudo -E bash deploy.sh
REPO_URL="${TC_REPO_URL:-https://github.com/BKWSU-UK/tc-server.git}"
BRANCH="${TC_BRANCH:-main}"

# Persistent storage for diskless mode (Alpine on Raspberry Pi)
# Override via environment: TC_DATA_DIR=/mnt/data sudo -E bash deploy.sh
DATA_DIR="${TC_DATA_DIR:-}"

# Detect OS (Alpine/Debian) and load per-distro paths, users and helpers.
# shellcheck source=scripts/os-detect.sh
source "$SCRIPT_DIR/scripts/os-detect.sh"

# Use sudo only when not already root (Alpine minimal has no sudo).
if [ "$(id -u)" -eq 0 ]; then SUDO=""; else SUDO="sudo"; fi

# Detect diskless mode (Alpine on Raspberry Pi typically uses overlayfs or tmpfs for root)
DISKLESS_MODE=false
if [ "$TC_OS" = "alpine" ]; then
    if mount | grep -q "on / type overlayfs" || mount | grep -q "on / type tmpfs"; then
        DISKLESS_MODE=true
        echo "Detected diskless mode (overlayfs/tmpfs root filesystem)"
    fi
fi

# If DATA_DIR is explicitly set, use it regardless of diskless detection
if [ -n "$DATA_DIR" ]; then
    echo "Using persistent data directory: $DATA_DIR"
    DISKLESS_MODE=true
fi

echo "Starting deployment to $DEST_DIR (OS: $TC_OS, app user: $APP_USER, nginx: $NGINX_USER, diskless: $DISKLESS_MODE)..."

# 1. Install required packages
echo "Installing required packages..."
if [ "$TC_OS" = "alpine" ]; then
    # Enable community repository for PHP and other packages
    if ! grep -q "^http.*community" /etc/apk/repositories; then
        echo "Enabling Alpine community repository..."
        ALPINE_VER=$(cat /etc/alpine-release | cut -d. -f1,2)
        $SUDO sh -c "echo 'http://dl-cdn.alpinelinux.org/alpine/v${ALPINE_VER}/community' >> /etc/apk/repositories"
    fi
    $SUDO apk update
    # Pick the newest available PHP 8.x package series
    PHPV=""
    for v in 85 84 83 82 81; do
        if $SUDO apk search --no-cache "php${v}" 2>/dev/null | grep -q "^php${v}-"; then
            PHPV="$v"
            echo "Found PHP package series: php${PHPV}"
            break
        fi
    done
    [ -n "$PHPV" ] || { echo "Error: No PHP 8.x package found in repositories"; exit 1; }
    echo "Using PHP package series: php${PHPV}"
    # nginx, PHP + required extensions, audio tools, and the GNU toolchain
    # (coreutils, grep w/ PCRE, procps, bash, util-linux) so exec() commands
    # behave like GNU rather than BusyBox. Note: pulseaudio-utils may
    # not be available on all Alpine versions; use dcron and alsa-utils.
    # Try with optional packages first, then without if they fail.
    $SUDO apk add --no-cache \
        nginx git \
        "php${PHPV}" "php${PHPV}-fpm" "php${PHPV}-cli" \
        "php${PHPV}-mbstring" "php${PHPV}-session" \
        "php${PHPV}-ctype" "php${PHPV}-fileinfo" \
        "php${PHPV}-phar" "php${PHPV}-openssl" \
        mplayer alsa-utils bc \
        coreutils grep procps bash util-linux tzdata dcron pulseaudio-utils 2>/dev/null || \
    $SUDO apk add --no-cache \
        nginx git \
        "php${PHPV}" "php${PHPV}-fpm" "php${PHPV}-cli" \
        "php${PHPV}-mbstring" "php${PHPV}-session" \
        "php${PHPV}-ctype" "php${PHPV}-fileinfo" \
        "php${PHPV}-phar" "php${PHPV}-openssl" \
        mplayer alsa-utils bc \
        coreutils grep procps bash util-linux tzdata dcron
    $SUDO ln -sf "/usr/bin/php${PHPV}" /usr/bin/php
else
    $SUDO apt update
    $SUDO apt install -y nginx php-fpm php-cli php-mbstring php-calendar \
        mplayer alsa-utils bc git cron
fi

# Re-source now that PHP is installed so version-derived paths are populated.
# shellcheck source=scripts/os-detect.sh
source "$SCRIPT_DIR/scripts/os-detect.sh"
echo "Detected PHP version: $TC_PHP_DOT"

# 2. Deploy/update the application from git.
#    $DEST_DIR itself becomes a git working tree, so updating the app is simply
#    a matter of re-running this script (it fetches the latest) or running
#    `git pull` inside $DEST_DIR. A shallow checkout keeps the (large) tracked
#    Music samples from pulling full history.
#    For diskless mode, clone to persistent storage first to avoid filling RAM.
if [ "$DISKLESS_MODE" = true ] && [ -n "$DATA_DIR" ]; then
    # In diskless mode, clone to persistent storage to avoid filling RAM
    REAL_DEST_DIR="$DATA_DIR/trafficcontrol"
    echo "Diskless mode: cloning to persistent storage at $REAL_DEST_DIR"
    $SUDO mkdir -p "$REAL_DEST_DIR"
    # Let root/sudo operate on a repo owned by $APP_USER (chowned below) without
    # git's "dubious ownership" safeguard aborting the run.
    $SUDO git config --global --get-all safe.directory 2>/dev/null | grep -qxF "$REAL_DEST_DIR" || \
        $SUDO git config --global --add safe.directory "$REAL_DEST_DIR"
    if [ ! -d "$REAL_DEST_DIR/.git" ]; then
        $SUDO git init -q "$REAL_DEST_DIR"
        $SUDO git -C "$REAL_DEST_DIR" remote add origin "$REPO_URL"
    fi
    $SUDO git -C "$REAL_DEST_DIR" remote set-url origin "$REPO_URL"
    $SUDO git -C "$REAL_DEST_DIR" fetch --depth 1 origin "$BRANCH"
    # checkout -f overwrites tracked files but leaves gitignored runtime state in
    # .tcsys/ (playListDb.JSON, logs, locks) and any user-uploaded Music intact.
    $SUDO git -C "$REAL_DEST_DIR" checkout -f -B "$BRANCH" "origin/$BRANCH"

    # Create symlink from RAM to persistent storage
    $SUDO mkdir -p "$(dirname "$DEST_DIR")"
    if [ -L "$DEST_DIR" ]; then
        $SUDO rm -f "$DEST_DIR"
    elif [ -d "$DEST_DIR" ]; then
        echo "Removing existing directory $DEST_DIR (will be replaced with symlink)"
        $SUDO rm -rf "$DEST_DIR"
    fi
    $SUDO ln -sf "$REAL_DEST_DIR" "$DEST_DIR"
    echo "Created symlink: $DEST_DIR -> $REAL_DEST_DIR"
else
    echo "Deploying branch '$BRANCH' from $REPO_URL to $DEST_DIR..."
    $SUDO mkdir -p "$DEST_DIR"
    # Let root/sudo operate on a repo owned by $APP_USER (chowned below) without
    # git's "dubious ownership" safeguard aborting the run.
    $SUDO git config --global --get-all safe.directory 2>/dev/null | grep -qxF "$DEST_DIR" || \
        $SUDO git config --global --add safe.directory "$DEST_DIR"
    if [ ! -d "$DEST_DIR/.git" ]; then
        $SUDO git init -q "$DEST_DIR"
        $SUDO git -C "$DEST_DIR" remote add origin "$REPO_URL"
    fi
    $SUDO git -C "$DEST_DIR" remote set-url origin "$REPO_URL"
    $SUDO git -C "$DEST_DIR" fetch --depth 1 origin "$BRANCH"
    # checkout -f overwrites tracked files but leaves gitignored runtime state in
    # .tcsys/ (playListDb.JSON, logs, locks) and any user-uploaded Music intact.
    $SUDO git -C "$DEST_DIR" checkout -f -B "$BRANCH" "origin/$BRANCH"
fi

# 3. Ensure the runtime system dir and Music dir exist (.tcsys ships only the
#    default playlist via git; everything else in it is created at runtime).
# For diskless mode, configure persistent storage.
if [ "$DISKLESS_MODE" = true ]; then
    if [ -z "$DATA_DIR" ]; then
        # Auto-detect or prompt for persistent storage location
        echo "Diskless mode detected. Persistent storage is required for .tcsys and Music."
        echo "Common locations: /mnt/data, /media/usb, /srv/data"
        echo "Set TC_DATA_DIR environment variable to specify location, e.g.:"
        echo "  TC_DATA_DIR=/mnt/data sudo -E bash deploy.sh"
        echo ""
        # Try common locations
        for loc in /mnt/data /media/usb /srv/data; do
            if [ -d "$loc" ] && [ -w "$loc" ]; then
                DATA_DIR="$loc"
                echo "Auto-detected writable persistent storage: $DATA_DIR"
                break
            fi
        done
        if [ -z "$DATA_DIR" ]; then
            echo "Error: No writable persistent storage found. Please set TC_DATA_DIR."
            exit 1
        fi
    fi

    # Verify that DATA_DIR is on a mounted filesystem (not in RAM)
    if ! mount | grep -q "on $DATA_DIR "; then
        echo "Error: $DATA_DIR is not a mounted filesystem."
        echo "Diskless mode requires persistent storage to be mounted."
        echo ""
        echo "To mount a device, run:"
        echo "  mkdir -p $DATA_DIR"
        echo "  mount /dev/sdX1 $DATA_DIR  # Replace sdX1 with your device"
        echo ""
        echo "Or add to /etc/fstab for automatic mounting on boot:"
        echo "  echo '/dev/sdX1 $DATA_DIR ext4 defaults 0 0' >> /etc/fstab"
        exit 1
    fi

    # In diskless mode, the entire repo is already in persistent storage (symlinked above)
    # so .tcsys and Music are already in the right place. Just ensure they exist.
    $SUDO mkdir -p "$DEST_DIR/.tcsys" "$DEST_DIR/Music"
    echo "Using persistent storage at $DATA_DIR (entire app is symlinked)"
else
    $SUDO mkdir -p "$DEST_DIR/.tcsys" "$DEST_DIR/Music"
fi

# 4. Create the dedicated app user (Alpine) and grant it ALSA access.
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

# 5. Set ownership. The tree is owned by APP_USER so php-fpm can write runtime
# state under .tcsys and uploads under Music (the owner has write access via the
# 755 dir modes git checked out). Ownership is NOT tracked by git, so this keeps
# `git status`/`git pull` clean. We deliberately avoid a blanket `chmod -R`,
# which would flip the executable bit on every tracked file and permanently
# dirty the working tree; git already checked out the correct file modes, and
# world-readability for nginx is guaranteed by the umask set at the top.
echo "Setting ownership..."
if [ "$DISKLESS_MODE" = true ] && [ -n "$DATA_DIR" ]; then
    # In diskless mode, set ownership on the persistent storage location
    REAL_DEST_DIR="$DATA_DIR/trafficcontrol"
    $SUDO chown -R "$APP_USER:$APP_GROUP" "$REAL_DEST_DIR"
    $SUDO chown -R "$APP_USER:$APP_GROUP" "$DATA_DIR"
else
    $SUDO chown -R "$APP_USER:$APP_GROUP" "$DEST_DIR"
fi

# 6. Verify required dependencies
echo "Verifying dependencies..."
for cmd in mplayer amixer bc php bash grep ps date; do
    if ! command -v "$cmd" >/dev/null 2>&1; then
        echo "Error: $cmd is not installed. Installation may have failed."
        exit 1
    fi
done
echo "All dependencies verified."

# 7. Install nginx configuration (patch the fastcgi_pass target)
echo "Installing nginx configuration..."
TMP_CONF="$(mktemp)"
sed "s|PHP_FPM_PASS|${TC_FASTCGI_PASS}|g" "$DEST_DIR/trafficcontrol.nginx.conf" > "$TMP_CONF"
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

# 8. Set up the scheduler cron job
echo "Setting up cron job..."
if [ "$TC_OS" = "alpine" ]; then
    # Detect which cron daemon is installed (prefer dcron over busybox crond)
    if command -v dcron >/dev/null 2>&1; then
        CRON_DAEMON="dcron"
    elif command -v crond >/dev/null 2>&1 && [ -f /sbin/crond ]; then
        CRON_DAEMON="crond"
    else
        # Default to busybox crond (built into Alpine)
        CRON_DAEMON="crond"
    fi
    echo "Using cron daemon: $CRON_DAEMON"

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

# 9. Add trafficcontrol.local to hosts file
if ! grep -q "trafficcontrol.local" /etc/hosts; then
    echo "Adding trafficcontrol.local to /etc/hosts..."
    echo "127.0.0.1 trafficcontrol.local" | $SUDO tee -a /etc/hosts > /dev/null
fi

# 10. Enable and (re)start services to apply changes
echo "Restarting services..."
if [ "$TC_OS" = "alpine" ]; then
    $SUDO rc-update add "php-fpm${TC_PHP_NODOT}" default 2>/dev/null || \
        $SUDO rc-update add php-fpm default 2>/dev/null || true
    $SUDO rc-update add nginx default 2>/dev/null || true
    $SUDO rc-update add "$CRON_DAEMON" default 2>/dev/null || true
    $SUDO rc-service "php-fpm${TC_PHP_NODOT}" restart 2>/dev/null || \
        $SUDO rc-service php-fpm restart 2>/dev/null || true
    $SUDO rc-service nginx restart
    $SUDO rc-service "$CRON_DAEMON" restart 2>/dev/null || true
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
echo ""
echo "To update the application later, re-run this script (it fetches the latest"
echo "'$BRANCH') or run: sudo git -C $DEST_DIR pull"
