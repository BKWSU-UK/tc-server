"use strict";

// Music file manager: a modal for browsing Music/, uploading files and
// folders (chunked, so any size works), creating folders, renaming,
// deleting, downloading (single files directly, folders/selections as ZIP)
// and inspecting the metadata mplayer reads from each file.
// Server side: php/filemanager.lib.php via php/tc.php?action=fm*.
TC.fm = (() => {
  const fm = {};
  const API = 'php/tc.php';
  const CHUNK = 1024 * 1024;        // stays under PHP's default 2 MB post limits
  const INFO_BATCH = 10;

  fm.path = '';                     // current folder, relative to Music/
  fm.items = [];
  fm.selected = new Set();
  fm.generation = 0;                // bumped on every navigation; stale replies are ignored
  fm.uploading = null;              // {cancelled, abort} while an upload runs
  fm.detailsPath = null;
  fm.filter = '';

  // ------------------------------------------------------------ helpers

  const esc = (s) => TC.escapeHtml(s === null || s === undefined ? '' : String(s));
  const join = (a, b) => (a ? a + '/' + b : b);
  const musicUrl = (rel) => 'Music/' + rel.split('/').map(encodeURIComponent).join('/');

  fm.formatSize = function (bytes) {
    if (bytes === null || bytes === undefined) return '';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let n = bytes, u = 0;
    while (n >= 1024 && u < units.length - 1) { n /= 1024; u++; }
    return (u === 0 ? n : n.toFixed(n < 10 ? 1 : 0)) + ' ' + units[u];
  };

  fm.formatDuration = function (sec) {
    if (!sec && sec !== 0) return '';
    sec = Math.round(sec);
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    const ss = String(s).padStart(2, '0');
    return h ? h + ':' + String(m).padStart(2, '0') + ':' + ss : m + ':' + ss;
  };

  fm.formatDate = function (ts) {
    if (!ts) return '';
    return new Date(ts * 1000).toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  };

  // Playlist entries (from the client's copy of the playlists) that use a
  // path or anything inside it.
  fm.referencesTo = function (rel) {
    const refs = [];
    (TC.stored.list || []).forEach(function (pl) {
      (pl.list || []).forEach(function (entry, i) {
        const what = entry.what || '';
        if (what === rel || what.indexOf(rel + '/') === 0) {
          refs.push({ playlist: pl.name, row: i + 1, time: entry.time });
        }
      });
    });
    return refs;
  };

  fm.describeRefs = function (refs) {
    const lines = refs.slice(0, 5).map(function (r) {
      return '  • "' + r.playlist + '" row ' + r.row + (r.time ? ' (' + r.time + ')' : '');
    });
    if (refs.length > 5) lines.push('  • …and ' + (refs.length - 5) + ' more');
    return lines.join('\n');
  };

  fm.post = function (data) {
    return $.ajax({ url: API, method: 'POST', data: data, dataType: 'json', traditional: false });
  };

  fm.ajaxError = function (xhr, fallback) {
    if (xhr && xhr.responseJSON && xhr.responseJSON.error) return xhr.responseJSON.error;
    return fallback;
  };

  // Show a result that may carry a permissions explanation.
  fm.showError = function (result, fallback) {
    const msg = (result && result.error) || fallback;
    let html = '<i class="bi bi-exclamation-triangle-fill me-2"></i>' + esc(msg);
    if (result && result.blocked && result.blocked.length) {
      html += '<ul class="mb-1 mt-1 small">' + result.blocked.map(function (b) { return '<li>' + esc(b) + '</li>'; }).join('') + '</ul>';
    }
    if (result && result.permissions) html += fm.permissionAdvice(result.permissions);
    fm.flash(html, 'danger', 0);
  };

  fm.permissionAdvice = function (p) {
    if (p.autoFix) {
      return '<div class="small mt-1">This usually happens when files are copied in by another user. ' +
        'Traffic Control hands them back to its own user (<code>' + esc(p.user) + '</code>) automatically within a minute. ' +
        '<a href="#" class="fm-refresh alert-link">Check again</a></div>';
    }
    return '<div class="small mt-1">Files copied in by another user can\'t be changed by Traffic Control (it runs as <code>' +
      esc(p.user) + '</code>). To fix this, run on the server:<br><code class="user-select-all">' + esc(p.command) +
      '</code><br>or re-run <code>deploy.sh</code>, which also sets this up to happen automatically.</div>';
  };

  // Message bar at the top of the manager. timeout 0 = stays until closed.
  fm.flash = function (html, type, timeout) {
    const $bar = $('#fmMessages');
    const $alert = $('<div class="alert alert-' + type + ' alert-dismissible py-2 mb-2 small" role="alert">' + html +
      '<button type="button" class="btn-close btn-sm" data-bs-dismiss="alert" aria-label="Close"></button></div>');
    $bar.append($alert);
    if (timeout !== 0) {
      setTimeout(function () { bootstrap.Alert.getOrCreateInstance($alert[0]).close(); }, timeout || 4000);
    }
  };

  // --------------------------------------------------------- navigation

  fm.open = function (startPath) {
    fm.path = startPath || fm.path || '';
    bootstrap.Modal.getOrCreateInstance(document.getElementById('musicManagerModal')).show();
  };

  fm.load = function (path, keepMessages) {
    const gen = ++fm.generation;
    fm.path = path;
    fm.selected.clear();
    if (!keepMessages) $('#fmMessages').empty();
    $('#fmList').html('<div class="text-center p-4 text-muted"><i class="bi bi-arrow-repeat spin"></i> Loading…</div>');
    fm.renderBreadcrumb();
    fm.renderSelectionBar();
    return $.ajax({ url: API, data: { action: 'fmList', path: path }, dataType: 'json' })
      .done(function (data) {
        if (gen !== fm.generation) return;
        if (data.error) {
          fm.items = [];
          $('#fmList').html('');
          fm.showError(data, 'Could not open this folder');
          if (path !== '' && data.error === 'Folder not found') fm.load(fm.parentOf(path), true);
          return;
        }
        fm.path = data.path;
        fm.items = data.items;
        fm.canWrite = data.canWrite;
        fm.permissions = data.permissions;
        fm.freeSpace = data.freeSpace;
        fm.renderBreadcrumb();
        fm.renderList();
        fm.renderStatus(data);
        fm.loadInfo(gen);
      })
      .fail(function (xhr) {
        if (gen !== fm.generation) return;
        $('#fmList').html('<div class="text-danger p-3">' + esc(fm.ajaxError(xhr, 'Could not load files')) + '</div>');
      });
  };

  fm.refresh = function () { return fm.load(fm.path, true); };

  fm.parentOf = function (path) {
    const i = path.lastIndexOf('/');
    return i < 0 ? '' : path.substring(0, i);
  };

  fm.renderBreadcrumb = function () {
    let html = '<a href="#" class="fm-crumb" data-path=""><i class="bi bi-music-note-beamed me-1"></i>Music</a>';
    let acc = '';
    if (fm.path) {
      fm.path.split('/').forEach(function (seg) {
        acc = join(acc, seg);
        html += ' <i class="bi bi-chevron-right small text-muted"></i> ' +
          '<a href="#" class="fm-crumb" data-path="' + esc(acc) + '">' + esc(seg) + '</a>';
      });
    }
    $('#fmBreadcrumb').html(html);
    $('#fmUp').prop('disabled', fm.path === '');
  };

  fm.renderStatus = function (data) {
    const writable = TC.lan && data.canWrite;
    $('.fm-write').toggleClass('d-none', !TC.lan).prop('disabled', !writable);
    $('.fm-write-label').toggleClass('disabled', !writable);
    $('#fmDropHint').toggleClass('invisible', !writable);
    let status = '';
    if (!TC.lan) {
      status = '<i class="bi bi-lock me-1"></i>Read-only: files can only be changed from the local network.';
    } else if (data.freeSpace !== null) {
      status = fm.formatSize(data.freeSpace) + ' free';
    }
    $('#fmStatus').html(status);
    let banner = '';
    if (TC.lan && data.problems > 0 && data.permissions) {
      const msg = data.canWrite
        ? 'Some items here belong to another user, so Traffic Control can\'t change them (marked <i class="bi bi-lock-fill text-warning"></i>).'
        : 'This folder belongs to another user, so nothing can be added, renamed or deleted here.';
      banner = '<div class="alert alert-warning py-2 mb-2 small"><i class="bi bi-exclamation-triangle-fill me-2"></i>' + msg +
        fm.permissionAdvice(data.permissions) + '</div>';
    }
    $('#fmPermBanner').html(banner);
  };

  // ------------------------------------------------------------- listing

  fm.itemPath = function (item) { return join(fm.path, item.name); };

  fm.icon = function (item) {
    if (item.type === 'dir') return '<i class="bi bi-folder-fill text-warning"></i>';
    if (item.kind === 'video') return '<i class="bi bi-film text-primary"></i>';
    if (item.kind === 'audio') return '<i class="bi bi-music-note-beamed text-primary"></i>';
    return '<i class="bi bi-file-earmark text-muted"></i>';
  };

  fm.itemProblem = function (item) {
    if (!item.readable) return 'Traffic Control can\'t read this (it belongs to ' + item.owner + ')';
    if (!item.canModify) return 'This can\'t be renamed or deleted: its folder belongs to another user';
    if (item.type === 'dir' && !item.canWrite) return 'Nothing can be added to or deleted from this folder: it belongs to ' + item.owner;
    if (item.type === 'file' && !item.kind) return 'Not a sound file: it can\'t be played';
    if (item.type === 'file' && item.info && item.info.playable === false) return 'mplayer found no playable audio in this file';
    return '';
  };

  fm.renderList = function () {
    const filter = fm.filter.toLowerCase();
    const rows = [];
    fm.items.forEach(function (item, idx) {
      const info = item.info || {};
      const hay = (item.name + ' ' + (info.title || '') + ' ' + (info.artist || '') + ' ' + (info.album || '')).toLowerCase();
      if (filter && hay.indexOf(filter) < 0) return;
      const path = fm.itemPath(item);
      const problem = fm.itemProblem(item);
      const writable = TC.lan && item.canModify;
      let sub = '';
      if (item.type === 'dir') {
        sub = item.count === 1 ? '1 item' : item.count + ' items';
      } else if (item.info) {
        sub = [info.title, info.artist].filter(Boolean).join(' — ');
      }
      let html = '<tr class="fm-row' + (fm.selected.has(path) ? ' table-active' : '') + (fm.detailsPath === path ? ' fm-current' : '') +
        '" data-idx="' + idx + '">';
      html += '<td class="fm-check"><input type="checkbox" class="form-check-input fm-select" aria-label="Select"' +
        (fm.selected.has(path) ? ' checked' : '') + '></td>';
      html += '<td class="fm-name"><span class="fm-icon">' + fm.icon(item) + '</span>' +
        '<a href="#" class="fm-open text-decoration-none" title="' + esc(item.name) + '">' + esc(item.name) + '</a>' +
        (problem ? ' <i class="bi bi-lock-fill text-warning" title="' + esc(problem) + '"></i>' : '') +
        (sub ? '<div class="small text-muted text-truncate fm-sub">' + esc(sub) + '</div>' : '') + '</td>';
      html += '<td class="fm-len text-nowrap small">' + (item.type === 'file'
        ? (item.info ? esc(fm.formatDuration(info.duration)) : (item.kind ? '<span class="text-muted fm-pending">…</span>' : ''))
        : '') + '</td>';
      html += '<td class="fm-size text-nowrap small text-end d-none d-md-table-cell">' + esc(fm.formatSize(item.size)) + '</td>';
      html += '<td class="fm-date text-nowrap small d-none d-lg-table-cell">' + esc(fm.formatDate(item.mtime)) + '</td>';
      html += '<td class="fm-actions text-end text-nowrap"><div class="btn-group btn-group-sm">' +
        '<button type="button" class="btn btn-outline-secondary fm-info" title="Details"><i class="bi bi-info-circle"></i></button>' +
        '<button type="button" class="btn btn-outline-secondary fm-download" title="Download' + (item.type === 'dir' ? ' as ZIP' : '') + '"' +
          (item.readable ? '' : ' disabled') + '><i class="bi bi-download"></i></button>' +
        (TC.lan ? '<button type="button" class="btn btn-outline-secondary fm-rename" title="Rename"' + (writable ? '' : ' disabled') + '><i class="bi bi-pencil"></i></button>' +
          '<button type="button" class="btn btn-outline-danger fm-delete" title="Delete"' + (writable ? '' : ' disabled') + '><i class="bi bi-trash"></i></button>' : '') +
        '</div></td>';
      html += '</tr>';
      rows.push(html);
    });
    let html = '';
    if (rows.length) {
      html = '<table class="table table-sm table-hover align-middle mb-0 fm-table"><thead><tr>' +
        '<th class="fm-check"><input type="checkbox" class="form-check-input fm-select-all" aria-label="Select all"></th>' +
        '<th>Name</th><th>Length</th><th class="text-end d-none d-md-table-cell">Size</th>' +
        '<th class="d-none d-lg-table-cell">Modified</th><th></th></tr></thead><tbody>' + rows.join('') + '</tbody></table>';
    } else if (fm.items.length) {
      html = '<div class="text-muted p-4 text-center">Nothing matches "' + esc(fm.filter) + '".</div>';
    } else {
      html = '<div class="text-muted p-4 text-center"><i class="bi bi-folder2-open fs-3 d-block mb-2"></i>This folder is empty.' +
        (TC.lan && fm.canWrite ? '<br>Drop sound files or folders here, or use <strong>Upload</strong>.' : '') + '</div>';
    }
    $('#fmList').html(html);
  };

  // Fetch durations/tags for the files in view, a few at a time. The
  // server identifies each file once with mplayer and caches the result.
  fm.loadInfo = function (gen) {
    const pending = fm.items.filter(function (it) { return it.type === 'file' && it.kind && !it.info; })
      .map(function (it) { return it.name; });
    const next = function () {
      if (gen !== fm.generation || !pending.length) return;
      const batch = pending.splice(0, INFO_BATCH);
      fm.post({ action: 'fmInfo', path: fm.path, names: batch })
        .done(function (data) {
          if (gen !== fm.generation || !data || !data.info) return;
          let progressed = false;
          batch.forEach(function (name) {
            if (!(name in data.info)) { pending.push(name); return; }   // server ran out of time
            progressed = true;
            const item = fm.items.find(function (it) { return it.name === name; });
            if (item) item.info = data.info[name] || { playable: false };
          });
          fm.renderList();
          if (progressed) next();
        });
    };
    next();
  };

  // ------------------------------------------------------------ details

  fm.showDetails = function (path) {
    fm.detailsPath = path;
    $('.fm-row').removeClass('fm-current');
    const $pane = $('#fmDetails');
    $pane.removeClass('d-none').html('<div class="p-3 text-muted"><i class="bi bi-arrow-repeat spin"></i> Reading…</div>');
    $('#fmMain').addClass('fm-with-details');
    $.ajax({ url: API, data: { action: 'fmDetails', path: path }, dataType: 'json' })
      .done(function (d) {
        if (fm.detailsPath !== path) return;
        if (d.error) { $pane.html('<div class="p-3 text-danger">' + esc(d.error) + '</div>'); return; }
        $pane.html(fm.renderDetails(d));
      })
      .fail(function (xhr) {
        $pane.html('<div class="p-3 text-danger">' + esc(fm.ajaxError(xhr, 'Could not read details')) + '</div>');
      });
  };

  fm.hideDetails = function () {
    fm.detailsPath = null;
    $('#fmDetails').addClass('d-none').empty();
    $('#fmMain').removeClass('fm-with-details');
    $('.fm-row').removeClass('fm-current');
  };

  fm.renderDetails = function (d) {
    const row = (k, v) => (v === null || v === undefined || v === '') ? '' : '<tr><th>' + esc(k) + '</th><td>' + esc(v) + '</td></tr>';
    const info = d.info || {};
    let html = '<div class="d-flex align-items-start p-3 pb-2 border-bottom gap-2">' +
      '<span class="fs-4">' + fm.icon(d) + '</span><div class="flex-grow-1 text-break"><div class="fw-bold">' + esc(info.title || d.name) + '</div>' +
      (info.title ? '<div class="small text-muted">' + esc(d.name) + '</div>' : '') +
      (info.artist ? '<div class="small">' + esc(info.artist) + (info.album ? ' — ' + esc(info.album) : '') + '</div>' : '') +
      '</div><button type="button" class="btn-close fm-details-close" aria-label="Close details"></button></div>';
    html += '<div class="p-3 small">';
    if (d.type === 'file' && d.kind && d.readable && info.playable !== false) {
      html += '<audio class="w-100 mb-2" controls preload="none" src="' + esc(musicUrl(d.path)) + '"></audio>';
    }
    const problem = fm.itemProblem(d);
    if (problem) html += '<div class="alert alert-warning py-1 px-2 small">' + esc(problem) + '</div>';

    html += '<table class="table table-sm fm-props mb-2"><tbody>';
    if (d.type === 'dir') {
      html += row('Contains', d.totalFiles + (d.totalFiles === 1 ? ' file' : ' files') + ', ' + fm.formatSize(d.totalSize));
    } else {
      html += row('Length', info.duration ? fm.formatDuration(info.duration) : null);
      html += row('Size', fm.formatSize(d.size));
      const ext = d.name.indexOf('.') > 0 ? d.name.split('.').pop().toUpperCase() : '';
      html += row('Type', [ext + (d.kind === 'video' ? ' video' : ''), d.mime].filter(Boolean).join(' · ') || null);
      if (info.audio) {
        const a = info.audio;
        html += row('Audio', [a.codec, a.bitrate ? Math.round(a.bitrate / 1000) + ' kbit/s' : null,
          a.sampleRate ? (a.sampleRate / 1000) + ' kHz' : null,
          a.channels ? (a.channels === 1 ? 'mono' : a.channels === 2 ? 'stereo' : a.channels + ' channels') : null].filter(Boolean).join(', '));
      }
      if (info.audioTracks > 1) html += row('Audio tracks', info.audioTracks + ' (the first is played)');
      if (info.video) {
        const v = info.video;
        html += row('Video', [v.codec || v.format, v.width && v.height ? v.width + '×' + v.height : null,
          v.fps ? Math.round(v.fps * 100) / 100 + ' fps' : null].filter(Boolean).join(', ') + ' (not shown; audio only)');
      }
      if (info.playable === false) html += row('Playable', 'No: mplayer found no audio');
    }
    html += row('Modified', fm.formatDate(d.mtime));
    html += row('Owner', d.owner + (d.mode ? ' (' + d.mode + ')' : ''));
    html += '</tbody></table>';

    if (info.tags && info.tags.length) {
      html += '<div class="fw-bold mt-2 mb-1">Tags</div><table class="table table-sm fm-props mb-2"><tbody>';
      info.tags.forEach(function (t) { html += row(t.name, t.value); });
      html += '</tbody></table>';
    } else if (d.type === 'file' && d.kind) {
      html += '<div class="text-muted mb-2">No tags.</div>';
    }
    if (info.chapters && info.chapters.length) {
      html += '<div class="fw-bold mt-2 mb-1">Chapters</div><table class="table table-sm fm-props mb-2"><tbody>';
      info.chapters.forEach(function (c, i) { html += row(fm.formatDuration(c.start), c.name || 'Chapter ' + (i + 1)); });
      html += '</tbody></table>';
    }
    const refs = d.references || [];
    html += '<div class="fw-bold mt-2 mb-1">Used in playlists</div>';
    if (refs.length) {
      html += '<ul class="mb-2 ps-3">' + refs.map(function (r) {
        return '<li>' + esc(r.playlist) + ', row ' + r.row + (r.time ? ' (' + esc(r.time) + ')' : '') + '</li>';
      }).join('') + '</ul>';
    } else {
      html += '<div class="text-muted mb-2">Not used.</div>';
    }
    html += '</div>';
    return html;
  };

  // ------------------------------------------------------------- actions

  fm.download = function (paths) {
    const qs = paths.map(function (p) { return 'paths[]=' + encodeURIComponent(p); }).join('&');
    const a = document.createElement('a');
    a.href = API + '?action=fmDownload&' + qs;
    a.download = '';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  fm.newFolder = function () {
    const name = (prompt('New folder name:') || '').trim();
    if (!name) return;
    fm.post({ action: 'fmMkdir', path: fm.path, name: name })
      .done(function (r) {
        if (r.error) { fm.showError(r); return; }
        fm.refresh();
      })
      .fail(function (xhr) { fm.showError(xhr.responseJSON, 'Could not create the folder'); });
  };

  // Rename in place: the name cell becomes a text box.
  fm.startRename = function ($row) {
    const item = fm.items[$row.data('idx')];
    if (!item || $row.find('.fm-rename-input').length) return;
    const $cell = $row.find('.fm-name');
    const original = $cell.html();
    const $input = $('<input type="text" class="form-control form-control-sm fm-rename-input">').val(item.name);
    $cell.empty().append($input);
    const dot = item.type === 'file' ? item.name.lastIndexOf('.') : -1;
    $input.trigger('focus');
    $input[0].setSelectionRange(0, dot > 0 ? dot : item.name.length);
    let done = false;
    const finish = function (save) {
      if (done) return;
      done = true;
      const newName = $input.val().trim();
      if (!save || !newName || newName === item.name) { $cell.html(original); return; }
      fm.rename(fm.itemPath(item), newName, function () { $cell.html(original); });
    };
    $input.on('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); finish(true); }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); }
    }).on('blur', function () { finish(true); });
  };

  fm.rename = function (path, newName, onFail) {
    fm.post({ action: 'fmRename', path: path, newName: newName })
      .done(function (r) {
        if (r.error) { fm.showError(r); if (onFail) onFail(); return; }
        if (r.warning) fm.flash(esc(r.warning), 'warning', 0);
        if (r.references > 0) {
          fm.flash('<i class="bi bi-check-circle me-2"></i>Renamed. ' + r.references +
            (r.references === 1 ? ' playlist entry was' : ' playlist entries were') + ' updated to match.', 'success');
          fm.reloadPlaylists();
        }
        if (fm.detailsPath === path) fm.showDetails(r.path);
        fm.refresh();
      })
      .fail(function (xhr) { fm.showError(xhr.responseJSON, 'Could not rename'); if (onFail) onFail(); });
  };

  fm.remove = function (paths) {
    const names = paths.map(function (p) { return p.split('/').pop(); });
    let refs = [];
    paths.forEach(function (p) { refs = refs.concat(fm.referencesTo(p)); });
    let msg = paths.length === 1
      ? 'Delete "' + names[0] + '"' + (fm.items.some(function (it) { return it.name === names[0] && it.type === 'dir'; }) ? ' and everything in it' : '') + '?'
      : 'Delete these ' + paths.length + ' items (including everything in any folders)?';
    if (refs.length) {
      msg += '\n\nUsed by ' + refs.length + (refs.length === 1 ? ' playlist entry' : ' playlist entries') +
        ', which will then have nothing to play:\n' + fm.describeRefs(refs);
    }
    msg += '\n\nThis cannot be undone.';
    if (!confirm(msg)) return;
    fm.post({ action: 'fmDelete', paths: paths })
      .done(function (r) {
        if (r.error) { fm.showError(r); fm.refresh(); return; }
        if (fm.detailsPath && paths.some(function (p) { return fm.detailsPath === p || fm.detailsPath.indexOf(p + '/') === 0; })) {
          fm.hideDetails();
        }
        fm.refresh();
      })
      .fail(function (xhr) { fm.showError(xhr.responseJSON, 'Could not delete'); fm.refresh(); });
  };

  // The server rewrote playlist entries after a rename; take its copy so a
  // later save from this page doesn't put the old paths back.
  fm.reloadPlaylists = function () {
    $.ajax({ url: API + '?action=load', dataType: 'json' }).done(function (data) {
      if (!data || !Array.isArray(data.list)) return;
      const selected = TC.stored.selectedPlayList;
      TC.stored = data;
      if (selected >= 0 && selected < data.list.length) TC.stored.selectedPlayList = selected;
      localStorage.setItem('tcPersistent', JSON.stringify(TC.stored));
      TC.renderAll();
    });
  };

  // ------------------------------------------------------------- uploads

  // Turn a drop into [{file, relPath}], walking into dropped folders.
  fm.filesFromDrop = function (dataTransfer) {
    const items = dataTransfer.items;
    const entries = [];
    if (items && items.length && items[0].webkitGetAsEntry) {
      for (let i = 0; i < items.length; i++) {
        const entry = items[i].webkitGetAsEntry();
        if (entry) entries.push(entry);
      }
    }
    if (!entries.length) {
      return Promise.resolve(Array.from(dataTransfer.files || []).map(function (f) { return { file: f, relPath: f.name }; }));
    }
    const out = [];
    const walk = function (entry, prefix) {
      if (entry.isFile) {
        return new Promise(function (resolve) {
          entry.file(function (f) { out.push({ file: f, relPath: prefix + f.name }); resolve(); }, function () { resolve(); });
        });
      }
      if (entry.isDirectory) {
        const reader = entry.createReader();
        const readAll = function (acc) {
          return new Promise(function (resolve) {
            reader.readEntries(function (batch) {
              if (!batch.length) { resolve(acc); return; }
              readAll(acc.concat(Array.from(batch))).then(resolve);
            }, function () { resolve(acc); });
          });
        };
        return readAll([]).then(function (children) {
          return children.reduce(function (p, child) {
            return p.then(function () { return walk(child, prefix + entry.name + '/'); });
          }, Promise.resolve());
        });
      }
      return Promise.resolve();
    };
    return entries.reduce(function (p, e) { return p.then(function () { return walk(e, ''); }); }, Promise.resolve())
      .then(function () { return out; });
  };

  fm.filesFromInput = function (fileList) {
    return Array.from(fileList || []).map(function (f) {
      return { file: f, relPath: f.webkitRelativePath || f.name };
    });
  };

  // Ask how to handle existing files. Resolves 'replace' | 'rename' | 'skip' | null (cancel).
  fm.askConflict = function (existing) {
    return new Promise(function (resolve) {
      const list = existing.slice(0, 5).map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') +
        (existing.length > 5 ? '<li>…and ' + (existing.length - 5) + ' more</li>' : '');
      const $q = $('<div class="alert alert-info py-2 mb-2 small"><div class="fw-bold mb-1">' +
        (existing.length === 1 ? 'This file already exists:' : existing.length + ' files already exist:') +
        '</div><ul class="mb-2">' + list + '</ul><div class="d-flex flex-wrap gap-2">' +
        '<button type="button" class="btn btn-sm btn-primary" data-choice="replace">Replace</button>' +
        '<button type="button" class="btn btn-sm btn-outline-primary" data-choice="rename">Keep both</button>' +
        '<button type="button" class="btn btn-sm btn-outline-secondary" data-choice="skip">Skip ' + (existing.length === 1 ? 'it' : 'them') + '</button>' +
        '<button type="button" class="btn btn-sm btn-link" data-choice="">Cancel upload</button></div></div>');
      $q.on('click', 'button', function () {
        const choice = $(this).data('choice');
        $q.remove();
        resolve(choice || null);
      });
      $('#fmMessages').append($q);
    });
  };

  fm.upload = function (files) {
    if (!files.length || fm.uploading) return;
    if (!TC.lan) return;
    const dir = fm.path;
    fm.post({ action: 'fmCheckUpload', path: dir, files: files.map(function (f) { return f.relPath; }) })
      .done(function (check) {
        if (check.error) { fm.showError(check); return; }
        if (!check.canWrite) {
          fm.showError({ error: 'Files can\'t be added to this folder: it belongs to another user', permissions: check.permissions });
          return;
        }
        const listOf = function (paths) {
          return '<ul class="mb-0 small">' + paths.slice(0, 8).map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') +
            (paths.length > 8 ? '<li>…and ' + (paths.length - 8) + ' more</li>' : '') + '</ul>';
        };
        const unplayable = check.unplayable || [], invalid = check.invalid || [];
        if (unplayable.length) {
          fm.flash('<i class="bi bi-exclamation-triangle-fill me-2"></i>Skipped ' + unplayable.length +
            (unplayable.length === 1 ? ' file that isn\'t a sound file:' : ' files that aren\'t sound files:') + listOf(unplayable), 'warning', 0);
        }
        if (invalid.length) {
          fm.flash('<i class="bi bi-exclamation-triangle-fill me-2"></i>Skipped ' + invalid.length +
            (invalid.length === 1 ? ' file' : ' files') + ' with a name that can\'t be used (hidden, or containing special characters):' +
            listOf(invalid), 'warning', 0);
        }
        const rejected = unplayable.concat(invalid);
        const todo = files.filter(function (f) { return rejected.indexOf(f.relPath) < 0; });
        if (!todo.length) return;
        const total = todo.reduce(function (n, f) { return n + f.file.size; }, 0);
        if (check.freeSpace !== null && total > check.freeSpace - 10 * 1024 * 1024) {
          fm.showError({ error: 'Not enough free space: these files need ' + fm.formatSize(total) +
            ' but only ' + fm.formatSize(check.freeSpace) + ' is free.' });
          return;
        }
        const ask = (check.exists && check.exists.length) ? fm.askConflict(check.exists) : Promise.resolve('rename');
        ask.then(function (conflict) {
          if (!conflict) return;
          let list = todo;
          if (conflict === 'skip') {
            list = todo.filter(function (f) { return check.exists.indexOf(f.relPath) < 0; });
            if (!list.length) return;
          }
          const bytes = list.reduce(function (n, f) { return n + f.file.size; }, 0);
          fm.runUpload(dir, list, bytes, conflict);
        });
      })
      .fail(function (xhr) { fm.showError(xhr.responseJSON, 'Upload failed'); });
  };

  fm.randomId = function () {
    const a = new Uint8Array(16);
    crypto.getRandomValues(a);
    return Array.from(a, function (b) { return b.toString(16).padStart(2, '0'); }).join('');
  };

  fm.runUpload = async function (dir, files, totalBytes, conflict) {
    const state = { cancelled: false, controller: null };
    fm.uploading = state;
    const $panel = $('#fmUpload').removeClass('d-none');
    const $bar = $panel.find('.progress-bar');
    const $label = $('#fmUploadLabel');
    let doneBytes = 0, ok = 0, skipped = 0;
    const errors = [];
    const update = function (name, fileBytes) {
      const pct = totalBytes ? Math.floor(100 * (doneBytes + fileBytes) / totalBytes) : 100;
      $bar.css('width', pct + '%').attr('aria-valuenow', pct);
      $label.text('Uploading ' + (ok + skipped + errors.length + 1) + ' of ' + files.length + ': ' + name + ' (' + pct + '%)');
    };

    for (const f of files) {
      if (state.cancelled) break;
      const id = fm.randomId();
      let offset = 0, tries = 0, result = null;
      update(f.relPath, 0);
      while (!state.cancelled) {
        const end = Math.min(offset + CHUNK, f.file.size);
        const qs = $.param({ action: 'fmUpload', dir: dir, relPath: f.relPath, uploadId: id, offset: offset, total: f.file.size, conflict: conflict });
        state.controller = new AbortController();
        let r;
        try {
          const resp = await fetch(API + '?' + qs, {
            method: 'POST', body: f.file.slice(offset, end), signal: state.controller.signal,
            headers: { 'Content-Type': 'application/octet-stream' }
          });
          r = await resp.json();
        } catch (e) {
          if (state.cancelled) break;
          if (++tries > 4) { result = { error: 'Network error' }; break; }
          await new Promise(function (res) { setTimeout(res, 1000 * tries); });
          continue;
        }
        if (r.error === 'offset' && typeof r.expected === 'number' && tries++ < 4) { offset = r.expected; continue; }
        if (r.error || r.done) { result = r; break; }
        offset = r.received;
        tries = 0;
        update(f.relPath, offset);
      }
      if (state.cancelled) break;
      if (result && result.done) {
        result.skipped ? skipped++ : ok++;
      } else {
        errors.push(f.relPath + ': ' + ((result && result.error) || 'failed'));
        if (result && result.permissions) { fm.showError(result); break; }
      }
      doneBytes += f.file.size;
    }

    fm.uploading = null;
    $panel.addClass('d-none');
    $bar.css('width', '0%');
    let summary = state.cancelled ? 'Upload cancelled. ' : '';
    summary += ok + (ok === 1 ? ' file uploaded' : ' files uploaded');
    if (skipped) summary += ', ' + skipped + ' skipped';
    if (errors.length) {
      fm.flash('<i class="bi bi-exclamation-triangle-fill me-2"></i>' + esc(summary) + ', ' + errors.length + ' failed:<ul class="mb-0 small">' +
        errors.slice(0, 8).map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('') + '</ul>', 'danger', 0);
    } else {
      fm.flash('<i class="bi bi-check-circle me-2"></i>' + esc(summary) + '.', state.cancelled ? 'warning' : 'success');
    }
    if (dir === fm.path) fm.refresh();
  };

  fm.cancelUpload = function () {
    if (!fm.uploading) return;
    fm.uploading.cancelled = true;
    if (fm.uploading.controller) fm.uploading.controller.abort();
  };

  // ----------------------------------------------------------- selection

  fm.renderSelectionBar = function () {
    const n = fm.selected.size;
    $('#fmSelectionBar').toggleClass('d-none', n === 0);
    $('#fmSelectionCount').text(n + (n === 1 ? ' item selected' : ' items selected'));
    $('#fmDeleteSelected').toggleClass('d-none', !TC.lan);
  };

  // ------------------------------------------------------------- binding

  fm.init = function () {
    const $modal = $('#musicManagerModal');
    $modal.on('show.bs.modal', function () {
      fm.hideDetails();
      fm.filter = '';
      $('#fmFilter').val('');
      fm.load(fm.path);
    });
    $modal.on('hide.bs.modal', function (e) {
      if (fm.uploading) {
        if (!confirm('An upload is still running. Stop it and close?')) { e.preventDefault(); return; }
        fm.cancelUpload();
      }
    });
    $modal.on('hidden.bs.modal', function () {
      fm.generation++;
      $modal.find('audio').each(function () { this.pause(); });
    });

    $modal.on('click', '.fm-crumb', function (e) { e.preventDefault(); fm.hideDetails(); fm.load($(this).attr('data-path')); });
    $modal.on('click', '.fm-refresh', function (e) { e.preventDefault(); fm.refresh(); });
    $('#fmUp').on('click', function () { fm.hideDetails(); fm.load(fm.parentOf(fm.path)); });
    $('#fmRefresh').on('click', function () { fm.refresh(); });
    $('#fmNewFolder').on('click', fm.newFolder);
    $('#fmUploadFiles, #fmUploadFolder').on('change', function () {
      fm.upload(fm.filesFromInput(this.files));
      this.value = '';
    });
    $('#fmCancelUpload').on('click', fm.cancelUpload);
    $('#fmFilter').on('input', function () { fm.filter = this.value; fm.renderList(); });

    const $list = $('#fmList');
    $list.on('click', '.fm-open', function (e) {
      e.preventDefault();
      const item = fm.items[$(this).closest('tr').data('idx')];
      if (!item) return;
      if (item.type === 'dir') { fm.hideDetails(); fm.load(fm.itemPath(item)); } else { fm.showDetails(fm.itemPath(item)); }
    });
    $list.on('click', '.fm-info', function () {
      const item = fm.items[$(this).closest('tr').data('idx')];
      if (item) fm.showDetails(fm.itemPath(item));
    });
    $list.on('click', '.fm-download', function () {
      const item = fm.items[$(this).closest('tr').data('idx')];
      if (item) fm.download([fm.itemPath(item)]);
    });
    $list.on('click', '.fm-rename', function () { fm.startRename($(this).closest('tr')); });
    $list.on('click', '.fm-delete', function () {
      const item = fm.items[$(this).closest('tr').data('idx')];
      if (item) fm.remove([fm.itemPath(item)]);
    });
    $list.on('change', '.fm-select', function () {
      const item = fm.items[$(this).closest('tr').data('idx')];
      if (!item) return;
      const p = fm.itemPath(item);
      this.checked ? fm.selected.add(p) : fm.selected.delete(p);
      $(this).closest('tr').toggleClass('table-active', this.checked);
      fm.renderSelectionBar();
    });
    $list.on('change', '.fm-select-all', function () {
      const on = this.checked;
      $list.find('.fm-select').each(function () {
        if (this.checked !== on) { this.checked = on; $(this).trigger('change'); }
      });
    });
    $('#fmDownloadSelected').on('click', function () { fm.download(Array.from(fm.selected)); });
    $('#fmDeleteSelected').on('click', function () { fm.remove(Array.from(fm.selected)); });
    $('#fmClearSelection').on('click', function () {
      fm.selected.clear();
      fm.renderList();
      fm.renderSelectionBar();
    });
    $('#fmDetails').on('click', '.fm-details-close', fm.hideDetails);

    // Drag and drop files or whole folders onto the list.
    const zone = document.getElementById('fmMain');
    let depth = 0;
    const isFileDrag = (e) => e.dataTransfer && Array.from(e.dataTransfer.types || []).indexOf('Files') >= 0;
    zone.addEventListener('dragenter', function (e) {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      depth++;
      if (TC.lan && fm.canWrite) zone.classList.add('fm-dragover');
    });
    zone.addEventListener('dragover', function (e) {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = (TC.lan && fm.canWrite) ? 'copy' : 'none';
    });
    zone.addEventListener('dragleave', function () {
      if (--depth <= 0) { depth = 0; zone.classList.remove('fm-dragover'); }
    });
    zone.addEventListener('drop', function (e) {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      depth = 0;
      zone.classList.remove('fm-dragover');
      if (!TC.lan || !fm.canWrite) return;
      fm.filesFromDrop(e.dataTransfer).then(fm.upload);
    });
    // A file dropped just outside the list must not replace the page.
    $modal[0].addEventListener('dragover', function (e) { if (isFileDrag(e)) e.preventDefault(); });
    $modal[0].addEventListener('drop', function (e) { if (isFileDrag(e)) e.preventDefault(); });
  };

  return fm;
})();
