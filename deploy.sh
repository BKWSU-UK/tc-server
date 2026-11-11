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
#   TC_REPO_URL=... TC_BRANCH=... sudo -E bash deploy.sh   (Debian)
#   TC_REPO_URL=... TC_BRANCH=... sh deploy.sh             (Alpine, as root)
REPO_URL="${TC_REPO_URL:-https://github.com/BKWSU-UK/tc-server.git}"
BRANCH="${TC_BRANCH:-main}"

# Persistent storage for diskless mode (Alpine on Raspberry Pi)
# Override via environment (as root): TC_DATA_DIR=/mnt/data sh deploy.sh
DATA_DIR="${TC_DATA_DIR:-}"

# Detect OS (Alpine/Debian) and load per-distro paths, users and helpers.
# shellcheck source=scripts/os-detect.sh
source "$SCRIPT_DIR/scripts/os-detect.sh"

# True if $1 is a directory with a filesystem mounted on it. An empty
# /media/usb (always present on Alpine) does not count as persistent storage.
is_mounted_dir() {
    [ -d "$1" ] && awk -v d="$1" '$2 == d { found = 1 } END { exit !found }' /proc/mounts
}

# Steps that need a reboot record why; the final message lists them.
REBOOT_REASONS=""
reboot_needed() {
    case "$REBOOT_REASONS" in
        *"$1"*) ;;
        *) REBOOT_REASONS="${REBOOT_REASONS:+$REBOOT_REASONS;} $1" ;;
    esac
}

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

# A diskless Alpine (root in RAM) usually means the SD card has not been
# converted to a sys install yet. Stop before installing anything unless
# persistent storage for the app is available.
if [ "$DISKLESS_MODE" = true ] && [ -z "$DATA_DIR" ]; then
    HAVE_DATA_DIR=false
    for loc in /mnt/data /media/usb /srv/data; do
        if is_mounted_dir "$loc" && [ -w "$loc" ]; then HAVE_DATA_DIR=true; fi
    done
    if [ "$HAVE_DATA_DIR" = false ]; then
        echo "Error: Alpine is running diskless (the root filesystem is in RAM),"
        echo "so Traffic Control would be lost at the next reboot."
        echo "Install Alpine onto the SD card first (README: 'For Alpine', Step 1),"
        echo "reboot, and then run this script again."
        echo "(Advanced: to stay diskless, mount persistent storage and run"
        echo " TC_DATA_DIR=/mnt/data sh deploy.sh)"
        exit 1
    fi
fi

# If DATA_DIR is explicitly set, use it regardless of diskless detection
if [ -n "$DATA_DIR" ]; then
    echo "Using persistent data directory: $DATA_DIR"
    DISKLESS_MODE=true
fi

# Reduce SD card wear (step 8b) on Alpine "sys" installs whose root filesystem
# is on an SD card/eMMC: logs go to RAM, / is mounted noatime, and the nginx
# access log (written on every UI poll) is turned off.
# Override with TC_SD_WEAR=on|off. It only applies to Alpine sys installs
# (it relies on OpenRC and BusyBox syslogd; diskless mode already runs in RAM).
SD_WEAR=off
if [ "$TC_OS" = "alpine" ] && [ "$DISKLESS_MODE" = false ]; then
    # Use the last "/" entry: /proc/mounts may also list an initial rootfs.
    case "$(awk '$2 == "/" { dev = $1 } END { print dev }' /proc/mounts)" in
        /dev/mmcblk*) SD_WEAR=on ;;
    esac
    case "${TC_SD_WEAR:-}" in
        on|off) SD_WEAR="$TC_SD_WEAR" ;;
    esac
fi

echo "Starting deployment to $DEST_DIR (OS: $TC_OS, app user: $APP_USER, nginx: $NGINX_USER, diskless: $DISKLESS_MODE, SD wear reduction: $SD_WEAR)..."

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
        coreutils grep findutils procps bash util-linux tzdata dcron pulseaudio-utils 2>/dev/null || \
    $SUDO apk add --no-cache \
        nginx git \
        "php${PHPV}" "php${PHPV}-fpm" "php${PHPV}-cli" \
        "php${PHPV}-mbstring" "php${PHPV}-session" \
        "php${PHPV}-ctype" "php${PHPV}-fileinfo" \
        "php${PHPV}-phar" "php${PHPV}-openssl" \
        mplayer alsa-utils bc \
        coreutils grep findutils procps bash util-linux tzdata dcron
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
        echo "  TC_DATA_DIR=/mnt/data sh deploy.sh"
        echo ""
        # Try common locations
        for loc in /mnt/data /media/usb /srv/data; do
            if is_mounted_dir "$loc" && [ -w "$loc" ]; then
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
if [ "$SD_WEAR" = on ]; then
    # The UI polls tc.php every 2 s, so the access log is the largest steady
    # writer. Turn it off rather than fill the size-capped tmpfs /var/log.
    sed -i 's|^\([[:space:]]*\)access_log .*|\1access_log off;|' "$TMP_CONF"
fi
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
    # /var/log may be a tmpfs that starts empty at boot (e.g. DietPi RAMlog), and
    # nginx refuses to start without /var/log/nginx. Have systemd create it before
    # every start; also create it now so 'nginx -t' below can open its logs.
    $SUDO mkdir -p /etc/systemd/system/nginx.service.d
    printf '[Service]\nLogsDirectory=nginx\n' | \
        $SUDO tee /etc/systemd/system/nginx.service.d/logsdir.conf > /dev/null
    $SUDO systemctl daemon-reload
    $SUDO mkdir -p /var/log/nginx
fi
rm -f "$TMP_CONF"

echo "Testing nginx configuration..."
$SUDO nginx -t

# 8. Set up the scheduler cron job
echo "Setting up cron job..."
if [ "$TC_OS" = "alpine" ]; then
    # Pick the cron service. The dcron package replaces /usr/sbin/crond with
    # Dillon's cron, but BusyBox's "crond" service may still be enabled; it
    # starts that binary with BusyBox options and it dies at once, so no job
    # ever runs. When dcron is installed, use its own service and turn the
    # BusyBox one off (both read /etc/crontabs).
    if [ -x /etc/init.d/dcron ]; then
        CRON_DAEMON="dcron"
        $SUDO rc-service crond stop >/dev/null 2>&1 || true
        $SUDO rc-update del crond default >/dev/null 2>&1 || true
    else
        CRON_DAEMON="crond"   # BusyBox crond, built into Alpine
    fi
    echo "Using cron service: $CRON_DAEMON"

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

# 8b. Reduce SD card wear (Alpine sys install on SD/eMMC; see SD_WEAR above).
#     Everything here is idempotent, so re-running deploy.sh is safe. The
#     /var/log tmpfs takes effect at the next reboot.
if [ "$SD_WEAR" = on ]; then
    echo "Reducing SD card writes (set TC_SD_WEAR=off to skip)..."

    # a) BusyBox syslogd: log to a 256 KB RAM ring buffer (read with `logread`)
    #    instead of /var/log/messages.
    SYSLOG_CONF=/etc/conf.d/syslog
    if [ -f "$SYSLOG_CONF" ] && [ -x /etc/init.d/syslog ]; then
        OLD_SYSLOGD_OPTS="$(. "$SYSLOG_CONF" >/dev/null 2>&1; printf '%s' "${SYSLOGD_OPTS:-}")" || true
        case " $OLD_SYSLOGD_OPTS " in
            *" -C"*) echo "syslogd already logs to RAM" ;;
            *)
                NEW_SYSLOGD_OPTS="${OLD_SYSLOGD_OPTS:+$OLD_SYSLOGD_OPTS }-C256"
                [ -f "$SYSLOG_CONF.tc-orig" ] || $SUDO cp -p "$SYSLOG_CONF" "$SYSLOG_CONF.tc-orig"
                $SUDO sed -i 's/^[[:space:]]*SYSLOGD_OPTS=/#&/' "$SYSLOG_CONF"
                printf '# Traffic Control deploy.sh: log to a RAM ring buffer (read with logread)\nSYSLOGD_OPTS="%s"\n' \
                    "$NEW_SYSLOGD_OPTS" | $SUDO tee -a "$SYSLOG_CONF" > /dev/null
                $SUDO rc-service syslog restart 2>/dev/null || true
                echo "syslogd now logs to RAM (SYSLOGD_OPTS=\"$NEW_SYSLOGD_OPTS\")"
                ;;
        esac
    else
        echo "BusyBox syslog service not found; leaving system logging unchanged"
    fi

    # b) /etc/fstab: noatime on /, a size cap on a tmpfs /tmp, and a size-capped
    #    tmpfs /var/log. Existing /tmp or /var/log entries that are not tmpfs are
    #    left alone. The original is kept once as /etc/fstab.tc-orig.
    [ -f /etc/fstab.tc-orig ] || $SUDO cp -p /etc/fstab /etc/fstab.tc-orig
    TMP_FSTAB="$(mktemp)"
    awk '
        function setopt(opts, drop, add,   n, a, i, out) {
            n = split(opts, a, ",")
            out = ""
            for (i = 1; i <= n; i++) {
                if (a[i] ~ drop) continue
                out = out (out == "" ? "" : ",") a[i]
            }
            return out (out == "" ? "" : ",") add
        }
        /^[[:space:]]*(#|$)/ || NF < 4 { print; next }
        $2 == "/" && $4 !~ /(^|,)noatime(,|$)/ {
            $4 = setopt($4, "^(atime|relatime|norelatime|strictatime|nostrictatime)$", "noatime")
            print; next
        }
        $2 == "/tmp" { tmp = 1 }
        $2 == "/tmp" && $3 == "tmpfs" && $4 !~ /(^|,)size=/ {
            $4 = setopt($4, "^$", "size=64m")
            print; next
        }
        $2 == "/var/log" { varlog = 1 }
        { print }
        END {
            if (!tmp)    print "tmpfs\t/tmp\ttmpfs\trw,nosuid,nodev,mode=1777,size=64m\t0 0"
            if (!varlog) print "tmpfs\t/var/log\ttmpfs\trw,nosuid,nodev,noexec,mode=0755,size=16m\t0 0"
        }
    ' OFS='\t' /etc/fstab > "$TMP_FSTAB"
    if cmp -s "$TMP_FSTAB" /etc/fstab; then
        echo "/etc/fstab already configured"
    else
        # Replace atomically (copy keeps the owner and permissions, then rename)
        # so a power cut mid-write can never leave an empty /etc/fstab.
        $SUDO cp -p /etc/fstab /etc/fstab.tc-new
        $SUDO sh -c "cat '$TMP_FSTAB' > /etc/fstab.tc-new"
        $SUDO sync
        $SUDO mv -f /etc/fstab.tc-new /etc/fstab
        echo "Updated /etc/fstab (original saved as /etc/fstab.tc-orig)"
    fi
    rm -f "$TMP_FSTAB"
    # Apply what can be applied live; the rest takes effect at the next boot.
    $SUDO mount -o remount,noatime / 2>/dev/null || true
    if awk '$2 == "/tmp" && $3 == "tmpfs" { found = 1 } END { exit !found }' /proc/mounts; then
        TMP_SIZE="$(awk '$2 == "/tmp" && $3 == "tmpfs" { n = split($4, a, ","); for (i = 1; i <= n; i++) if (a[i] ~ /^size=/) s = substr(a[i], 6) } END { print s }' /etc/fstab)"
        [ -z "$TMP_SIZE" ] || $SUDO mount -o "remount,size=$TMP_SIZE" /tmp 2>/dev/null || true
    fi

    # c) A tmpfs /var/log starts empty at every boot, but nginx and php-fpm
    #    refuse to start without their log directories. Install a boot service
    #    that recreates every directory currently under /var/log with the same
    #    owner and mode (plus the ones nginx and php-fpm need).
    VARLOG_INIT=/etc/init.d/tc-varlog-dirs
    VARLOG_DIRS="$(mktemp)"
    find /var/log -mindepth 1 -type d 2>/dev/null | while IFS= read -r d; do
        printf '%s %s %s\n' "$d" "$(stat -c '%U:%G' "$d")" "$(stat -c '%a' "$d")"
    done > "$VARLOG_DIRS"
    for d in /var/log/nginx "/var/log/php${TC_PHP_NODOT}"; do
        grep -q "^$d " "$VARLOG_DIRS" || printf '%s root:root 755\n' "$d" >> "$VARLOG_DIRS"
    done
    TMP_INIT="$(mktemp)"
    {
        echo '#!/sbin/openrc-run'
        echo '# Generated by Traffic Control deploy.sh; regenerated on every deploy.'
        echo 'description="Recreate log directories on a tmpfs /var/log"'
        echo ''
        echo 'depend() {'
        echo '	need localmount'
        echo "	before logger syslog nginx php-fpm${TC_PHP_NODOT} crond dcron chronyd"
        echo '}'
        echo ''
        echo 'start() {'
        echo '	ebegin "Recreating /var/log directories"'
        echo '	rc=0'
        sort "$VARLOG_DIRS" | while read -r d owner mode; do
            printf '\tcheckpath -d -o %s -m 0%s "%s" || rc=1\n' "$owner" "$mode" "$d"
        done
        echo '	eend $rc'
        echo '}'
    } > "$TMP_INIT"
    $SUDO cp "$TMP_INIT" "$VARLOG_INIT"
    $SUDO chmod 755 "$VARLOG_INIT"
    rm -f "$TMP_INIT" "$VARLOG_DIRS"
    $SUDO rc-update add tc-varlog-dirs boot 2>/dev/null || true

    if awk '$2 == "/var/log" && $3 == "tmpfs" { found = 1 } END { exit !found }' /etc/fstab; then
        awk '$2 == "/var/log" && $3 == "tmpfs" { found = 1 } END { exit !found }' /proc/mounts || \
            reboot_needed "to move /var/log into RAM"
    else
        echo "/etc/fstab already mounts /var/log from other storage; leaving it on disk"
    fi
fi

# Undo step 8b when explicitly asked (TC_SD_WEAR=off) after an earlier deploy
# applied it. The nginx access log is already back on (step 7).
if [ "$TC_OS" = "alpine" ] && [ "${TC_SD_WEAR:-}" = off ] && \
   { [ -f /etc/fstab.tc-orig ] || [ -f /etc/conf.d/syslog.tc-orig ] || [ -f /etc/init.d/tc-varlog-dirs ]; }; then
    echo "Undoing SD card wear reduction (TC_SD_WEAR=off)..."
    if [ -f /etc/fstab.tc-orig ]; then
        # Keep the current file in case it was edited since the first deploy.
        $SUDO cp -p /etc/fstab /etc/fstab.tc-sdwear
        $SUDO cp -p /etc/fstab.tc-orig /etc/fstab.tc-new
        $SUDO sync
        $SUDO mv -f /etc/fstab.tc-new /etc/fstab
        $SUDO rm -f /etc/fstab.tc-orig
        echo "Restored /etc/fstab (the previous version is saved as /etc/fstab.tc-sdwear)"
    fi
    if [ -f /etc/conf.d/syslog.tc-orig ]; then
        $SUDO mv -f /etc/conf.d/syslog.tc-orig /etc/conf.d/syslog
        $SUDO rc-service syslog restart 2>/dev/null || true
        echo "Restored /etc/conf.d/syslog"
    fi
    $SUDO rc-update del tc-varlog-dirs boot 2>/dev/null || true
    $SUDO rm -f /etc/init.d/tc-varlog-dirs
    reboot_needed "to finish undoing the SD card wear reduction"
fi

# 8c. Make sure the clock stays correct (Alpine). The Pi has no real-time
#     clock, and the scheduler is useless with the wrong time.
if [ "$TC_OS" = "alpine" ]; then
    if rc-update show 2>/dev/null | grep -qE '^[[:space:]]*(chronyd|ntpd|openntpd)[[:space:]]'; then
        echo "Network time sync is already enabled"
    else
        echo "Enabling network time sync (chrony)..."
        $SUDO apk add --no-cache chrony
        $SUDO rc-update add chronyd default 2>/dev/null || true
        $SUDO rc-service chronyd start 2>/dev/null || true
    fi
fi

# 8d. Raspberry Pi with no sound card: enable the onboard audio (headphone
#     jack/HDMI), which needs a firmware setting and a reboot. A USB sound
#     card, or an existing dtparam=audio line, is left alone.
PI_MODEL="$(tr -d '\0' < /proc/device-tree/model 2>/dev/null || true)"
BOOT_ID="$(cat /proc/sys/kernel/random/boot_id 2>/dev/null || true)"
HAS_SOUND_CARD() { grep -qE '^ *[0-9]+ \[' /proc/asound/cards 2>/dev/null; }
case "$PI_MODEL" in
    *"Raspberry Pi"*)
        # The onboard audio driver isn't always loaded automatically (Alpine's
        # mdev doesn't autoload it). Try it, and load it at every boot if it
        # brings up a sound card.
        if ! HAS_SOUND_CARD && $SUDO modprobe snd_bcm2835 2>/dev/null; then
            sleep 1
            if HAS_SOUND_CARD; then
                echo "Loaded the Raspberry Pi audio driver (snd_bcm2835); loading it at boot from now on"
                if [ "$TC_OS" = "alpine" ]; then
                    grep -qx 'snd_bcm2835' /etc/modules 2>/dev/null || \
                        echo 'snd_bcm2835' | $SUDO tee -a /etc/modules > /dev/null
                else
                    echo 'snd_bcm2835' | $SUDO tee /etc/modules-load.d/trafficcontrol-audio.conf > /dev/null
                fi
            fi
        fi
        if ! HAS_SOUND_CARD; then
            PI_CFG=""
            for f in /boot/firmware/config.txt /boot/config.txt; do
                if [ -f "$f" ]; then PI_CFG="$f"; break; fi
            done
            # Alpine keeps user settings in usercfg.txt, included from config.txt.
            if [ -n "$PI_CFG" ] && grep -q '^include usercfg.txt' "$PI_CFG"; then
                PI_USERCFG="$(dirname "$PI_CFG")/usercfg.txt"
            else
                PI_USERCFG="$PI_CFG"
            fi
            if [ -z "$PI_CFG" ]; then
                echo "Warning: no sound card found and no Raspberry Pi config.txt to enable onboard audio"
            elif grep -q '^# Added by Traffic Control deploy.sh: onboard audio' "$PI_USERCFG" 2>/dev/null; then
                # Added by an earlier run. Only ask for a reboot if it was added
                # during this boot; after a reboot, there is nothing more to try.
                if grep -q "^# Added by Traffic Control deploy.sh: onboard audio (boot $BOOT_ID)" "$PI_USERCFG"; then
                    reboot_needed "to enable the onboard audio"
                else
                    echo "Warning: onboard audio is enabled in $PI_USERCFG but no sound card was found."
                    echo "Some models (e.g. Pi 5, Pi Zero) have no headphone jack; use a USB or HAT sound card."
                fi
            elif cat "$PI_CFG" "$PI_USERCFG" 2>/dev/null | grep -q '^[[:space:]]*dtparam=audio='; then
                echo "Warning: no sound card found, but dtparam=audio is already set in $PI_CFG or $PI_USERCFG"
            else
                echo "No sound card found: enabling the Raspberry Pi onboard audio in $PI_USERCFG"
                # [all] ends any model-specific section that config.txt might end in.
                printf '[all]\n# Added by Traffic Control deploy.sh: onboard audio (boot %s)\ndtparam=audio=on\n' "$BOOT_ID" | \
                    $SUDO tee -a "$PI_USERCFG" > /dev/null
                reboot_needed "to enable the onboard audio"
            fi
        fi
        ;;
    *)
        if ! grep -qE '^ *[0-9]+ \[' /proc/asound/cards 2>/dev/null; then
            echo "Warning: no sound card found. Connect one (or check its driver) for audio output."
        fi
        ;;
esac

# 8e. Ownership fixer. Files copied into Music by another user (e.g. root over
#     SSH, or Samba) can't be renamed or deleted by the app. A root cron job
#     hands them to the app user every minute; see the script for the
#     safeguards that make running it as root safe.
echo "Installing the Music ownership fixer..."
$SUDO mkdir -p /usr/local/sbin    # not present on a minimal Alpine install
$SUDO install -o root -g root -m 0755 "$DEST_DIR/scripts/tc-fix-music-ownership.sh" \
    /usr/local/sbin/tc-fix-music-ownership
# Its safeguards need the kernel's hardlink/symlink protections. They are on
# by default on systemd distros; make sure they are on everywhere.
printf 'fs.protected_hardlinks = 1\nfs.protected_symlinks = 1\n' | \
    $SUDO tee /etc/sysctl.d/60-trafficcontrol.conf > /dev/null
$SUDO sysctl -p /etc/sysctl.d/60-trafficcontrol.conf > /dev/null 2>&1 || true
MUSIC_REAL="$(cd "$DEST_DIR/Music" && pwd -P)"
FIXER_CMD="/usr/local/sbin/tc-fix-music-ownership '$MUSIC_REAL' $APP_USER $APP_GROUP"
if [ "$TC_OS" = "alpine" ]; then
    $SUDO touch /etc/crontabs/root
    $SUDO sed -i '/tc-fix-music-ownership/d' /etc/crontabs/root
    echo "* * * * * $FIXER_CMD" | $SUDO tee -a /etc/crontabs/root > /dev/null
else
    printf '# Traffic Control: give the app user files copied into Music by others\n* * * * * root %s\n' \
        "$FIXER_CMD" | $SUDO tee /etc/cron.d/trafficcontrol-ownership > /dev/null
    $SUDO chmod 644 /etc/cron.d/trafficcontrol-ownership
fi
$SUDO /usr/local/sbin/tc-fix-music-ownership "$MUSIC_REAL" "$APP_USER" "$APP_GROUP"

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
    # Without cron nothing is scheduled, so say so loudly.
    sleep 2
    if ! $SUDO rc-service "$CRON_DAEMON" status >/dev/null 2>&1; then
        echo "WARNING: the cron service ($CRON_DAEMON) is not running, so scheduled events will not play."
        echo "         Check it with: rc-service $CRON_DAEMON status"
    fi
else
    # reload-or-restart: a plain reload fails if nginx isn't running
    $SUDO systemctl reload-or-restart nginx
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
if [ -n "$REBOOT_REASONS" ]; then
    echo ""
    echo "*** Reboot now to finish:$REBOOT_REASONS ***"
fi
