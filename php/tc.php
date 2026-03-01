<?php
  ini_set('display_errors',1);
  ini_set('display_startup_errors',1);
  error_reporting(-1);
  
  define ( 'ELCONNECTOR', 'http://localhost' . dirname(dirname($_SERVER['PHP_SELF'])) . '/elfinder-2.x/php/connector.php');

  /**
  * Check if a client IP is in our Server subnet
  *
  * @param string $clientIp
  * @param string $serverIp
  * @return boolean
  */
  function clientInSameSubnet($clientIp=false,$serverIp=false) {
      if (!$clientIp) {
        $clientIp = $_SERVER['REMOTE_ADDR'];
      }
      if (!$serverIp)
          $serverIp = $_SERVER['SERVER_ADDR'];
      //if same then obviously on LAN
      if ($clientIp === $serverIp) return true;
      // Extract mask length from ip addr show
      exec('ip addr show', $ipAddrShow);
      $escapedServerIp = str_replace('.', '\.', $serverIp);
      preg_match_all('/' . $escapedServerIp . '\/[0-9]{1,2}/', implode("\n", $ipAddrShow), $ipMatches);
      if (empty($ipMatches[0])) return false;
      $explodedIpMatches = explode('/', $ipMatches[0][0]);
      $maskLen = $explodedIpMatches[1];
      $mask = -1 << (32 - (int)substr($maskLen, 1));
      //Compare IP addresses though mask
      return ((ip2long($clientIp) & $mask) === (ip2long($serverIp) & $mask));
  }
  
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
              
              // Preserve item-specific remote items
              if (property_exists($stored, 'list')) {
                foreach ($stored->list as $i => $playList) {                  
                  if (property_exists($playList, 'lastPlay')) {
                    foreach ($playList->lastPlay as $j => $lastPlayHash) {
                      if (isset($newStore->list[$i]->list) && array_key_exists($j, $newStore->list[$i]->list)) {
                        if(property_exists($lastPlayHash, 'hashSelectedRemote')) {
                          @$newStore->list[$i]->lastPlay->{$j}->hashSelectedRemote = $lastPlayHash->hashSelectedRemote;
                        }
                        if(property_exists($lastPlayHash, 'recentRemote')) {
                          @$newStore->list[$i]->lastPlay->{$j}->recentRemote = $lastPlayHash->recentRemote;
                        }
                      }
                    }
                  }
                  //Item specific
                  foreach ($playList->list as $j => $playListItem) {
                    if (isset($newStore->list[$i]->list) && array_key_exists($j, $newStore->list[$i]->list)) {
                      if (property_exists($playListItem, 'whatSelectedRemote')) {
                        @$newStore->list[$i]->list[$j]->whatSelectedRemote = $playListItem->whatSelectedRemote;
                      }
                      if (property_exists($playListItem, 'hashSelectedRemote')) {
                        @$newStore->list[$i]->list[$j]->hashSelectedRemote = $playListItem->hashSelectedRemote;
                      }
                      if (property_exists($playListItem, 'recentRemote')) {
                        @$newStore->list[$i]->list[$j]->recentRemote = $playListItem->recentRemote;
                      }
                    }
                  }
                }
              }
              
              // Use the class to save
              $tcReflection = new ReflectionClass($tc);
              $storedProp = $tcReflection->getProperty('stored');
              $storedProp->setAccessible(true);
              $storedProp->setValue($tc, $newStore);
              
              // Recalculate next event based on new schedule
              $tc->findNext();
              $tc->saveStored();
              
              // Update cron job based on system flag
              $systemEnabled = property_exists($newStore, 'system') && $newStore->system === true;
              updateCronJob($systemEnabled);
            }
            $tc->releaseLock('store');
            break;
          #Load settings and send to client. Use default if none yet stored.
          case 'load':
            $tc->getLock('load');
            $stored = $tc->loadStored();
            echo json_encode($stored, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
            $tc->releaseLock('load');
            break;
          #Return default settings to client
          case 'defaults':
            if (file_exists(PERSISTENTFILEDEFAULT)) {
              echo file_get_contents(PERSISTENTFILEDEFAULT);
            }
            break;
          #Is client on LAN or WAN? If system directory not writable then treat as WAN anyway.
          case 'lan':
            echo (clientInSameSubnet() && sys_writable())?'lan':'wan';
            break;
          #List files in directory
          case 'listFiles':
            $phash = $_REQUEST['phash'] ?? '';
            if (!preg_match('/^[a-zA-Z0-9_]+$/', $phash)) {
                echo json_encode([]);
                break;
            }
            echo json_encode(listFiles ($phash), JSON_PRETTY_PRINT);
            break;
          #Play a song
          case 'play':
            if (!clientInSameSubnet()) {
              http_response_code(403);
              die('Can not play song from WAN');
            }
            checkOsCommands ();
            if (isset($_REQUEST['index'])) {
              $index = $_REQUEST['index'];
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
            checkOsCommands ();
            if (isset($_REQUEST['index'])) {
              $index = (int)$_REQUEST['index'];
              $tc->loadStored();
              if (isset($_REQUEST['volume'])) {
                $stored->list[$stored->selectedPlayList]->list[$index]->volume = (int)$_REQUEST['volume'];
              }
              $oldId = @exec('ps aux | grep -F -v grep | grep -F mplayer | grep -P -o "sid [0-9]+ -x [0-9]+$" | tr -cd "0-9\-"');
              setPlayerVolumeAndLength($index, false, '', $oldId, false, getMplayerAudioOutput());
            }
            break;
          case 'stop':
            if (!clientInSameSubnet()) {
              http_response_code(403);
              die('Can not stop song from WAN');
            }
            checkOsCommands ();
            stopPlayer();
            break;
          case 'next':
            if (!clientInSameSubnet()) {
              http_response_code(403);
              die('Can not find next remote track from WAN');
            }
            checkOsCommands ();
            $tc->getLock('next');
            $tc->loadStored();
            $tc->findNext();
            $tc->saveStored();
            $tc->releaseLock('next');
            break;
          case 'bankhols':
            echo json_encode(calculateBankHolidays(date('Y')));
            break;
          case 'listSounds':
            $oldErrorLevel = error_reporting(E_ERROR | E_PARSE);
            $phash = isset($_REQUEST['phash']) ? $_REQUEST['phash'] : '';
            echo json_encode(listAllSounds($phash), JSON_PRETTY_PRINT);
            error_reporting($oldErrorLevel);
            break;
          case 'createFolder':
            if (!clientInSameSubnet()) {
              http_response_code(403);
              die(json_encode(['error' => 'Not allowed from WAN']));
            }
            $path = isset($_REQUEST['path']) ? $_REQUEST['path'] : '';
            $name = isset($_REQUEST['name']) ? $_REQUEST['name'] : '';
            echo json_encode(createFolder($path, $name));
            break;
          case 'deleteItem':
            if (!clientInSameSubnet()) {
              http_response_code(403);
              die(json_encode(['error' => 'Not allowed from WAN']));
            }
            $path = isset($_REQUEST['path']) ? $_REQUEST['path'] : '';
            echo json_encode(deleteItem($path));
            break;
          case 'renameItem':
            if (!clientInSameSubnet()) {
              http_response_code(403);
              die(json_encode(['error' => 'Not allowed from WAN']));
            }
            $path = isset($_REQUEST['path']) ? $_REQUEST['path'] : '';
            $newName = isset($_REQUEST['newName']) ? $_REQUEST['newName'] : '';
            echo json_encode(renameItem($path, $newName));
            break;
          case 'uploadFile':
            if (!clientInSameSubnet()) {
              http_response_code(403);
              die(json_encode(['error' => 'Not allowed from WAN']));
            }
            $path = isset($_REQUEST['path']) ? $_REQUEST['path'] : '';
            echo json_encode(uploadFiles($path, $_FILES));
            break;
          case 'time':
            $tc->loadStored();
            echo json_encode([date("F j, Y, g:i a", time ()), date_default_timezone_get ()]);
            break;
          case 'audioDevices':
            echo json_encode(getAudioDevices());
            break;
          case 'setAudioDevice':
            if (!clientInSameSubnet()) {
              http_response_code(403);
              die(json_encode(['error' => 'Not allowed from WAN']));
            }
            $deviceId = isset($_REQUEST['device']) ? $_REQUEST['device'] : 'auto';
            $tc->getLock('setAudioDevice');
            $stored = $tc->loadStored();
            $stored->audioDevice = $deviceId;
            $tcReflection = new ReflectionClass($tc);
            $storedProp = $tcReflection->getProperty('stored');
            $storedProp->setAccessible(true);
            $storedProp->setValue($tc, $stored);
            $tc->saveStored();
            $tc->releaseLock('setAudioDevice');
            echo json_encode(['success' => true, 'device' => $deviceId]);
            break;
          case 'getAudioDevice':
            $tc->loadStored();
            $selected = getSelectedAudioDevice();
            $resolved = resolveAudioDevice($selected);
            echo json_encode(['device' => $resolved]);
            break;
          case 'factoryreset':
            if (!clientInSameSubnet() || !sys_writable()) {
              die('Factory reset denied');
            }
            $tc->getLock('factoryreset');
            @unlink(PERSISTENTFILE);
            @unlink(PLAYLOG);
            @unlink(DEBUGLOG);
            $tc->releaseLock('factoryreset');
            die('Factory reset done');
            break;
          case 'update':
            if (!clientInSameSubnet() || !sys_writable()) {
              die('Software update denied');
            }
            checkOsCommands ();
            $rootDir = escapeshellarg(ROOTDIR);
            $debugLog = escapeshellarg(DEBUGLOG);
            shell_exec("(cd $rootDir && pwd && svn up) > $debugLog 2>&1 &");
            die('<p>Update requested. Result can be viewed <a href="../.tcsys/debug.log">here</a></p>');
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
