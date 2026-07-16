<?php
  define ( 'ELFINDERPHP', dirname(__FILE__) . '/' . '..' . '/' . 'elFinder-2.1.65' . '/' . 'php' . '/');
  define ( 'PLAYLISTDIR', dirname(__FILE__) . '/' . '..' . '/' . 'Music');
  define ( 'SYSTEMDIR', dirname(__FILE__) . '/' . '..' . '/' . '.tcsys');
  define ( 'ROOTDIR', dirname(__FILE__) . '/' . '..' . '/');
  define ( 'PERSISTENTFILE', SYSTEMDIR . '/' . 'playListDb.JSON');
  define ( 'PERSISTENTFILEDEFAULT', SYSTEMDIR . '/' . 'playListDbDefault.JSON');
  define ( 'PERSISTENTLOCK', SYSTEMDIR . '/' . 'playListDb.lock');
  define ( 'PLAYLOG', SYSTEMDIR . '/' . 'played.log');
  define ( 'NOWPLAYINGFILE', SYSTEMDIR . '/' . 'nowPlaying.JSON');
  define ( 'DEBUGLOG', SYSTEMDIR . '/' . 'debug.log');
  define ( 'FADEDEBUGLOG', SYSTEMDIR . '/' . 'debug_fade.log');
  define ( 'DEBUG', file_exists ( SYSTEMDIR . '/' . 'debug' ));
  define ( 'LOCKTIMEOUT', 40);
  define ( 'FADETIMEMS', 5000);
  define ( 'CHIME_START', '.system/Chime_start.flac');
  define ( 'CHIME_END', '.system/Chime_end.flac');
  define ( 'DB_PER_VOL_UNIT', 0.46 );
  define ( 'OS_COMMANDS', 'bc|amixer|mplayer|bash');
  define ( 'NO_BUSYBOX_COMMAND', 'grep|date|ps');
  // PHP extensions the app relies on that are NOT bundled/enabled by default on
  // Alpine (separate phpXX-* packages) or Ubuntu: ctype (ctype_digit),
  // fileinfo (mime_content_type). Note: calendar extension was removed in PHP 8.1,
  // its functionality is now in the date extension (always bundled).
  define ( 'PHP_EXTENSIONS', 'ctype|fileinfo|session|mbstring');

  //This may be changed by some functions but must be set now
  //to prevent warnings
  date_default_timezone_set ( "Europe/London" );
  
  function getCardNum(): int {
    static $cardNum = null;
    if ($cardNum !== null) return $cardNum;
    $aplayOutput = [];
    exec('aplay -l 2>/dev/null', $aplayOutput);
    foreach ($aplayOutput as $line) {
      if (preg_match('/^card (\d+):.*device 0:/', $line, $matches)) {
        $n = intval($matches[1]);
        if (strpos($line, 'HDMI') === false) {
          return $cardNum = $n;
    }
      }
    }
    return $cardNum = -1;
  }

  function sys_writable () {
    return is_writable(SYSTEMDIR);
  }

/*
*    Function to calculate which days are British bank holidays (England & Wales) for a given year.
*
*    Created by David Scourfield, 07 August 2006, and released into the public domain.
*    Anybody may use and/or modify this code.
*
*    USAGE:
*
*    array calculateBankHolidays(int $yr)
*
*    ARGUMENTS
*
*    $yr = 4 digit numeric representation of the year (eg 1997).
*
*    RETURN VALUE
*
*    Returns an array of strings where each string is a date of a bank holiday in the format "yyyy-mm-dd".
*
*    See example below
*
*/

function calculateBankHolidays($yr) {

  $bankHols = [];

  // New year's:
  switch ( date("w", strtotime("$yr-01-01 12:00:00")) ) {
    case 6:
      $bankHols[] = "$yr-01-03";
      break;
  case 0:
    $bankHols[] = "$yr-01-02";
    break;
  default:
    $bankHols[] = "$yr-01-01";
  }

  // Good friday:
  $bankHols[] = date("Y-m-d", strtotime( "+".(easter_days($yr) - 2)." days", strtotime("$yr-03-21 12:00:00") ));

  // Easter Monday:
  $bankHols[] = date("Y-m-d", strtotime( "+".(easter_days($yr) + 1)." days", strtotime("$yr-03-21 12:00:00") ));

  // May Day:
  if ($yr == 1995) {
    $bankHols[] = "1995-05-08"; // VE day 50th anniversary year exception
  } else {
    switch (date("w", strtotime("$yr-05-01 12:00:00"))) {
      case 0:
        $bankHols[] = "$yr-05-02";
        break;
      case 1:
        $bankHols[] = "$yr-05-01";
        break;
      case 2:
        $bankHols[] = "$yr-05-07";
        break;
      case 3:
        $bankHols[] = "$yr-05-06";
        break;
      case 4:
        $bankHols[] = "$yr-05-05";
        break;
      case 5:
        $bankHols[] = "$yr-05-04";
        break;
      case 6:
        $bankHols[] = "$yr-05-03";
        break;
    }
  }

  // Whitsun:
  if ($yr == 2002) { // exception year
    $bankHols[] = "2002-06-03";
    $bankHols[] = "2002-06-04";
  } else {
    switch (date("w", strtotime("$yr-05-31 12:00:00"))) {
      case 0:
        $bankHols[] = "$yr-05-25";
        break;
      case 1:
        $bankHols[] = "$yr-05-31";
        break;
      case 2:
        $bankHols[] = "$yr-05-30";
        break;
      case 3:
        $bankHols[] = "$yr-05-29";
        break;
      case 4:
        $bankHols[] = "$yr-05-28";
        break;
      case 5:
        $bankHols[] = "$yr-05-27";
        break;
      case 6:
        $bankHols[] = "$yr-05-26";
        break;
    }
  }

  // Summer Bank Holiday:
  switch (date("w", strtotime("$yr-08-31 12:00:00"))) {
    case 0:
      $bankHols[] = "$yr-08-25";
      break;
    case 1:
      $bankHols[] = "$yr-08-31";
      break;
    case 2:
      $bankHols[] = "$yr-08-30";
      break;
    case 3:
      $bankHols[] = "$yr-08-29";
      break;
    case 4:
      $bankHols[] = "$yr-08-28";
      break;
    case 5:
      $bankHols[] = "$yr-08-27";
      break;
    case 6:
      $bankHols[] = "$yr-08-26";
      break;
  }

  // Christmas:
  switch ( date("w", strtotime("$yr-12-25 12:00:00")) ) {
    case 5:
      $bankHols[] = "$yr-12-25";
      $bankHols[] = "$yr-12-28";
      break;
    case 6:
      $bankHols[] = "$yr-12-27";
      $bankHols[] = "$yr-12-28";
      break;
    case 0:
      $bankHols[] = "$yr-12-26";
      $bankHols[] = "$yr-12-27";
      break;
    default:
      $bankHols[] = "$yr-12-25";
      $bankHols[] = "$yr-12-26";
  }

  return $bankHols;
}

  /**
  * Check if a client IP is in our Server subnet
  *
  * @param string $clientIp
  * @param string $serverIp
  * @return boolean
  */
  function clientInSameSubnet($clientIp=false,$serverIp=false) {
      if (!$clientIp) {
        $clientIp = $_SERVER['REMOTE_ADDR'] ?? '';
      }
      if (!$serverIp)
          $serverIp = $_SERVER['SERVER_ADDR'] ?? '';
      if (!$clientIp) return false;
      //if same then obviously on LAN
      if ($clientIp === $serverIp) return true;
      // Loopback is always local
      if ($clientIp === '127.0.0.1' || $clientIp === '::1') return true;
      // Extract all interface CIDRs from ip addr show
      exec('ip addr show 2>/dev/null', $ipAddrShow);
      $output = implode("\n", $ipAddrShow);
      // Primary check: find SERVER_ADDR's subnet and compare
      if ($serverIp) {
          $escapedServerIp = str_replace('.', '\.', $serverIp);
          preg_match_all('/' . $escapedServerIp . '\/([0-9]{1,2})/', $output, $ipMatches);
          if (!empty($ipMatches[0])) {
              $maskLen = (int)$ipMatches[1][0];
              $mask = -1 << (32 - $maskLen);
              if ((ip2long($clientIp) & $mask) === (ip2long($serverIp) & $mask)) return true;
          }
      }
      // Fallback: check client IP against all interface subnets.
      // Handles Docker/NAT where SERVER_ADDR is on a different subnet than the client's real IP.
      preg_match_all('/inet (\d+\.\d+\.\d+\.\d+)\/(\d+)/', $output, $allMatches, PREG_SET_ORDER);
      foreach ($allMatches as $m) {
          if ($m[1] === '127.0.0.1') continue;
          $mask = -1 << (32 - (int)$m[2]);
          if ((ip2long($clientIp) & $mask) === (ip2long($m[1]) & $mask)) return true;
      }
      // Last resort: if both client and server are on RFC 1918 private ranges,
      // treat as LAN (covers Docker port-mapping where real client IP is preserved).
      $isPrivate = function($ip) {
          return filter_var($ip, FILTER_VALIDATE_IP) !== false
              && filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) === false;
      };
      return $isPrivate($clientIp) && $isPrivate($serverIp);
  }

  function dbToVol ($levelDb) {
    debugLog('LevelDb: '. $levelDb);
    $level = (int) (99 + ((float)$levelDb / DB_PER_VOL_UNIT));
    if ($level > 99) { $level = 99; }
    if ($level < 0) { $level = 0; }
    return $level;
  }
  function voltoDb ($level) {
    $levelDb = 0 - ((99 - $level) * DB_PER_VOL_UNIT);
    return $levelDb;
  }

  function getAudioDevices() {
    $devices = [];

    // Scan ALSA cards from /proc/asound/cards
    $cards = @file_get_contents('/proc/asound/cards');
    if ($cards !== false) {
      $lines = explode("\n", $cards);
      foreach ($lines as $line) {
        if (preg_match('/^\s*(\d+)\s+\[([^\]]+)\]:\s+(.+)$/', $line, $matches)) {
          $cardNum = intval($matches[1]);
          $cardId = trim($matches[2]);
          $cardName = trim($matches[3]);
          $devices[] = [
            'id' => 'alsa:' . $cardId,
            'type' => 'alsa',
            'cardNum' => $cardNum,
            'cardId' => $cardId,
            'name' => $cardName,
            'displayName' => $cardName . ' (Card ' . $cardNum . ')'
          ];
        }
      }
        }

    // Scan Bluetooth devices via bluetoothctl
    $btLines = [];
    exec('command -v bluetoothctl >/dev/null 2>&1 && bluetoothctl devices Connected 2>/dev/null', $btLines);
    if (!empty($btLines)) {
      foreach ($btLines as $btLine) {
        if (preg_match('/^Device\s+([0-9A-F:]+)\s+(.+)$/i', trim($btLine), $btMatches)) {
          $macAddr = $btMatches[1];
          $btName = trim($btMatches[2]);
          $devices[] = [
            'id' => 'bluetooth:' . $macAddr,
            'type' => 'bluetooth',
            'mac' => $macAddr,
            'name' => $btName,
            'displayName' => $btName . ' (Bluetooth)'
          ];
        }
      }
        }

    // Check for bluealsa as fallback bluetooth detection
    if (empty(array_filter($devices, fn($d) => $d['type'] === 'bluetooth'))) {
      $bluealsaCheck = exec('which bluealsa-aplay >/dev/null 2>&1 && bluealsa-aplay -L 2>/dev/null | grep -Eo "^[0-9A-F:]+\\s" | head -1');
      if (!empty($bluealsaCheck)) {
        $devices[] = [
          'id' => 'bluetooth:bluealsa',
          'type' => 'bluetooth',
          'mac' => 'bluealsa',
          'name' => 'Bluetooth Audio',
          'displayName' => 'Bluetooth Audio (BlueALSA)'
        ];
      }
    }

    // Add auto-detect option at the beginning
    array_unshift($devices, [
      'id' => 'auto',
      'type' => 'auto',
      'name' => 'Auto-detect',
      'displayName' => 'Auto-detect (default)'
    ]);

    return $devices;
        }

  function getSelectedAudioDevice() {
    global $stored;
    if (isset($stored) && is_object($stored) && property_exists($stored, 'audioDevice')) {
      return $stored->audioDevice;
    }
    return 'auto';
  }

  function resolveAudioDevice($selectedDevice) {
    if ($selectedDevice === 'auto') {
      return 'auto';
          }
    $devices = getAudioDevices();
    foreach ($devices as $device) {
      if (isset($device['id']) && $device['id'] === $selectedDevice) {
        return $selectedDevice;
        }
        }
    // Backward compatibility: map numeric card id to cardId
    if (strpos($selectedDevice, 'alsa:') === 0) {
      $maybeNum = substr($selectedDevice, 5);
      if (ctype_digit($maybeNum)) {
        foreach ($devices as $device) {
          if (isset($device['cardNum']) && (string)$device['cardNum'] === $maybeNum && isset($device['cardId'])) {
            return 'alsa:' . $device['cardId'];
        }
        }
      }
    }
    return 'auto';
  }

  function getDevCardInfo() {
    global $stored;

    $selectedDevice = (isset($stored) && is_object($stored) && property_exists($stored, 'audioDevice'))
                      ? $stored->audioDevice : 'auto';
    $selectedDevice = resolveAudioDevice($selectedDevice);

    // Handle explicit device selection
    if ($selectedDevice !== 'auto') {
      if (strpos($selectedDevice, 'alsa:') === 0) {
        $cardId = substr($selectedDevice, 5);
        $cardId = preg_replace('/[^A-Za-z0-9_]/', '', $cardId);
        if ($cardId !== '') {
          return "-c " . $cardId;
        }
      }
      if (strpos($selectedDevice, 'bluetooth:') === 0) {
        return ' -D bluealsa';
      }
    }

    // Auto-detect: prefer non-HDMI ALSA card, fallback to bluetooth
    $cardNum = getCardNum();
    if ($cardNum != -1) {
      $cards = @file_get_contents('/proc/asound/cards');
      if ($cards !== false && preg_match('/^\s*' . $cardNum . '\s+\[([^\]]+)\]/m', $cards, $matches)) {
        $cardId = preg_replace('/[^A-Za-z0-9_]/', '', trim($matches[1]));
        $devCardInfo = ($cardId !== '') ? "-c " . $cardId : "-c " . $cardNum;
      } else {
        $devCardInfo = "-c " . $cardNum;
      }
    } else {
      $devCardInfo = (exec( 'which bluealsa-aplay >/dev/null && bluealsa-aplay -L | grep -Fo headset' ) === 'headset')?' -D bluealsa':'';
    }
    return $devCardInfo;
  }

  function getMplayerAudioOutput() {
    global $stored;

    // Detect Docker environment and force null audio output for testing
    if (file_exists('/.dockerenv')) {
      return '-ao null';
    }

    $selectedDevice = (isset($stored) && is_object($stored) && property_exists($stored, 'audioDevice'))
                      ? $stored->audioDevice : 'auto';
    $selectedDevice = resolveAudioDevice($selectedDevice);

    // Check if PulseAudio/PipeWire is available via the current process's session
    $hasPulse = false;
    $xdgRuntime = getenv('XDG_RUNTIME_DIR');
    if ($xdgRuntime && (file_exists("$xdgRuntime/pulse/native") || file_exists("$xdgRuntime/pipewire-0"))) {
      $runtimeStat = @stat($xdgRuntime);
      if ($runtimeStat && $runtimeStat['uid'] === posix_getuid()) {
        $hasPulse = true;
      }
    }

    // When running as a server process (e.g. www-data), XDG_RUNTIME_DIR is not
    // set, but a desktop user's PulseAudio/PipeWire socket may still be readable
    // if permissions allow.  Check all logged-in users' runtime dirs.
    if (!$hasPulse) {
      foreach (glob('/run/user/*/pulse/native') ?: [] as $socket) {
        if (is_readable($socket)) {
          putenv('PULSE_SERVER=unix:' . $socket);
          $hasPulse = true;
          break;
    }
    }
  }

    // PULSE_SERVER env var is set by the Home Assistant supervisor for add-ons
    // with audio: true, and may also be set in other containerised environments.
    if (!$hasPulse && getenv('PULSE_SERVER')) {
      $hasPulse = true;
  }

    if ($hasPulse) {
      return '-ao pulse';
  }
  
    // Fall back to ALSA with plughw (allows software mixing, works alongside PipeWire)
    if ($selectedDevice !== 'auto' && strpos($selectedDevice, 'alsa:') === 0) {
      $cardId = substr($selectedDevice, 5);
      return '-ao alsa:device=plughw=' . $cardId . '.0';
    }

    // Auto-detect ALSA card
    $cardNum = getCardNum();
    if ($cardNum >= 0) {
      $cards = @file_get_contents('/proc/asound/cards');
      if ($cards !== false && preg_match('/^\s*' . $cardNum . '\s+\[([^\]]+)\]/m', $cards, $matches)) {
        $cardId = trim($matches[1]);
        return '-ao alsa:device=plughw=' . $cardId . '.0';
      }
      return '-ao alsa:device=plughw=' . $cardNum . '.0';
    }

    // Last resort - let mplayer auto-detect
    return '';
  }
  function getIsMapped() {
    $devCardInfo = getDevCardInfo();
    $isMapped = (exec('amixer ' . $devCardInfo . ' -M 2>&1 | grep -Fo invalid') !== 'invalid');
    return $isMapped;
  }
  
  function prepareMixer (&$oldId, &$devCardInfo, &$controlId, &$level, &$isMapped) {
    $devCardInfo = getDevCardInfo();    
    $isMapped = getIsMapped();
    if ($isMapped) {
      //Copy initial level from playing instance if available
      $controlId = exec('amixer ' . $devCardInfo . ' -M | grep -Po "(?<=Simple mixer control \')[^\']+" | head -n 1');
      $levelDb = exec('amixer ' . $devCardInfo . ' -M get ' . escapeshellarg($controlId) . ' | grep -Po "(?<=\[)[0-9.-]+(?=dB)" | head -n 1');
      $level =dbToVol($levelDb);
    } else {
      $controlId = exec('amixer ' . $devCardInfo . ' controls | grep -P "(Master|PCM|A2DP) Playback Volume" | grep -P -o "numid=[0-9]+"');
      //Copy initial level from playing instance if available
      if (strlen($oldId) > 1) {
          $explodedId = explode('-', $oldId);
          $level = $explodedId[0];    } else {
        if (strlen($controlId) > 1) {
          $level = exec('amixer ' . $devCardInfo . ' cget ' . escapeshellarg($controlId) . ' | grep -Po "[^,]values=[0-9-]+" | tr -dc "0-9-"');
          if ($level < 0) {
            $level = 0;
          }
        }
      }
    }
    debugLog("devCardInfo :" . $devCardInfo . ", controlId : " . $controlId . ", Current level : " . $level . ", is mapped : " . $isMapped);
  }

  function setPlayerVolumeAndLength ($index, $setLength, $id, $oldId, $chime, $audioOutput, $unused = '') {
    global $stored;

    $item = $stored->list[ $stored->selectedPlayList ]->list[$index];
    if (property_exists($item, 'hash') &&
        property_exists($stored, 'audioVolumes') &&
        property_exists($stored->audioVolumes, $item->hash)) {
      $fileVolume = $stored->audioVolumes->{$item->hash};
    } else {
      $fileVolume = 80;
    }
    $combinedVolume = (int)(($fileVolume * $item->volume) / 80);
    if ($combinedVolume > 99) {
      $combinedVolume = 99;
    }
    //Convert linear volume to log volume scale on 0-100%
    $combinedLogVolume = 0;
    if ($combinedVolume > 0) {
      //Math.pow(10, (compositeVolume + 1) / 50) - 1
      
      $combinedLogVolume = intval(100 - ((0 - log10($combinedVolume / 100))*50));
    }
    //Default initial value
    $initialLevel = 0;
    prepareMixer ($oldId, $devCardInfo, $controlId, $initialLevel, $isMapped);
    $hasMixerControl = strlen($controlId) > 1;
    if ($hasMixerControl) {
      $escapedControlId = escapeshellarg($controlId);
      if ($isMapped) {
        $command = 'amixer ' . $devCardInfo . ' -M set ' . $escapedControlId . ' -- ' . voltoDb($combinedVolume) . 'dB unmute >/dev/null 2>&1';
      } else {
        $command = 'amixer ' . $devCardInfo . ' cset ' . $escapedControlId . ' ' . $combinedLogVolume . '% unmute >/dev/null 2>&1';
      }
      debugLog($command);
      exec ($command);      
    }
    //Program music playing time and fade if set — runs regardless of mixer availability
      if ($setLength) {
        if (property_exists($item, 'howLong') && (intval($item->howLong) > 0)) {
        $howLong = intval($item->howLong);
        $fadeTimeMs = intval(FADETIMEMS);
        $dbPerVolUnit = floatval(DB_PER_VOL_UNIT);
        $debugLog = escapeshellarg(DEBUGLOG);
        $initialLevelEscaped = escapeshellarg($initialLevel);
        $initialLevelDb = voltoDb($initialLevel);

        $command = "(  sleep $howLong\n";
          if ($chime) {
          $chimeEnd = escapeshellarg(PLAYLISTDIR . '/' . CHIME_END);
          $command .= "mplayer $chimeEnd $audioOutput -vo null";
        } elseif ($hasMixerControl) {
            //dash/bash script to wait for end to music then start fade then kill the music
            //Do not act if different id playing at time of end of song
          $escapedControlId = escapeshellarg($controlId);
          $fadeStartVol = (($isMapped)?$combinedVolume:$combinedLogVolume);
          $fadeStepMs = intval($fadeTimeMs / max(1, $fadeStartVol));

          $command .= '  id=' . escapeshellarg($id) . '
                        if ps aux | grep -v grep | grep -F -q -- "-x $id" ; then
                            time=$( date +%s%3N )
                          i=' . $fadeStartVol . '
                          ' . ((DEBUG)?'echo "Starting fade from volume level $i" >> ' . $debugLog:'') . '
                            while [ $i -ge 0 ]; do
                            time=$(( time + ' . $fadeStepMs . ' ))
                              while [ $time -ge $( date +%s%3N ) ]; do
                                sleep 0.001
                              done
                            amixer ' . $devCardInfo . (($isMapped)?' -M set ' . $escapedControlId . ' -- $( echo "0 - ((99 - $i) * ' . $dbPerVolUnit . ')" | bc )dB':' cset ' . $escapedControlId . ' "$i"%') . '
                              i=$((i-1))
                            done
                          ' . ((DEBUG)?'echo "Killing player with id : $id" >> ' . $debugLog:'') . '
                            ps aux | grep -v grep | grep -F -q -- "-x $id" && kill $( ps aux | grep -v grep | grep -F -- "-x $id" | awk \'{print $2}\' )
                            sleep 0.5
                          amixer ' . $devCardInfo . (($isMapped)?' -M set ' . $escapedControlId . ' -- ' . $initialLevelDb . 'dB':' cset ' . $escapedControlId . ' ' . $initialLevelEscaped) . '
                          fi';
        } else {
          // No ALSA mixer — fade via PulseAudio (pactl), then kill
          $command .= "  xid=" . escapeshellarg($id) . "\n" .
            "  MPLAYER_PID=\$(ps aux | grep -v grep | grep -F -- \"-x \$xid\" | awk '{print \$2}' | head -1)\n" .
            (DEBUG ? "  echo \"PulseAudio fade: xid=\$xid pid=\$MPLAYER_PID\" >> $debugLog\n" : '') .
            "  if [ -n \"\$MPLAYER_PID\" ]; then\n" .
            "    SINK=\$(pactl list sink-inputs 2>/dev/null | awk -v mpid=\"\$MPLAYER_PID\" '/^Sink Input/{si=substr(\$3,2)} /application\\.process\\.id/ && index(\$0,mpid){print si}')\n" .
            "    if [ -n \"\$SINK\" ]; then\n" .
            "      CURRENT_VOL=\$(pactl list sink-inputs 2>/dev/null | awk -v sink=\"\$SINK\" '/^Sink Input #/{found=(substr(\$3,2)==sink)} found && /Volume:/{match(\$0,/[0-9]+%/); print substr(\$0,RSTART,RLENGTH-1)+0; exit}')\n" .
            "      [ -z \"\$CURRENT_VOL\" ] && CURRENT_VOL=100\n" .
            "      i=\$(( CURRENT_VOL * 50 / 100 ))\n" .
            "      while [ \$i -ge 0 ]; do\n" .
            "        pactl set-sink-input-volume \"\$SINK\" \"\$(( \$i * 100 / 50 ))%\" 2>/dev/null\n" .
            "        sleep 0.1\n" .
            "        i=\$(( \$i - 1 ))\n" .
            "      done\n" .
            "    fi\n" .
            "    kill \"\$MPLAYER_PID\" 2>/dev/null\n" .
            "  fi";
          }
        $command .= "\n) >/dev/null 2>&1 &";
          debugLog($command);
          exec ($command);
        }
      }
    // Real-time PulseAudio volume when no ALSA mixer is available (used by setVolume action)
    if (!$hasMixerControl && !$setLength && strlen($oldId) > 1) {
      $xid = explode('-', $oldId)[1] ?? '';
      if (ctype_digit($xid)) {
        $mplayerPid = trim(exec("ps aux | grep -v grep | grep -F -- '-x $xid' | awk '{print \$2}' | head -1 2>/dev/null"));
        if (ctype_digit($mplayerPid)) {
          $sinkInput = trim(exec("pactl list sink-inputs 2>/dev/null | awk -v mpid=$mplayerPid '/^Sink Input/{si=substr(\$3,2)} /application\\.process\\.id/ && index(\$0,mpid){print si}'"));
          if (ctype_digit($sinkInput)) {
            exec("pactl set-sink-input-volume $sinkInput {$combinedVolume}% 2>/dev/null");
            debugLog("PulseAudio: set sink-input $sinkInput to {$combinedVolume}%");
          }
    }
      }
    }
    return ['id' => $initialLevel . '-' . $id, 'hasMixerControl' => $hasMixerControl, 'volume' => $combinedVolume];
  }

  function fileIsAudio ($file) {
    return (strpos($file['mime'], 'audio') !== false);
  }

  function listAllSounds($phash = '') {
    static $elFinder = null;

    if ($elFinder === null) {
      $prevErrorLevel = error_reporting(E_ALL & ~E_DEPRECATED & ~E_STRICT);
      include_once ELFINDERPHP.'elFinder.class.php';
      include_once ELFINDERPHP.'elFinderVolumeDriver.class.php';
      include_once ELFINDERPHP.'elFinderVolumeLocalFileSystem.class.php';
      error_reporting($prevErrorLevel);

      $opts = array(
        'roots' => array(
          array(
            'driver'        => 'LocalFileSystem',
            'path'          => PLAYLISTDIR . '/',
            'accessControl' => 'access'
          )
        )
      );
      $elFinder = new elFinder($opts);
    }

    $sounds = array();

    if (empty($phash)) {
      $sounds[] = array('path' => 'Chime', 'name' => 'Chime', 'hash' => '', 'mime' => 'audio/chime');
      $result = $elFinder->exec('open', array('target' => '', 'tree' => false, 'init' => true));
      $currentPath = '';
    } else {
      if (!preg_match('/^[a-zA-Z0-9_]+$/', $phash)) {
        return $sounds;
      }
      $result = $elFinder->exec('open', array('target' => $phash, 'tree' => false, 'init' => false));
      $currentPath = '';
      if (isset($result['cwd']['name'])) {
        $currentPath = $result['cwd']['name'];
      }
    }

    if (isset($result['files'])) {
      foreach ($result['files'] as $file) {
        if (!isset($file['name']) || strpos($file['name'], '.') === 0) continue;
        if (!empty($phash) && isset($file['phash']) && $file['phash'] !== $phash) continue;

        $isDir = (isset($file['mime']) && $file['mime'] === 'directory');
        $isAudio = (isset($file['mime']) && strpos($file['mime'], 'audio') !== false);

        if ($isDir || $isAudio) {
          $name = $file['name'];
          $path = empty($currentPath) ? $name : $currentPath . '/' . $name;
          $sounds[] = array(
            'path' => $path,
            'name' => $name,
            'hash' => isset($file['hash']) ? $file['hash'] : '',
            'mime' => isset($file['mime']) ? $file['mime'] : ''
          );
        }
      }
    }

    usort($sounds, function($a, $b) {
      if ($a['path'] === 'Chime') return -1;
      if ($b['path'] === 'Chime') return 1;
      $aIsDir = ($a['mime'] === 'directory');
      $bIsDir = ($b['mime'] === 'directory');
      if ($aIsDir && !$bIsDir) return -1;
      if (!$aIsDir && $bIsDir) return 1;
      return strcasecmp($a['name'], $b['name']);
    });

    return $sounds;
  }

  function sanitizePath($path) {
    $path = str_replace(['..', "\0"], '', $path);
    $path = preg_replace('/[\/\\\\]+/', '/', $path);
    $path = trim($path, '/');
    return $path;
  }

  function getFullPath($relativePath) {
    $relativePath = sanitizePath($relativePath);
    $fullPath = PLAYLISTDIR . '/' . $relativePath;
    $realPath = realpath(dirname($fullPath));
    if ($realPath === false || strpos($realPath, realpath(PLAYLISTDIR)) !== 0) {
      return false;
    }
    return $fullPath;
  }

  function createFolder($currentPath, $name) {
    $name = sanitizePath($name);
    if (empty($name)) {
      return ['error' => 'Folder name is required'];
    }
    $currentPath = sanitizePath($currentPath);
    $fullPath = PLAYLISTDIR . '/' . ($currentPath ? $currentPath . '/' : '') . $name;

    $parentReal = realpath(PLAYLISTDIR . '/' . $currentPath);
    if ($parentReal === false || strpos($parentReal, realpath(PLAYLISTDIR)) !== 0) {
      return ['error' => 'Invalid path'];
    }

    if (file_exists($fullPath)) {
      return ['error' => 'Folder already exists'];
    }

    if (mkdir($fullPath, 0755, true)) {
      return ['success' => true];
    }
    return ['error' => 'Failed to create folder'];
  }

  function deleteItem($path) {
    $path = sanitizePath($path);
    if (empty($path)) {
      return ['error' => 'Path is required'];
    }
    $fullPath = PLAYLISTDIR . '/' . $path;
    $realPath = realpath($fullPath);

    if ($realPath === false || strpos($realPath, realpath(PLAYLISTDIR)) !== 0) {
      return ['error' => 'Invalid path'];
    }
    if ($realPath === realpath(PLAYLISTDIR)) {
      return ['error' => 'Cannot delete root folder'];
    }

    if (is_dir($realPath)) {
      $iterator = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($realPath, RecursiveDirectoryIterator::SKIP_DOTS),
        RecursiveIteratorIterator::CHILD_FIRST
      );
      foreach ($iterator as $file) {
        if ($file->isDir()) {
          rmdir($file->getPathname());
        } else {
          unlink($file->getPathname());
        }
      }
      if (rmdir($realPath)) {
        return ['success' => true];
      }
    } else {
      if (unlink($realPath)) {
        return ['success' => true];
      }
    }
    return ['error' => 'Failed to delete'];
  }

  function renameItem($path, $newName) {
    $path = sanitizePath($path);
    $newName = sanitizePath($newName);
    if (empty($path) || empty($newName)) {
      return ['error' => 'Path and new name are required'];
    }

    $fullPath = PLAYLISTDIR . '/' . $path;
    $realPath = realpath($fullPath);

    if ($realPath === false || strpos($realPath, realpath(PLAYLISTDIR)) !== 0) {
      return ['error' => 'Invalid path'];
    }
    if ($realPath === realpath(PLAYLISTDIR)) {
      return ['error' => 'Cannot rename root folder'];
    }

    $parentDir = dirname($realPath);
    $newPath = $parentDir . '/' . basename($newName);

    if (file_exists($newPath)) {
      return ['error' => 'A file with that name already exists'];
    }

    if (rename($realPath, $newPath)) {
      return ['success' => true];
    }
    return ['error' => 'Failed to rename'];
  }

  function uploadFiles($currentPath, $files) {
    $currentPath = sanitizePath($currentPath);
    $targetDir = PLAYLISTDIR . '/' . $currentPath;

    $realTargetDir = realpath($targetDir);
    if ($realTargetDir === false) {
      $realTargetDir = realpath(PLAYLISTDIR);
      $targetDir = PLAYLISTDIR;
    }
    if (strpos($realTargetDir, realpath(PLAYLISTDIR)) !== 0) {
      return ['error' => 'Invalid path'];
    }

    $uploaded = 0;
    $errors = [];
    $audioMimes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/flac', 'audio/ogg', 'audio/m4a', 'audio/aac', 'audio/x-m4a'];

    if (isset($files['files'])) {
      $fileCount = count($files['files']['name']);
      for ($i = 0; $i < $fileCount; $i++) {
        if ($files['files']['error'][$i] === UPLOAD_ERR_OK) {
          $tmpName = $files['files']['tmp_name'][$i];
          $name = basename($files['files']['name'][$i]);
          $mime = mime_content_type($tmpName);

          if (!in_array($mime, $audioMimes) && strpos($mime, 'audio/') !== 0) {
            $errors[] = "$name: Not an audio file";
            continue;
          }

          $name = preg_replace('/[^\w\s\-\.\(\)]/', '_', $name);
          $targetPath = $targetDir . '/' . $name;

          if (move_uploaded_file($tmpName, $targetPath)) {
            chmod($targetPath, 0644);
            $uploaded++;
          } else {
            $errors[] = "$name: Upload failed";
          }
        }
      }
    }

    if ($uploaded > 0) {
      return ['success' => true, 'uploaded' => $uploaded, 'errors' => $errors];
    }
    return ['error' => 'No files uploaded', 'errors' => $errors];
  }

  function listFiles ($phash) {
    static $hasInit = false, $command;

    if ($hasInit === false) {
      $prevErrorLevel = error_reporting(E_ALL & ~E_DEPRECATED & ~E_STRICT);
      include_once ELFINDERPHP.'elFinder.class.php';
      include_once ELFINDERPHP.'elFinderVolumeDriver.class.php';
      include_once ELFINDERPHP.'elFinderVolumeLocalFileSystem.class.php';
      error_reporting($prevErrorLevel);

      $opts = array(
        // 'debug' => true,
        'roots' => array(
          array(
            'driver'        => 'LocalFileSystem',   // driver for accessing file system (REQUIRED)
            'path'          => PLAYLISTDIR . '/',        // path to files (REQUIRED)
            'accessControl' => 'access'            // disable and hide dot starting files (OPTIONAL)
          )
        )
      );
      $args = array();
      $command = new elFinder($opts);
      $hasInit = true;
    }

    $args['target'] = $phash;
    $args['tree'] = false;
    $args['init'] = false;

    $dirOpen = $command->exec('open',$args);
    if (array_key_exists('files',$dirOpen)) {
      return array_filter($dirOpen['files'], 'fileIsAudio');
    } else {
      return null;
    }
  }

  function directorySelect($index) {
    global $stored;

    $playList = $stored->list[ $stored->selectedPlayList ];
    $entry = $playList->list[$index];
    $phash = $entry->hash;

    $found = false;

    $dirList = listFiles($phash);

    //Create lastPlay if not existing
    if (!is_object($playList)) {
      debugLog('Playlist is not an object : ' . "\n" . print_r($playList, true));
    }
    if (!is_object($playList->lastPlay ?? null)) {
      debugLog('Playlist->lastPlay is not an object : ' . "\n" . print_r($playList->lastPlay ?? null, true));
    }
    if (!property_exists($playList, 'lastPlay') || !is_object($playList->lastPlay)) {
      $playList->{'lastPlay'} = new stdClass();
    }

    //Create last play directory if not existing for directory
    if (!property_exists($playList->lastPlay, $phash)) {
      $playList->lastPlay->{$phash} = new stdClass();
      $playList->lastPlay->{$phash}->{'hashSelectedLocal'} = '';
      $playList->lastPlay->{$phash}->{'hashSelectedRemote'} = '';
      $playList->lastPlay->{$phash}->{'recentLocal'} = [];
      $playList->lastPlay->{$phash}->{'recentRemote'} = [];
    }

    $dirPlayed = $playList->lastPlay->{$phash};

    if ($dirList && count($dirList) > 0) {
      switch ($entry->how) {
        case 'seq':
          //Search for next entry in list
          reset($dirList);
          foreach ($dirList as $listIndex => $fileItem) {
            if ($dirPlayed->hashSelectedRemote === $fileItem['hash']) {
              $nextFileItem = next($dirList);
              if ($nextFileItem !== false) {
                //Reached end of list?
                if ($nextFileItem['hash'] === $fileItem['hash']) {
                  break;
                } else {
                  $found = true;
                  $entry->hashSelectedRemote = $nextFileItem['hash'];
                  $entry->whatSelectedRemote = $entry->what . '/' . $nextFileItem['name'];
                }
              }
              break;
            }
            //The foreach command by itself doesn't advance the array pointer
            //so mirror foreach action with "next()"
            next($dirList);
          }
          //If nothing found or end of list then go to first entry
          if ($found === false) {
            $nextFileItem = reset($dirList);
            $entry->hashSelectedRemote = $nextFileItem['hash'];
            $entry->whatSelectedRemote = $entry->what . '/' . $nextFileItem['name'];
          }
          break;
        case 'rand':
          if (is_object($dirPlayed) && !property_exists($dirPlayed, 'recentRemote')) {
            $dirPlayed->{'recentRemote'} = [];
          }
          //Clean up junk from deprecated data structure
          if (is_object($dirPlayed) && property_exists($entry, 'recentRemote')) {
              unset($entry->recentRemote);
          }
          //Default pick
          $pick = rand(0, count($dirList) - 1);
          if ((count($dirPlayed->recentRemote) > 0) && ($dirPlayed->hashSelectedRemote !== '' )) {
            while (count($dirPlayed->recentRemote) > (count($dirList) / 2)) {
              array_pop($dirPlayed->recentRemote);
            }
            //Look for match, with iteration cap to prevent infinite loop
            $attempts = 0;
            $maxAttempts = count($dirList) * 2;
            do {
              $found = false;
              $pickedSlice = array_slice($dirList, $pick, 1);
              $newHash = $pickedSlice[0]['hash'];
              foreach ($dirPlayed->recentRemote as $recentHash) {
                 if ($newHash === $recentHash) {
                  $found = true;
                  $pick = rand(0, count($dirList) - 1);
                  break;
                }
              }
              $attempts++;
            } while ($found === true && $attempts < $maxAttempts);
          }
          //Selected entry
          $pickedSlice = array_slice($dirList, $pick, 1);
          $entry->hashSelectedRemote = $pickedSlice[0]['hash'];
          $entry->whatSelectedRemote = $entry->what . '/' . $pickedSlice[0]['name'];
          //Append selected entry to list of recent
          if (!is_array($dirPlayed->recentRemote)) {
            $dirPlayed->recentRemote = [];
          }
          array_unshift($dirPlayed->recentRemote, $dirPlayed->hashSelectedRemote);
          break;
        //Should never default in normal operation
        default:
          $entry->hashSelectedRemote = '';
          $entry->whatSelectedRemote = '';
          break;
      }
    } else {
      $entry->hashSelectedRemote = '';
      $entry->whatSelectedRemote = '';
    }
    $dirPlayed->hashSelectedRemote = $entry->hashSelectedRemote;
  }

  // Query the real duration (seconds) of a media file via mplayer -identify.
  // Used when an entry has no explicit howLong (i.e. "Full"/"0" - plays to the
  // natural end of the file) so the "now playing" UI can still show an accurate
  // countdown. Returns null if the duration could not be determined.
  function getTrackDuration($filePath) {
    $escapedPath = escapeshellarg($filePath);
    $output = exec("mplayer -identify -frames 0 -vo null -ao null $escapedPath 2>/dev/null | grep -m1 -oP 'ID_LENGTH=\K[0-9.]+'");
    if (is_numeric($output)) {
      return (int) round((float)$output);
    }
    return null;
  }

  // Persist state describing what is currently playing in system mode, so the
  // web UI can poll for it (php/tc.php?action=nowPlaying) and show a "now
  // playing" indicator/countdown similar to local (browser) mode.
  function writeNowPlaying($data) {
    file_put_contents(NOWPLAYINGFILE, json_encode($data));
  }

  function clearNowPlaying() {
    if (file_exists(NOWPLAYINGFILE)) {
      unlink(NOWPLAYINGFILE);
    }
  }

  function getNowPlayingStatus() {
    if (!file_exists(NOWPLAYINGFILE)) {
      return ['playing' => false];
    }
    $data = json_decode(file_get_contents(NOWPLAYINGFILE), true);
    if (!is_array($data) || !isset($data['xid']) || !ctype_digit((string)$data['xid'])) {
      clearNowPlaying();
      return ['playing' => false];
    }
    $howLong = $data['howLong'];
    $elapsed = time() - $data['startTime'];

    if ($data['chimeGapScheduled'] ?? false) {
      // The start-chime mplayer process exits almost immediately; the actual wait
      // + end-chime playback happens in a separate detached shell script that we
      // can't track by PID, so fall back to elapsed-time tracking for the whole
      // gap plus the (approximate) end chime length.
      $totalDuration = $howLong + ($data['chimeEndDuration'] ?? 3);
      if ($elapsed >= $totalDuration) {
        clearNowPlaying();
        return ['playing' => false];
      }
    } else {
      exec('ps aux | grep -F -v grep | grep -F -- "-x ' . $data['xid'] . '"', $psOut);
      if (empty($psOut)) {
        clearNowPlaying();
        return ['playing' => false];
      }
    }
    return [
      'playing' => true,
      'what' => $data['what'],
      'startTime' => $data['startTime'],
      'howLong' => $howLong,
      'elapsed' => $elapsed,
      'remaining' => ($howLong !== null) ? max(0, $howLong - $elapsed) : null,
      'volume' => $data['volume'],
      'index' => $data['index']
    ];
  }

  function playEntry ($index) {
    global $stored, $tc;
    $played = 'nothing';

    $entry = $stored->list[ $stored->selectedPlayList ]->list[$index];

    $id = (string)((int)str_replace('.','',microtime(true)) % 4096);

    if (strToLower($entry->what) === 'chime') {
      $entry->whatSelectedRemote = CHIME_START;
      $entry->mime = 'audio/chime';
      $entry->hashSelectedRemote = 'null';
    } else {
      if ($entry->mime === 'directory') {
        //If no selection made from last run then create an initial selection
        if (is_object($entry) && (!property_exists($entry, 'whatSelectedRemote') || ($entry->whatSelectedRemote === '')))  {
          directorySelect($index);
        }
      } else {
        $entry->whatSelectedRemote = $entry->what;
      }
    }

    // Prevent directory traversal
    $realPlaylistDir = realpath(PLAYLISTDIR);
    $requestedFile = realpath(PLAYLISTDIR . '/' . $entry->whatSelectedRemote);
    if ($requestedFile === false || strpos($requestedFile, $realPlaylistDir) !== 0) {
        debugLog("Directory traversal attempt blocked: " . $entry->whatSelectedRemote);
        return 'nothing';
    }

    //Get id of any previously playing instance
    $oldId = exec( 'ps aux | grep -F -v grep | grep -F mplayer | grep -P -o "sid [0-9]+ -x [0-9]+$" | tr -cd "0-9\-"' );
    //Kill any previously playing instance
    if (strlen($oldId) > 1) {
      exec( 'kill $( ps aux | grep -F -v grep | grep -F mplayer | awk \'{print $2}\' )' );
    }
    $audioOutput = getMplayerAudioOutput();
    $chime = str_ends_with($entry->whatSelectedRemote, CHIME_START);
    $result = setPlayerVolumeAndLength($index, true, $id, $oldId, $chime, $audioOutput, '');
    $id = $result['id'];
    //mplayer plays just about anything and is available on Rapberry Pi
    $mplayerPath = escapeshellarg(PLAYLISTDIR . '/' . $entry->whatSelectedRemote);
    $sid = escapeshellarg(explode("-", "$id")[0]);
    $xid = escapeshellarg(explode("-", "$id")[1]);
    // When no ALSA mixer control is available (e.g. PulseAudio), pass volume directly to mplayer
    $volumeFlag = $result['hasMixerControl'] ? '' : '-volume ' . $result['volume'];
    // Use nohup and setsid to fully detach from parent process
    $mplayerCmd = "nohup setsid mplayer $mplayerPath $audioOutput $volumeFlag -vo null -sid $sid -x $xid >/dev/null 2>&1 </dev/null &";
    exec($mplayerCmd);
    debugLog($mplayerCmd);
    $played = $entry->whatSelectedRemote;

    $rawXid = explode("-", "$id")[1];
    $displayName = ($entry->mime === 'audio/chime') ? 'Chime' : basename($entry->whatSelectedRemote);
    $howLongNum = (property_exists($entry, 'howLong') && (intval($entry->howLong) > 0)) ? intval($entry->howLong) : null;
    $duration = $howLongNum ?? getTrackDuration(PLAYLISTDIR . '/' . $entry->whatSelectedRemote);
    // When a Chime entry has an explicit duration, setPlayerVolumeAndLength() schedules the
    // wait + end-chime playback in a separate detached shell script (not this mplayer process),
    // so getNowPlayingStatus() can't rely on this $rawXid staying alive for the whole duration.
    $chimeGapScheduled = $chime && ($howLongNum !== null);
    writeNowPlaying([
      'what' => $displayName,
      'startTime' => time(),
      'howLong' => $duration,
      'volume' => $result['volume'],
      'index' => $index,
      'xid' => $rawXid,
      'chimeGapScheduled' => $chimeGapScheduled,
      'chimeEndDuration' => $chimeGapScheduled ? (getTrackDuration(PLAYLISTDIR . '/' . CHIME_END) ?? 3) : null
    ]);

    if ($entry->mime === 'directory') {
      //Selection for next time
      directorySelect($index);
      $tc->saveStored();
    }
    return ($played);
  }

  function stopPlayer() {
    //Recover initial volume level if player is playing
    $oldId = exec( 'ps aux | grep -F -v grep | grep -F mplayer | grep -P -o "sid [0-9]+ -x [0-9]+$" | tr -cd "0-9\-"');
    $devCardInfo = getDevCardInfo();
    $isMapped = getIsMapped();
    //Kill player if found
    if (strlen($oldId) > 1) {
      exec( 'kill $( ps aux | grep -F -v grep | grep -F mplayer | awk \'{print $2}\' )' );
      //Restore initial level if known
      $initialLevel = -1;
      prepareMixer ($oldId, $devCardInfo, $controlId, $initialLevel, $isMapped);
      if ($initialLevel > 0) {
        exec('amixer ' . $devCardInfo . (($isMapped)?' -M set "' . $controlId . '" -- ' . voltoDb($initialLevel) . 'dB':' cset "' . $controlId . '" ' . $initialLevel));
      }
    }
    clearNowPlaying();
  }

  function checkOsCommands () {
    $flunked = "";
    $os_commands = explode('|', OS_COMMANDS);
    foreach ($os_commands as $command) {
      if (basename(exec('which ' . $command )) !== "$command") {
        debugLog("Required OS command, ' . $command . ', not found");
        $flunked .= ', ' . $command;
      }
    }
    if (strlen($flunked) > 0) {
      die('Required OS command(s) :' . $flunked . ', not found');
    }
  }
  function checkBusyBoxCommands () {
    $flunked = "";
    $busy_commands = explode('|', NO_BUSYBOX_COMMAND);
    foreach ($busy_commands as $command) {
      $which = exec('which ' . $command );
      if (is_link($which) && (readlink($which) == "/bin/busybox")) {
        debugLog("Required OS command, $command, is the Busybox version. GNU version of this command required.");
        $flunked .= ', ' . $command;
      }
    }
    if (strlen($flunked) > 0) {
      die('Required OS command(s) :' . $flunked . ', are Busybox version. The GNU versions (coreutils, grep, procps) are required.');
    }
  }
  function checkPhpExtensions () {
    $flunked = "";
    $extensions = explode('|', PHP_EXTENSIONS);
    foreach ($extensions as $extension) {
      if (!extension_loaded($extension)) {
        debugLog("Required PHP extension, $extension, not loaded");
        $flunked .= ', ' . $extension;
      }
    }
    if (strlen($flunked) > 0) {
      $missing = ltrim($flunked, ', ');
      die('Required PHP extension(s) not installed: ' . $missing . '. Install the matching package(s) and restart php-fpm - on Alpine: "apk add php<version>-<extension>" (e.g. php85-fileinfo); on Debian/Ubuntu: "apt install php-<extension>".');
    }
  }

  function checkDependencies() {
    checkOsCommands();
    checkBusyBoxCommands();
    checkPhpExtensions();
  }
  
  function debugLog($message) {
    if (DEBUG) {
      file_put_contents(DEBUGLOG, $message . "\n", FILE_APPEND);
    }    
  }
  
  function errorLog(Throwable $e) {
    $logEntry = 'File : ' . $e->getFile() . ', Line : ' . $e->getLine() . ', Message : ' . $e->getMessage() . "\n";
    file_put_contents(DEBUGLOG, $logEntry, FILE_APPEND);
  }

  function updateCronJob($enabled) {
    $flagFile = SYSTEMDIR . '/scheduler_enabled';

    if ($enabled) {
      file_put_contents($flagFile, date('c'));
      chmod($flagFile, 0664);
      debugLog("Scheduler enabled");
    } else {
      if (file_exists($flagFile)) {
        unlink($flagFile);
      }
      debugLog("Scheduler disabled");
    }
    return true;
  }
?>
