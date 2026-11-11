# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Traffic Control is a PHP/JavaScript web application for scheduling timed audio announcements and music playback on Linux (primarily Raspberry Pi). It targets institutional use cases (e.g., timed chimes, announcements) and supports two deployment modes:

- **Home Assistant add-on**: Docker container (Nginx + PHP-FPM), persistent storage in `/data`
- **Bare-metal**: Direct install via `deploy.sh` on Debian/Raspberry Pi OS or Alpine (OpenRC). On Alpine sys installs with root on `/dev/mmcblk*`, `deploy.sh` also reduces SD card wear (syslog to RAM, `noatime`, size-capped tmpfs `/tmp` and `/var/log` recreated at boot by `/etc/init.d/tc-varlog-dirs`, nginx access log off); `TC_SD_WEAR=on|off` overrides, and an explicit `off` undoes an earlier run. On Alpine it also enables chrony if no NTP client is enabled, refuses to run on a diskless Alpine without persistent storage, and on a Raspberry Pi with no sound card adds `dtparam=audio=on`. Steps needing a reboot call `reboot_needed`, and the script ends by telling the user to reboot. Keep the README minimal: put checks and fixes in `deploy.sh`, not in user instructions. `deploy.sh` must stay BusyBox `sh`-compatible on the Alpine path.

## Deployment & Running

```bash
# Bare-metal install (installs nginx, php-fpm, mplayer, alsa-utils, sets up cron)
sudo bash deploy.sh

# Docker/HA: container starts via run.sh automatically

# Enable debug logging
touch .tcsys/debug
tail -f .tcsys/debug.log

# Enable the scheduler
touch .tcsys/scheduler_enabled
tail -f .tcsys/cron.log
```

There is no build step — this is a ready-to-deploy web app with no package manager or compilation.

**Cache busting:** nginx serves `.js`/`.css` with a one-year immutable cache, so whenever you change `js/tc.js` or `css/tc.css`, bump its `?v=` query string in `index.html` (e.g. `?v=20261110a`). Otherwise browsers keep running the old file against the new HTML.

## Architecture

### Request Flow
1. Browser loads `index.html` → runs `js/tc.js` (jQuery-based SPA)
2. JS sends AJAX to `php/tc.php` with an `action` parameter
3. `tc.php` instantiates `TrafficControl` (from `TrafficControl.class.php`) and delegates to `tc.lib.php`
4. State persists in `.tcsys/playListDb.JSON`
5. System cron calls `php/cron.php` every minute to trigger scheduled playback via `mplayer`/`amixer`

### Key Files

| File | Role |
|------|------|
| `php/tc.php` | HTTP request handler; routes `action` parameter to class methods |
| `php/TrafficControl.class.php` | Core class: load/save JSON, file locking, `findNext()`, `playEntry()` |
| `php/tc.lib.php` | ~1,150 lines of functions: audio playback, volume/fade, bank holidays, file browser, ALSA device detection |
| `php/cron.php` | Scheduler: checks `nextEventTime`, calls `playEntry()` if match; also restarts the Live Audio listener if needed |
| `php/liveaudio.php` | Live Audio listener (detached): receives a UDP stream on port 5555 and pipes it to mplayer |
| `js/tc.js` | ~1,650-line jQuery SPA: playlist CRUD, UI rendering, AJAX, volume UI, sound picker |
| `php/filemanager.lib.php` | Music file manager backend (`fm*` actions in `tc.php`): listing, chunked uploads, mkdir/rename/delete, file/ZIP downloads, mplayer metadata (cached in `.tcsys/mediaInfo.JSON`), playlist reference rewriting on rename |
| `js/tc-filemanager.js` | Music file manager UI (`TC.fm`), opened by the "Manage Music" button |
| `scripts/tc-fix-music-ownership.sh` | Root cron helper (installed as `/usr/local/sbin/tc-fix-music-ownership`) that chowns files copied into Music by other users to the app user |
| `index.html` | Main UI shell |
| `run.sh` | Docker entrypoint: symlinks, permissions, starts nginx/php-fpm/cron |
| `deploy.sh` | Bare-metal installer |

### Persistence (`.tcsys/` directory)

- `playListDb.JSON` — current schedule/settings (JSON)
- `playListDbDefault.JSON` — factory default template
- `playListDb.lock` — file lock (40-second timeout) prevents race conditions
- `mediaInfo.JSON` — cache of mplayer metadata per Music file (keyed by path, invalidated by size+mtime)
- `scheduler_enabled` — flag file; scheduler only runs if this exists
- `liveaudio_enabled` — flag file; Live Audio listener runs while this exists
- `liveaudio.lock` / `liveaudio.pid` — held/written by the running listener; `liveaudio_receiving` exists while a stream is playing
- `debug.log`, `played.log`, `cron.log` — logging

### Playlist JSON Shape

```json
{
  "selectedPlayList": 0,
  "system": true,
  "audioDevice": "auto",
  "timezone": "Europe/London",
  "list": [
    {
      "name": "Playlist Name",
      "list": [
        {
          "time": "06:30 AM",
          "day": "monday",
          "week": "all",
          "exception": "every",
          "what": "path/to/file",
          "mode": "single",
          "volume": 75,
          "length": "full"
        }
      ]
    }
  ]
}
```

`exception` values: `"every"`, `"except"` (skip bank holidays), `"never"`, `"manual"`
`mode` values: `"single"`, `"random"`, `"sequential"` (folder-based)
`length`: `"full"` or seconds (10–180) with 3-second fade

### Security Model

- `clientInSameSubnet()` in `tc.lib.php` restricts write operations (play, volume, file management) to LAN clients only — no authentication system.
- File manager paths are validated per segment (`fmValidName`) and resolved with `realpath()` inside Music; dot-files (`.system` chimes, `.tcupload-*` partial uploads) are hidden and unaddressable; symlinks are never followed out of Music.
- The ownership fixer runs as root over a tree the app user can write, so it must stay symlink/hardlink-safe: GNU `find -P ... -execdir chown -h`, Music dir must not be a symlink, and it refuses to run unless `fs.protected_hardlinks`/`protected_symlinks` are 1 (`deploy.sh` sets them). Install it root-owned outside the app tree; never run a script from the app tree as root.

### Audio System

- Audio playback uses `mplayer` with ALSA; volume via `amixer`
- Logarithmic dB conversion in `tc.lib.php` for perceptually linear volume control
- Chime files live in `Music/.system/` (FLAC format)
- `getAudioDevices()` / `resolveAudioDevice()` handle device enumeration

### Live Audio

The Settings "Live Audio" toggle plays an audio stream (MPEG-TS, MP3, etc.) sent to `udp://<device>:5555`. `php/liveaudio.php` binds the port and pipes packets into `mplayer -demuxer lavf -` (mplayer's own demuxer probe hangs on real-time streams, and mplayer never exits when a UDP stream stops). While a stream is arriving it stops scheduled playback and `playEntry()` skips entries; 3 s without packets ends the stream. The listener holds an exclusive lock on `liveaudio.lock`, which is how `liveAudioRunning()` detects it. Code that kills "all mplayer" processes must exclude the listener (its command line contains `LIVEAUDIO_URL`). Its volume (0–99, stored in `.tcsys/liveaudio_volume`) is applied with mplayer `-softvol`, using the same dB curve as entries; changes during a stream go to mplayer as slave commands via the `liveaudio.fifo` FIFO.

### UK Bank Holiday Logic

`tc.lib.php` contains a full UK bank holiday calculator (Easter, May Day, Whitsun, etc.) used for the `"except"` exception mode.
