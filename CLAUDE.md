# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Traffic Control is a PHP/JavaScript web application for scheduling timed audio announcements and music playback on Linux (primarily Raspberry Pi). It targets institutional use cases (e.g., timed chimes, announcements) and supports two deployment modes:

- **Home Assistant add-on**: Docker container (Nginx + PHP-FPM), persistent storage in `/data`
- **Bare-metal**: Direct install via `deploy.sh` on Debian/Raspberry Pi OS

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
| `php/cron.php` | Scheduler: checks `nextEventTime`, calls `playEntry()` if match |
| `js/tc.js` | ~1,650-line jQuery SPA: playlist CRUD, UI rendering, AJAX, volume UI, elFinder integration |
| `index.html` | Main UI shell |
| `run.sh` | Docker entrypoint: symlinks, permissions, starts nginx/php-fpm/cron |
| `deploy.sh` | Bare-metal installer |

### Persistence (`.tcsys/` directory)

- `playListDb.JSON` — current schedule/settings (JSON)
- `playListDbDefault.JSON` — factory default template
- `playListDb.lock` — file lock (40-second timeout) prevents race conditions
- `scheduler_enabled` — flag file; scheduler only runs if this exists
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

### Audio System

- Audio playback uses `mplayer` with ALSA; volume via `amixer`
- Logarithmic dB conversion in `tc.lib.php` for perceptually linear volume control
- Chime files live in `Music/.system/` (FLAC format)
- `getAudioDevices()` / `resolveAudioDevice()` handle device enumeration

### UK Bank Holiday Logic

`tc.lib.php` contains a full UK bank holiday calculator (Easter, May Day, Whitsun, etc.) used for the `"except"` exception mode.
