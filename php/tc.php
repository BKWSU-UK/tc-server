<?php
  // Never send PHP errors/notices to the HTTP response — they corrupt JSON AJAX replies.
  // Errors go to the PHP error log; enable the debug flag for detailed logging.
  ini_set('display_errors', 0);
  ini_set('display_startup_errors', 0);
  ini_set('log_errors', 1);
  error_reporting(E_ALL);
  
  define ( 'ELCONNECTOR', 'http://localhost' . dirname(dirname($_SERVER['PHP_SELF'])) . '/elfinder-2.x/php/connector.php');

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
              $stored = $tc->loadStored();
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
              //Item specific
              foreach ($playList->list as $j => $playListItem) {
                    if (isset($newStore->list[$i]->list) && array_key_exists($j, $newStore->list[$i]->list)) {
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
          case 'createFolder':
            if (!clientInSameSubnet()) {
              http_response_code(403);
              header('Content-Type: application/json');
              die(json_encode(['error' => 'Not allowed from WAN']));
            }
            $path = isset($_REQUEST['path']) ? $_REQUEST['path'] : '';
            $name = isset($_REQUEST['name']) ? $_REQUEST['name'] : '';
            header('Content-Type: application/json');
            echo json_encode(createFolder($path, $name));
            break;
          case 'deleteItem':
            if (!clientInSameSubnet()) {
              http_response_code(403);
              header('Content-Type: application/json');
              die(json_encode(['error' => 'Not allowed from WAN']));
            }
            $path = isset($_REQUEST['path']) ? $_REQUEST['path'] : '';
            header('Content-Type: application/json');
            echo json_encode(deleteItem($path));
            break;
          case 'renameItem':
            if (!clientInSameSubnet()) {
              http_response_code(403);
              header('Content-Type: application/json');
              die(json_encode(['error' => 'Not allowed from WAN']));
            }
            $path = isset($_REQUEST['path']) ? $_REQUEST['path'] : '';
            $newName = isset($_REQUEST['newName']) ? $_REQUEST['newName'] : '';
            header('Content-Type: application/json');
            echo json_encode(renameItem($path, $newName));
            break;
          case 'uploadFile':
            if (!clientInSameSubnet()) {
              http_response_code(403);
              header('Content-Type: application/json');
              die(json_encode(['error' => 'Not allowed from WAN']));
            }
            checkPhpExtensions ();
            $path = isset($_REQUEST['path']) ? $_REQUEST['path'] : '';
            header('Content-Type: application/json');
            echo json_encode(uploadFiles($path, $_FILES));
            break;
      case 'time':
            $tc->loadStored();
            header('Content-Type: application/json');
        echo json_encode([date("F j, Y, g:i a", time ()), date_default_timezone_get ()]);
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
