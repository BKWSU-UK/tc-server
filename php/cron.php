<?php

  //Make sure we are in the right directory to start with
  chdir(realpath(dirname(__FILE__)));

  include('tc.lib.php');

  checkOsCommands ();
  
  function next_and_store() {
    global $stored;

    find_next();
    put_stored();
  }
  if (DEBUG) {
    set_exception_handler('errorLog');
  }
  get_lock ('cron');
  get_stored ();

  if (property_exists($stored, 'nextEventTime') && ($stored->system === true)) {
    if (DEBUG) {
        $logEntry = "Comparing time " . date('G:i') . " with " . date('G:i', $stored->nextEventTime) . "\n";
        file_put_contents(DEBUGLOG, $logEntry,FILE_APPEND);
    }
    if (date('G:i') === date('G:i', $stored->nextEventTime)) {
      $played = playEntry($stored->nextEventIndex);
      $logEntry = "Played \"" . $played . "\" for index " . $stored->nextEventIndex . " at " . date('r');
      @exec('if [ $( wc -l "' . DEBUGLOG . '" | awk \'{print $1}\' ) -gt 1100 ]; then tail -n 1000 "' . DEBUGLOG . '" >"' . DEBUGLOG . '_temp"; mv -f "' . DEBUGLOG . '_temp" "' . DEBUGLOG . '"; fi');
      @exec('if [ $( wc -l "' . DEBUGLOG . '" | awk \'{print $1}\' ) -gt 1100 ]; then tail -n 1000 "' . DEBUGLOG . '" >"' . DEBUGLOG . '_temp"; mv -f "' . DEBUGLOG . '_temp" "' . DEBUGLOG . '"; fi');
      next_and_store();
      $logEntry .= ", next due : " . date('G:i', $stored->nextEventTime) . "\n";
      file_put_contents(DEBUGLOG, $logEntry, FILE_APPEND);
    } else {
      //Force refresh at the start of each day
      if (DEBUG && property_exists($stored, 'day')) {
        $logEntry = "Comparing day " . date('w') . " with " . $stored->day . "\n";
        file_put_contents(DEBUGLOG, $logEntry,FILE_APPEND);
      }
      if (!property_exists($stored, 'day') || ($stored->day !== date('w'))) {
        next_and_store();
      }
    }
  } else {
    next_and_store();
  }
  yield_lock('cron');
?>
