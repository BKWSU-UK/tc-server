"use strict";

const TC = (() => {
  const TC = {};
  TC.stored = {};
  TC.stored.list = [];
  TC.selectedRow = 0;
  TC.stored.selectedPlayList = -1;
  TC.playerIndex = -1;
  TC.loaded = false;
  TC.system = true;
  TC.schedulerEnabled = true;
  TC.systemPreview = false;
  TC.lan = true;
  TC.serverAvailable = false;
  TC.holdOff = 1000;
  TC.heldOffVolume = -1;
  TC.fading = false;
  TC.fadeTime = 5000;
  TC.lastMinute = -1;
  TC.lastHour = -1;
  TC.nextEventReIndex = false;
  TC.nextEventIndex = -1;
  TC.nextEventTime = -1;
  TC.forceRemoteSave = false;
  TC.lastTimeLoop = (new Date()).getTime();
    
  //Action when a row is clicked
  TC.rowClick = function (i) {
    if (TC.selectedRow > 0) {
      $( '#tableRow' + TC.selectedRow ).removeClass( "table-info" );
    }
    $( '#tableRow' + i ).addClass( "table-info" );
    TC.selectedRow = i;
  }
  
  //Return the currently selected "what" object
  TC.whatCurrent = function () {
    if (TC.selectedRow > 0) {
      return '#what' + TC.selectedRow
    }
  }
  
  //Scroll to the end of the playlist
  TC.scrollDownPlayList = function () {
    const d = $('#playListTableDiv');
    if ( TC.stored.list[TC.stored.selectedPlayList].list.length === TC.selectedRow) {
      d.scrollTop(d.prop("scrollHeight"));
    }
  }
  
  TC.nudgeList = function (pickiBox) {
    const d = $('#playListTableDiv');
    const boxBotLeft = pickiBox.offset().top + (pickiBox.height() * 3.3);
    const scrollPos = d.scrollTop();
    const scrollWindowBotLeft = d.offset().top + d.height();
    const offset = boxBotLeft - scrollWindowBotLeft;
    
    if (offset > 0) {
      d.scrollTop(scrollPos + offset);
    }
  }
  
  TC.convertTo24Hour = function (timeStr) {
    if (!timeStr) return '12:00';
    const parts = timeStr.replace(/\s/g, '').split(':');
    let hours = parseInt(parts[0]);
    const minutes = parts[1] || '00';
    const ampm = parts[2] || 'AM';
    if (ampm === 'PM' && hours !== 12) hours += 12;
    if (ampm === 'AM' && hours === 12) hours = 0;
    return String(hours).padStart(2, '0') + ':' + String(minutes).padStart(2, '0');
  };

  TC.convertTo12Hour = function (time24) {
    if (!time24) return '12 : 00 : AM';
    const parts = time24.split(':');
    let hours = parseInt(parts[0]);
    const minutes = parts[1] || '00';
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    if (hours === 0) hours = 12;
    return String(hours).padStart(2, '0') + ' : ' + minutes + ' : ' + ampm;
  };

  //Render the JS generated parts of the page
  TC.renderModeToggles = function () {
    $('#modeToggleButton').prop('checked', TC.system);
    $('#schedulerToggleButton').prop('checked', TC.schedulerEnabled);
    $('#previewToggleButton').prop('checked', TC.systemPreview);
    $('.scheduler-container').css('visibility', TC.system && TC.lan ? 'visible' : 'hidden');
    $('.preview-mode-container').css('visibility', TC.system ? 'visible' : 'hidden');
    $('.mode-container').css('visibility', TC.lan ? 'visible' : 'hidden');
    $('.audio-device-container').css('display', TC.lan ? 'block' : 'none');
  };

  TC.renderPlaylistSelector = function () {
    let html = '<table class="playListSelectorTable"><tbody><tr id="playListSelRow">';
    html += '<td class="playListButtons d-flex gap-2 align-items-center">';
    if (TC.stored.list.length === 0) {
      html += '<i class="bi bi-plus-circle" data-bs-toggle="modal" data-bs-target="#editPlaylistName" onclick="TC.playListAdd();" title="Add a playlist"></i>';
      html += '</td><th class="small text-muted">Start a playlist</th></tr></tbody></table>';
    } else {
      html += '<i class="bi bi-plus-circle" data-bs-toggle="modal" data-bs-target="#editPlaylistName" onclick="TC.playListAdd();" title="Add"></i>';
      html += '<i class="bi bi-copy" data-bs-toggle="modal" data-bs-target="#editPlaylistName" onclick="TC.playListCopy();" title="Copy"></i>';
      html += '<i class="bi bi-pencil-square" data-bs-toggle="modal" data-bs-target="#editPlaylistName" onclick="TC.playListEdit();" title="Rename"></i>';
      html += '<i class="bi bi-trash text-danger" data-bs-toggle="modal" data-bs-target="#confirmDeletePlaylist" onclick="TC.playListDelete();" title="Delete"></i>';
      html += '<i class="bi bi-download text-secondary" onclick="TC.exportPlaylists();" title="Export playlists"></i>';
      html += '<i class="bi bi-upload text-secondary" onclick="TC.importPlaylists();" title="Import playlists"></i>';
      html += '</td></tr><tr><td colspan="2" class="pt-2">';
      html += '<select id="playListSelect" name="playList" class="form-select form-select-sm">';
      for (let i = 0; i < TC.stored.list.length; i++) {
        html += '<option value="' + TC.stored.list[i].name + '"' + (i === TC.stored.selectedPlayList ? ' selected' : '') + '>' + TC.stored.list[i].name + '</option>';
      }
      html += '</select></td></tr></tbody></table>';
    }
    return html;
  };

  TC.renderPlaylistItems = function () {
    if (TC.stored.list.length === 0) return '';
    const len = TC.stored.list[TC.stored.selectedPlayList].list.length;
    let html = '<div id="playListTableDiv" class="scrollable-area">';
    if (len === 0) {
      html += '<div class="playlist-empty text-center py-5">';
      html += '<i class="bi bi-plus-circle action-icon add fs-1" data-bs-toggle="tooltip" title="Add row" onclick="TC.listAdd(0);"></i>';
      html += '<div class="mt-3 text-muted">Playlist is empty. Click to add items.</div></div>';
    } else {
      html += '<div id="playListCards" class="playlist-cards">';
      for (let i = 0; i < len && TC.stored.selectedPlayList >= 0; i++) {
        const listItem = TC.stored.list[TC.stored.selectedPlayList].list[i];
        if (!listItem.hasOwnProperty('what')) continue;
        const ip1 = i + 1;
        const time24 = TC.convertTo24Hour(listItem.time);
        html += '<div id="tableRow' + ip1 + '" class="playlist-item" onclick="TC.rowClick(' + ip1 + ');">';
        html += '<div class="playlist-item-header">';
        html += '<button type="button" class="btn btn-outline-secondary btn-sm content-what text-start text-truncate flex-grow-1" id="what' + ip1 + '" data-bs-toggle="modal" data-bs-target="#fileBrowserModal" onclick="event.stopPropagation();TC.openFileBrowser(' + ip1 + ');" title="' + listItem.what + '">' + TC.displayFileName(listItem.what, listItem.mime) + '</button>';
        html += '<div class="playlist-item-actions">';
        html += '<select id="how' + ip1 + '" name="how' + ip1 + '" class="form-select form-select-sm content-how" onclick="event.stopPropagation();">';
        html += '<option value="single" ' + (listItem.how === 'single' ? 'selected' : '') + '>Single</option>';
        html += '<option value="rand" ' + (listItem.how === 'rand' ? 'selected' : '') + '>Random</option>';
        html += '<option value="seq" ' + (listItem.how === 'seq' ? 'selected' : '') + '>Sequential</option>';
        html += '</select>';
        html += '<i class="bi bi-plus-circle action-icon add" title="Add After" onclick="event.stopPropagation();TC.listAdd(' + ip1 + ');"></i>';
        html += '<i class="bi bi-dash-circle action-icon remove" title="Remove" onclick="event.stopPropagation();TC.listDelete(' + ip1 + ');"></i>';
        html += '</div></div>';
        html += '<div class="playlist-item-schedule"><span class="schedule-label">Schedule</span>';
        html += '<select id="exception' + ip1 + '" name="exception' + ip1 + '" class="form-select form-select-sm">';
        html += '<option value="every" ' + (listItem.exception === 'every' ? 'selected' : '') + '>Every</option>';
        html += '<option value="except" ' + (listItem.exception === 'except' ? 'selected' : '') + '>Except</option>';
        html += '<option value="never" ' + (listItem.exception === 'never' ? 'selected' : '') + '>Manual</option>';
        html += '</select>';
        html += '<select id="day' + ip1 + '" name="day' + ip1 + '" class="form-select form-select-sm schedule-day">';
        html += '<option value="day" ' + (listItem.day === 'day' ? 'selected' : '') + '>Daily</option>';
        html += '<option value="monday" ' + (listItem.day === 'monday' ? 'selected' : '') + '>Mon</option>';
        html += '<option value="tuesday" ' + (listItem.day === 'tuesday' ? 'selected' : '') + '>Tue</option>';
        html += '<option value="wednesday" ' + (listItem.day === 'wednesday' ? 'selected' : '') + '>Wed</option>';
        html += '<option value="thursday" ' + (listItem.day === 'thursday' ? 'selected' : '') + '>Thu</option>';
        html += '<option value="friday" ' + (listItem.day === 'friday' ? 'selected' : '') + '>Fri</option>';
        html += '<option value="saturday" ' + (listItem.day === 'saturday' ? 'selected' : '') + '>Sat</option>';
        html += '<option value="sunday" ' + (listItem.day === 'sunday' ? 'selected' : '') + '>Sun</option>';
        html += '</select>';
        html += '<select id="week' + ip1 + '" name="week' + ip1 + '" class="form-select form-select-sm schedule-week">';
        html += '<option value="all" ' + (listItem.week === 'all' ? 'selected' : '') + '>All</option>';
        html += '<option value="1st" ' + (listItem.week === '1st' ? 'selected' : '') + '>1st</option>';
        html += '<option value="2nd" ' + (listItem.week === '2nd' ? 'selected' : '') + '>2nd</option>';
        html += '<option value="3rd" ' + (listItem.week === '3rd' ? 'selected' : '') + '>3rd</option>';
        html += '</select>';
        html += '<button type="button" class="time_element btn btn-outline-secondary btn-sm" id="time' + ip1 + '" data-time="' + time24 + '" onclick="event.stopPropagation();TC.openTimePicker(' + ip1 + ');">' + TC.formatTimeDisplay(time24) + '</button>';
        html += '</div>';
        html += '<div class="playlist-item-controls">';
        html += '<div class="control-group"><label class="control-label">Length</label>';
        html += '<select id="howLong' + ip1 + '" name="howLong' + ip1 + '" class="form-select form-select-sm">';
        html += '<option value="0" ' + (String(listItem.howLong) === '0' ? 'selected' : '') + '>Full</option>';
        for (let s = 10; s <= 180; s += 10) {
          html += '<option value="' + s + '" ' + (String(listItem.howLong) === String(s) ? 'selected' : '') + '>' + s + 's</option>';
        }
        html += '</select></div>';
        html += '<div class="control-group control-group-volume slider-class">';
        html += '<label class="control-label">Volume</label>';
        html += '<div class="volume-control">';
        html += '<input id="volume' + ip1 + '" name="volume' + ip1 + '" type="range" min="0" max="99" value="' + listItem.volume + '" class="volume-slider" />';
        html += '<span class="volume-display">' + listItem.volume + '</span>';
        html += '</div></div>';
        html += '<div class="control-group control-group-preview"><label class="control-label">Preview</label>';
        html += '<div class="preview-buttons">';
        html += '<i class="bi bi-play-circle-fill action-icon play" title="Preview" onclick="event.stopPropagation();TC.rowClick(' + ip1 + ');TC.play(' + ip1 + ', true);"></i>';
        html += '<i class="bi bi-stop-circle-fill action-icon stop" title="Stop" onclick="event.stopPropagation();TC.rowClick(' + ip1 + ');TC.stop(' + ip1 + ');"></i>';
        html += '</div></div></div></div>';
      }
      html += '</div>';
    }
    html += '</div>';
    return html;
  };

  TC.attachItemEventHandlers = function () {
    //Volume slider events — delegated so re-attachment on every render is not needed
    $(document).on('input', '.volume-slider', function (e) {
      const volControl = $(this);
      const index = volControl[0].id.replace(/[^\d]/g, '') - 1;
      const value = parseInt(volControl.val());
      volControl.siblings('.volume-display').text(value);
      TC.stored.list[TC.stored.selectedPlayList].list[index]['volume'] = value;
      if ((TC.playerIndex === index) && (!TC.fading)) {
        TC.heldOffVolume = TC.compositeVolume();
        if (!TC.controlsHoldOff) {
          $('#audioPlayer').prop('volume', TC.compositeVolume() / 100);
        }
        if (TC.system && TC.serverAvailable) {
          $.ajax({ url: 'php/tc.php?action=setVolume&index=' + encodeURIComponent(index) + '&volume=' + encodeURIComponent(value),
            error: function (xhr) { console.error(xhr.status + ': ' + xhr.responseText); }
          });
        }
      }
      TC.storeAll(false);
    });
    //Scroll wheel on volume control — delegated
    $(document).on('wheel', '.slider-class', function (e) {
      const volControl = $(this).find('.volume-slider');
      const index = volControl[0].id.replace(/[^\d]/g, '') - 1;
      const currentVal = parseInt(volControl.val());
      let newVal = currentVal + (e.originalEvent.deltaY < 0 ? 1 : -1);
      newVal = Math.max(0, Math.min(99, newVal));
      volControl.val(newVal);
      volControl.siblings('.volume-display').text(newVal);
      TC.stored.list[TC.stored.selectedPlayList].list[index]['volume'] = newVal;
      if ((TC.playerIndex === index) && (!TC.fading)) {
        TC.heldOffVolume = TC.compositeVolume();
        if (!TC.controlsHoldOff) {
          $('#audioPlayer').prop('volume', TC.compositeVolume() / 100);
        }
        if (TC.system && TC.serverAvailable) {
          $.ajax({ url: 'php/tc.php?action=setVolume&index=' + encodeURIComponent(index) + '&volume=' + encodeURIComponent(newVal),
            error: function (xhr) { console.error(xhr.status + ': ' + xhr.responseText); }
          });
        }
      }
      TC.storeAll(false);
      e.preventDefault();
    });
  };

  TC.renderAll = function () {
    TC.purifyList();
    TC.renderModeToggles();
    $('#playListSelector').empty().append(TC.renderPlaylistSelector());
    const scrollPos = $('#playListTableDiv').scrollTop();
    $('#playList').empty().append(TC.renderPlaylistItems());
    $('#playListTableDiv').scrollTop(scrollPos);
    $('[data-bs-toggle="tooltip"]').tooltip();
    $('#playListForm').off('propertychange change keyup paste input')
      .on('propertychange change keyup paste input', function (event) {
        TC.formChange(event);
      });
    if (TC.stored.list.length > 0) {
      $('#playListNameInput').val(TC.stored.list[TC.stored.selectedPlayList].name);
    }
    TC.validate();
    TC.storeAll(false);
  };

  //Save the persistent data
  TC.storeAll = function ( endTimeout ) {
    TC.purifyList();
    
    if (!TC.loaded) {
      return;
    }
    
    if (!TC.controlsHoldOff) {
      TC.nextEventReIndex = true;
      TC.stored.system = TC.system;
      TC.stored.schedulerEnabled = TC.schedulerEnabled;
      TC.stored.systemPreview = TC.systemPreview;
      
      //Store to local storage as backup
      if (TC.stored.hasOwnProperty('list')) {
        localStorage.setItem('tcPersistent', JSON.stringify(TC.stored));
      }
      
      //Always save to server if PHP is available
      if (TC.serverAvailable && TC.stored.hasOwnProperty('list')) {
        $.post('php/tc.php', {action: 'store', tcPersistent: encodeURI(JSON.stringify(TC.stored))})
          .fail(function (xhr) {
            console.error('Storing data on server failed: ' + xhr.status + ': ' + xhr.responseText);
          });
      }
      
      //Prevent too many calls to PHP helper script
      if (!endTimeout) {
        TC.controlsHoldOff = true;
        setTimeout(function () {
          TC.controlsHoldOff = false;
          TC.storeAll(true);
          if (TC.heldOffVolume >= 0) {
            $('#audioPlayer').prop('volume', TC.heldOffVolume / 100);
            TC.heldOffVolume = -1;
          }
        }, TC.holdOff);
      }
    }
  }
    
  //Get the persistent data
  TC.loadAll = function () {
    let storedJson;
    
    storedJson = localStorage.getItem('tcPersistent');
    
    if (storedJson) {
      TC.stored = JSON.parse(storedJson);
      if (!Array.isArray(TC.stored.list)) {
        TC.stored.list = [];
      }
      //Get system and preview if on LAN
      if (TC.lan) {
        if (TC.stored.system) {
          TC.system = TC.stored.system;
        }
        if (TC.stored.schedulerEnabled !== undefined) {
          TC.schedulerEnabled = TC.stored.schedulerEnabled;
        }
        if (TC.stored.systemPreview) {
          TC.systemPreview = TC.stored.systemPreview;
        }
      }
    }
  }
  
  TC.purifyList = function () {
    let i, len, listItem, doneStuff;
    
    if (TC.stored.selectedPlayList >= 0) {
      do {
        doneStuff = false;
        len = TC.stored.list[TC.stored.selectedPlayList].list.length;
        for (i = 0; i < len && TC.stored.selectedPlayList >= 0; i++) {
          listItem = TC.stored.list[TC.stored.selectedPlayList].list[i];
          if (listItem && !listItem.hasOwnProperty('what')) {
            doneStuff = true;
            if (i === 0) {
              TC.stored.list[TC.stored.selectedPlayList].list.shift();
            } else {
              TC.stored.list[TC.stored.selectedPlayList].list.splice(i, 1);
            }
          }
        }
      } while (doneStuff);
    }
  }
  
  //Remove an item from playlist
  TC.listDelete = function (i) {
    event.preventDefault();
    event.stopPropagation();
    TC.stored.list[TC.stored.selectedPlayList].list.splice(i - 1, 1);
    TC.renderAll();
    return false;
  };
  TC.newItemObject = function (newTime) {
    return {time : newTime,
      exception : 'every',
      week : 'all',
      day : 'day',
      what : 'Chime',
      hashSelectedLocal : '',
      hashSelectedRemote : '',
      hash : '',
      mime : '',
      how : 'single',
      volume : 80,
      howLong : 0,
      lastPlay : []
    }
  }
  //Add a new item to playlist
  TC.listAdd = function (i) {
    event.preventDefault();
    event.stopPropagation();
    
    let newTime = '12 : 00 : AM';

    //Copy previous time if not first item and add one hour
    if (TC.stored.list[TC.stored.selectedPlayList].list.length > 0) {
      const prevTime = TC.stored.list[TC.stored.selectedPlayList].list[i - 1].time;
      const time24 = TC.convertTo24Hour(prevTime);
      const parts = time24.split(':');
      const hours = (parseInt(parts[0]) + 1) % 24;
      newTime = TC.convertTo12Hour(String(hours).padStart(2, '0') + ':' + parts[1]);
    }
    
    if (i >= TC.stored.list[TC.stored.selectedPlayList].list.length) {
      TC.stored.list[TC.stored.selectedPlayList].list.push(TC.newItemObject(newTime));
    } else {
      TC.stored.list[TC.stored.selectedPlayList].list.splice(i, 0, TC.newItemObject(newTime));
    }
    TC.renderAll();
    TC.rowClick(i + 1);
    TC.scrollDownPlayList();
    return false;
  };
  
  //Delete the current playlist
  TC.playListDelete = function () {
    $('#playListDeleteName').html(TC.stored.list[TC.stored.selectedPlayList].name);
    $('#confirmDeletePlaylist').modal({ backdrop: 'static', keyboard: false }).one('click', '#deleteListConfirm', function () {
        TC.stored.list.splice(TC.stored.selectedPlayList, 1);
        TC.stored.selectedPlayList -= 1;
        TC.renderAll();
    });
  };
  //Add a new playlist
  TC.playListAdd = function (listName) {
    if (!listName) {
      listName = 'new';
    }
    if (!Array.isArray(TC.stored.list)) {
      TC.stored.list = [];
    }
    TC.stored.list.push({list : [], name : listName});
    TC.stored.selectedPlayList = TC.stored.list.length - 1;
    TC.renderAll();
  };
  //Copy the current playlist
  TC.playListCopy = function (listName) {
    if (!listName) {
      listName = TC.stored.list[TC.stored.selectedPlayList].name + "_copy";
    }
    TC.stored.list.push({list : JSON.parse(JSON.stringify(TC.stored.list[TC.stored.selectedPlayList].list)), name : listName});
    TC.stored.selectedPlayList = TC.stored.list.length - 1;
    TC.renderAll();
  };
  //Rename a playlist
  TC.playListEdit = function () {
    TC.renderAll();
  };
  //Export all playlists as a JSON file download
  TC.exportPlaylists = function () {
    const date = new Date().toISOString().slice(0, 10);
    const filename = 'trafficcontrol-' + date + '.json';
    const json = JSON.stringify(TC.stored, null, 2);
    const blob = new Blob([json], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  };

  //Import playlists from a JSON file (replaces all current data)
  TC.importPlaylists = function () {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.style.display = 'none';
    input.onchange = function () {
      TC.handleImportFile(input);
      document.body.removeChild(input);
    };
    document.body.appendChild(input);
    input.click();
  };
  TC.handleImportFile = function (input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (e) {
      let data;
      try {
        data = JSON.parse(e.target.result);
      } catch (err) {
        alert('Invalid JSON file.');
        return;
      }
      if (!data || !Array.isArray(data.list)) {
        alert('Invalid playlist file: missing playlist data.');
        return;
      }
      for (let i = 0; i < data.list.length; i++) {
        const pl = data.list[i];
        if (!pl || !Array.isArray(pl.list)) {
          alert('Invalid playlist file: playlist ' + (i + 1) + ' is malformed.');
          return;
        }
        for (let j = 0; j < pl.list.length; j++) {
          if (!pl.list[j] || typeof pl.list[j].what !== 'string') {
            alert('Invalid playlist file: item ' + (j + 1) + ' in playlist "' + (pl.name || (i + 1)) + '" is missing required fields.');
            return;
          }
        }
      }
      if (!confirm('This will replace all current playlists with the imported data. Continue?')) return;
      TC.stored = data;
      if (typeof TC.stored.selectedPlayList !== 'number' ||
          TC.stored.selectedPlayList < 0 ||
          TC.stored.selectedPlayList >= TC.stored.list.length) {
        TC.stored.selectedPlayList = TC.stored.list.length > 0 ? 0 : -1;
      }
      delete TC.stored.nextEventTime;
      delete TC.stored.nextEventIndex;
      TC.renderAll();
    };
    reader.readAsText(file);
  };

  //Validate and correct/default the form
  TC.validate = function () {
    let i, listItem, ip1, changed = false, len;
        
    if ((TC.hasOwnProperty('stored')) && (TC.stored.hasOwnProperty('list')) && 
        (TC.stored.hasOwnProperty('selectedPlayList')) &&
        (TC.stored.selectedPlayList >= 0) &&
        (TC.stored.list[TC.stored.selectedPlayList].hasOwnProperty('list'))) {
      len = TC.stored.list[TC.stored.selectedPlayList].list.length;
      
      //Scan items of play list form
      for (i = 0; i < len && TC.stored.selectedPlayList >= 0; i++) {
        listItem = TC.stored.list[TC.stored.selectedPlayList].list[i];
        ip1 = i + 1;
        
        if (listItem.exception === 'never') {
          $('#day' + ip1).css('visibility','hidden');
          $('#week' + ip1).css('visibility','hidden');
          $('#time' + ip1).css('visibility','hidden');
        } else {
          $('#day' + ip1).css('visibility','visible');
          $('#time' + ip1).css('visibility','visible');
          //If playing every day then week number becomes meaningless so reset
          if (listItem.day === 'day') {
            if (listItem.week !== 'all') {
              listItem.week = 'all';
              $('#week' + ip1).val('all');
              changed = true;
            }
            $('#week' + ip1).css('visibility','hidden');
          } else {
            $('#week' + ip1).css('visibility','visible');
          }
        }

        //Directory must be 'seq' or 'rand', file must be 'single'
        if (listItem.mime === 'directory') {
          if (listItem.how === 'single') {
            listItem.how = 'seq'; //Default directory mode
            $('#how' + ip1).val('seq');
            changed = true;
          }
          $('#how' + ip1).css('visibility','visible');
        } else {
          if (listItem.how !== 'single') {
            listItem.how = 'single'; //Default directory mode
            $('#how' + ip1).val('single');
            changed = true;
          }
          $('#how' + ip1).css('visibility','hidden');
        }
        
        //If Chime selected then no Length selection
        if (listItem.what.toLowerCase() === 'chime') {
          $('#howLong' + ip1)[0][0].innerHTML = '-';
        } else {
          $('#howLong' + ip1)[0][0].innerHTML = 'Full';
        }
      }
    }
  }
  
  TC.directorySelect = function ( phash, dirList ) {
    let i, pick, found = false;
    const keys = Object.keys( dirList );
    const playList = TC.stored.list[TC.stored.selectedPlayList];
    const entry = playList.list[TC.selectedRow - 1];
    let dirPlayed;
    
    //Create lastPlay if not existing
    if (!playList.hasOwnProperty( 'lastPlay' )) {
      playList.lastPlay = [];
    }
      
    //Create last play directory if not existing for directory
    if (!(phash in playList.lastPlay)) {
      playList.lastPlay[phash] = {
        hashSelectedLocal : '', 
        hashSelectedRemote : '',
        recentLocal : [],
        recentRemote : []
      };
    }
    
    dirPlayed = playList.lastPlay[phash];
        
    switch (entry.how) {
      case 'seq':
        //Search for last entry in list
        if (keys.length > 0) {
          for (i=0; i < keys.length && entry.hashSelectedLocal !== ''; i++) {
            //If found then try selecting next in list if not at end of list
            if (dirPlayed.hashSelectedLocal === dirList[keys[i]].hash) {
              if (dirList[keys[i + 1]]) {
                found = true;
                entry.hashSelectedLocal = dirList[keys[i + 1]].hash;
                entry.whatSelectedLocal = entry.what + '/' + dirList[keys[i + 1]].name;
              }
              break;
            }
          }
          //Go to first entry
          if (!found) {
            //If at end of list take first entry
            entry.hashSelectedLocal = dirList[keys[0]].hash;
            entry.whatSelectedLocal = entry.what + '/' + dirList[keys[0]].name;
          }
        } else {
          entry.hashSelectedLocal = '';
          entry.whatSelectedLocal = '';     
        }
        break;
      case 'rand':
        //Clean up junk from deprecated data structure
        if (entry.recentLocal) {
          delete entry.recentLocal;
        }
        if (keys.length > 0) {
          if (!dirPlayed.recentLocal) {
            dirPlayed.recentLocal = [];
          }
          //Default pick
          pick = Math.floor( Math.random() * keys.length );
          //Find a random number that hasn't been used recently
          if (( dirPlayed.recentLocal.length > 0 ) && ( entry.hashSelectedLocal !== '' )) {
            //Trim recent items to half length of list
            while (dirPlayed.recentLocal.length > ( keys.length / 2 )) {
              dirPlayed.recentLocal.pop();
            }
            //Look for match, cap attempts to prevent infinite loop
            let attempts = 0;
            do {
              found = false;
              for (i = 0; i < dirPlayed.recentLocal.length; i++) {
                if (dirList[keys[pick]].hash === dirPlayed.recentLocal[i]) {
                  found = true;
                  pick = Math.floor( Math.random() * keys.length );
                  break;
                }
              }
              attempts++;
           } while (found && attempts < keys.length * 2);
          }
          //Selected entry
          entry.hashSelectedLocal = dirList[keys[pick]].hash;
          entry.whatSelectedLocal = entry.what + '/' + dirList[keys[pick]].name;
          //Append selected entry to list of recent
          dirPlayed.recentLocal.unshift(entry.hashSelectedLocal);
        } else {
          entry.hashSelectedLocal = '';
          entry.whatSelectedLocal = '';     
        }
        break;
      //Should never default in normal operation
      default:
        entry.hashSelectedLocal = '';
        entry.whatSelectedLocal = '';
        break;
    }
    dirPlayed.hashSelectedLocal = entry.hashSelectedLocal;        
  }
  
  TC.fileBrowserRow = 0;
  TC.fileBrowserPath = [];
  TC.fileBrowserCurrentHash = '';

  TC.displayFileName = function (what, mime) {
    if (!what) return 'Select...';
    const icon = (mime === 'directory') ? '<i class="bi bi-folder-fill text-warning me-1"></i>' : '<i class="bi bi-music-note text-primary me-1"></i>';
    const name = what.split('/').pop();
    return icon + name;
  };

  TC.openFileBrowser = function (rowIndex) {
    TC.fileBrowserRow = rowIndex;
    TC.fileBrowserPath = [];
    TC.fileBrowserCurrentHash = '';
    TC.loadFileBrowserContents('');
  };

  TC.loadFileBrowserContents = function (hash) {
    TC.fileBrowserCurrentHash = hash;
    const container = $('#fileBrowserContents');
    container.html('<div class="text-center p-4"><i class="bi bi-arrow-repeat spin"></i> Loading...</div>');
    
    $.ajax({
      url: 'php/tc.php?action=listSounds' + (hash ? '&phash=' + encodeURIComponent(hash) : ''),
      dataType: 'json',
      success: function (data) {
        TC.renderFileBrowser(data || []);
      },
      error: function (xhr, status, error) {
        console.error('File browser error:', status, error);
        container.html('<div class="text-danger p-3">Failed to load files</div>');
      }
    });
  };

  TC.renderFileBrowser = function (files) {
    let html = '';

    html += '<div class="list-group list-group-flush">';

    if (TC.fileBrowserPath.length > 0) {
      html += '<a href="#" class="list-group-item list-group-item-action fb-back">';
      html += '<i class="bi bi-arrow-left me-2"></i>.. Back</a>';
    }

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.mime === 'directory') {
        html += '<div class="list-group-item d-flex justify-content-between align-items-center fb-item" ';
        html += 'data-hash="' + TC.escapeHtml(file.hash || '') + '" data-name="' + TC.escapeHtml(file.name) + '" data-path="' + TC.escapeHtml(file.path) + '" data-mime="directory">';
        html += '<a href="#" class="fb-dir flex-grow-1 text-decoration-none text-dark"><i class="bi bi-folder-fill text-warning me-2"></i>' + TC.escapeHtml(file.name) + ' <i class="bi bi-chevron-right text-muted small"></i></a>';
        html += '<div class="btn-group btn-group-sm ms-2">';
        html += '<button type="button" class="btn btn-outline-primary btn-sm fb-select-dir" title="Use folder">Select</button>';
        html += '<button type="button" class="btn btn-outline-secondary btn-sm fb-rename" title="Rename"><i class="bi bi-pencil"></i></button>';
        html += '<button type="button" class="btn btn-outline-danger btn-sm fb-delete" title="Delete"><i class="bi bi-trash"></i></button>';
        html += '</div></div>';
      } else if (file.path !== 'Chime') {
        html += '<div class="list-group-item d-flex justify-content-between align-items-center fb-item" ';
        html += 'data-hash="' + TC.escapeHtml(file.hash || '') + '" data-path="' + TC.escapeHtml(file.path) + '" data-name="' + TC.escapeHtml(file.name) + '" data-mime="' + TC.escapeHtml(file.mime) + '">';
        html += '<a href="#" class="fb-file flex-grow-1 text-decoration-none text-dark"><i class="bi bi-music-note text-primary me-2"></i>' + TC.escapeHtml(file.name) + '</a>';
        html += '<div class="btn-group btn-group-sm ms-2">';
        html += '<button type="button" class="btn btn-outline-secondary btn-sm fb-rename" title="Rename"><i class="bi bi-pencil"></i></button>';
        html += '<button type="button" class="btn btn-outline-danger btn-sm fb-delete" title="Delete"><i class="bi bi-trash"></i></button>';
        html += '</div></div>';
      } else {
        html += '<a href="#" class="list-group-item list-group-item-action fb-file fb-item" ';
        html += 'data-hash="" data-path="Chime" data-name="Chime" data-mime="audio/chime">';
        html += '<i class="bi bi-bell text-primary me-2"></i>Chime</a>';
      }
    }
    
    if (files.length === 0 && TC.fileBrowserPath.length > 0) {
      html += '<div class="list-group-item text-muted">No audio files in this folder</div>';
    }
    
    html += '</div>';
    
    $('#fileBrowserContents').html(html);
    TC.bindFileBrowserEvents();
    TC.updateBreadcrumb();
  };

  TC.bindFileBrowserEvents = function () {
    $('#fileBrowserContents').off('click').on('click', '.fb-back', function (e) {
      e.preventDefault();
      TC.fileBrowserGoUp();
    }).on('click', '.fb-dir', function (e) {
      e.preventDefault();
      const $fbEl1 = $(this).closest('.fb-item');
      TC.fileBrowserEnterDir($fbEl1.attr('data-hash'), $fbEl1.attr('data-name'));
    }).on('click', '.fb-select-dir', function (e) {
      e.preventDefault();
      e.stopPropagation();
      const $fbEl2 = $(this).closest('.fb-item');
      TC.fileBrowserSelectItem($fbEl2.attr('data-path'), $fbEl2.attr('data-hash'), 'directory');
    }).on('click', '.fb-file', function (e) {
      e.preventDefault();
      const $fbEl3 = $(this).closest('.fb-item');
      TC.fileBrowserSelectItem($fbEl3.attr('data-path'), $fbEl3.attr('data-hash'), $fbEl3.attr('data-mime'));
    }).on('click', '.fb-rename', function (e) {
      e.preventDefault();
      e.stopPropagation();
      const $fbEl4 = $(this).closest('.fb-item');
      TC.fileBrowserRename($fbEl4.attr('data-path'), $fbEl4.attr('data-name'));
    }).on('click', '.fb-delete', function (e) {
      e.preventDefault();
      e.stopPropagation();
      const $fbEl5 = $(this).closest('.fb-item');
      TC.fileBrowserDelete($fbEl5.attr('data-path'), $fbEl5.attr('data-name'));
    });
  };

  TC.fileBrowserNewFolder = function () {
    const name = prompt('Enter folder name:');
    if (name && name.trim()) {
      const currentPath = TC.fileBrowserPath.map(function(p) { return p.name; }).join('/');
      $.ajax({
        url: 'php/tc.php',
        method: 'POST',
        data: { action: 'createFolder', path: currentPath, name: name.trim() },
        dataType: 'json',
        success: function (result) {
          if (result.error) {
            alert('Error: ' + result.error);
          } else {
            TC.loadFileBrowserContents(TC.fileBrowserCurrentHash);
          }
        },
        error: function () {
          alert('Failed to create folder');
        }
      });
    }
  };

  TC.fileBrowserUpload = function (files) {
    if (!files || files.length === 0) return;

    const formData = new FormData();
    formData.append('action', 'uploadFile');
    const currentPath = TC.fileBrowserPath.map(function(p) { return p.name; }).join('/');
    formData.append('path', currentPath);

    for (let i = 0; i < files.length; i++) {
      formData.append('files[]', files[i]);
    }

    const container = $('#fileBrowserContents');
    container.html('<div class="text-center p-4"><i class="bi bi-arrow-repeat spin"></i> Uploading...</div>');
    
    $.ajax({
      url: 'php/tc.php',
      method: 'POST',
      data: formData,
      processData: false,
      contentType: false,
      dataType: 'json',
      success: function (result) {
        if (result.error) {
          alert('Error: ' + result.error);
        } else if (result.uploaded) {
          if (result.errors && result.errors.length > 0) {
            alert('Uploaded ' + result.uploaded + ' file(s). Errors:\n' + result.errors.join('\n'));
          }
        }
        TC.loadFileBrowserContents(TC.fileBrowserCurrentHash);
      },
      error: function () {
        alert('Upload failed');
        TC.loadFileBrowserContents(TC.fileBrowserCurrentHash);
      }
    });
    
    $('#fileBrowserUpload').val('');
  };

  TC.fileBrowserRename = function (path, currentName) {
    const newName = prompt('Enter new name:', currentName);
    if (newName && newName.trim() && newName !== currentName) {
      $.ajax({
        url: 'php/tc.php',
        method: 'POST',
        data: { action: 'renameItem', path: path, newName: newName.trim() },
        dataType: 'json',
        success: function (result) {
          if (result.error) {
            alert('Error: ' + result.error);
          } else {
            TC.loadFileBrowserContents(TC.fileBrowserCurrentHash);
          }
        },
        error: function () {
          alert('Failed to rename');
        }
      });
    }
  };

  TC.fileBrowserDelete = function (path, name) {
    if (confirm('Delete "' + name + '"?\n\nThis cannot be undone.')) {
      $.ajax({
        url: 'php/tc.php',
        method: 'POST',
        data: { action: 'deleteItem', path: path },
        dataType: 'json',
        success: function (result) {
          if (result.error) {
            alert('Error: ' + result.error);
          } else {
            TC.loadFileBrowserContents(TC.fileBrowserCurrentHash);
          }
        },
        error: function () {
          alert('Failed to delete');
        }
      });
    }
  };

  TC.escapeHtml = function (str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };

  TC.updateBreadcrumb = function () {
    let html = '<span class="text-muted">Music</span>';
    for (let i = 0; i < TC.fileBrowserPath.length; i++) {
      html += ' <i class="bi bi-chevron-right small text-muted"></i> ' + TC.escapeHtml(TC.fileBrowserPath[i].name);
    }
    $('#fileBrowserBreadcrumb').html(html);
  };

  TC.fileBrowserEnterDir = function (hash, name) {
    TC.fileBrowserPath.push({ hash: hash, name: name });
    TC.loadFileBrowserContents(hash);
  };

  TC.fileBrowserGoUp = function () {
    TC.fileBrowserPath.pop();
    const parentHash = TC.fileBrowserPath.length > 0 ? TC.fileBrowserPath[TC.fileBrowserPath.length - 1].hash : '';
    TC.loadFileBrowserContents(parentHash);
  };

  TC.fileBrowserSelectItem = function (path, hash, mime) {
    const entry = TC.stored.list[TC.stored.selectedPlayList].list[TC.fileBrowserRow - 1];
    
    entry.what = path;
    entry.hash = hash;
    entry.mime = mime;
    
    $('#what' + TC.fileBrowserRow).html(TC.displayFileName(path, mime)).attr('title', path);
    $('#fileBrowserModal').modal('hide');
    
    if (mime === 'directory') {
      TC.validate();
      $.ajax({
        url: 'php/tc.php?action=listFiles&phash=' + encodeURIComponent(hash),
        dataType: 'json'
      }).done(function (data) {
        TC.directorySelect(hash, data);
        TC.storeAll(false);
      }).fail(function (xhr) {
        console.error(xhr.status + ': ' + xhr.responseText);
        TC.storeAll(false);
      });
    } else {
      entry.hashSelectedLocal = hash;
      entry.whatSelectedLocal = path;
      TC.validate();
      TC.storeAll(false);
    }
  };

  //Copy selected file item to selected "What" column and array
  // Find volume of individual file given by hash
  TC.fileVolume = function(fileHash) {
    if (!fileHash) {
      return 80;
    }
    if ((TC.stored.audioVolumes) && (TC.stored.audioVolumes[fileHash])) {
      return TC.stored.audioVolumes[fileHash];
    } else {
      return 80;
    }
  }
  //Return the composite volume of the playing file and selected item
  TC.compositeVolume = function() {
    let compositeVolume;
    const entry = TC.stored.list[TC.stored.selectedPlayList].list[TC.playerIndex];
    
    if (entry.hasOwnProperty('hashSelectedLocal') && entry.hashSelectedLocal ) {
      compositeVolume = Math.floor((TC.fileVolume(entry.hashSelectedLocal) * entry.volume) / 80);
    } else {
      if (entry.hasOwnProperty('volume')) {
        compositeVolume = entry.volume;
      } else {
        compositeVolume = 80;
      }
    }
    if (compositeVolume > 100) {
      compositeVolume = 100;
    }
    // Convert from linear to exponential (for DB scale)
    // 99 represents 0dB then approx 0.46dB steps (measured) down
    compositeVolume = Math.pow(10, (compositeVolume + 1) / 50) - 1;
        
    return compositeVolume;
  }
  //Return the item volume from the player volume taking into account the volume of the playing file
  TC.reverseCompositeVolume = function (compositeVolume) {
    const entry = TC.stored.list[TC.stored.selectedPlayList].list[TC.playerIndex];
    let entryVolume;
    
    compositeVolume = (Math.log10(compositeVolume + 1) * 50) - 1;
    
    entryVolume = Math.floor((compositeVolume * 80) / TC.fileVolume(entry.hashSelectedLocal));
    
    if (entryVolume > 100) {
      entryVolume = 100;
    }
    if (entryVolume < 0) {
      entryVolume = 0;
    }
    
    return entryVolume;
  }
  
  //Catch changes to selectors and volume
  TC.formChange = function (event) {
    let prop, index, value;
    if (event.target.id && (event.target.value !== undefined)) {
      TC.validate();
      switch (event.target.id) {
        case 'playListSelect':
          if (TC.stored.selectedPlayList !== event.target.selectedIndex) {
            TC.stored.selectedPlayList = event.target.selectedIndex;
            TC.renderAll();
          }
          break;
        case 'modeToggleButton':
          if (TC.system !== $('#modeToggleButton').prop('checked')) {
            TC.system = $('#modeToggleButton').prop('checked');
            TC.forceRemoteSave = true;
            TC.renderAll();
          }
          break;
        case 'schedulerToggleButton':
          if (TC.schedulerEnabled !== $('#schedulerToggleButton').prop('checked')) {
            TC.schedulerEnabled = $('#schedulerToggleButton').prop('checked');
            TC.forceRemoteSave = true;
            TC.renderAll();
          }
          break;
        case 'previewToggleButton':
          if (TC.systemPreview !== $('#previewToggleButton').prop('checked')) {
            TC.systemPreview = $('#previewToggleButton').prop('checked');
            TC.renderAll();
          }
          break;
        case 'audioDeviceSelect':
          break;
        default:
          prop = event.target.id.replace(/[\d]/g, '');
          index = event.target.id.replace(/[^\d]/g, '') - 1;
          if (prop === 'volume') {
            // Handled by separate slider event
          } else {
            TC.stored.list[TC.stored.selectedPlayList].list[index][prop] = event.target.value;
            TC.storeAll(false);
          }
          break;
      }
    }
  };
  
  TC.timeChanged = function (index, time24) {
    TC.stored.list[TC.stored.selectedPlayList].list[index]['time'] = TC.convertTo12Hour(time24);
    $('#time' + (index + 1)).attr('data-time', time24).text(TC.formatTimeDisplay(time24));
    TC.storeAll(false);
    TC.nextEventReIndex = true;
  };

  TC.formatTimeDisplay = function (time24) {
    if (!time24) return '12:00 AM';
    const parts = time24.split(':');
    let hours = parseInt(parts[0]);
    const minutes = parts[1] || '00';
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    if (hours === 0) hours = 12;
    return hours + ':' + minutes + ' ' + ampm;
  };

  TC.timePickerIndex = 0;

  TC.openTimePicker = function (rowIndex) {
    TC.timePickerIndex = rowIndex;
    const currentTime = $('#time' + rowIndex).attr('data-time') || '12:00';
    const parts = currentTime.split(':');
    let hours = parseInt(parts[0]);
    const minutes = parseInt(parts[1]) || 0;
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    if (hours === 0) hours = 12;

    $('#tpHour').val(hours);
    $('#tpMinute').val(String(minutes).padStart(2, '0'));
    $('#tpAM').removeClass('active');
    $('#tpPM').removeClass('active');
    if (ampm === 'AM') {
      $('#tpAM').addClass('active');
    } else {
      $('#tpPM').addClass('active');
    }

    const modal = new bootstrap.Modal(document.getElementById('timePickerModal'));
    modal.show();
  };

  TC.confirmTimePicker = function () {
    let hours = parseInt($('#tpHour').val());
    const minutes = $('#tpMinute').val();
    const ampm = $('#tpPM').hasClass('active') ? 'PM' : 'AM';

    if (ampm === 'PM' && hours !== 12) hours += 12;
    if (ampm === 'AM' && hours === 12) hours = 0;

    const time24 = String(hours).padStart(2, '0') + ':' + minutes;
    TC.timeChanged(TC.timePickerIndex - 1, time24);

    bootstrap.Modal.getInstance(document.getElementById('timePickerModal')).hide();
  };

  TC.adjustTime = function (field, delta) {
    const $field = $('#tp' + field);
    let val = parseInt($field.val());
    
    if (field === 'Hour') {
      val += delta;
      if (val > 12) val = 1;
      if (val < 1) val = 12;
      $field.val(val);
    } else {
      val += delta;
      if (val >= 60) val = 0;
      if (val < 0) val = 59;
      $field.val(String(val).padStart(2, '0'));
    }
  };

  TC.toggleAmPm = function (period) {
    $('#tpAM').removeClass('active');
    $('#tpPM').removeClass('active');
    $('#tp' + period).addClass('active');
  }; 
  
  TC.bindPlayListInput = function () {
    $('#playListNameDone').click(function () {
      const value = $('#playListNameInput')[0].value;
      
      if (value.length > 0) {
        TC.stored.list[TC.stored.selectedPlayList].name = value;
        TC.renderAll();
      }
    });
  };
  
  TC.playEngine = function (player, source, volume) {
    $('#audioPlayerDiv').fadeIn(200);
    if (TC.hidePlayerTimeout) {
      clearTimeout(TC.hidePlayerTimeout);
    }
    player.attr("src", 'Music/' + source);
    player.prop('volume', volume / 100);
    player[0].pause();
    player[0].load();
    player[0].play();    
  }
  
  //Fadeout processing
  TC.howLong = function () {
    const entry = TC.stored.list[TC.stored.selectedPlayList].list[TC.playerIndex];
    const player = $('#audioPlayer');
    const stamp = Date.now().toString();
    
    //Plan fade out event after howLong seconds
    player.attr('playStamp', stamp);
    if (parseInt(entry.howLong)) {
      setTimeout(function () {
        if (entry.what.toLowerCase() === 'chime') {
          //Special case for Chime, we must now play the end chime.
          let compositeVolume = TC.compositeVolume(), source = '.system/Chime_end.flac';
          TC.playEngine(player, source, compositeVolume);
        } else {
          //Only fade if still playing same music as when initiated
          if (player.attr('playStamp') === stamp) {
            TC.fading = true;
            player.animate({volume: 0}, TC.fadeTime);
            //Stop player after fade out and then restore volume level
            setTimeout(function () {
              player[0].pause();
              player.prop('volume', TC.compositeVolume() / 100);
              TC.fading = false;
            }, TC.fadeTime + 100);
          }
        }
      }, entry.howLong * 1000);
    } 
  }
  
  //Handle media preview
  TC.play = function ( index, previewCall ) {
    const entry = TC.stored.list[TC.stored.selectedPlayList].list[index - 1];
    const player = $('#audioPlayer');
    let source, compositeVolume;
    
    if (!entry || !entry.what) {
      console.error('No valid entry to play at index ' + index);
      return;
    }
        
    TC.playerIndex = index - 1;
    
    compositeVolume = TC.compositeVolume();
    

    if (!TC.system || (!TC.systemPreview && previewCall)) {
      if (entry.what.toLowerCase() === 'chime') {
        source = '.system/Chime_start.flac'
        entry.whatSelectedLocal = source;
        entry.hashSelectedLocal = '';
      } else if (entry.mime === 'directory') {
        source = entry.whatSelectedLocal;
      } else {
        source = entry.what;
      }
      
      if (!source) {
        console.error('No source file available for playback');
        return;
      }
      
      console.log('Playing locally: ' + source + ' at volume ' + compositeVolume + '% for ' + entry.howLong + ' seconds');
      
      TC.playEngine(player, source, compositeVolume);
      TC.howLong();
      $( '#nowPlayingTag' ).empty().append( source );
    }
    if (TC.system && TC.systemPreview && previewCall) {
      console.log('Playing on system: ' + (entry.whatSelectedRemote || entry.what) + ' at volume ' + compositeVolume + '%');
      $.ajax({ url: 'php/tc.php?action=play&index=' + TC.playerIndex,
        error: function (xhr) {
          console.error(xhr.status + ': ' + xhr.responseText)
        }
      });    
    }
    
    //Choose next track
    if (entry.mime === 'directory') {
      $.ajax({ url: 'php/tc.php?action=listFiles&phash=' + encodeURIComponent(entry.hash),
        dataType: 'json'
      }).done(function (data) {
        TC.directorySelect(entry.hash, data);
        TC.storeAll(false);
      }).fail(function (xhr) {
        console.error(xhr.status + ': ' + xhr.responseText);
      });
    }
  }
  
  TC.stop = function ( index ) {
    const player = $('#audioPlayer');

    if (TC.system && TC.systemPreview) {
      $.ajax({ url: 'php/tc.php?action=stop',
        error: function (xhr) {
          console.error(xhr.status + ': ' + xhr.responseText)
        }
      });
    } else {
      player[0].pause();
    }
  }

  TC.sortCompareTime = function (a, b) {
    const aBits = TC.timeToBits(a.time);
    const bBits = TC.timeToBits(b.time);
        
    if (aBits[0] < bBits[0]) {
      return -1;
    }
    if (aBits[0] === bBits[0]) {
      if (aBits[1] < bBits[1]) {
        return -1;
      }
      if  (aBits[1] === bBits[1]) {
        return 0;
      }
    }
    return 1;
  }
    
  TC.SortPlaylist = function () {
    let len, list, i, needsSorting = false;
    
    if (TC.stored.selectedPlayList >= 0) {
      len = TC.stored.list[TC.stored.selectedPlayList].list.length;
      list = TC.stored.list[TC.stored.selectedPlayList].list;

      //Scan items of play list form
      for (i = 1; i < len; i++) {
        if (TC.sortCompareTime(list[i - 1], list[i]) === 1 ) {
          needsSorting = true;
        }
      }
      if (needsSorting) {
        list.sort(TC.sortCompareTime);
        TC.renderAll();
      }
    }
  }
  
  //Convert time to 24 hour format in integers
  TC.timeToBits = function (eventTime) {
    const timeBits = eventTime.replace(/\s/g, '').split(':');
    //Convert AM/PM + hour to 24 hour
    timeBits[0] = parseInt(timeBits[0]);
    if (timeBits[0] === 12) {
      timeBits[0] = (timeBits[2] === 'PM') ? 12 : 0;
    } else {
      if (timeBits[2] === 'PM') {
        timeBits[0] += 12;
      }
    }
    timeBits[1] = parseInt(timeBits[1]);
    
    return timeBits;
  }
  
  TC.nextEvent = function (d) {
    let bestTime = -1, len, listItem, i, timeBits, dayMatch;
    const weekNumber = parseInt((d.getDate() - 1) / 7) + 1;
    const day = d.getDay();
    const hour = d.getHours();
    const minute = d.getMinutes();
    const weekDay = [ 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday' ];
    const itemDate = new Date();

    if (TC.stored.selectedPlayList >= 0) {
      len = TC.stored.list[TC.stored.selectedPlayList].list.length;

      //Scan items of play list form
      for (i = 0; i < len && TC.stored.selectedPlayList >= 0; i++) {
        //Scrub previous next markers
        if ( $( '#tableRow' + (i)).hasClass( "table-success" ) ) {
          $( '#tableRow' + (i)).removeClass( "table-success" );
        }
        
        listItem = TC.stored.list[TC.stored.selectedPlayList].list[i];

        //Skip if never playing
        if (listItem.exception === 'never') {
          continue;
        }

        dayMatch = ((listItem.week === 'all' || (parseInt(listItem.week) === weekNumber)) && 
                  ((listItem.day === 'day') || (listItem.day === weekDay[day])));
        
        //Skip if wrong day
        if (!dayMatch) {
          continue;
        }
          
        timeBits = TC.timeToBits(listItem.time);
          
        //Skip any time that is past now
        if (hour > timeBits[0]) {
          continue;
        }
        if ((hour === timeBits[0]) && (minute >= timeBits[1])) {
          continue;
        }
        //Calculate timestamp of item
        itemDate.setSeconds(0);
        itemDate.setMinutes(timeBits[1]);
        itemDate.setHours(timeBits[0]);
        
        if ((bestTime === -1) || (itemDate.getTime() < bestTime)) {
          bestTime = itemDate.getTime();
          TC.nextEventTime = bestTime;
          TC.nextEventIndex = i;
        }
      }
      if (TC.nextEventIndex > 0) {
        $( '#tableRow' + (TC.nextEventIndex + 1)).addClass( "table-success" );
      }
    }
  }
  
  TC.eventClock = function () {
   //Check time every 1000 ms
    setInterval(function () {
      const d = new Date(), minuteNow = d.getMinutes(), hourNow = d.getHours(), beenSleeping = ((d.getTime() - TC.lastTimeLoop) > 10000);
      
      TC.lastTimeLoop = d.getTime();
     
      if (minuteNow !== TC.lastMinute) {
        TC.lastMinute = minuteNow;
        if (hourNow !== TC.lastHour) {
          TC.lastHour = hourNow;
          //Refresh the next event at the start of each day
          if (hourNow === 0) {
            TC.nextEvent(d);
          }
        }
      }
      //Only perform these function is no item times are being adjusted
      if ($('.timePicker').is(":visible") === false) {
        //Get next event if required 
        if ((TC.nextEventIndex === -1) || TC.nextEventReIndex) {
          TC.nextEventReIndex = false;
          TC.nextEvent(d);
        }
        //Sort playlist if it needs sorting
        TC.SortPlaylist();
        //Play the next event when time to
        if ((d.getTime() >= TC.nextEventTime) && (TC.nextEventIndex >= 0)) {
          //Only play if in "local" mode and not coming out of sleep
          if (!TC.system && !beenSleeping) {
            TC.play(TC.nextEventIndex + 1, false)
          }
          TC.nextEvent(d);
        }
      }
    }, 1000);
  }  
  
  TC.audioDevices = [];
  TC.selectedAudioDevice = 'auto';
  
  TC.loadAudioDevices = function () {
    $.ajax({
      url: 'php/tc.php?action=audioDevices',
      dataType: 'json',
      timeout: 5000,
      success: function (devices) {
        TC.audioDevices = devices || [];
        TC.renderAudioDeviceSelector();
      },
      error: function () {
        console.log('Failed to load audio devices');
      }
    });
    
    $.ajax({
      url: 'php/tc.php?action=getAudioDevice',
      dataType: 'json',
      timeout: 5000,
      success: function (result) {
        if (result && result.device) {
          TC.selectedAudioDevice = result.device;
          $('#audioDeviceSelect').val(TC.selectedAudioDevice);
        }
      }
    });
  };
  
  TC.refreshAudioDevices = function () {
    const $btn = $('.audio-device-container .bi-arrow-clockwise');
    $btn.addClass('spin');
    $.ajax({
      url: 'php/tc.php?action=audioDevices',
      dataType: 'json',
      timeout: 5000,
      success: function (devices) {
        TC.audioDevices = devices || [];
        TC.renderAudioDeviceSelector();
      },
      complete: function () {
        setTimeout(function () { $btn.removeClass('spin'); }, 500);
      }
    });
  };
  
  TC.renderAudioDeviceSelector = function () {
    const $select = $('#audioDeviceSelect');
    let html = '';
    
    for (let i = 0; i < TC.audioDevices.length; i++) {
      const device = TC.audioDevices[i];
      html += '<option value="' + TC.escapeHtml(device.id) + '"';
      if (device.id === TC.selectedAudioDevice) {
        html += ' selected';
      }
      html += '>' + TC.escapeHtml(device.displayName) + '</option>';
    }
    
    if (html) {
      $select.html(html);
    }
  };
  
  TC.setAudioDevice = function (deviceId) {
    TC.selectedAudioDevice = deviceId;
    $.ajax({
      url: 'php/tc.php',
      method: 'POST',
      data: { action: 'setAudioDevice', device: deviceId },
      dataType: 'json',
      success: function (result) {
        if (result.error) {
          console.error('Failed to set audio device:', result.error);
        }
      },
      error: function () {
        console.error('Failed to set audio device');
      }
    });
  };
  
  TC.init2 = function () {
    const currentTimeZone = moment.tz.guess();

    TC.loadAll();
    TC.purifyList();
    TC.renderAll();
    TC.bindPlayListInput();
    TC.attachItemEventHandlers();
    TC.eventClock();
    TC.loaded = true;
    
    if (TC.lan) {
      TC.loadAudioDevices();
      $('#audioDeviceSelect').on('change', function () {
        TC.setAudioDevice($(this).val());
      });
    }
    
    if (!TC.stored.hasOwnProperty('timezone') || (TC.stored.timezone !== currentTimeZone)) {
      TC.stored.timezone = currentTimeZone;
      TC.storeAll(false);
    }
  }
  
  //Initialise
  TC.init = function () {
    
    //Bind to audio player events
    $('#audioPlayerDiv').hide();
    $('#audioPlayer').on('pause ended', function(){
      //Clear the player 10 seconds from now
      if (TC.hidePlayerTimeout) {
        clearTimeout(TC.hidePlayerTimeout);
      }
      TC.hidePlayerTimeout = setTimeout(function() {
        $('#audioPlayerDiv').fadeOut(200);
      }, 3000);
    });
    $('#audioPlayer').on('play', function(){
      if (TC.hidePlayerTimeout) {
        clearTimeout(TC.hidePlayerTimeout);
      }      
    });
    $('#audioPlayer').on('volumechange', function(){
      const volume = TC.reverseCompositeVolume(Math.round($('#audioPlayer').prop('volume') * 100));

      if (!TC.fading && TC.playerIndex >= 0) {
        TC.stored.list[TC.stored.selectedPlayList].list[TC.playerIndex]['volume'] = volume;
        const volSlider = $('#volume' + (TC.playerIndex + 1));
        if (volSlider.length) {
          volSlider.val(volume);
          volSlider.siblings('.volume-display').text(volume);
        }
        if (volume === 100) {
          $('#audioPlayer').prop('volume', TC.compositeVolume() / 100);
        }
      }
    });
    
    TC.serverAvailable = false;

    //Check server availability and LAN status, then load data
    $.ajax({ url: 'php/tc.php?action=lan', timeout: 3000 })
      .then(function (result) {
        TC.serverAvailable = true;
        if (result !== 'lan') {
          TC.system = false;
          TC.systemPreview = false;
          TC.lan = false;
        }
        return $.ajax({ url: 'php/tc.php?action=load', timeout: 5000, dataType: 'json' });
      })
      .then(function (data) {
        if (data) {
          try {
            TC.stored = (typeof data === 'string') ? JSON.parse(data) : data;
            if (!Array.isArray(TC.stored.list)) {
              TC.stored.list = [];
            }
            localStorage.setItem('tcPersistent', JSON.stringify(TC.stored));
            if (TC.stored.system !== undefined) {
              TC.system = TC.stored.system && TC.lan;
            }
            if (TC.stored.schedulerEnabled !== undefined) {
              TC.schedulerEnabled = TC.stored.schedulerEnabled && TC.lan;
            }
            if (TC.stored.systemPreview !== undefined) {
              TC.systemPreview = TC.stored.systemPreview && TC.lan;
            }
          } catch (err) {
            console.error('Failed to parse server data:', err);
            TC.loadAll();
          }
        } else {
          TC.loadAll();
        }
      })
      .catch(function () {
        console.log('Server not available or load failed, using local storage');
        TC.loadAll();
      })
      .always(function () {
        TC.init2();
      });
  }

  return TC;
})();
