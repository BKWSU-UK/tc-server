# Traffic Control

Traffic Control is a PHP-based audio scheduling and playback system, designed to run on Linux systems like the Raspberry Pi. It allows for complex scheduling of audio files and directories, with features like volume management, fading, and chime support.

## Prerequisites

- **Web Server:** Apache or Nginx with PHP support.
- **PHP:** Version 7.4 or higher recommended.
- **Operating System:** Linux (tested on Raspberry Pi OS / Debian).
- **Audio Hardware:** ALSA-compatible sound card or Bluetooth audio.
- **System Utilities:**
  - `mplayer` (for audio playback)
  - `amixer` (for volume control)
  - `bc` (for calculations)

## Installation

1.  **Clone the Repository:**
    Clone the project to your web server's document root:
    ```bash
    git clone <repository-url> /var/www/html/trafficcontrol
    ```

2.  **Set Permissions:**
    The application requires write access to its system directory for persistent storage and logs.
    ```bash
    cd /var/www/html/trafficcontrol
    mkdir .tcsys
    sudo chown -R www-data:www-data .tcsys Music
    sudo chmod -R 775 .tcsys Music
    ```

3.  **Install Dependencies:**
    Ensure the required OS packages are installed:
    ```bash
    sudo apt update
    sudo apt install mplayer alsa-utils bc
    ```

## Configuration

### 1. Web Interface
Access the application via your browser (e.g., `http://your-pi-ip/trafficcontrol/index.html`) to configure playlists and schedules.

### 2. Audio Output
The application automatically attempts to detect your sound card. You can verify audio settings in `php/tc.lib.php`. If using Bluetooth, ensure `bluealsa` is configured.

### 3. Scheduling (Cron)
To enable automated playback, add a cron job that runs the scheduler every minute.

Open the crontab for the web server user:
```bash
sudo crontab -u www-data -e
```

Add the following line:
```cron
* * * * * /usr/bin/php /var/www/html/trafficcontrol/php/cron.php > /dev/null 2>&1
```

### 4. Debugging
To enable debug logging, create an empty file named `debug` in the `.tcsys` directory:
```bash
touch /var/www/html/trafficcontrol/.tcsys/debug
```
Logs will be written to `.tcsys/debug.log`.

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

- `Music/`: Root directory for audio files.
- `php/`: Core logic and scheduler.
- `.tcsys/`: Persistent storage, locks, and logs (created during installation).
- `elFinder-2.1.65/`: File manager for managing audio files via the web UI.

## License
This project is released under the MIT License.
