<?php
  // Never send PHP errors/notices to the HTTP response — they corrupt JSON AJAX replies.
  // Errors go to the PHP error log; enable the debug flag for detailed logging.
  ini_set('display_errors', 0);
  ini_set('display_startup_errors', 0);
  ini_set('log_errors', 1);
  error_reporting(E_ALL);
  
  include('tc.lib.php');
  require_once('TrafficControl.class.php');
  $tc = new TrafficControl();

  if (DEBUG) {
    set_exception_handler('errorLog');
  }
  
  if (isset($_REQUEST['action'])) {
    try {
        $stored = $tc->loadStored(); // Initialize global variable for procedural functions
    switch ($_REQUEST['action']) {
      #Store settings sent from client
      case 'store':
            $tc->getLock('store');
        if (isset($_REQUEST['tcPersistent'])) {
              $stored = $tc->loadStored(true);
              $newStore = json_decode(rawurldecode($_REQUEST['tcPersistent']));

          //Preserve item-specific remote items
          if (property_exists($stored, 'list')) {
            foreach ($stored->list as $i => $playList) {                  
              if (property_exists($playList, 'lastPlay')) {
                foreach ($playList->lastPlay as $j => $lastPlayHash) {
                      if (isset($newStore->list[$i])) {
                    if(property_exists($lastPlayHash, 'hashSelectedRemote')) {
                          if (!isset($newStore->list[$i]->lastPlay) || !is_object($newStore->list[$i]->lastPlay)) {
                            $newStore->list[$i]->lastPlay = new stdClass();
                          }
                          if (!isset($newStore->list[$i]->lastPlay->{$j})) {
                            $newStore->list[$i]->lastPlay->{$j} = new stdClass();
                          }
                          $newStore->list[$i]->lastPlay->{$j}->hashSelectedRemote = $lastPlayHash->hashSelectedRemote;
                    }
                    if(property_exists($lastPlayHash, 'recentRemote')) {
                          if (!isset($newStore->list[$i]->lastPlay) || !is_object($newStore->list[$i]->lastPlay)) {
                            $newStore->list[$i]->lastPlay = new stdClass();
                          }
                          if (!isset($newStore->list[$i]->lastPlay->{$j})) {
                            $newStore->list[$i]->lastPlay->{$j} = new stdClass();
                          }
                          $newStore->list[$i]->lastPlay->{$j}->recentRemote = $lastPlayHash->recentRemote;
                    }
                  }
                }
              }
              //Item specific. Entries are matched by position, which shifts
              //when rows are added, removed or sorted, so only keep the
              //server's selection if the entry still uses the same file/folder.
              foreach ($playList->list as $j => $playListItem) {
                    if (isset($newStore->list[$i]->list) && array_key_exists($j, $newStore->list[$i]->list)
                        && ($newStore->list[$i]->list[$j]->what ?? null) === ($playListItem->what ?? null)) {
                  if (property_exists($playListItem, 'whatSelectedRemote')) {
                        $newStore->list[$i]->list[$j]->whatSelectedRemote = $playListItem->whatSelectedRemote;
                  }
                  if (property_exists($playListItem, 'hashSelectedRemote')) {
                        $newStore->list[$i]->list[$j]->hashSelectedRemote = $playListItem->hashSelectedRemote;
                  }
                  if (property_exists($playListItem, 'recentRemote')) {
                        $newStore->list[$i]->list[$j]->recentRemote = $playListItem->recentRemote;
                  }
                }
              }
            }
          }          

              $tc->setStored($newStore);

              // Recalculate next event based on new schedule
              $tc->findNext();
              $tc->saveStored();

              $systemEnabled = property_exists($newStore, 'system') && $newStore->system === true;
              $schedulerEnabled = !property_exists($newStore, 'schedulerEnabled') || $newStore->schedulerEnabled === true;
              updateCronJob($systemEnabled && $schedulerEnabled);
        }
            $tc->releaseLock('store');
        break;
      #Load settings and send to client. Use default if none yet stored.
      case 'load':
            $tc->getLock('load');
            $stored = $tc->loadStored();
            header('Content-Type: application/json');
            echo json_encode($stored, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
            $tc->releaseLock('load');
        break;
      #Return default settings to client
      case 'defaults':
        if (file_exists(PERSISTENTFILEDEFAULT)) {
              header('Content-Type: application/json');
          echo file_get_contents(PERSISTENTFILEDEFAULT);
        }
        break;
          #Is client on LAN or WAN?
      case 'lan':
            echo clientInSameSubnet()?'lan':'wan';
        break;
      #List files in directory
      case 'listFiles':
            $phash = $_REQUEST['phash'] ?? '';
            if (!preg_match('/^[a-zA-Z0-9_]+$/', $phash)) {
                header('Content-Type: application/json');
                echo json_encode([]);
                break;
            }
            header('Content-Type: application/json');
            echo json_encode(listFiles ($phash), JSON_PRETTY_PRINT);
        break;
      #Advance directory selection for sequential/random playback
      case 'directorySelect':
            if (!clientInSameSubnet()) {
              http_response_code(403);
              die('Cannot advance directory selection from WAN');
            }
            if (isset($_REQUEST['index'])) {
              $index = (int)$_REQUEST['index'];
              $tc->getLock('directorySelect');
              $stored = $tc->loadStored(true);
              directorySelect($index);
              $tc->saveStored();
              $tc->releaseLock('directorySelect');
            }
            break;
      #Play a song
      case 'play':
        if (!clientInSameSubnet()) {
          http_response_code(403);
          die('Can not play song from WAN');
        }
        checkDependencies();
        if (isset($_REQUEST['index'])) {
              $index = (int)$_REQUEST['index'];
              $tc->getLock('play');
              $tc->loadStored();
          playEntry ($index);
              $tc->saveStored();
              $tc->releaseLock('play');
            }
            break;
          case 'setVolume':
            if (!clientInSameSubnet()) {
              http_response_code(403);
              die('Can not set volume from WAN');
            }
            checkDependencies();
            if (isset($_REQUEST['index'])) {
              $index = (int)$_REQUEST['index'];
              $tc->loadStored();
              if (isset($_REQUEST['volume'])) {
                $stored->list[$stored->selectedPlayList]->list[$index]->volume = (int)$_REQUEST['volume'];
              }
              $oldId = exec('ps aux | grep -F -v grep | grep -F mplayer | grep -P -o "sid [0-9]+ -x [0-9]+$" | tr -cd "0-9\-"');
              setPlayerVolumeAndLength($index, false, '', $oldId, false, getMplayerAudioOutput());
        }
        break;
      case 'stop':
        if (!clientInSameSubnet()) {
          http_response_code(403);
          die('Can not stop song from WAN');
        }
        checkDependencies();
        stopPlayer();
        break;
      #Poll what is currently playing on the system (server-side) player
      case 'nowPlaying':
            header('Content-Type: application/json');
            echo json_encode(getNowPlayingStatus());
        break;
      case 'next':
        if (!clientInSameSubnet()) {
          http_response_code(403);
          die('Can not find next remote track from WAN');
        }
        checkOsCommands ();
        checkBusyBoxCommands ();
        checkPhpExtensions ();
            $tc->getLock('next');
            $tc->loadStored();
            $tc->findNext();
            $tc->saveStored();
            $tc->releaseLock('next');
        break;
      case 'bankhols':
        checkPhpExtensions ();
            header('Content-Type: application/json');
        echo json_encode(calculateBankHolidays(date('Y')));
        break;
          case 'listSounds':
            $oldErrorLevel = error_reporting(E_ERROR | E_PARSE);
            $phash = isset($_REQUEST['phash']) ? $_REQUEST['phash'] : '';
            header('Content-Type: application/json');
            echo json_encode(listAllSounds($phash), JSON_PRETTY_PRINT);
            error_reporting($oldErrorLevel);
            break;
          #Music file manager. Reading is allowed from anywhere (Music is
          #served statically anyway); changes only from the LAN.
          case 'fmList':
          case 'fmInfo':
          case 'fmDetails':
          case 'fmMkdir':
          case 'fmRename':
          case 'fmDelete':
          case 'fmCheckUpload':
          case 'fmUpload':
            $fmAction = $_REQUEST['action'];
            $fmWrite = in_array($fmAction, ['fmMkdir', 'fmRename', 'fmDelete', 'fmCheckUpload', 'fmUpload'], true);
            header('Content-Type: application/json');
            if ($fmWrite && ($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
              http_response_code(405);
              die(json_encode(['error' => 'POST required']));
            }
            // Writes must come from this page's own scripts: a custom header
            // can't be added by another site without a CORS preflight, which
            // the server never grants (blocks CSRF from pages on the LAN).
            if ($fmWrite && ($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '') !== 'XMLHttpRequest') {
              http_response_code(403);
              die(json_encode(['error' => 'Request rejected']));
            }
            if ($fmWrite && !clientInSameSubnet()) {
              http_response_code(403);
              die(json_encode(['error' => 'Files can only be changed from the local network']));
            }
            switch ($fmAction) {
              case 'fmList':        $fmResult = fmList($_REQUEST['path'] ?? ''); break;
              case 'fmInfo':        $fmResult = fmInfoBatch($_REQUEST['path'] ?? '', $_REQUEST['names'] ?? []); break;
              case 'fmDetails':     $fmResult = fmDetails($_REQUEST['path'] ?? ''); break;
              case 'fmMkdir':       $fmResult = fmMkdir($_REQUEST['path'] ?? '', $_REQUEST['name'] ?? ''); break;
              case 'fmRename':      $fmResult = fmRename($_REQUEST['path'] ?? '', $_REQUEST['newName'] ?? ''); break;
              case 'fmDelete':      $fmResult = fmDelete($_REQUEST['paths'] ?? []); break;
              case 'fmCheckUpload': $fmResult = fmCheckUpload($_REQUEST['path'] ?? '', $_REQUEST['files'] ?? []); break;
              case 'fmUpload':      $fmResult = fmUploadChunk($_GET); break;
            }
            if (!clientInSameSubnet() && is_array($fmResult)) {
              unset($fmResult['permissions']);   // don't reveal server paths/users off the LAN
            }
            echo json_encode($fmResult, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
            break;
          case 'fmDownload':
            fmDownload($_REQUEST['paths'] ?? []);
            break;
      case 'time':
            $tc->loadStored();
            header('Content-Type: application/json');
        echo json_encode([date("F j, Y, g:i a", time ()), date_default_timezone_get ()]);
        break;
          #Live Audio: play a UDP stream received on LIVEAUDIO_PORT
          case 'liveAudioStatus':
            header('Content-Type: application/json');
            echo json_encode(getLiveAudioStatus());
            break;
          case 'setLiveAudio':
            if (!clientInSameSubnet()) {
              http_response_code(403);
              header('Content-Type: application/json');
              die(json_encode(['error' => 'Not allowed from WAN']));
            }
            if (!empty($_REQUEST['enabled']) && $_REQUEST['enabled'] !== 'false') {
              checkDependencies();
              file_put_contents(LIVEAUDIO_FLAG, date('c'));
              chmod(LIVEAUDIO_FLAG, 0664);
              ensureLiveAudio();
              // Give the listener a moment to take its lock so the reply shows it running
              for ($i = 0; $i < 20 && !liveAudioRunning(); $i++) {
                usleep(100000);
              }
            } else {
              stopLiveAudio();
            }
            header('Content-Type: application/json');
            echo json_encode(getLiveAudioStatus());
            break;
          case 'setLiveAudioVolume':
            if (!clientInSameSubnet()) {
              http_response_code(403);
              header('Content-Type: application/json');
              die(json_encode(['error' => 'Not allowed from WAN']));
            }
            setLiveAudioVolume((int)($_REQUEST['volume'] ?? LIVEAUDIO_DEFAULT_VOLUME));
            header('Content-Type: application/json');
            echo json_encode(getLiveAudioStatus());
            break;
          case 'audioDevices':
            header('Content-Type: application/json');
            echo json_encode(getAudioDevices());
            break;
          case 'setAudioDevice':
            if (!clientInSameSubnet()) {
              http_response_code(403);
              header('Content-Type: application/json');
              die(json_encode(['error' => 'Not allowed from WAN']));
            }
            $deviceId = isset($_REQUEST['device']) ? $_REQUEST['device'] : 'auto';
            $tc->getLock('setAudioDevice');
            $stored = $tc->loadStored();
            $stored->audioDevice = $deviceId;
            $tc->setStored($stored);
            $tc->saveStored();
            $tc->releaseLock('setAudioDevice');
            header('Content-Type: application/json');
            echo json_encode(['success' => true, 'device' => $deviceId]);
            break;
          case 'getAudioDevice':
            $tc->loadStored();
            $selected = getSelectedAudioDevice();
            $resolved = resolveAudioDevice($selected);
            header('Content-Type: application/json');
            echo json_encode(['device' => $resolved]);
            break;
      case 'factoryreset':
        if (!clientInSameSubnet() || !sys_writable()) {
          die('Factory reset denied');
        }
            $tc->getLock('factoryreset');
            if (file_exists(PERSISTENTFILE)) unlink(PERSISTENTFILE);
            if (file_exists(PLAYLOG)) unlink(PLAYLOG);
            if (file_exists(DEBUGLOG)) unlink(DEBUGLOG);
            clearNowPlaying();
            $tc->releaseLock('factoryreset');
        die('Factory reset done');
        break;
        }
    } catch (Exception $e) {
        errorLog($e);
        http_response_code(500);
        die($e->getMessage());
    }
  }
  if ($tc) {
    $tc->releaseLock('hanging lock');
  }
