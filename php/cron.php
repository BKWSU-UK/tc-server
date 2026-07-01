<?php

  //Make sure we are in the right directory to start with
  chdir(realpath(dirname(__FILE__)));

  require_once('TrafficControl.class.php');
  $tc = new TrafficControl();

  // Check if scheduler is enabled via flag file
  if (!file_exists(SYSTEMDIR . '/scheduler_enabled')) {
    exit(0);
  }

  checkDependencies();
  
  function next_and_store() {
    global $tc;
    $tc->findNext();
    $tc->saveStored();
  }

  if (DEBUG) {
    set_exception_handler('errorLog');
  }

  try {
    $tc->getLock('cron');
    $stored = $tc->loadStored(); // Initialize global variable for procedural functions

    if (property_exists($stored, 'nextEventTime') && ($stored->system === true) && (!property_exists($stored, 'schedulerEnabled') || $stored->schedulerEnabled === true)) {
    if (DEBUG) {
          $logEntry = "Comparing time " . time() . " with event time " . $stored->nextEventTime . " (diff " . abs(time() - $stored->nextEventTime) . "s)\n";
          $tc->debugLog($logEntry);
    }
      if (abs(time() - $stored->nextEventTime) < 30) {
      $played = playEntry($stored->nextEventIndex);
      $logEntry = "Played \"" . $played . "\" for index " . $stored->nextEventIndex . " at " . date('r');
        if (DEBUG && file_exists(DEBUGLOG) && filesize(DEBUGLOG) > 0) {
            exec('if [ $( wc -l ' . escapeshellarg(DEBUGLOG) . ' | awk \'{print $1}\' ) -gt 1100 ]; then tail -n 1000 ' . escapeshellarg(DEBUGLOG) . ' >' . escapeshellarg(DEBUGLOG . '_temp') . '; mv -f ' . escapeshellarg(DEBUGLOG . '_temp') . ' ' . escapeshellarg(DEBUGLOG) . '; fi');
        }
      next_and_store();
      $logEntry .= ", next due : " . date('G:i', $stored->nextEventTime) . "\n";
        $tc->debugLog($logEntry);
    } else {
      //Force refresh at the start of each day
      if (DEBUG && property_exists($stored, 'day')) {
        $logEntry = "Comparing day " . date('w') . " with " . $stored->day . "\n";
          $tc->debugLog($logEntry);
      }
      if (!property_exists($stored, 'day') || ($stored->day !== date('w'))) {
        next_and_store();
      }
    }
  } else {
    next_and_store();
  }
    $tc->releaseLock('cron');
  } catch (Exception $e) {
    $tc->debugLog('Cron error: ' . $e->getMessage() . ' in ' . $e->getFile() . ' line ' . $e->getLine());
    $tc->releaseLock('cron error');
  }
?>
