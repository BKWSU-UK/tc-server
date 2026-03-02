<?php

class TrafficControl {
    private ?stdClass $stored = null;
    private mixed $lockHandle = null;

    public function __construct() {
        if (!defined('SYSTEMDIR')) {
            require_once __DIR__ . '/tc.lib.php';
        }
        $this->setTimezone();
    }

    private function setTimezone(): void {
        $this->loadStored();
        if (isset($this->stored->timezone)) {
            date_default_timezone_set($this->stored->timezone);
        } else {
            date_default_timezone_set("Europe/London");
        }
    }

    public function loadStored(): stdClass {
        if ($this->stored === null) {
            if (file_exists(PERSISTENTFILE)) {
                $content = file_get_contents(PERSISTENTFILE);
                $this->stored = json_decode($content);
            } elseif (file_exists(PERSISTENTFILEDEFAULT)) {
                $content = file_get_contents(PERSISTENTFILEDEFAULT);
                $this->stored = json_decode($content);
            }

            if (!$this->stored) {
                $this->stored = new stdClass();
            }
        }
        return $this->stored;
    }

    public function setStored(stdClass $data): void {
        $this->stored = $data;
    }

    public function saveStored(): void {
        if (!property_exists($this->stored, 'list')) {
            throw new Exception('Tried to write corrupt playlist');
        }
        $json = json_encode($this->stored, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
        if ($json === false) {
            throw new Exception('JSON encoding failed');
        }
        if (file_put_contents(PERSISTENTFILE, $json, LOCK_EX) === false) {
            throw new Exception('Attempt to write playlist file failed');
        }
        chmod(PERSISTENTFILE, 0664);
    }

    public function getLock(string $source): void {
        if (!is_writable(SYSTEMDIR)) {
            throw new Exception('System directory is not writable');
        }

        $this->lockHandle = fopen(PERSISTENTLOCK, 'c');
        if (!$this->lockHandle) {
            throw new Exception('Could not create lock file');
        }

        $startTime = time();
        while (!flock($this->lockHandle, LOCK_EX | LOCK_NB)) {
            if (time() - $startTime > LOCKTIMEOUT) {
                fclose($this->lockHandle);
                throw new Exception('Lock timeout');
            }
            usleep(250000);
        }
        $this->debugLog("Got lock from $source at " . date("Y-m-d h:i:sa"));
    }

    public function releaseLock(string $source): void {
        if ($this->lockHandle) {
            flock($this->lockHandle, LOCK_UN);
            fclose($this->lockHandle);
            $this->lockHandle = null;
            $this->debugLog("Released lock from $source at " . date("Y-m-d h:i:sa"));
        }
    }

    public function debugLog(string $message): void {
        if (DEBUG) {
            file_put_contents(DEBUGLOG, $message . "\n", FILE_APPEND);
        }
    }

    public function findNext(): void {
        $timeNow = time();
        $weekNumber = intval(date('j', $timeNow) / 7) + 1;
        $weekDay = strtolower(date('l', $timeNow));
        $hour = intval(date('G', $timeNow));
        $minute = intval(date('i', $timeNow));
        $bestTime = -1;

        if (isset($this->stored->selectedPlayList) && isset($this->stored->list[$this->stored->selectedPlayList])) {
            $playlist = $this->stored->list[$this->stored->selectedPlayList];
            foreach ($playlist->list as $index => $listItem) {
                if (!property_exists($listItem, 'week') || $listItem->exception === 'never') {
                    continue;
                }

                $dayMatch = (($listItem->week === 'all' || (intval($listItem->week) === $weekNumber)) &&
                            (($listItem->day === 'day') || ($listItem->day === $weekDay)));

                if (($listItem->exception === 'every') !== $dayMatch) {
                    continue;
                }

                $timeBits = explode(':', str_replace(' ', '', $listItem->time));
                $h = intval($timeBits[0]);
                if ($h === 12) {
                    $h = ($timeBits[2] === 'PM') ? 12 : 0;
                } elseif ($timeBits[2] === 'PM') {
                    $h += 12;
                }

                $m = intval($timeBits[1]);
                if ($hour > $h || ($hour === $h && $minute >= $m)) {
                    continue;
                }

                $itemTime = strtotime("$h:$m");
                if ($bestTime === -1 || $itemTime < $bestTime) {
                    $bestTime = $itemTime;
                    $this->stored->nextEventTime = $bestTime;
                    $this->stored->nextEventIndex = $index;
                }
            }
        }
        $this->stored->day = date('w');
    }
}
