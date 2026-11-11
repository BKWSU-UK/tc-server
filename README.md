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

Run every command below as root (Alpine has no `sudo`).

##### Step 1: Install Alpine onto the SD card

Alpine on a Raspberry Pi starts in "diskless" mode, where everything runs from RAM and is lost at reboot. Traffic Control needs Alpine installed onto the SD card itself.

> **Warning:** this erases the SD card you booted from.

First run `setup-alpine`. When it asks, choose `chrony` as the NTP client and an online package mirror. Then repartition the card into a 512M FAT32 boot partition and an ext4 root, and install onto it:

```sh
apk add e2fsprogs dosfstools
modprobe ext4; modprobe vfat      # load these before the module image is unmounted
umount /.modloop /media/mmcblk0p1 2>/dev/null

fdisk /dev/mmcblk0
#   d                          -> delete the existing partition (repeat if there are several)
#   n, p, 1, Enter, +512M      -> new boot partition
#   t, c                       -> set its type to W95 FAT32 (LBA)
#   n, p, 2, Enter, Enter      -> new root partition (rest of the card)
#   w                          -> write the changes and exit

mdev -s
mkfs.vfat -F 32 /dev/mmcblk0p1
mkfs.ext4 /dev/mmcblk0p2
mount /dev/mmcblk0p2 /mnt
mkdir -p /mnt/boot
mount /dev/mmcblk0p1 /mnt/boot
setup-disk -m sys /mnt
reboot
```

##### Step 2: Deploy Traffic Control

```sh
apk add git
git clone https://github.com/BKWSU-UK/tc-server.git /var/www/html/trafficcontrol
sh /var/www/html/trafficcontrol/deploy.sh
```

If the script ends by asking you to reboot, run `reboot`.

`deploy.sh` installs and configures everything. It also makes sure network time sync is running, enables the Pi's onboard audio if no sound card is found, and stops if Alpine is still running diskless. To reduce SD card wear, it moves the system logs and `/tmp` into size-limited RAM, mounts `/` with `noatime`, and turns off the nginx access log. To skip the SD card changes, run `TC_SD_WEAR=off sh /var/www/html/trafficcontrol/deploy.sh`; that also undoes them if an earlier run applied them.

#### Manual setup (instead of `deploy.sh`)

`deploy.sh` is the supported route. If you set things up by hand, match what it does:

**Debian/Ubuntu/Raspberry Pi OS:**
```bash
cd /var/www/html/trafficcontrol
mkdir -p .tcsys Music
sudo apt install nginx php-fpm php-mbstring mplayer alsa-utils bc
sudo usermod -aG audio www-data
sudo chown -R www-data:www-data .tcsys Music
```
Then add a cron job for `www-data` (`sudo crontab -u www-data -e`):
```cron
* * * * * /usr/bin/php /var/www/html/trafficcontrol/php/cron.php >> /var/www/html/trafficcontrol/.tcsys/cron.log 2>&1
```

**Alpine:** (as root; replace `83` with your PHP series)
```sh
cd /var/www/html/trafficcontrol
mkdir -p .tcsys Music
apk add nginx php83 php83-fpm php83-cli php83-mbstring php83-session php83-ctype \
    php83-fileinfo php83-phar php83-openssl mplayer alsa-utils bc \
    coreutils grep procps bash util-linux tzdata
addgroup -S trafficcontrol
adduser -S -D -H -s /sbin/nologin -G trafficcontrol trafficcontrol
addgroup trafficcontrol audio
chown -R trafficcontrol:trafficcontrol .
```
Then set `user`/`group` to `trafficcontrol` in `/etc/php83/php-fpm.d/www.conf`, install `trafficcontrol.nginx.conf` as `/etc/nginx/http.d/trafficcontrol.conf` (replacing `PHP_FPM_PASS` with `127.0.0.1:9000`), and remove `/etc/nginx/http.d/default.conf`. Finally, create `/etc/crontabs/trafficcontrol`. Its format is BusyBox crond, with no user field:
```cron
* * * * * /usr/bin/php /var/www/html/trafficcontrol/php/cron.php >> /var/www/html/trafficcontrol/.tcsys/cron.log 2>&1
```
and enable the services with `rc-update add nginx default`, `rc-update add php-fpm83 default` and `rc-update add crond default`.

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

Access the application at `http://your-pi-ip/`.

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
| **Content** | File or folder path. Click it to pick a sound. |
| **Mode** | `Single` plays the file, `Random` or `Sequential` for folders. |
| **Volume** | Playback volume (0-99). Use the slider or scroll wheel. |
| **Length** | `Full` plays the entire track, or limit to 10-180 seconds with fade-out. |
| **Actions** | Preview (play) or Stop the item. |

Use the + and - icons in the first column to add or remove rows.

### Selecting Audio

To assign audio to a playlist item, click its Content box and pick a file or folder from the `Music/` folder. For folders, choose Random or Sequential playback mode.

### Managing Music Files

Click **Manage Music** in the Music Files panel (between Playlist and Settings) (or **Manage** in the sound picker) to work with the files in `Music/`:

- **Upload** sound files or whole folders with the buttons, or by dragging them onto the list. Uploads are sent in small pieces, so any file size works. Anything mplayer can't play is skipped. Video files are accepted too; their audio is played.
- **New folder**, **rename** and **delete**. Renaming a file or folder also updates the playlist entries that use it. Deleting warns you if a playlist uses the item.
- **Download** a file, or a folder as a ZIP. Tick several items to download or delete them together.
- **Details**: click a file to listen to it and see what mplayer reads from it: length, format, codec, bitrate, sample rate, channels, chapters and every tag the file carries (title, artist, album and so on, from ID3, Vorbis comments, MP4, ASF/WMA, APE, Matroska and others). It also shows which playlist entries use the file.

Files can only be changed from the local network; elsewhere the manager is read-only.

**File ownership:** Traffic Control runs as its own user (`trafficcontrol` on Alpine, `www-data` on Debian, the add-on's user in Home Assistant). Files it uploads always belong to that user. Files copied into `Music/` some other way (e.g. as root over SSH, or via Samba) may belong to someone else. A small root cron job, installed by `deploy.sh` and by the add-on, hands them back to the app user every minute, so they can be renamed and deleted from the web page. Until then they're marked with a lock.

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
