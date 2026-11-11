#!/bin/sh
# Traffic Control: give the app user ownership of anything copied into the
# Music folder by another user (e.g. root over SSH, or Samba), so the web
# file manager can rename and delete it.
#
# Installed root-owned as /usr/local/sbin/tc-fix-music-ownership by
# deploy.sh (bare metal) or the Dockerfile (Home Assistant add-on) and run
# every minute from root's crontab:
#   tc-fix-music-ownership <music-dir> <user> <group>
#
# The Music tree is writable by the app user, so this must not let a
# compromised app trick root into changing anything outside it:
#   * symlinks are never followed (find -P, chown -h) and the Music folder
#     itself must not be a symlink;
#   * changes are made with GNU find -execdir, which works relative to each
#     folder it has already entered, so swapping a parent folder for a
#     symlink mid-run can't redirect it;
#   * it refuses to run unless the kernel's hardlink/symlink protections are
#     on, so a hardlink to another user's file can't be planted in Music.

set -u
[ $# -eq 3 ] || { echo "usage: $0 <music-dir> <user> <group>" >&2; exit 2; }
MUSIC=$1
APP_USER=$2
APP_GROUP=$3

[ "$(cat /proc/sys/fs/protected_hardlinks 2>/dev/null)" = 1 ] || exit 0
[ "$(cat /proc/sys/fs/protected_symlinks 2>/dev/null)" = 1 ] || exit 0
# -execdir needs GNU find (BusyBox find lacks it).
find --version 2>/dev/null | grep -q GNU || exit 0
[ -d "$MUSIC" ] && [ ! -L "$MUSIC" ] || exit 0

find -P "$MUSIC" -xdev \( -type d -o -type f \) \
    \( ! -user "$APP_USER" -o ! -group "$APP_GROUP" \) \
    -execdir chown -h "$APP_USER:$APP_GROUP" {} + 2>/dev/null
exit 0
