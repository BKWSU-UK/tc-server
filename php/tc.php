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
  if (DEBUG) {
    set_exception_handler('errorLog');
  }
  
  if (isset($_REQUEST['action'])) {
    switch ($_REQUEST['action']) {
      #Store settings sent from client
      case 'store':
        if (!clientInSameSubnet()) {
          //Not on LAN so don't allow saving
          http_response_code(403);
          die('Can not store from WAN');
        }
        checkOsCommands ();
        get_lock('store');
        if (isset($_REQUEST['tcPersistent'])) {
          get_stored();
          find_next();
          $newStore = json_decode(mb_convert_encoding(rawurldecode($_REQUEST['tcPersistent']), 'ISO-8859-1', 'UTF-8'));
          //Preserve item-specific remote items
          if (property_exists($stored, 'list')) {
            //Directory hash specific
            foreach ($stored->list as $i => $playList) {                  
              if (property_exists($playList, 'lastPlay')) {
                foreach ($playList->lastPlay as $j => $lastPlayHash) {
                  if (property_exists($newStore->list[$i], 'list') && array_key_exists($j, $newStore->list[$i]->list)) {
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
                if (property_exists($newStore->list[$i], 'list') && array_key_exists($j, $newStore->list[$i]->list)) {
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
          if (property_exists($stored,'nextEventTime')) {
            @$newStore->nextEventTime = $stored->nextEventTime;
          }
          if (property_exists($stored,'nextEventIndex')) {
            @$newStore->nextEventIndex = $stored->nextEventIndex;
          }
          file_put_contents(PERSISTENTFILE . '_temp', json_encode($newStore, JSON_PRETTY_PRINT));
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
        yield_lock('store');
        break;
      #Load settings and send to client. Use default if none yet stored.
      case 'load':
        if (!clientInSameSubnet()) {
          //Not on LAN so don't allow saving
          http_response_code(403);
          die('Can not load from WAN');
        }
        checkOsCommands ();
        get_lock('load');
        if (file_exists(PERSISTENTFILE)) {
          echo file_get_contents(PERSISTENTFILE);
        } else {
          if (file_exists(PERSISTENTFILEDEFAULT)) {
            echo file_get_contents(PERSISTENTFILEDEFAULT);
          } else {
            echo '';
          }
        }
        yield_lock('load');
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
        echo json_encode(listFiles ($_REQUEST['phash']), JSON_PRETTY_PRINT);
        break;
      #Play a song
      case 'play':
        if (!clientInSameSubnet()) {
          //Not on LAN so don't allow saving
          http_response_code(403);
          die('Can not play song from WAN');
        }
        checkOsCommands ();
        if (isset($_REQUEST['index'])) {
          $index = $_REQUEST['index'];
          
          get_lock('play');
          get_stored ();
          playEntry ($index);
          put_stored();
          yield_lock('play');
        }
        break;
      case 'stop':
        if (!clientInSameSubnet()) {
          //Not on LAN so don't allow saving
          http_response_code(403);
          die('Can not stop song from WAN');
        }
        checkOsCommands ();
        stopPlayer();
        break;
      case 'next':
        if (!clientInSameSubnet()) {
          //Not on LAN so don't allow saving
          http_response_code(403);
          die('Can not find next remote track from WAN');
        }
        checkOsCommands ();
        get_lock('next');
        get_stored ();
        find_next();
        put_stored();
        yield_lock('next');
        break;
      case 'bankhols':
        echo json_encode(calculateBankHolidays(date('Y')));
        break;
      case 'time':
        get_stored();
        echo json_encode([date("F j, Y, g:i a", time ()), date_default_timezone_get ()]);
        break;
      case 'factoryreset':
        if (!clientInSameSubnet() || !sys_writable()) {
          die('Factory reset denied');
        }
        get_lock('factoryreset');
        @unlink(PERSISTENTFILE);
        @unlink(PLAYLOG);
        @unlink(DEBUGLOG);
        yield_lock('factoryreset');
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
  }
  if ($locked) {
    yield_lock('hanging lock');
  }
