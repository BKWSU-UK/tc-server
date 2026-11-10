<?php
  // Live Audio listener.
  //
  // Runs detached (started by ensureLiveAudio() from the UI or cron) for as long
  // as the LIVEAUDIO_FLAG file exists. It binds the Live Audio UDP port itself and
  // pipes the received packets into mplayer's stdin, rather than letting mplayer
  // open udp:// directly, because:
  //  - mplayer never exits when a UDP stream stops (it holds the audio device
  //    forever), and its output can't reliably tell a stopped stream from a
  //    playing one. Here we know exactly when packets stop: after
  //    SILENCE_SECONDS we close mplayer's stdin, it plays out its buffer and exits.
  //  - While idle nothing but this process runs: no CPU use, audio device free.
  //
  // When a stream starts, any scheduled playback is stopped before mplayer has
  // buffered enough to open the audio device, and LIVEAUDIO_RECEIVING stops new
  // entries playing until the stream ends.

  chdir(realpath(dirname(__FILE__)));
  require_once('tc.lib.php');
  require_once('TrafficControl.class.php');

  const SILENCE_SECONDS = 3;            // No packets for this long = stream ended
  const DRAIN_SECONDS = 15;             // Max time for mplayer to play out its buffer after the stream ends
  const TAKEOVER_BYTES = 8192;          // Data needed before treating packets as a stream (ignores strays)
  const SETTINGS_REFRESH_SECONDS = 30;

  // Single instance: the lock is held for the life of this process.
  // 'e' = close-on-exec, so mplayer does not inherit (and keep holding) the lock.
  $lockHandle = fopen(LIVEAUDIO_LOCK, 'ce');
  if (!$lockHandle || !flock($lockHandle, LOCK_EX | LOCK_NB)) {
    exit(0);
  }
  file_put_contents(LIVEAUDIO_PID, getmypid());

  // Command FIFO for mplayer. We keep it open read-write ourselves so mplayer
  // never sees end-of-file when a writer (setLiveAudioVolume()) closes it.
  @unlink(LIVEAUDIO_FIFO);
  if (function_exists('posix_mkfifo')) {
    posix_mkfifo(LIVEAUDIO_FIFO, 0660);
  } else {
    exec('mkfifo -m 660 ' . escapeshellarg(LIVEAUDIO_FIFO));
  }
  $fifoHandle = @fopen(LIVEAUDIO_FIFO, 'r+e');

  $stored = null;
  $audioOutput = '';
  $settingsLoadedAt = 0;

  // Re-read settings so a change of audio output device is picked up
  function refreshSettings(): void {
    global $stored, $audioOutput, $settingsLoadedAt;
    if (time() - $settingsLoadedAt < SETTINGS_REFRESH_SECONDS) {
      return;
    }
    $tc = new TrafficControl();
    $stored = $tc->loadStored();
    $audioOutput = getMplayerAudioOutput();
    $settingsLoadedAt = time();
  }

  function setReceiving(bool $receiving): void {
    if ($receiving) {
      touch(LIVEAUDIO_RECEIVING);
      debugLog('Live Audio: receiving stream, stopping any scheduled playback');
      stopPlayer();
    } else {
      @unlink(LIVEAUDIO_RECEIVING);
      debugLog('Live Audio: stream ended');
    }
  }

  function startPlayer(): ?array {
    global $audioOutput;
    refreshSettings();
    // LIVEAUDIO_URL is only a marker on the command line so killLiveAudioPlayers()
    // can find these processes; mplayer reads the stream from stdin ('-').
    // -demuxer lavf: mplayer's own format probing never completes on a real-time
    // stream (it waits forever with "Cache empty"); libavformat's does.
    // -afm ffmpeg,: prefer FFmpeg's decoders. mplayer's mpg123 decoder glitches on
    // MP3 packets from the libavformat MPEG-TS demuxer (e.g. ffmpeg -f mpegts);
    // the trailing comma falls back to other decoders for formats FFmpeg can't do.
    // -softvol: volume is applied in software, so it works the same on ALSA and
    // PulseAudio and leaves the hardware mixer level used by playlist entries alone.
    // -input file: volume changes from the UI arrive through LIVEAUDIO_FIFO.
    $command = 'exec mplayer -quiet -cache 256 -demuxer lavf -afm ffmpeg, ' . $audioOutput . ' -vo null'
      . ' -softvol -softvol-max 100 -volume ' . liveAudioGain(getLiveAudioVolume())
      . ' -input file=' . escapeshellarg(LIVEAUDIO_FIFO)
      . ' -title ' . escapeshellarg(LIVEAUDIO_URL) . ' -';
    $process = proc_open($command, [0 => ['pipe', 'r'], 1 => ['file', '/dev/null', 'w'], 2 => ['file', '/dev/null', 'w']], $pipes);
    if (!is_resource($process)) {
      debugLog('Live Audio: failed to start mplayer');
      return null;
    }
    stream_set_blocking($pipes[0], false);
    return ['process' => $process, 'stdin' => $pipes[0], 'bytes' => 0, 'receiving' => false];
  }

  // Close mplayer's input so it plays out what it has buffered, then make sure it is gone
  function closePlayer(array &$player, bool $drain): void {
    if ($player['stdin']) {
      fclose($player['stdin']);
      $player['stdin'] = null;
    }
    $deadline = microtime(true) + ($drain ? DRAIN_SECONDS : 0);
    while (proc_get_status($player['process'])['running'] && microtime(true) < $deadline && liveAudioEnabled()) {
      usleep(100000);
    }
    if (proc_get_status($player['process'])['running']) {
      proc_terminate($player['process']);
    }
    proc_close($player['process']);
    killLiveAudioPlayers();  // mplayer's cache child process
    if ($player['receiving']) {
      setReceiving(false);
    }
  }

  // Bind the port, retrying if it is still held (e.g. by a crashed listener's mplayer)
  $socket = false;
  while (liveAudioEnabled() && !$socket) {
    $socket = @stream_socket_server(LIVEAUDIO_URL, $errno, $errstr, STREAM_SERVER_BIND);
    if (!$socket) {
      debugLog("Live Audio: cannot bind " . LIVEAUDIO_URL . " ($errstr), retrying");
      killLiveAudioPlayers();
      sleep(2);
    }
  }

  if ($socket) {
    debugLog('Live Audio: listener running on ' . LIVEAUDIO_URL);
    $player = null;
    $lastData = 0;

    while (liveAudioEnabled()) {
      $read = [$socket];
      $write = $except = null;
      if (stream_select($read, $write, $except, 0, 500000) > 0) {
        $packet = stream_socket_recvfrom($socket, 65535);
        if ($packet !== false && $packet !== '') {
          $lastData = microtime(true);
          if ($player === null) {
            $player = startPlayer();
          }
          if ($player !== null) {
            // Non-blocking: if mplayer can't keep up, drop the packet rather than stall
            @fwrite($player['stdin'], $packet);
            $player['bytes'] += strlen($packet);
            if (!$player['receiving'] && $player['bytes'] >= TAKEOVER_BYTES) {
              $player['receiving'] = true;
              setReceiving(true);
            }
          }
        }
      }
      if ($player !== null) {
        if (!proc_get_status($player['process'])['running']) {
          // mplayer gave up (e.g. data it couldn't decode); start afresh on the next packet
          closePlayer($player, false);
          $player = null;
        } elseif (microtime(true) - $lastData > SILENCE_SECONDS) {
          closePlayer($player, true);
          $player = null;
        }
      }
    }

    if ($player !== null) {
      closePlayer($player, false);
    }
    fclose($socket);
  }

  if ($fifoHandle) {
    fclose($fifoHandle);
  }
  @unlink(LIVEAUDIO_FIFO);
  @unlink(LIVEAUDIO_RECEIVING);
  @unlink(LIVEAUDIO_PID);
  debugLog('Live Audio: listener exited');
  flock($lockHandle, LOCK_UN);
  fclose($lockHandle);
