<?php
  define ( 'ELFINDERPHP', dirname(__FILE__) . '/' . '..' . '/' . 'elFinder-2.1.65' . '/' . 'php' . '/');
  define ( 'PLAYLISTDIR', dirname(__FILE__) . '/' . '..' . '/' . 'Music');
  define ( 'SYSTEMDIR', dirname(__FILE__) . '/' . '..' . '/' . '.tcsys');
  define ( 'ROOTDIR', dirname(__FILE__) . '/' . '..' . '/');
  define ( 'PERSISTENTFILE', SYSTEMDIR . '/' . 'playListDb.JSON');
  define ( 'PERSISTENTFILEDEFAULT', SYSTEMDIR . '/' . 'playListDbDefault.JSON');
  define ( 'PERSISTENTLOCK', SYSTEMDIR . '/' . 'playListDb.lock');
  define ( 'PLAYLOG', SYSTEMDIR . '/' . 'played.log');
  define ( 'DEBUGLOG', SYSTEMDIR . '/' . 'debug.log');
  define ( 'DEBUG', file_exists ( SYSTEMDIR . '/' . 'debug' ));
  define ( 'LOCKTIMEOUT', 40);
  define ( 'FADETIMEMS', 3000);
  define ( 'CHIME_START', '.system/Chime_start.flac');
  define ( 'CHIME_END', '.system/Chime_end.flac');
  define ( 'DB_PER_VOL_UNIT', 0.46 );
  define ( 'OS_COMMANDS', 'svn|bc|amixer|mplayer');
  define ( 'CARD_NUM', exec('[ -f /proc/asound/cards ] && grep -F -v "HDMI" /proc/asound/cards | grep -P -o "^[[:space:]]+[0-9]+[[:space:]]+\[" | head -n 1 | tr -dc "0-9" || echo "-1"'));

  //This may be changed by some functions but must be set now
  //to prevent warnings
  date_default_timezone_set ( "Europe/London" );
  
  // Global lock
  $locked = false;
  
  function dump($thingToDump) {
    echo "<pre>\n";
    print_r($thingToDump);
    echo "\n</pre>\n";
  }

  function sys_writable () {
    return is_writable(SYSTEMDIR);
  }


  if (!function_exists('str_ends_with')) {
    function str_ends_with($str, $end) {
      return (@substr_compare($str, $end, -strlen($end))==0);
    }
  }

  function get_lock ($fromWhere) {
    global $locked;
    
    $forced = "";
    
    if (! sys_writable() ) {
      http_response_code(403);
      die('Local system directory, ' . SYSTEMDIR . ', is not writable');
    }
    while (!@mkdir(PERSISTENTLOCK)) {
      if ((time() - filemtime(PERSISTENTLOCK)) > LOCKTIMEOUT) {
        @rmdir(PERSISTENTLOCK);
        $forced = " (forced)";
      } else {
        sleep(1);
      }
    }
    $locked = true;
    debugLog("Got lock from " . $fromWhere . $forced  .  " at " . date("Y-m-d h:i:sa"));
  }

  function yield_lock ($fromWhere) {
    global $locked;
    
    @rmdir(PERSISTENTLOCK);
    $locked = false;
    debugLog("Released lock from " . $fromWhere . " at " . date("Y-m-d h:i:sa"));
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

  $bankHols = Array();

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

  function find_next () {
    global $stored;

    $timeNow = time ();
    $weekNumber = intval(date('j', $timeNow) / 7) + 1;
    $weekDay = strtolower(date('l', $timeNow));
    $hour = intval(date('G', $timeNow));
    $minute = intval(date('i', $timeNow));
    $bestTime = -1;

    //If play list is selected then start
    if (isset($stored->selectedPlayList)) {
      $i = -1;
      foreach($stored->list[$stored->selectedPlayList]->list as $listItem) {
        $i++;

        if (!property_exists($listItem, 'week')) {
          continue;
        }

        //Skip if never playing
        if ($listItem->exception === 'never') {
          continue;
        }

        $dayMatch = (($listItem->week === 'all' || (intval($listItem->week) === $weekNumber)) &&
                  (($listItem->day === 'day') || ($listItem->day === $weekDay)));

        //Skip if wrong day
        if (($listItem->exception === 'every') !== $dayMatch) {
          continue;
        }

        $timeBits = explode(':', str_replace(' ','', $listItem->time));

        //Convert AM/PM + hour to 24 hour
        $timeBits[0] = intval($timeBits[0]);
        if ($timeBits[0] === 12) {
          $timeBits[0] = ($timeBits[2] === 'PM') ? 12 : 0;
        } else {
          if ($timeBits[2] === 'PM') {
            $timeBits[0] += 12;
          }
        }
        //Skip any time that is past now
        if ($hour > $timeBits[0]) {
          continue;
        }
        $timeBits[1] = intval($timeBits[1]);
        if (($hour === $timeBits[0]) && ($minute >= $timeBits[1])) {
          continue;
        }
        $itemTime = strtotime($timeBits[0] . ':' . $timeBits[1]);


        if (($bestTime === -1) || ($itemTime < $bestTime)) {
          $bestTime = $itemTime;
          $stored->nextEventTime = $bestTime;
          $stored->nextEventIndex = $i;
        }
      }
    }
    //Record day
    $stored->day = date('w');
  }

  function set_tz () {
    global $stored;

    date_default_timezone_set ( $stored->timezone );
  }

  function get_stored () {
    global $stored;

    //Only load if not loaded already
    if (!isset($stored)) {
      //Load persistent data
      if (file_exists(PERSISTENTFILE)) {
        $stored = json_decode(file_get_contents(PERSISTENTFILE));
      } elseif (file_exists(PERSISTENTFILEDEFAULT)) {
        $stored = json_decode(file_get_contents(PERSISTENTFILEDEFAULT));
      } else {
        $stored = new stdClass();
      }
    }
    //Always set the time zone at this point
    set_tz();
  }

  function put_stored() {
    global $stored;

    if (!property_exists($stored, 'list')) {
      http_response_code(507);
      trigger_error('Tried to write corrupt playlist', E_USER_ERROR);
      die('Tried to write corrupt playlist');
    }
    file_put_contents(PERSISTENTFILE . '_temp', json_encode($stored, JSON_PRETTY_PRINT));
    if (file_exists(PERSISTENTFILE . '_temp') &&
        property_exists(json_decode(file_get_contents(PERSISTENTFILE . '_temp')), 'list')) {
      rename(PERSISTENTFILE . '_temp', PERSISTENTFILE);
      chmod(PERSISTENTFILE, 0664);
    } else {
      unlink(PERSISTENTFILE . '_temp');
      http_response_code(507);
      trigger_error('Attempt to write new playlist file failed', E_USER_ERROR);
      die('Attempt to write new playlist file failed');
    }
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
  
  function getDevCardInfo() {
    // Get the best candidate for sound card
    if (CARD_NUM != -1) {
      $devCardInfo = "-c " . escapeshellarg(CARD_NUM);
    } else {
      $devCardInfo = (@exec( 'which bluealsa-aplay >/dev/null && bluealsa-aplay -L | grep -Fo headset' ) === 'headset')?' -D bluealsa':'';
    }
    return $devCardInfo;
  }
  function getIsMapped() {
    $devCardInfo = getDevCardInfo();
    $isMapped = (@exec('amixer ' . $devCardInfo . ' -M 2>&1 | grep -Fo invalid') !== 'invalid');
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

  function setPlayerVolumeAndLength ($index, $setLength, $id, $oldId, $chime, $alsa, $blue) {
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
    if (strlen($controlId) > 1) {
      $escapedControlId = escapeshellarg($controlId);
      if ($isMapped) {
        $command = 'amixer ' . $devCardInfo . ' -M set ' . $escapedControlId . ' -- ' . voltoDb($combinedVolume) . 'dB >/dev/null 2>&1';
      } else {
        $command = 'amixer ' . $devCardInfo . ' cset ' . $escapedControlId . ' ' . $combinedLogVolume . '% >/dev/null 2>&1';
      }
      debugLog($command);
      exec ($command);      
      //Program music playing time and fade if set
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
            $command .= "mplayer $chimeEnd $alsa $blue -vo null";
          } else {
            //dash/bash script to wait for end to music then start fade then kill the music
            //Do not act if different id playing at time of end of song
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
          }
          $command .= "\n) >/dev/null 2>&1 &";
          debugLog($command);
          exec ($command);
        }
      }
    }
    return $initialLevel . '-' . $id;
  }

  function fileIsAudio ($file) {
    return (strpos($file['mime'], 'audio') !== false);
  }

  function listFiles ($phash) {
    static $hasInit = false, $command;

    if ($hasInit === false) {
      include_once ELFINDERPHP.'elFinder.class.php';
      include_once ELFINDERPHP.'elFinderVolumeDriver.class.php';
      include_once ELFINDERPHP.'elFinderVolumeLocalFileSystem.class.php';

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
    if (gettype($playList) !== 'object') {
      debugLog('Playlist is not an object : ' . "\n" . print_r($playList, true));
    }
    if (gettype($playList->lastPlay) !== 'object') {
      debugLog('Playlist->lastPlay is not an object : ' . "\n" . print_r($playList->lastPlay, true));
    }
    if ((gettype($playList->lastPlay) !== 'object') || !property_exists($playList, 'lastPlay')) {
      $playList->{'lastPlay'} = new stdClass();
    }

    //Create last play directory if not existing for directory
    if (!property_exists($playList->lastPlay, $phash)) {
      $playList->lastPlay->{$phash} = new stdClass();
      $playList->lastPlay->{$phash}->{'hashSelectedLocal'} = '';
      $playList->lastPlay->{$phash}->{'hashSelectedRemote'} = '';
      $playList->lastPlay->{$phash}->{'recentLocal'} = Array();
      $playList->lastPlay->{$phash}->{'recentRemote'} = Array();
    }

    $dirPlayed = $playList->lastPlay->{$phash};

    if (count($dirList) > 0) {
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
          if ((gettype($dirPlayed) === 'object') && !property_exists($dirPlayed, 'recentRemote')) {
            $dirPlayed->{'recentRemote'} = Array ();
          }
          //Clean up junk from deprecated data structure
          if ((gettype($dirPlayed) === 'object') && property_exists($entry, 'recentRemote')) {
              unset($entry->recentRemote);
          }
          //Default pick
          $pick = rand(0, count($dirList) - 1);
          if ((count($dirPlayed->recentRemote) > 0) && ($dirPlayed->hashSelectedRemote !== '' )) {
            while (count($dirPlayed->recentRemote) > (count($dirList) / 2)) {
              array_pop($dirPlayed->recentRemote);
            }
            //Look for match
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
            } while ($found === true);
          }
          //Selected entry
          $pickedSlice = array_slice($dirList, $pick, 1);
          $entry->hashSelectedRemote = $pickedSlice[0]['hash'];
          $entry->whatSelectedRemote = $entry->what . '/' . $pickedSlice[0]['name'];
          //Append selected entry to list of recent
          if (!is_array($dirPlayed->recentRemote)) {
            $dirPlayed->recentRemote = Array();
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

  function playEntry ($index) {
    global $stored;
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
        if ((gettype($entry) === 'object') && (!property_exists($entry, 'whatSelectedRemote') || ($entry->whatSelectedRemote === '')))  {
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
    $oldId = @exec( 'ps aux | grep -F -v grep | grep -F mplayer | grep -P -o "sid [0-9]+ -x [0-9]+$" | tr -cd "0-9\-"' );
    //Kill any previously playing instance
    if (strlen($oldId) > 1) {
      @exec( 'kill $( ps aux | grep -F -v grep | grep -F mplayer | awk \'{print $2}\' )' );
    }
    $blue = (@exec( 'which bluealsa-aplay >/dev/null && bluealsa-aplay -L | grep -Fo headset' ) === 'headset')?' -ao alsa:device=bluealsa':'';
    $alsa = (CARD_NUM > 0)?'-ao alsa:device=hw=' . escapeshellarg(CARD_NUM):'';
    $chime = str_ends_with($entry->whatSelectedRemote, CHIME_START);
    $id = setPlayerVolumeAndLength($index, true, $id, $oldId, $chime, $alsa, $blue);
    //mplayer plays just about anything and is available on Rapberry Pi
    $mplayerPath = escapeshellarg(PLAYLISTDIR . '/' . $entry->whatSelectedRemote);
    $sid = escapeshellarg(explode("-", "$id")[0]);
    $xid = escapeshellarg(explode("-", "$id")[1]);
    exec( "mplayer $mplayerPath $alsa $blue -vo null -sid $sid -x $xid >/dev/null 2>&1 &");
    debugLog("mplayer $mplayerPath $alsa $blue -vo null -sid $sid -x $xid");
    $played = $entry->whatSelectedRemote;

    if ($entry->mime === 'directory') {
      //Selection for next time
      directorySelect($index);
      put_stored ();
    }
    return ($played);
  }

  function stopPlayer() {
    //Recover initial volume level if player is playing
    $oldId = @exec( 'ps aux | grep -F -v grep | grep -F mplayer | grep -P -o "sid [0-9]+ -x [0-9]+$" | tr -cd "0-9\-"');
    $devCardInfo = getDevCardInfo();
    $isMapped = getIsMapped();
    //Kill player if found
    if (strlen($oldId) > 1) {
      @exec( 'kill $( ps aux | grep -F -v grep | grep -F mplayer | awk \'{print $2}\' )' );
      //Restore initial level if known
      $initialLevel = -1;
      prepareMixer ($oldId, $devCardInfo, $controlId, $initialLevel, $isMapped);
      if ($initialLevel > 0) {
        @exec('amixer ' . $devCardInfo . (($isMapped)?' -M set "' . $controlId . '" -- ' . voltoDb($initialLevel) . 'dB':' cset "' . $controlId . '" ' . $initialLevel));
      }
    }
  }

  function checkOsCommands () {
    $flunked = "";
    $os_commands = explode('|', OS_COMMANDS);
    foreach ($os_commands as $command) {
      if (basename(@exec('which ' . $command )) !== "$command") {
        debugLog("Required OS command, ' . $command . ', not found");
        $flunked .= ', ' . $command;
      }
    }
    if (strlen($flunked) > 0) {
      die('Required OS command(s)' . $flunked . ', not found');
    }
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
?>
