# Traffic Control

Traffic Control is a PHP-based audio scheduling and playback system, designed to run on Linux systems like the Raspberry Pi. It allows for complex scheduling of audio files and directories, with features like volume management, fading, and chime support.

## Installation

### Option 1: Home Assistant Add-on (Recommended)

Traffic Control can run as a Home Assistant add-on, which handles all dependencies and configuration automatically.

1. **Copy the add-on to your HA config directory:**
   ```bash
   cp -r trafficcontrol /config/addons/trafficcontrol
   ```

2. **Install via the HA UI:**
   Go to **Settings → Add-ons → Add-on Store**, click the refresh icon (top-right), and the add-on will appear under **Local add-ons**.

3. **Start the add-on.** The web UI is then accessible from the HA sidebar, or directly at `http://your-ha-ip:8099`.

**Storage:** Playlists and settings are persisted in HA's add-on data directory. Music files live in `/media/trafficcontrol/`, which is accessible via HA's Media browser. The built-in chime sounds are copied there automatically on first run.

**Audio:** The add-on passes `/dev/snd` through to the container for ALSA access. Make sure your audio device is ALSA-compatible.

### Option 2: Bare-metal (Nginx + PHP)

#### Prerequisites

- **Web Server:** Apache or Nginx with PHP support.
- **PHP:** Version 8.0 or higher recommended (needs the `ctype`, `fileinfo`, `mbstring` and `session` extensions).
- **Operating System:** Linux — Debian/Ubuntu/Raspberry Pi OS **or** Alpine (including Alpine on Raspberry Pi). `deploy.sh` auto-detects the distro (`apt`+systemd vs `apk`+OpenRC) and installs the right packages.
- **Audio Hardware:** ALSA-compatible sound card or Bluetooth audio.
- **System Utilities:**
  - `mplayer` (for audio playback)
  - `amixer` (for volume control)
  - `bc` (for calculations)
  - **On Alpine:** the GNU toolchain (`coreutils`, `grep`, `procps`, `bash`, `util-linux`) is also required — the app's scheduler relies on GNU behaviour rather than BusyBox. `deploy.sh` installs these automatically.

#### Steps

**For Debian/Ubuntu/Raspberry Pi OS:**

1.  **Clone the Repository:**
    Clone the project to your web server's document root:
    ```bash
    git clone https://github.com/BKWSU-UK/tc-server.git /var/www/html/trafficcontrol
    ```

2.  **Run the deployment script** (installs packages, configures nginx and cron automatically):
    ```bash
    sudo bash deploy.sh
    ```

**For Alpine (including Alpine on Raspberry Pi):**

Alpine minimal does not include sudo by default. Run as root.

**IMPORTANT: Convert Alpine from diskless to traditional installation first**

Alpine on Raspberry Pi installs in diskless mode by default (root filesystem in RAM). Convert to a traditional installation where the root filesystem is on persistent storage.

**Install to SD card (recommended):**

The Raspberry Pi firmware requires a FAT32 boot partition. The default diskless boot partition (129M) is too small for a full kernel install, so repartition the SD card with a larger boot partition and an ext4 root partition:

```bash
# Install partition management tools
apk add e2fsprogs dosfstools

# Unmount the existing boot partition before repartitioning
umount /media/mmcblk0p1 2>/dev/null || true

# Repartition the SD card
fdisk /dev/mmcblk0
# d, then Enter (repeat for any other existing partitions) to delete them
# n, p, 1, Enter, +512M           -> new boot partition (512M)
# t, 1, c                         -> set type to W95 FAT32 (LBA)
# n, p, 2, Enter, Enter           -> new root partition (remaining space)
# w                                -> write changes

# Format the partitions
mkfs.vfat -F 32 /dev/mmcblk0p1
mkfs.ext4 /dev/mmcblk0p2

# Mount root, then boot inside it
mkdir -p /mnt/alpine-root
mount /dev/mmcblk0p2 /mnt/alpine-root
mkdir -p /mnt/alpine-root/boot
mount /dev/mmcblk0p1 /mnt/alpine-root/boot

# Install Alpine to the mounted root
setup-disk -m sys /mnt/alpine-root

# Reboot to boot from the new installation
reboot
```

`setup-disk` will configure `/etc/fstab` automatically for both partitions.

**Deployment after conversion:**
```bash
su -
git clone https://github.com/BKWSU-UK/tc-server.git /var/www/html/trafficcontrol
cd /var/www/html/trafficcontrol
bash deploy.sh
```

    Or set up manually:

    **Debian/Ubuntu/Raspberry Pi OS:**
    ```bash
    cd /var/www/html/trafficcontrol
    mkdir .tcsys
    sudo chown -R www-data:www-data .tcsys Music
    sudo chmod -R 775 .tcsys Music
    sudo apt install mplayer alsa-utils bc
    ```

    **Alpine (including Alpine on Raspberry Pi):**
    Alpine minimal does not include sudo by default. Run as root:
    ```bash
    su -
    cd /var/www/html/trafficcontrol
    mkdir .tcsys
    chown -R www-data:www-data .tcsys Music
    chmod -R 775 .tcsys Music
    apk add mplayer alsa-utils bc coreutils grep procps bash util-linux
    ```

3.  **Configure the cron job** (if not using `deploy.sh`):

    **Debian/Ubuntu/Raspberry Pi OS:**
    ```bash
    sudo crontab -u www-data -e
    ```
    Add:
    ```cron
    * * * * * /usr/bin/php /var/www/html/trafficcontrol/php/cron.php > /dev/null 2>&1
    ```

    **Alpine (including Alpine on Raspberry Pi):**
    Run as root:
    ```bash
    crontab -u www-data -e
    ```
    Add (BusyBox crond format, no user field):
    ```cron
    * * * * * /usr/bin/php /var/www/html/trafficcontrol/php/cron.php > /dev/null 2>&1
    ```

## Configuration

### Audio Output
The application automatically detects your sound card. If using Bluetooth, ensure `bluealsa` is configured.

### Debugging
To enable debug logging, create an empty file named `debug` in the `.tcsys` directory:
```bash
touch /var/www/html/trafficcontrol/.tcsys/debug
```
Logs will be written to `.tcsys/debug.log`. When running as an HA add-on, `.tcsys` maps to the add-on's persistent data directory.

## Using the Web Interface

Access the application at `http://your-pi-ip/trafficcontrol/index.html`.

### Playlists

The left panel contains playlist management controls:

- **Add** (+): Create a new playlist.
- **Copy**: Duplicate the current playlist.
- **Rename** (pencil): Change the playlist name.
- **Delete** (trash): Remove the current playlist.
- **Dropdown**: Switch between playlists.

### Playlist Items

Each row in the playlist table represents a scheduled audio event:

| Column | Description |
|--------|-------------|
| **Time** | When to play (12-hour format). Click to open the time picker. |
| **Schedule** | `Every` plays on selected days, `Except` skips selected days, `Manual` disables automatic playback. |
| **Week** | Restrict to 1st, 2nd, or 3rd week of the month (visible when a specific day is selected). |
| **Day** | Daily or a specific day of the week. |
| **Content** | File or folder path. Select from the Media Library below. |
| **Mode** | `Single` plays the file, `Random` or `Sequential` for folders. |
| **Volume** | Playback volume (0-99). Use the slider or scroll wheel. |
| **Length** | `Full` plays the entire track, or limit to 10-180 seconds with fade-out. |
| **Actions** | Preview (play) or Stop the item. |

Use the + and - icons in the first column to add or remove rows.

### Media Library

The file browser at the bottom (elFinder) shows the contents of the `Music/` folder. To assign audio to a playlist item:

1. Click a row in the playlist to select it (highlighted in blue).
2. Click a file or folder in the Media Library.

The path appears in the Content column. For folders, choose Random or Sequential playback mode.

### System Mode vs Local Mode

The **System Mode** toggle determines where audio plays:

- **System**: Audio plays on the server hardware (Raspberry Pi, Alpine on Raspberry Pi, or any Linux system) (requires LAN access).
- **Local**: Audio plays through the browser on your computer.

When in System mode, the **Preview Mode** toggle controls where preview playback occurs.

### Special Content

- **Chime**: Enter "Chime" in the Content field to play the built-in chime sound. The Length setting controls the duration before the closing chime plays.

## Directory Structure

- `Music/`: Root directory for audio files (symlinked to `/media/trafficcontrol` in the HA add-on).
- `php/`: Core logic and scheduler.
- `.tcsys/`: Persistent storage, locks, and logs (symlinked to `/data` in the HA add-on).
- `elFinder-2.1.65/`: File manager for managing audio files via the web UI.
- `Dockerfile`: Container definition for the HA add-on.
- `config.yaml`: HA add-on manifest.
- `build.yaml`: Base image configuration per CPU architecture.
- `run.sh`: Container startup script.
- `ha-nginx.conf`: nginx configuration for the container.

## License
This project is released under the MIT License.
