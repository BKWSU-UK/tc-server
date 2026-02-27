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
- **PHP:** Version 7.4 or higher recommended.
- **Operating System:** Linux (tested on Raspberry Pi OS / Debian).
- **Audio Hardware:** ALSA-compatible sound card or Bluetooth audio.
- **System Utilities:**
  - `mplayer` (for audio playback)
  - `amixer` (for volume control)
  - `bc` (for calculations)

#### Steps

1.  **Clone the Repository:**
    Clone the project to your web server's document root:
    ```bash
    git clone <repository-url> /var/www/html/trafficcontrol
    ```

2.  **Run the deployment script** (installs packages, configures nginx and cron automatically):
    ```bash
    sudo bash deploy.sh
    ```

    Or set up manually:

    ```bash
    cd /var/www/html/trafficcontrol
    mkdir .tcsys
    sudo chown -R www-data:www-data .tcsys Music
    sudo chmod -R 775 .tcsys Music
    sudo apt install mplayer alsa-utils bc
    ```

3.  **Configure the cron job** (if not using `deploy.sh`):
    ```bash
    sudo crontab -u www-data -e
    ```
    Add:
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

- **System**: Audio plays on the Raspberry Pi hardware (requires LAN access).
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
