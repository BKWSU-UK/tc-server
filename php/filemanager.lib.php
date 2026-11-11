<?php
/*
 * Music file manager: browse, upload (chunked), create folders, rename,
 * delete, download (files and ZIPs of folders) and read media metadata.
 *
 * Every path the client sends is relative to PLAYLISTDIR (Music/). It is
 * validated segment by segment and resolved with realpath(), so nothing
 * outside Music/ can be reached. Dot-files (e.g. Music/.system with the
 * chimes, and in-progress uploads) are hidden and cannot be addressed.
 *
 * Ownership: php-fpm and the scheduler run as the same app user. Items it
 * creates are made owner/group writable and world readable (nginx runs as a
 * different user on Alpine). Items copied in by other users (e.g. root over
 * SSH or Samba) may not be writable by the app; listings flag them, and the
 * root-run ownership fixer installed by deploy.sh/run.sh
 * (FM_OWNERSHIP_FIXER) hands them back to the app user within a minute.
 */

  define('FM_UPLOAD_PREFIX', '.tcupload-');
  define('FM_UPLOAD_MAX_AGE', 86400);          // abandon partial uploads after a day
  define('FM_MAX_CHUNK', 8 * 1024 * 1024);     // client sends 1 MiB; this is a hard cap
  define('FM_INFO_CACHE', SYSTEMDIR . '/mediaInfo.JSON');
  define('FM_INFO_TIMEOUT', 20);               // seconds for one mplayer -identify
  define('FM_ZIP_LIMIT', 0xFFFFFFFF - 1048576); // stay below the 4 GiB ZIP (non-ZIP64) limit
  define('FM_OWNERSHIP_FIXER', '/usr/local/sbin/tc-fix-music-ownership');

  // Extensions of files mplayer can play the audio of. Audio-only formats
  // first, then containers that usually hold video (mplayer plays their
  // audio track; video output is disabled).
  define('FM_AUDIO_EXTENSIONS', [
    'mp3', 'mp2', 'mp1', 'mpa', 'flac', 'wav', 'wave', 'aif', 'aiff', 'aifc',
    'ogg', 'oga', 'opus', 'spx', 'm4a', 'm4b', 'aac', 'adts', 'ac3', 'eac3',
    'dts', 'wma', 'ape', 'wv', 'mpc', 'mp+', 'mka', 'weba', 'amr', 'awb',
    'au', 'snd', 'caf', 'tta', 'ra', 'ram', 'voc', 'w64', 'rf64', 'tak',
    'ofr', 'ofs', 'shn', 'mlp', 'thd', 'dsf', 'dff', 'gsm', 'aa3', 'oma',
  ]);
  define('FM_VIDEO_EXTENSIONS', [
    'mp4', 'm4v', 'mkv', 'webm', 'mov', 'qt', 'avi', 'flv', 'wmv', 'asf',
    'mpg', 'mpeg', 'vob', 'ts', 'm2ts', 'mts', '3gp', '3g2', 'ogv', 'rm',
    'rmvb', 'dv', 'nut',
  ]);

  // ---------------------------------------------------------------- paths

  function fmMusicRoot(): string {
    $root = realpath(PLAYLISTDIR);
    if ($root === false) {
      throw new RuntimeException('The Music folder is missing');
    }
    return $root;
  }

  // A single file/folder name: no separators, NUL or control characters, not
  // hidden, not "." or "..", at most 255 bytes.
  function fmValidName($name): bool {
    return is_string($name)
      && $name !== ''
      && strlen($name) <= 255
      && $name[0] !== '.'
      && !preg_match('/[\/\\\\\x00-\x1F\x7F]/', $name)
      && trim($name) === $name;
  }

  // Validate a relative path ('' is the Music root) and return its segments.
  function fmSegments($rel): ?array {
    if (!is_string($rel)) return null;
    $rel = trim($rel, '/');
    if ($rel === '') return [];
    $parts = explode('/', $rel);
    foreach ($parts as $p) {
      if (!fmValidName($p)) return null;
    }
    return $parts;
  }

  // Resolve a relative path to an absolute one inside Music/. With
  // $mustExist the target must exist and its realpath (after symlinks) must
  // still be inside Music/.
  function fmResolve($rel, bool $mustExist = true): ?string {
    $parts = fmSegments($rel);
    if ($parts === null) return null;
    $root = fmMusicRoot();
    $abs = $root . (count($parts) ? '/' . implode('/', $parts) : '');
    if (!$mustExist) {
      $parent = realpath(dirname($abs));
      if ($parent === false || ($parent !== $root && strpos($parent, $root . '/') !== 0)) return null;
      return $parent . '/' . basename($abs);
    }
    $real = realpath($abs);
    if ($real === false || ($real !== $root && strpos($real, $root . '/') !== 0)) return null;
    return $real;
  }

  function fmRel(string $abs): string {
    $root = fmMusicRoot();
    return $abs === $root ? '' : substr($abs, strlen($root) + 1);
  }

  function fmJoin(string $a, string $b): string {
    return $a === '' ? $b : $a . '/' . $b;
  }

  // The hash elFinder uses for a path relative to Music/ (volume id "l1_"),
  // which playlist entries store in "hash" and lastPlay keys.
  function fmPathHash(string $rel): string {
    $p = $rel === '' ? '/' : $rel;
    return 'l1_' . rtrim(strtr(base64_encode($p), '+/=', '-_.'), '.');
  }

  function fmHashPath(string $hash): ?string {
    if (strpos($hash, 'l1_') !== 0) return null;
    $b = strtr(substr($hash, 3), '-_.', '+/=');
    $b .= str_repeat('=', (4 - strlen($b) % 4) % 4);
    $p = base64_decode($b, true);
    if ($p === false) return null;
    return $p === '/' ? '' : $p;
  }

  // ------------------------------------------------------- identity/perms

  function fmProcessUser(): array {
    static $who = null;
    if ($who === null) {
      $user = trim((string)@exec('id -un 2>/dev/null'));
      $group = trim((string)@exec('id -gn 2>/dev/null'));
      $who = ['user' => $user !== '' ? $user : 'unknown', 'group' => $group !== '' ? $group : 'unknown'];
    }
    return $who;
  }

  function fmOwnerName(int $uid): string {
    if (function_exists('posix_getpwuid')) {
      $pw = @posix_getpwuid($uid);
      if ($pw && isset($pw['name'])) return $pw['name'];
    }
    static $cache = [];
    if (!isset($cache[$uid])) {
      $name = trim((string)@exec('id -un ' . (int)$uid . ' 2>/dev/null'));
      $cache[$uid] = $name !== '' ? $name : (string)$uid;
    }
    return $cache[$uid];
  }

  // True when this process owns the path (needed to chmod it).
  function fmOwnedByMe(string $abs): bool {
    static $myUid = null;
    if ($myUid === null) {
      $myUid = function_exists('posix_geteuid') ? posix_geteuid() : (int)@exec('id -u 2>/dev/null');
    }
    $st = @lstat($abs);
    return $st !== false && $st['uid'] === $myUid;
  }

  // Give an item the modes the app needs: owner/group read-write (and
  // traverse for folders), world readable so nginx can serve it. Only
  // possible for items this process owns; others are left to the fixer.
  function fmNormaliseMode(string $abs): void {
    if (is_link($abs) || !fmOwnedByMe($abs)) return;
    $mode = @fileperms($abs);
    if ($mode === false) return;
    $want = is_dir($abs) ? 0775 : 0664;
    if (($mode & 0777) !== (($mode & 0777) | $want)) {
      @chmod($abs, ($mode & 0777) | $want);
    }
  }

  // The fixer only runs when the kernel's link protections are on (see the
  // script), so only promise automatic fixing when they are.
  function fmFixerInstalled(): bool {
    if (!is_file(FM_OWNERSHIP_FIXER)) return false;
    foreach (['protected_hardlinks', 'protected_symlinks'] as $k) {
      if (trim((string)@file_get_contents("/proc/sys/fs/$k")) !== '1') return false;
    }
    return true;
  }

  // What to tell the user when items aren't manageable by the app.
  function fmPermissionHelp(): array {
    $who = fmProcessUser();
    $root = fmMusicRoot();
    return [
      'user' => $who['user'],
      'group' => $who['group'],
      'autoFix' => fmFixerInstalled(),
      'command' => 'sudo chown -R ' . $who['user'] . ':' . $who['group'] . ' ' . escapeshellarg($root),
    ];
  }

  // Can the app rename or delete $abs (needs write+execute on the parent
  // folder)? For folders, deleting also needs write access to every folder
  // inside it; that is checked separately before deleting.
  function fmCanModify(string $abs): bool {
    $parent = dirname($abs);
    return is_writable($parent) && is_executable($parent);
  }

  // --------------------------------------------------------- media types

  function fmExtension(string $name): string {
    $dot = strrpos($name, '.');
    return $dot === false ? '' : strtolower(substr($name, $dot + 1));
  }

  // 'audio', 'video' (mplayer plays its audio track) or '' (not playable).
  function fmMediaKind(string $name, string $mime = ''): string {
    $ext = fmExtension($name);
    if (in_array($ext, FM_AUDIO_EXTENSIONS, true)) return 'audio';
    if (in_array($ext, FM_VIDEO_EXTENSIONS, true)) return 'video';
    if (strpos($mime, 'audio/') === 0) return 'audio';
    return '';
  }

  // Used by the sound picker and folder playback: anything mplayer can play.
  function fmIsPlayable(string $name, string $mime = ''): bool {
    return fmMediaKind($name, $mime) !== '';
  }

  // ------------------------------------------------------------ metadata

  function fmMplayerIds(string $abs, string $extra = ''): array {
    $cmd = 'timeout ' . FM_INFO_TIMEOUT . ' mplayer ' . $extra . ' -identify -frames 0 -vo null -ao null -nolirc -noautosub '
      . escapeshellarg($abs) . ' 2>/dev/null';
    $lines = [];
    @exec($cmd, $lines);
    $ids = [];
    foreach ($lines as $line) {
      if (strpos($line, 'ID_') !== 0) continue;
      $eq = strpos($line, '=');
      if ($eq === false) continue;
      $ids[substr($line, 3, $eq - 3)] = fmUtf8(substr($line, $eq + 1));
    }
    return $ids;
  }

  // Everything mplayer reports about a file (stream details and tags),
  // topped up where mplayer is blind:
  //   * its native MP3 demuxer ignores ID3v2, so retry with libavformat;
  //   * it never shows Vorbis comments of Ogg streams (Vorbis, Opus, Speex,
  //     Ogg FLAC) or ID3v1, so read those directly.
  function fmIdentify(string $abs): array {
    $ids = fmMplayerIds($abs);
    $demuxer = $ids['DEMUXER'] ?? '';
    if (!isset($ids['CLIP_INFO_N']) && $demuxer !== '' && strpos($demuxer, 'lavf') !== 0) {
      $lavf = fmMplayerIds($abs, '-demuxer lavf');
      foreach ($lavf as $k => $v) {
        if (strpos($k, 'CLIP_INFO_') === 0 || strpos($k, 'CHAPTER') === 0 || !isset($ids[$k]) && $k === 'LENGTH') {
          $ids[$k] = $v;
        }
      }
    }
    $extra = [];
    $ext = fmExtension($abs);
    if (in_array($ext, ['ogg', 'oga', 'ogv', 'opus', 'spx'], true)) {
      $extra = fmReadOggComments($abs);
    }
    if (!isset($ids['CLIP_INFO_N']) || in_array($ext, ['mp3', 'mp2', 'mp1', 'mpa'], true)) {
      $extra = array_merge($extra, fmReadId3v1($abs));
    }
    if ($extra) {
      $n = isset($ids['CLIP_INFO_N']) ? (int)$ids['CLIP_INFO_N'] : 0;
      $have = [];
      for ($i = 0; $i < $n; $i++) $have[strtolower($ids["CLIP_INFO_NAME$i"] ?? '')] = true;
      foreach ($extra as $tag) {
        if (isset($have[strtolower($tag['name'])])) continue;
        $have[strtolower($tag['name'])] = true;
        $ids["CLIP_INFO_NAME$n"] = $tag['name'];
        $ids["CLIP_INFO_VALUE$n"] = $tag['value'];
        $n++;
      }
      $ids['CLIP_INFO_N'] = (string)$n;
    }
    return $ids;
  }

  // Vorbis comments from the first logical stream of an Ogg file: the
  // second packet, reassembled from Ogg pages.
  function fmReadOggComments(string $abs): array {
    $fh = @fopen($abs, 'rb');
    if (!$fh) return [];
    $packets = [];
    $current = '';
    $serial = null;
    $read = 0;
    while (count($packets) < 2 && $read < 8 * 1024 * 1024) {
      $hdr = fread($fh, 27);
      if (strlen($hdr) < 27 || substr($hdr, 0, 4) !== 'OggS') break;
      $pageSerial = unpack('V', substr($hdr, 14, 4))[1];
      $segCount = ord($hdr[26]);
      $segs = fread($fh, $segCount);
      $sizes = array_map('ord', str_split($segs));
      $body = $segCount ? fread($fh, array_sum($sizes)) : '';
      $read += 27 + $segCount + strlen($body);
      if ($serial === null) $serial = $pageSerial;
      if ($pageSerial !== $serial) continue;
      $pos = 0;
      foreach ($sizes as $sz) {
        $current .= substr($body, $pos, $sz);
        $pos += $sz;
        if ($sz < 255) { $packets[] = $current; $current = ''; if (count($packets) >= 2) break; }
      }
    }
    fclose($fh);
    if (count($packets) < 2) return [];
    // The first packet says which codec it is, and so how the comment
    // packet is framed.
    [$head, $p] = $packets;
    if (strncmp($head, "\x01vorbis", 7) === 0 && strncmp($p, "\x03vorbis", 7) === 0) {
      $p = substr($p, 7);
    } elseif (strncmp($head, 'OpusHead', 8) === 0 && strncmp($p, 'OpusTags', 8) === 0) {
      $p = substr($p, 8);
    } elseif (strncmp($head, "\x7FFLAC", 5) === 0 && strlen($p) > 4 && (ord($p[0]) & 0x7F) === 4) {
      $p = substr($p, 4);                       // FLAC VORBIS_COMMENT metadata block
    } elseif (strncmp($head, 'Speex   ', 8) !== 0) {
      return [];                                // Speex: the packet is the bare comment
    }
    return fmParseVorbisComment($p);
  }

  function fmParseVorbisComment(string $p): array {
    $tags = [];
    if (strlen($p) < 8) return $tags;
    $vlen = unpack('V', substr($p, 0, 4))[1];
    $pos = 4 + $vlen;
    if ($pos + 4 > strlen($p)) return $tags;
    $count = unpack('V', substr($p, $pos, 4))[1];
    $pos += 4;
    for ($i = 0; $i < $count && $i < 500 && $pos + 4 <= strlen($p); $i++) {
      $len = unpack('V', substr($p, $pos, 4))[1];
      $pos += 4;
      $c = substr($p, $pos, $len);
      $pos += $len;
      $eq = strpos($c, '=');
      if ($eq === false) continue;
      $name = substr($c, 0, $eq);
      $value = substr($c, $eq + 1);
      if (strcasecmp($name, 'METADATA_BLOCK_PICTURE') === 0 || strcasecmp($name, 'COVERART') === 0) {
        $tags[] = ['name' => 'Cover art', 'value' => 'yes'];
        continue;
      }
      $tags[] = ['name' => strtolower($name), 'value' => fmUtf8($value)];
    }
    return $tags;
  }

  // The 128-byte ID3v1/v1.1 tag at the end of older MP3s (Latin-1 text).
  function fmReadId3v1(string $abs): array {
    $size = @filesize($abs);
    if (!$size || $size < 128) return [];
    $fh = @fopen($abs, 'rb');
    if (!$fh) return [];
    fseek($fh, -128, SEEK_END);
    $t = fread($fh, 128);
    fclose($fh);
    if (strlen($t) !== 128 || substr($t, 0, 3) !== 'TAG') return [];
    $field = function ($off, $len) use ($t) { return trim(fmUtf8(rtrim(substr($t, $off, $len), "\0 "))); };
    $tags = [];
    foreach (['title' => [3, 30], 'artist' => [33, 30], 'album' => [63, 30], 'year' => [93, 4]] as $name => [$off, $len]) {
      $v = $field($off, $len);
      if ($v !== '') $tags[] = ['name' => $name, 'value' => $v];
    }
    if ($t[125] === "\0" && $t[126] !== "\0") {
      $tags[] = ['name' => 'track', 'value' => (string)ord($t[126])];
      $comment = $field(97, 28);
    } else {
      $comment = $field(97, 30);
    }
    if ($comment !== '') $tags[] = ['name' => 'comment', 'value' => $comment];
    return $tags;
  }

  // Tags in older files (e.g. ID3v1) are often Latin-1, not UTF-8.
  function fmUtf8(string $s): string {
    if (mb_check_encoding($s, 'UTF-8')) return $s;
    return mb_convert_encoding($s, 'UTF-8', 'Windows-1252');
  }

  // Turn mplayer's ID_* values into the structure the UI shows. Tags are
  // whatever the file carries (ID3v1/v2, Vorbis comments, APE, MP4/iTunes
  // atoms, ASF/WMA, RIFF INFO, Matroska tags...), passed through unchanged.
  function fmParseIdentify(array $ids): array {
    $tags = [];
    $n = isset($ids['CLIP_INFO_N']) ? (int)$ids['CLIP_INFO_N'] : 0;
    for ($i = 0; $i < max($n, 64); $i++) {
      if (!isset($ids["CLIP_INFO_NAME$i"])) {
        if ($i >= $n) break;
        continue;
      }
      $name = trim($ids["CLIP_INFO_NAME$i"]);
      $value = trim($ids["CLIP_INFO_VALUE$i"] ?? '');
      if ($name === '' || $value === '') continue;
      $tags[] = ['name' => $name, 'value' => $value];
    }
    $chapters = [];
    $nch = isset($ids['CHAPTERS']) ? (int)$ids['CHAPTERS'] : 0;
    for ($i = 0; $i < $nch && $i < 500; $i++) {
      $chapters[] = [
        'start' => isset($ids["CHAPTER_{$i}_START"]) ? (float)$ids["CHAPTER_{$i}_START"] / 1000 : null,
        'name' => $ids["CHAPTER_{$i}_NAME"] ?? '',
      ];
    }
    $audioTracks = [];
    foreach ($ids as $k => $v) {
      if (preg_match('/^AID_(\d+)_(LANG|NAME)$/', $k, $m)) {
        $audioTracks[$m[1]][strtolower($m[2])] = $v;
      }
    }
    $hasAudio = isset($ids['AUDIO_CODEC']) || isset($ids['AUDIO_FORMAT']) || isset($ids['AUDIO_ID']);
    $num = function ($k) use ($ids) {
      return (isset($ids[$k]) && is_numeric($ids[$k]) && (float)$ids[$k] > 0) ? (float)$ids[$k] : null;
    };
    $find = function (array $names) use ($tags) {
      foreach ($tags as $t) {
        if (in_array(strtolower($t['name']), $names, true)) return $t['value'];
      }
      return null;
    };
    return [
      'playable' => $hasAudio,
      'duration' => $num('LENGTH'),
      'container' => $ids['DEMUXER'] ?? null,
      'audio' => $hasAudio ? [
        'codec' => $ids['AUDIO_CODEC'] ?? null,
        'format' => $ids['AUDIO_FORMAT'] ?? null,
        'bitrate' => $num('AUDIO_BITRATE'),
        'sampleRate' => $num('AUDIO_RATE'),
        'channels' => $num('AUDIO_NCH'),
      ] : null,
      'video' => isset($ids['VIDEO_FORMAT']) ? [
        'format' => $ids['VIDEO_FORMAT'],
        'codec' => $ids['VIDEO_CODEC'] ?? null,
        'width' => $num('VIDEO_WIDTH'),
        'height' => $num('VIDEO_HEIGHT'),
        'fps' => $num('VIDEO_FPS'),
        'bitrate' => $num('VIDEO_BITRATE'),
      ] : null,
      'audioTracks' => count($audioTracks),
      'chapters' => $chapters,
      'seekable' => isset($ids['SEEKABLE']) ? $ids['SEEKABLE'] === '1' : null,
      'tags' => $tags,
      'title' => $find(['title', 'name', 'inam']),
      'artist' => $find(['artist', 'author', 'performer', 'album_artist', 'albumartist', 'iart']),
      'album' => $find(['album', 'iprd']),
    ];
  }

  // Cache of parsed metadata, keyed by relative path and invalidated by
  // size+mtime, so each file is only identified once. Changes are written
  // once at the end of the request (fewer SD card writes).
  function &fmInfoCacheData(): array {
    static $cache = null;
    if ($cache === null) {
      $cache = [];
      if (is_file(FM_INFO_CACHE)) {
        $data = json_decode((string)@file_get_contents(FM_INFO_CACHE), true);
        if (is_array($data)) $cache = $data;
      }
    }
    return $cache;
  }

  function fmInfoCacheChanged(): void {
    static $registered = false;
    if ($registered) return;
    $registered = true;
    register_shutdown_function(function () {
      $json = json_encode(fmInfoCacheData(), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
      if ($json === false) return;
      $tmp = FM_INFO_CACHE . '.tmp' . getmypid();
      if (@file_put_contents($tmp, $json) !== false) {
        @rename($tmp, FM_INFO_CACHE);
      } else {
        @unlink($tmp);
      }
    });
  }

  function fmInfoFor(string $abs, bool $compute = true): ?array {
    $rel = fmRel($abs);
    $st = @stat($abs);
    if ($st === false) return null;
    $cache = &fmInfoCacheData();
    $hit = $cache[$rel] ?? null;
    if ($hit && $hit['size'] === $st['size'] && $hit['mtime'] === $st['mtime']) {
      return $hit['info'];
    }
    if (!$compute) return null;
    $info = fmParseIdentify(fmIdentify($abs));
    // Only cache a result mplayer actually produced (a timeout gives nothing).
    if ($info['playable'] || $info['container'] !== null) {
      fmInfoCacheStore($rel, $st, $info);
    }
    return $info;
  }

  function fmInfoCacheStore(string $rel, array $st, array $info): void {
    $cache = &fmInfoCacheData();
    $cache[$rel] = ['size' => $st['size'], 'mtime' => $st['mtime'], 'info' => $info];
    fmInfoCacheChanged();
  }

  // Move or drop cache entries after a rename or delete.
  function fmInfoCacheRewrite(string $fromRel, ?string $toRel): void {
    $cache = &fmInfoCacheData();
    foreach (array_keys($cache) as $k) {
      if ($k === $fromRel || strpos($k, $fromRel . '/') === 0) {
        if ($toRel !== null) $cache[$toRel . substr($k, strlen($fromRel))] = $cache[$k];
        unset($cache[$k]);
        fmInfoCacheChanged();
      }
    }
  }

  // Forget files in $dirRel that no longer exist (e.g. deleted over SSH).
  function fmInfoCachePrune(string $dirRel, array $names): void {
    $cache = &fmInfoCacheData();
    $prefix = $dirRel === '' ? '' : $dirRel . '/';
    $present = array_flip($names);
    foreach (array_keys($cache) as $k) {
      if ($prefix !== '' && strpos($k, $prefix) !== 0) continue;
      $rest = substr($k, strlen($prefix));
      if (strpos($rest, '/') !== false) continue;
      if (!isset($present[$rest])) {
        unset($cache[$k]);
        fmInfoCacheChanged();
      }
    }
  }

  // ------------------------------------------------------------- listing

  function fmItem(string $abs, string $name): array {
    $isLink = is_link($abs);
    $isDir = is_dir($abs);
    $st = @stat($abs);
    $mime = '';
    if (!$isDir && $st !== false && fmMediaKind($name) === '') {
      $mime = (string)@mime_content_type($abs);
    }
    $item = [
      'name' => $name,
      'type' => $isDir ? 'dir' : 'file',
      'size' => ($st !== false && !$isDir) ? $st['size'] : null,
      'mtime' => $st !== false ? $st['mtime'] : null,
      'owner' => $st !== false ? fmOwnerName($st['uid']) : null,
      'mode' => $st !== false ? sprintf('%04o', $st['mode'] & 07777) : null,
      'readable' => is_readable($abs) && (!$isDir || is_executable($abs)),
      'canModify' => fmCanModify($abs),
      'symlink' => $isLink,
    ];
    if ($isDir) {
      $item['canWrite'] = is_writable($abs) && is_executable($abs);
      $count = 0;
      if ($item['readable'] && ($dh = @opendir($abs))) {
        while (($e = readdir($dh)) !== false) {
          if ($e[0] !== '.') $count++;
        }
        closedir($dh);
      }
      $item['count'] = $count;
    } else {
      $item['kind'] = fmMediaKind($name, $mime);
      $item['info'] = $item['kind'] !== '' ? fmInfoFor($abs, false) : null;
    }
    return $item;
  }

  function fmList($rel): array {
    $abs = fmResolve($rel);
    if ($abs === null || !is_dir($abs)) {
      return ['error' => 'Folder not found'];
    }
    if (!is_readable($abs) || !is_executable($abs)) {
      return ['error' => 'The app cannot read this folder', 'permissions' => fmPermissionHelp()];
    }
    fmCleanupUploads($abs);
    $items = [];
    $problems = 0;
    foreach (scandir($abs) ?: [] as $name) {
      if ($name === '' || $name[0] === '.') continue;
      $path = $abs . '/' . $name;
      fmNormaliseMode($path);
      $item = fmItem($path, $name);
      if (!$item['readable'] || !$item['canModify'] || ($item['type'] === 'dir' && !$item['canWrite'])) {
        $problems++;
      }
      $items[] = $item;
    }
    fmInfoCachePrune(fmRel($abs), array_column($items, 'name'));
    usort($items, function ($a, $b) {
      if ($a['type'] !== $b['type']) return $a['type'] === 'dir' ? -1 : 1;
      return strnatcasecmp($a['name'], $b['name']);
    });
    $relClean = fmRel($abs);
    $canWrite = is_writable($abs) && is_executable($abs);
    if (!$canWrite) $problems++;
    $free = @disk_free_space($abs);
    return [
      'path' => $relClean,
      'canWrite' => $canWrite,
      'items' => $items,
      'problems' => $problems,
      'permissions' => fmPermissionHelp(),
      'freeSpace' => $free === false ? null : $free,
    ];
  }

  // Metadata for several files in one folder, computing at most until the
  // time budget runs out (the client asks again for the rest).
  function fmInfoBatch($dirRel, $names): array {
    $dir = fmResolve($dirRel);
    if ($dir === null || !is_dir($dir) || !is_array($names)) return ['error' => 'Folder not found'];
    $start = microtime(true);
    $out = [];
    foreach (array_slice($names, 0, 50) as $name) {
      if (!fmValidName($name)) continue;
      $abs = fmResolve(fmJoin(fmRel($dir), $name));
      if ($abs === null || !is_file($abs) || fmMediaKind($name) === '' && strpos((string)@mime_content_type($abs), 'audio/') !== 0) {
        $out[$name] = null;
        continue;
      }
      $compute = (microtime(true) - $start) < 6;
      $info = fmInfoFor($abs, $compute);
      if ($info === null && !$compute) break;   // out of time; client retries the rest
      $out[$name] = $info;
    }
    return ['info' => $out];
  }

  function fmDetails($rel): array {
    $abs = fmResolve($rel);
    if ($abs === null || $abs === fmMusicRoot()) return ['error' => 'Not found'];
    $item = fmItem($abs, basename($abs));
    $item['path'] = fmRel($abs);
    if ($item['type'] === 'file' && $item['readable']) {
      $item['info'] = fmInfoFor($abs, true);
      $item['mime'] = (string)@mime_content_type($abs);
    } elseif ($item['type'] === 'dir') {
      $item['totalSize'] = 0;
      $item['totalFiles'] = 0;
      fmWalk($abs, function ($p, $isDir) use (&$item) {
        if (!$isDir) { $item['totalFiles']++; $item['totalSize'] += (int)@filesize($p); }
      });
    }
    $item['references'] = fmFindReferences($item['path']);
    $item['permissions'] = fmPermissionHelp();
    return $item;
  }

  // Visit everything under $abs (children before their folder), without
  // following symlinked folders. Hidden items are included.
  function fmWalk(string $abs, callable $fn): void {
    $dh = @opendir($abs);
    if (!$dh) return;
    while (($e = readdir($dh)) !== false) {
      if ($e === '.' || $e === '..') continue;
      $p = $abs . '/' . $e;
      $isDir = is_dir($p) && !is_link($p);
      if ($isDir) fmWalk($p, $fn);
      $fn($p, $isDir);
    }
    closedir($dh);
  }

  // ----------------------------------------------------- playlist references

  // Playlist entries that use a path or anything inside it.
  function fmFindReferences(string $rel): array {
    global $tc;
    $stored = $tc->loadStored();
    $refs = [];
    if (!isset($stored->list) || !is_array($stored->list)) return $refs;
    foreach ($stored->list as $pl) {
      if (!isset($pl->list) || !is_array($pl->list)) continue;
      foreach ($pl->list as $i => $entry) {
        $what = isset($entry->what) ? (string)$entry->what : '';
        if ($what !== '' && ($what === $rel || strpos($what, $rel . '/') === 0)) {
          $refs[] = ['playlist' => (string)($pl->name ?? ''), 'row' => $i + 1, 'time' => (string)($entry->time ?? ''), 'what' => $what];
        }
      }
    }
    return $refs;
  }

  function fmRewritePath(string $p, string $from, string $to): ?string {
    if ($p === $from) return $to;
    if (strpos($p, $from . '/') === 0) return $to . substr($p, strlen($from));
    return null;
  }

  function fmRewriteHash(string $h, string $from, string $to): ?string {
    $p = fmHashPath($h);
    if ($p === null) return null;
    $np = fmRewritePath($p, $from, $to);
    return $np === null ? null : fmPathHash($np);
  }

  // After a rename, point every playlist reference (paths, elFinder hashes
  // and the per-folder play history) at the new location. Runs under the
  // playlist lock. Returns the number of entries changed.
  function fmRewriteReferences(string $from, string $to): int {
    global $tc;
    $tc->getLock('fmRename');
    try {
      $stored = $tc->loadStored();
      $changed = 0;
      if (!isset($stored->list) || !is_array($stored->list)) return 0;
      foreach ($stored->list as $pl) {
        if (isset($pl->list) && is_array($pl->list)) {
          foreach ($pl->list as $entry) {
            $hit = false;
            foreach (['what', 'whatSelectedLocal', 'whatSelectedRemote'] as $f) {
              if (isset($entry->$f) && is_string($entry->$f)) {
                $np = fmRewritePath($entry->$f, $from, $to);
                if ($np !== null) { $entry->$f = $np; $hit = true; }
              }
            }
            foreach (['hash', 'hashSelectedLocal', 'hashSelectedRemote'] as $f) {
              if (isset($entry->$f) && is_string($entry->$f)) {
                $nh = fmRewriteHash($entry->$f, $from, $to);
                if ($nh !== null) { $entry->$f = $nh; $hit = true; }
              }
            }
            if ($hit) $changed++;
          }
        }
        if (isset($pl->lastPlay) && (is_object($pl->lastPlay) || is_array($pl->lastPlay))) {
          $newLast = new stdClass();
          foreach ($pl->lastPlay as $key => $hist) {
            $nk = fmRewriteHash((string)$key, $from, $to) ?? (string)$key;
            if (is_object($hist)) {
              foreach (['hashSelectedLocal', 'hashSelectedRemote'] as $f) {
                if (isset($hist->$f) && is_string($hist->$f)) {
                  $hist->$f = fmRewriteHash($hist->$f, $from, $to) ?? $hist->$f;
                }
              }
              foreach (['recentLocal', 'recentRemote'] as $f) {
                if (isset($hist->$f) && is_array($hist->$f)) {
                  foreach ($hist->$f as $k => $h) {
                    if (is_string($h)) $hist->{$f}[$k] = fmRewriteHash($h, $from, $to) ?? $h;
                  }
                }
              }
            }
            $newLast->{$nk} = $hist;
          }
          $pl->lastPlay = $newLast;
        }
      }
      if ($changed > 0) {
        $tc->setStored($stored);
        $tc->saveStored();
      }
      return $changed;
    } finally {
      $tc->releaseLock('fmRename');
    }
  }

  // ------------------------------------------------------------ changes

  function fmMkdir($dirRel, $name): array {
    if (!fmValidName($name)) return ['error' => 'That is not a valid folder name'];
    $dir = fmResolve($dirRel);
    if ($dir === null || !is_dir($dir)) return ['error' => 'Folder not found'];
    $target = $dir . '/' . $name;
    if (file_exists($target) || is_link($target)) return ['error' => "\"$name\" already exists"];
    if (!is_writable($dir)) return fmPermissionError('create a folder in', $dir, $dir);
    if (!@mkdir($target, 0775)) return ['error' => 'Could not create the folder'];
    @chmod($target, 0775);
    return ['success' => true, 'path' => fmRel($target)];
  }

  function fmRename($rel, $newName): array {
    if (!fmValidName($newName)) return ['error' => 'That is not a valid name'];
    // Resolve without following a final symlink: rename the link itself.
    $abs = fmResolve($rel, false);
    if ($abs === null || (!file_exists($abs) && !is_link($abs))) return ['error' => 'Not found'];
    $target = dirname($abs) . '/' . $newName;
    if ($target === $abs) return ['success' => true, 'path' => fmRel($abs), 'references' => 0];
    // Allow changing only the letter case on case-insensitive filesystems.
    if ((file_exists($target) || is_link($target)) && strcasecmp($target, $abs) !== 0) {
      return ['error' => "\"$newName\" already exists"];
    }
    if (!fmCanModify($abs)) return fmPermissionError('rename', $abs, dirname($abs));
    $from = fmRel($abs);
    if (!@rename($abs, $target)) return ['error' => 'Could not rename'];
    $to = fmRel($target);
    fmInfoCacheRewrite($from, $to);
    $refs = 0;
    try {
      $refs = fmRewriteReferences($from, $to);
    } catch (Throwable $e) {
      return ['success' => true, 'path' => $to, 'references' => 0,
              'warning' => 'Renamed, but playlist entries using it could not be updated: ' . $e->getMessage()];
    }
    return ['success' => true, 'path' => $to, 'references' => $refs];
  }

  function fmDelete($paths): array {
    if (!is_array($paths) || count($paths) === 0) return ['error' => 'Nothing to delete'];
    $targets = [];
    foreach ($paths as $rel) {
      $abs = fmResolve($rel, false);
      if ($abs === null || (!file_exists($abs) && !is_link($abs)) || $abs === fmMusicRoot()) {
        return ['error' => 'Not found: ' . (is_string($rel) ? $rel : '')];
      }
      $targets[] = $abs;
    }
    // Check everything first so a delete never stops half way through.
    $blocked = [];
    foreach ($targets as $abs) {
      if (!fmCanModify($abs)) $blocked[] = fmRel($abs);
      if (is_dir($abs) && !is_link($abs)) {
        if (!is_writable($abs) || !is_executable($abs)) $blocked[] = fmRel($abs);
        fmWalk($abs, function ($p, $isDir) use (&$blocked) {
          if ($isDir && (!is_writable($p) || !is_executable($p))) $blocked[] = fmRel($p);
        });
      }
    }
    if ($blocked) {
      $blocked = array_values(array_unique($blocked));
      return ['error' => 'Some items belong to another user, so the app cannot delete them',
              'blocked' => array_slice($blocked, 0, 10), 'permissions' => fmPermissionHelp()];
    }
    $deleted = 0;
    foreach ($targets as $abs) {
      $rel = fmRel($abs);
      if (is_dir($abs) && !is_link($abs)) {
        fmWalk($abs, function ($p, $isDir) { $isDir ? @rmdir($p) : @unlink($p); });
        $ok = @rmdir($abs);
      } else {
        $ok = @unlink($abs);
      }
      if (!$ok) return ['error' => 'Could not delete "' . basename($abs) . '"', 'deleted' => $deleted];
      fmInfoCacheRewrite($rel, null);
      $deleted++;
    }
    return ['success' => true, 'deleted' => $deleted];
  }

  // $abs is what the user tried to change; $folder is the folder whose
  // ownership prevents it.
  function fmPermissionError(string $what, string $abs, string $folder): array {
    $help = fmPermissionHelp();
    $st = @stat($folder);
    $owner = $st ? fmOwnerName($st['uid']) : 'another user';
    $folderName = fmRel($folder) ?: 'Music';
    return [
      'error' => "The app cannot $what \"" . (fmRel($abs) ?: 'Music') . "\": the folder \"$folderName\" belongs to $owner",
      'permissions' => $help,
    ];
  }

  // ------------------------------------------------------------- uploads

  function fmCleanupUploads(string $dir): void {
    foreach (glob($dir . '/' . FM_UPLOAD_PREFIX . '*') ?: [] as $part) {
      if (@filemtime($part) < time() - FM_UPLOAD_MAX_AGE) @unlink($part);
    }
  }

  // Which of these relative paths (files being uploaded, possibly inside
  // new sub-folders) already exist in the target folder?
  function fmCheckUpload($dirRel, $relPaths): array {
    $dir = fmResolve($dirRel);
    if ($dir === null || !is_dir($dir)) return ['error' => 'Folder not found'];
    if (!is_array($relPaths)) return ['error' => 'Nothing to upload'];
    $exists = [];
    $invalid = [];
    $unplayable = [];
    foreach ($relPaths as $rp) {
      $parts = fmSegments($rp);
      if ($parts === null || count($parts) === 0) { $invalid[] = (string)$rp; continue; }
      if (fmMediaKind(end($parts)) === '') { $unplayable[] = (string)$rp; continue; }
      if (file_exists($dir . '/' . implode('/', $parts))) $exists[] = $rp;
    }
    $free = @disk_free_space($dir);
    return ['exists' => $exists, 'invalid' => $invalid, 'unplayable' => $unplayable,
            'canWrite' => is_writable($dir), 'freeSpace' => $free === false ? null : $free,
            'permissions' => is_writable($dir) ? null : fmPermissionHelp()];
  }

  // Receive one chunk of a file. The request body is the raw chunk; the
  // file is assembled in a hidden .part file next to its destination and
  // renamed into place after the last chunk (so the scheduler never sees a
  // half-written file).
  function fmUploadChunk(array $q): array {
    $dir = fmResolve($q['dir'] ?? null);
    $parts = fmSegments($q['relPath'] ?? null);
    $id = $q['uploadId'] ?? '';
    $offset = filter_var($q['offset'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 0]]);
    $total = filter_var($q['total'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 0]]);
    $conflict = $q['conflict'] ?? 'rename';
    if ($dir === null || !is_dir($dir)) return ['error' => 'Folder not found'];
    if ($parts === null || count($parts) === 0) return ['error' => 'Invalid file name'];
    if (!is_string($id) || !preg_match('/^[a-f0-9]{16,64}$/', $id)) return ['error' => 'Invalid upload id'];
    if ($offset === false || $total === false || $offset > $total) return ['error' => 'Invalid offset'];
    if (!in_array($conflict, ['rename', 'replace', 'skip'], true)) return ['error' => 'Invalid conflict mode'];
    $name = array_pop($parts);
    if (fmMediaKind($name) === '') {
      return ['error' => "\"$name\" is not a sound file the player can play"];
    }

    // Create any sub-folders (folder uploads), making them manageable.
    $target = $dir;
    foreach ($parts as $p) {
      $target .= '/' . $p;
      if (is_link($target)) return ['error' => 'Invalid folder'];
      if (!is_dir($target)) {
        if (!is_writable(dirname($target))) return fmPermissionError('create a folder in', dirname($target), dirname($target));
        if (!@mkdir($target, 0775) && !is_dir($target)) return ['error' => 'Could not create folder "' . $p . '"'];
        @chmod($target, 0775);
      }
    }
    if (!is_writable($target)) return fmPermissionError('upload to', $target, $target);

    // Hidden while incomplete; keeps the real extension so mplayer's format
    // probe works on it.
    $part = $target . '/' . FM_UPLOAD_PREFIX . $id . '.' . fmExtension($name);
    if ($offset === 0) {
      $free = @disk_free_space($target);
      if ($free !== false && $free < $total + 10 * 1024 * 1024) {
        return ['error' => 'Not enough free space for "' . $name . '"'];
      }
      @unlink($part);
    }
    clearstatcache(true, $part);
    $have = is_file($part) ? filesize($part) : 0;
    if ($have !== $offset) {
      // Resume/retry: tell the client where to continue from.
      return ['error' => 'offset', 'expected' => $have];
    }

    $in = fopen('php://input', 'rb');
    $out = fopen($part, $offset === 0 ? 'wb' : 'ab');
    if (!$in || !$out) return ['error' => 'Could not write the upload'];
    $written = 0;
    while (!feof($in)) {
      $buf = fread($in, 65536);
      if ($buf === false) break;
      $written += strlen($buf);
      if ($written > FM_MAX_CHUNK || $offset + $written > $total) {
        fclose($in); fclose($out); @unlink($part);
        return ['error' => 'Upload is larger than expected'];
      }
      if (fwrite($out, $buf) !== strlen($buf)) {
        fclose($in); fclose($out); @unlink($part);
        return ['error' => 'Could not write the upload (disk full?)'];
      }
    }
    fclose($in);
    fclose($out);
    if ($offset + $written < $total) {
      return ['received' => $offset + $written];
    }

    // Last chunk: check mplayer can play it, then move it into place.
    @chmod($part, 0664);
    $info = fmParseIdentify(fmIdentify($part));
    if (!$info['playable']) {
      @unlink($part);
      return ['error' => "\"$name\" does not contain audio the player can play"];
    }
    $final = $target . '/' . $name;
    if (file_exists($final) || is_link($final)) {
      if ($conflict === 'skip') {
        @unlink($part);
        return ['done' => true, 'skipped' => true, 'path' => fmRel($final)];
      }
      if ($conflict === 'rename') {
        $final = fmUniqueName($target, $name);
      } elseif (is_dir($final) && !is_link($final)) {
        @unlink($part);
        return ['error' => "A folder called \"$name\" is in the way"];
      }
    }
    if (!@rename($part, $final)) {
      @unlink($part);
      return ['error' => 'Could not save "' . $name . '"'];
    }
    $st = @stat($final);
    if ($st !== false) fmInfoCacheStore(fmRel($final), $st, $info);
    return ['done' => true, 'path' => fmRel($final)];
  }

  function fmUniqueName(string $dir, string $name): string {
    $dot = strrpos($name, '.');
    $base = $dot > 0 ? substr($name, 0, $dot) : $name;
    $ext = $dot > 0 ? substr($name, $dot) : '';
    for ($i = 2; $i < 1000; $i++) {
      $candidate = "$dir/$base ($i)$ext";
      if (!file_exists($candidate) && !is_link($candidate)) return $candidate;
    }
    return "$dir/$base (" . uniqid() . ")$ext";
  }

  // ----------------------------------------------------------- downloads

  function fmContentDisposition(string $name): string {
    $ascii = preg_replace('/[^\x20-\x7E]|["\\\\]/', '_', $name);
    return 'attachment; filename="' . $ascii . '"; filename*=UTF-8\'\'' . rawurlencode($name);
  }

  function fmSendError(int $code, string $message): void {
    http_response_code($code);
    header('Content-Type: text/plain; charset=utf-8');
    echo $message;
  }

  // Stream a file, or a ZIP of folders/several items, to the browser.
  function fmDownload($paths): void {
    if (!is_array($paths) || count($paths) === 0) { fmSendError(400, 'Nothing to download'); return; }
    $targets = [];
    foreach ($paths as $rel) {
      $abs = fmResolve($rel);
      if ($abs === null || $abs === fmMusicRoot()) { fmSendError(404, 'Not found'); return; }
      $targets[] = $abs;
    }
    @set_time_limit(0);
    // Stream straight through nginx instead of buffering to a temp file.
    header('X-Accel-Buffering: no');
    header('Cache-Control: no-store');
    if (count($targets) === 1 && is_file($targets[0])) {
      $abs = $targets[0];
      if (!is_readable($abs)) { fmSendError(403, 'The app cannot read this file'); return; }
      $mime = (string)@mime_content_type($abs);
      header('Content-Type: ' . ($mime !== '' ? $mime : 'application/octet-stream'));
      header('Content-Disposition: ' . fmContentDisposition(basename($abs)));
      header('Content-Length: ' . filesize($abs));
      while (ob_get_level()) ob_end_clean();
      readfile($abs);
      return;
    }
    $zipName = count($targets) === 1 ? basename($targets[0]) . '.zip' : 'Music.zip';
    fmStreamZip($targets, $zipName);
  }

  // Minimal streaming ZIP writer ("stored": audio is already compressed).
  // Each file's CRC is computed just before it is sent, so data starts
  // flowing immediately and nothing is staged on disk.
  function fmStreamZip(array $targets, string $zipName): void {
    $entries = [];
    foreach ($targets as $abs) {
      $base = basename($abs);
      if (is_dir($abs)) {
        $entries[] = ['abs' => $abs, 'name' => $base . '/', 'dir' => true];
        $collected = [];
        $root = fmMusicRoot();
        fmWalk($abs, function ($p, $isDir) use (&$collected, $abs, $base, $root) {
          $rel = $base . substr($p, strlen($abs));
          if (strpos('/' . $rel, '/.') !== false) return;   // skip hidden items
          if (is_link($p)) {
            // Only include links to files inside Music.
            $real = realpath($p);
            if ($real === false || is_dir($real) || strpos($real, $root . '/') !== 0) return;
          }
          $collected[] = ['abs' => $p, 'name' => $rel . ($isDir ? '/' : ''), 'dir' => $isDir];
        });
        // fmWalk lists children before folders; ZIPs read better parents first.
        usort($collected, function ($a, $b) { return strcmp($a['name'], $b['name']); });
        $entries = array_merge($entries, $collected);
      } else {
        $entries[] = ['abs' => $abs, 'name' => $base, 'dir' => false];
      }
    }
    $total = 22;
    foreach ($entries as &$e) {
      $e['size'] = $e['dir'] ? 0 : (int)@filesize($e['abs']);
      if (!$e['dir'] && !is_readable($e['abs'])) {
        fmSendError(403, 'The app cannot read "' . $e['name'] . '"');
        return;
      }
      $total += 30 + strlen($e['name']) + $e['size'] + 46 + strlen($e['name']);
    }
    unset($e);
    if (count($entries) > 65000 || $total > FM_ZIP_LIMIT) {
      fmSendError(413, 'That is too much to download as one ZIP (over 4 GB or 65,000 files). Download smaller folders.');
      return;
    }

    header('Content-Type: application/zip');
    header('Content-Disposition: ' . fmContentDisposition($zipName));
    header('Content-Length: ' . $total);
    while (ob_get_level()) ob_end_clean();

    $offset = 0;
    $central = '';
    foreach ($entries as $e) {
      $mtime = @filemtime($e['abs']) ?: time();
      [$dosTime, $dosDate] = fmDosTime($mtime);
      $crc = 0;
      if (!$e['dir'] && $e['size'] > 0) {
        $crc = hexdec(hash_file('crc32b', $e['abs']));
      }
      $flags = 0x0800;   // names are UTF-8
      $local = pack('VvvvvvVVVvv', 0x04034b50, 20, $flags, 0, $dosTime, $dosDate,
        $crc, $e['size'], $e['size'], strlen($e['name']), 0) . $e['name'];
      echo $local;
      if (!$e['dir'] && $e['size'] > 0) {
        $fh = @fopen($e['abs'], 'rb');
        $left = $e['size'];
        while ($fh && $left > 0 && !feof($fh)) {
          $buf = fread($fh, min(1048576, $left));
          if ($buf === false || $buf === '') break;
          echo $buf;
          $left -= strlen($buf);
        }
        if ($fh) fclose($fh);
        // Keep the archive consistent if the file shrank while being sent.
        if ($left > 0) echo str_repeat("\0", $left);
      }
      $attr = $e['dir'] ? ((040775 << 16) | 0x10) : (0100664 << 16);
      $central .= pack('VvvvvvvVVVvvvvvVV', 0x02014b50, 0x0314, 20, $flags, 0, $dosTime, $dosDate,
        $crc, $e['size'], $e['size'], strlen($e['name']), 0, 0, 0, 0, $attr, $offset) . $e['name'];
      $offset += strlen($local) + $e['size'];
      if (connection_aborted()) return;
    }
    echo $central;
    echo pack('VvvvvVVv', 0x06054b50, 0, 0, count($entries), count($entries), strlen($central), $offset, 0);
  }

  function fmDosTime(int $ts): array {
    $d = getdate($ts);
    if ($d['year'] < 1980) $d = getdate(mktime(0, 0, 0, 1, 1, 1980));
    return [
      ($d['hours'] << 11) | ($d['minutes'] << 5) | intdiv($d['seconds'], 2),
      (($d['year'] - 1980) << 9) | ($d['mon'] << 5) | $d['mday'],
    ];
  }
