# Traffic Control Test Rig

A Docker-based test environment for Traffic Control that requires only Docker on the host system.

## Prerequisites

- Docker
- Docker Compose (or `docker compose` plugin)

## Quick Start

1. Navigate to the test-rig directory:
   ```bash
   cd test-rig
   ```

2. Start the containers:
   ```bash
   docker compose up -d
   ```

3. Access the application:
   ```
   http://localhost:8080
   ```

## Stopping the Test Rig

```bash
docker compose down
```

To also remove volumes (clears .tcsys state):
```bash
docker compose down -v
```

## Rebuilding After Code Changes

If you modify the Dockerfile or PHP dependencies:
```bash
docker compose build --no-cache
docker compose up -d
```

For application code changes (PHP, JS, HTML, CSS), the volume mount means changes are reflected immediately — no rebuild needed.

## Architecture

- **PHP-FPM Container**: Runs PHP 8.3 with required extensions (mbstring, ctype, fileinfo, calendar) and mplayer/alsa-utils for audio playback
- **Nginx Container**: Serves the web application and proxies PHP requests to PHP-FPM via Unix socket
- **Shared Volume**: The application code is mounted from the parent directory, allowing live code editing

## Audio

The `php` service in `docker-compose.yml` is set up for real ALSA playback through the host's sound hardware:

- `devices: /dev/snd` passes the host's sound devices into the container.
- `security_opt: systempaths=unconfined` unmasks `/proc/asound`, which Docker hides by default. The app reads `/proc/asound/cards` to list audio devices. This loosens the container's isolation slightly, which is acceptable for a local test rig.
- The Dockerfile adds `www-data` to a group whose GID matches the host's `audio` group, so PHP-FPM workers can open the devices. The GID comes from the `AUDIO_GID` build argument (default `29`, the Debian/Ubuntu value). If your host differs, rebuild with:
  ```bash
  AUDIO_GID=$(getent group audio | cut -d: -f3) docker compose build
  ```

If the host runs PipeWire or PulseAudio, it may hold some cards open, and playback to those cards fails with "device busy". Choose a different card in the app's audio device setting.

## Limitations

- **Audio playback**: The host's sound cards are passed through to the PHP container, so playback is real (see [Audio](#audio)). On a host with no sound card, the app falls back to null audio output, which still exercises all playback logic without producing sound.
- The test rig uses Alpine Linux; production may use Debian
- No cron/scheduler is configured in this test rig (manual testing only)

## Troubleshooting

**Port 8080 already in use:**
Edit `docker-compose.yml` and change the port mapping from `"8080:80"` to another port like `"8081:80"`.

**Permission errors:**
The containers run as `www-data`. If you encounter permission issues with created files, you may need to adjust permissions on the host.

**PHP errors:**
Check PHP-FPM logs:
```bash
docker-compose logs php
```

**Nginx errors:**
Check nginx logs:
```bash
docker-compose logs nginx
```
