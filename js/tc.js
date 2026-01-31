"use strict";

var TC = new function () {
  var TC = this;
  TC.stored = {};
  TC.stored.list = new Array();
  TC.selectedRow = 0;
  TC.stored.selectedPlayList = -1;
  TC.playerIndex = -1;
  TC.loaded = false;
  TC.system = true;
  TC.systemPreview = false;
  TC.lan = true;
  TC.serverAvailable = false;
  TC.holdOff = 1000;
  TC.heldOffVolume = -1;
  TC.fading = false;
  TC.fadeTime = 3000;
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
    var d = $('#playListTableDiv'), scrollPos = d.scrollTop();
    if ( TC.stored.list[TC.stored.selectedPlayList].list.length === TC.selectedRow) {
      d.scrollTop(d.prop("scrollHeight"));
    }
  }
  
  TC.nudgeList = function (pickiBox) {
    var boxBotLeft = pickiBox.offset().top + (pickiBox.height() * 3.3),
        d = $('#playListTableDiv'), scrollPos = d.scrollTop(),
        scrollWindowBotLeft = d.offset().top + d.height(),
        offset = boxBotLeft - scrollWindowBotLeft;
    
    if (offset > 0) {
      d.scrollTop(scrollPos + offset);
    }
  }
  
  TC.convertTo24Hour = function (timeStr) {
    if (!timeStr) return '12:00';
    var parts = timeStr.replace(/\s/g, '').split(':');
    var hours = parseInt(parts[0]);
    var minutes = parts[1] || '00';
    var ampm = parts[2] || 'AM';
    if (ampm === 'PM' && hours !== 12) hours += 12;
    if (ampm === 'AM' && hours === 12) hours = 0;
    return String(hours).padStart(2, '0') + ':' + String(minutes).padStart(2, '0');
  };

  TC.convertTo12Hour = function (time24) {
    if (!time24) return '12 : 00 : AM';
    var parts = time24.split(':');
    var hours = parseInt(parts[0]);
    var minutes = parts[1] || '00';
    var ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    if (hours === 0) hours = 12;
    return String(hours).padStart(2, '0') + ' : ' + minutes + ' : ' + ampm;
  };

  //Render the JS generated parts of the page
  TC.renderAll = function () {
    var listHtml = '', listSelHtml = '', len = 0, i = 0, ip1, listItem, scrollPos;
    
    TC.purifyList();
   
    $('#modeToggleButton').prop('checked', TC.system);
    $('#previewToggleButton').prop('checked', TC.systemPreview);
    $('.preview-mode-container').css('visibility',(TC.system)?'visible':'hidden');
    $('.mode-container').css('visibility',(TC.lan)?'visible':'hidden');
    $('.audio-device-container').css('display',(TC.lan)?'block':'none');
    
    //Playlist selector
    listSelHtml+='                  <table class="playListSelectorTable">\n';
    listSelHtml+='                    <tbody>\n';
    listSelHtml+='                      <tr id="playListSelRow">\n';
    listSelHtml+='                        <td class="playListButtons d-flex gap-2 align-items-center">\n';
    if (TC.stored.list.length === 0) {
      listSelHtml+='                          <i class="bi bi-plus-circle" data-bs-toggle="modal" data-bs-target="#editPlaylistName" onclick="TC.playListAdd();" title="Add a playlist"></i>\n';
      listSelHtml+='                        </td>\n';
      listSelHtml+='                        <th class="small text-muted">Start a playlist</th>\n';
      listSelHtml+='                      </tr>\n';
      listSelHtml+='                    </tbody>\n';
      listSelHtml+='                  </table>\n';
    } else {
      len = TC.stored.list[TC.stored.selectedPlayList].list.length;
      listSelHtml+='                          <i class="bi bi-plus-circle" data-bs-toggle="modal" data-bs-target="#editPlaylistName" onclick="TC.playListAdd();" title="Add"></i>\n';
      listSelHtml+='                          <i class="bi bi-copy" data-bs-toggle="modal" data-bs-target="#editPlaylistName" onclick="TC.playListCopy();" title="Copy"></i>\n';
      listSelHtml+='                          <i class="bi bi-pencil-square" data-bs-toggle="modal" data-bs-target="#editPlaylistName" onclick="TC.playListEdit();" title="Rename"></i>\n';
      listSelHtml+='                          <i class="bi bi-trash text-danger" data-bs-toggle="modal" data-bs-target="#confirmDeletePlaylist" onclick="TC.playListDelete();" title="Delete"></i>\n';
      listSelHtml+='                        </td>\n';
      listSelHtml+='                      </tr>\n';
      listSelHtml+='                      <tr>\n';
      listSelHtml+='                        <td colspan="2" class="pt-2">\n';
      listSelHtml+='                          <select id="playListSelect" name="playList" class="form-select form-select-sm">\n';
      for (i = 0; i < TC.stored.list.length; i++) {
        listSelHtml+='                            <option value="' + TC.stored.list[i].name + '"' + ((i === TC.stored.selectedPlayList ) ? ' selected' : '') + '>' + TC.stored.list[i].name + '</option>\n';
      }
      listSelHtml+='                         </select>\n';
      listSelHtml+='                        </td>\n';
      listSelHtml+='                      </tr>\n';
      listSelHtml+='                    </tbody>\n';
      listSelHtml+='                  </table>\n';
    }
    if (TC.stored.list.length > 0) {
      listHtml+='        <div id="playListTableDiv" class="scrollable-area">\n';
      if (len === 0) {
        listHtml+='          <div class="playlist-empty text-center py-5">\n';
        listHtml+='            <i class="bi bi-plus-circle action-icon add fs-1" data-bs-toggle="tooltip" title="Add row" onclick="TC.listAdd(0);"></i>\n';
        listHtml+='            <div class="mt-3 text-muted">Playlist is empty. Click to add items.</div>\n';
        listHtml+='          </div>\n';
      } else {
        listHtml+='          <div id="playListCards" class="playlist-cards">\n';
        for (i = 0; i < len && TC.stored.selectedPlayList >= 0; i++) {
          listItem = TC.stored.list[TC.stored.selectedPlayList].list[i];
          if (!listItem.hasOwnProperty('what')) {
            continue;
          }
          ip1 = i + 1;
          var time24 = TC.convertTo24Hour(listItem.time);
          listHtml+='            <div id="tableRow' + ip1 + '" class="playlist-item" onclick="TC.rowClick(' + ip1 + ');">\n';
          listHtml+='              <div class="playlist-item-header">\n';
          listHtml+='                <button type="button" class="btn btn-outline-secondary btn-sm content-what text-start text-truncate flex-grow-1" id="what' + ip1 + '" data-bs-toggle="modal" data-bs-target="#fileBrowserModal" onclick="event.stopPropagation();TC.openFileBrowser(' + ip1 + ');" title="' + listItem.what + '">' + TC.displayFileName(listItem.what, listItem.mime) + '</button>\n';
          listHtml+='                <div class="playlist-item-actions">\n';
          listHtml+='                  <select id="how' + ip1 + '" name="how' + ip1 + '" class="form-select form-select-sm content-how" onclick="event.stopPropagation();">\n';
          listHtml+='                    <option value="single" ' + ((listItem.how === 'single') ? 'selected' : '') + '>Single</option>\n';
          listHtml+='                    <option value="rand" ' + ((listItem.how === 'rand') ? 'selected' : '') + '>Random</option>\n';
          listHtml+='                    <option value="seq" ' + ((listItem.how === 'seq') ? 'selected' : '') + '>Sequential</option>\n';
          listHtml+='                  </select>\n';
          listHtml+='                  <i class="bi bi-plus-circle action-icon add" title="Add After" onclick="event.stopPropagation();TC.listAdd(' + ip1 + ');"></i>\n';
          listHtml+='                  <i class="bi bi-dash-circle action-icon remove" title="Remove" onclick="event.stopPropagation();TC.listDelete(' + ip1 + ');"></i>\n';
          listHtml+='                </div>\n';
          listHtml+='              </div>\n';
          listHtml+='              <div class="playlist-item-schedule">\n';
          listHtml+='                <span class="schedule-label">Schedule</span>\n';
          listHtml+='                <select id="exception' + ip1 + '" name="exception' + ip1 + '" class="form-select form-select-sm">\n';
          listHtml+='                  <option value="every" ' + ((listItem.exception === 'every') ? 'selected' : '') + '>Every</option>\n';
          listHtml+='                  <option value="except" ' + ((listItem.exception === 'except') ? 'selected' : '') + '>Except</option>\n';
          listHtml+='                  <option value="never" ' + ((listItem.exception === 'never') ? 'selected' : '') + '>Manual</option>\n';
          listHtml+='                </select>\n';
          listHtml+='                <select id="day' + ip1 + '" name="day' + ip1 + '" class="form-select form-select-sm schedule-day">\n';
          listHtml+='                  <option value="day" ' + ((listItem.day === 'day') ? 'selected' : '') + '>Daily</option>\n';
          listHtml+='                  <option value="monday" ' + ((listItem.day === 'monday') ? 'selected' : '') + '>Mon</option>\n';
          listHtml+='                  <option value="tuesday" ' + ((listItem.day === 'tuesday') ? 'selected' : '') + '>Tue</option>\n';
          listHtml+='                  <option value="wednesday" ' + ((listItem.day === 'wednesday') ? 'selected' : '') + '>Wed</option>\n';
          listHtml+='                  <option value="thursday" ' + ((listItem.day === 'thursday') ? 'selected' : '') + '>Thu</option>\n';
          listHtml+='                  <option value="friday" ' + ((listItem.day === 'friday') ? 'selected' : '') + '>Fri</option>\n';
          listHtml+='                  <option value="saturday" ' + ((listItem.day === 'saturday') ? 'selected' : '') + '>Sat</option>\n';
          listHtml+='                  <option value="sunday" ' + ((listItem.day === 'sunday') ? 'selected' : '') + '>Sun</option>\n';
          listHtml+='                </select>\n';
          listHtml+='                <select id="week' + ip1 + '" name="week' + ip1 + '" class="form-select form-select-sm schedule-week">\n';
          listHtml+='                  <option value="all" ' + ((listItem.week === 'all') ? 'selected' : '') + '>All</option>\n';
          listHtml+='                  <option value="1st" ' + ((listItem.week === '1st') ? 'selected' : '') + '>1st</option>\n';
          listHtml+='                  <option value="2nd" ' + ((listItem.week === '2nd') ? 'selected' : '') + '>2nd</option>\n';
          listHtml+='                  <option value="3rd" ' + ((listItem.week === '3rd') ? 'selected' : '') + '>3rd</option>\n';
          listHtml+='                </select>\n';
          listHtml+='                <button type="button" class="time_element btn btn-outline-secondary btn-sm" id="time' + ip1 + '" data-time="' + time24 + '" onclick="event.stopPropagation();TC.openTimePicker(' + ip1 + ');">' + TC.formatTimeDisplay(time24) + '</button>\n';
          listHtml+='              </div>\n';
          listHtml+='              <div class="playlist-item-controls">\n';
          listHtml+='                <div class="control-group">\n';
          listHtml+='                  <label class="control-label">Length</label>\n';
          listHtml+='                  <select id="howLong' + ip1 + '" name="howLong' + ip1 + '" class="form-select form-select-sm">\n';
          listHtml+='                    <option value="0" ' + ((listItem.howLong === '0') ? 'selected' : '') + '>Full</option>\n';
          for (let s = 10; s <= 180; s += 10) {
            listHtml+='                    <option value="' + s + '" ' + ((listItem.howLong == s) ? 'selected' : '') + '>' + s + 's</option>\n';
          }
          listHtml+='                  </select>\n';
          listHtml+='                </div>\n';
          listHtml+='                <div class="control-group control-group-volume slider-class">\n';
          listHtml+='                  <label class="control-label">Volume</label>\n';
          listHtml+='                  <div class="volume-control">\n';
          listHtml+='                    <input id="volume' + ip1 + '" name="volume' + ip1 + '" type="range" min="0" max="99" value="' + listItem.volume + '" class="volume-slider" />\n';
          listHtml+='                    <span class="volume-display">' + listItem.volume + '</span>\n';
          listHtml+='                  </div>\n';
          listHtml+='                </div>\n';
          listHtml+='                <div class="control-group control-group-preview">\n';
          listHtml+='                  <label class="control-label">Preview</label>\n';
          listHtml+='                  <div class="preview-buttons">\n';
          listHtml+='                    <i class="bi bi-play-circle-fill action-icon play" title="Preview" onclick="event.stopPropagation();TC.rowClick(' + ip1 + ');TC.play(' + ip1 + ', true);"></i>\n';
          listHtml+='                    <i class="bi bi-stop-circle-fill action-icon stop" title="Stop" onclick="event.stopPropagation();TC.rowClick(' + ip1 + ');TC.stop(' + ip1 + ');"></i>\n';
          listHtml+='                  </div>\n';
          listHtml+='                </div>\n';
          listHtml+='              </div>\n';
          listHtml+='            </div>\n';
        }
        listHtml+='          </div>\n';
      }
      listHtml+='        </div>\n';
    }
    $( '#playListSelector' ).empty().append( listSelHtml );
    //Preserve scroll position while re-rendering playlist
    scrollPos = $('#playListTableDiv').scrollTop();
    $( '#playList' ).empty().append( listHtml );
    //Restore scroll position
    $('#playListTableDiv').scrollTop(scrollPos);
    //Initialise tooltip
    $('[data-bs-toggle="tooltip"]').tooltip();
    //Click event trap
    $('#playListForm').off('propertychange change keyup paste input').on('propertychange change keyup paste input', function (event) {
      TC.formChange(event);
    });
    //Volume slider events
    $('.volume-slider').on('input', function (e) {
      var volControl = $(this),
          index = volControl[0].id.replace(/[^\d]/g, '') - 1,
          value = parseInt(volControl.val());
      volControl.siblings('.volume-display').text(value);
      TC.stored.list[TC.stored.selectedPlayList].list[index]['volume'] = value;
      if ((TC.playerIndex === index) && (!TC.fading)) {
        TC.heldOffVolume = TC.compositeVolume();
        if (!TC.controlsHoldOff) {
          $('#audioPlayer').prop('volume', TC.compositeVolume() / 100);
        }
      }
      TC.storeAll(false);
    });
    //Scroll wheel on volume control
    $('.slider-class').on('wheel', function (e) {
      var delta = e.originalEvent.deltaY,
          volControl = $(this).find('.volume-slider'),
          index = volControl[0].id.replace(/[^\d]/g, '') - 1,
          currentVal = parseInt(volControl.val()),
          newVal = currentVal + ((delta < 0) ? 1 : -1);
      newVal = Math.max(0, Math.min(99, newVal));
      volControl.val(newVal);
      volControl.siblings('.volume-display').text(newVal);
      TC.stored.list[TC.stored.selectedPlayList].list[index]['volume'] = newVal;
      if ((TC.playerIndex === index) && (!TC.fading)) {
        TC.heldOffVolume = TC.compositeVolume();
        if (!TC.controlsHoldOff) {
          $('#audioPlayer').prop('volume', TC.compositeVolume() / 100);
        }
      }
      TC.storeAll(false);
      e.preventDefault();
    });
    //Prime Playlist popup form
    if (TC.stored.list.length > 0) {
      $('#playListNameInput').val(TC.stored.list[TC.stored.selectedPlayList].name);
    }
    //Validate
    TC.validate();
    //Update cookie
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
    var storedJson;
    
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
        if (TC.stored.systemPreview) {
          TC.systemPreview = TC.stored.systemPreview;
        }
      }
    }
  }
  
  TC.purifyList = function () {
    var i, len, listItem, doneStuff;
    
    if (TC.stored.selectedPlayList >= 0) {
      do {
        doneStuff = false;
        len = TC.stored.list[TC.stored.selectedPlayList].list.length;
        for (i = 0; i < len && TC.stored.selectedPlayList >= 0; i++) {
          listItem = TC.stored.list[TC.stored.selectedPlayList].list[i];
          if (listItem && !listItem.hasOwnProperty('what')) {
            doneStuff = true;
            if (i === len) {
              TC.stored.list[TC.stored.selectedPlayList].list.pop();
            } else {
              if (i === 0) {
                TC.stored.list[TC.stored.selectedPlayList].list.shift();
              } else {
                TC.stored.list[TC.stored.selectedPlayList].list.splice(i, 1);
              }
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
      lastPlay : Array()
    }
  }
  //Add a new item to playlist
  TC.listAdd = function (i) {
    event.preventDefault();
    event.stopPropagation();
    
    var newTime = '12 : 00 : AM';
    
    //Copy previous time if not first item and add one hour
    if (TC.stored.list[TC.stored.selectedPlayList].list.length > 0) {
      var prevTime = TC.stored.list[TC.stored.selectedPlayList].list[i - 1].time;
      var time24 = TC.convertTo24Hour(prevTime);
      var parts = time24.split(':');
      var hours = (parseInt(parts[0]) + 1) % 24;
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
    
  //Validate and correct/default the form
  TC.validate = function () {
    var i, listItem, ip1, changed = false, len;
        
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
    var i, pick, found = false, keys = Object.keys( dirList ),
      playList = TC.stored.list[TC.stored.selectedPlayList],
      entry = playList.list[TC.selectedRow - 1], dirPlayed;
    
    //Create lastPlay if not existing
    if (!playList.hasOwnProperty( 'lastPlay' )) {
      playList.lastPlay = Array();
    }
      
    //Create last play directory if not existing for directory
    if (!(phash in playList.lastPlay)) {
      playList.lastPlay[phash] = {
        hashSelectedLocal : '', 
        hashSelectedRemote : '',
        recentLocal : Array(),
        recentRemote : Array()
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
            dirPlayed.recentLocal = Array();
          }
          //Default pick
          pick = Math.floor( Math.random() * keys.length );
          //Find a random number that hasn't been used recently
          if (( dirPlayed.recentLocal.length > 0 ) && ( entry.hashSelectedLocal !== '' )) {
            //Trim recent items to half length of list
            while (dirPlayed.recentLocal.length > ( keys.length / 2 )) {
              dirPlayed.recentLocal.pop();
            }
            //Look for match
            do {
              found = false;
              for (i = 0; i < dirPlayed.recentLocal.length; i++) {
                if (dirList[keys[pick]].hash === dirPlayed.recentLocal[i]) {
                  found = true;
                  pick = Math.floor( Math.random() * keys.length );
                  break;
                }
              }
           } while (found);
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
    var icon = (mime === 'directory') ? '<i class="bi bi-folder-fill text-warning me-1"></i>' : '<i class="bi bi-music-note text-primary me-1"></i>';
    var name = what.split('/').pop();
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
    var container = $('#fileBrowserContents');
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
    var html = '', i, file;
    
    html += '<div class="list-group list-group-flush">';
    
    if (TC.fileBrowserPath.length > 0) {
      html += '<a href="#" class="list-group-item list-group-item-action fb-back">';
      html += '<i class="bi bi-arrow-left me-2"></i>.. Back</a>';
    }
    
    for (i = 0; i < files.length; i++) {
      file = files[i];
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
      var $el = $(this).closest('.fb-item');
      TC.fileBrowserEnterDir($el.attr('data-hash'), $el.attr('data-name'));
    }).on('click', '.fb-select-dir', function (e) {
      e.preventDefault();
      e.stopPropagation();
      var $el = $(this).closest('.fb-item');
      TC.fileBrowserSelectItem($el.attr('data-path'), $el.attr('data-hash'), 'directory');
    }).on('click', '.fb-file', function (e) {
      e.preventDefault();
      var $el = $(this).closest('.fb-item');
      TC.fileBrowserSelectItem($el.attr('data-path'), $el.attr('data-hash'), $el.attr('data-mime'));
    }).on('click', '.fb-rename', function (e) {
      e.preventDefault();
      e.stopPropagation();
      var $el = $(this).closest('.fb-item');
      TC.fileBrowserRename($el.attr('data-path'), $el.attr('data-name'));
    }).on('click', '.fb-delete', function (e) {
      e.preventDefault();
      e.stopPropagation();
      var $el = $(this).closest('.fb-item');
      TC.fileBrowserDelete($el.attr('data-path'), $el.attr('data-name'));
    });
  };

  TC.fileBrowserNewFolder = function () {
    var name = prompt('Enter folder name:');
    if (name && name.trim()) {
      var currentPath = TC.fileBrowserPath.map(function(p) { return p.name; }).join('/');
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
    
    var formData = new FormData();
    formData.append('action', 'uploadFile');
    var currentPath = TC.fileBrowserPath.map(function(p) { return p.name; }).join('/');
    formData.append('path', currentPath);
    
    for (var i = 0; i < files.length; i++) {
      formData.append('files[]', files[i]);
    }
    
    var container = $('#fileBrowserContents');
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
    var newName = prompt('Enter new name:', currentName);
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
    var html = '<span class="text-muted">Music</span>';
    for (var i = 0; i < TC.fileBrowserPath.length; i++) {
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
    var parentHash = TC.fileBrowserPath.length > 0 ? TC.fileBrowserPath[TC.fileBrowserPath.length - 1].hash : '';
    TC.loadFileBrowserContents(parentHash);
  };

  TC.fileBrowserSelectItem = function (path, hash, mime) {
    var entry = TC.stored.list[TC.stored.selectedPlayList].list[TC.fileBrowserRow - 1];
    
    entry.what = path;
    entry.hash = hash;
    entry.mime = mime;
    
    $('#what' + TC.fileBrowserRow).html(TC.displayFileName(path, mime)).attr('title', path);
    $('#fileBrowserModal').modal('hide');
    
    if (mime === 'directory') {
      TC.validate();
      $.ajax({
        url: 'php/tc.php?action=listFiles&phash=' + hash,
        error: function (xhr) {
          console.error(xhr.status + ': ' + xhr.responseText);
        }
      }).always(function (data) {
        TC.directorySelect(hash, JSON.parse(data));
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
  TC.fileSelect = function (path, hash, mime) {
    var shortName, playList, entry, id;
    
    if (TC.selectedRow > 0) {
      shortName = path.replace('Music/', '');
      id = '#what' + TC.selectedRow;
      playList = TC.stored.list[TC.stored.selectedPlayList];
      entry = playList.list[TC.selectedRow - 1];
      entry.what = shortName;
      entry.hash = hash;
      entry.mime = mime;
      $(id).prop('title', shortName);
      $(id).val(shortName);
      //Set up tooltips
      $(id).tooltip();
      $(id).scrollLeft(999);
      if (mime === 'directory') {
        TC.validate();
        $.ajax({ url: 'php/tc.php?action=listFiles&phash=' + entry.hash,
          error: function (xhr) {
            console.error(xhr.status + ': ' + xhr.responseText)
          }
        }).always(function ( data ) {
          TC.directorySelect(entry.hash, JSON.parse( data )) ;
          TC.storeAll(false);
        });
      } else {
        entry.hashSelectedLocal = entry.hash;
        entry.whatSelectedLocal = entry.what;
        TC.validate();
        TC.storeAll(false);
      }
    }
  };
  
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
    var compositeVolume,
      entry=TC.stored.list[TC.stored.selectedPlayList].list[TC.playerIndex];
    
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
    var entryVolume, entry=TC.stored.list[TC.stored.selectedPlayList].list[TC.playerIndex];
    
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
    var prop, index, value;
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
    var parts = time24.split(':');
    var hours = parseInt(parts[0]);
    var minutes = parts[1] || '00';
    var ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    if (hours === 0) hours = 12;
    return hours + ':' + minutes + ' ' + ampm;
  };

  TC.timePickerIndex = 0;

  TC.openTimePicker = function (rowIndex) {
    TC.timePickerIndex = rowIndex;
    var currentTime = $('#time' + rowIndex).attr('data-time') || '12:00';
    var parts = currentTime.split(':');
    var hours = parseInt(parts[0]);
    var minutes = parseInt(parts[1]) || 0;
    var ampm = hours >= 12 ? 'PM' : 'AM';
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

    var modal = new bootstrap.Modal(document.getElementById('timePickerModal'));
    modal.show();
  };

  TC.confirmTimePicker = function () {
    var hours = parseInt($('#tpHour').val());
    var minutes = $('#tpMinute').val();
    var ampm = $('#tpPM').hasClass('active') ? 'PM' : 'AM';

    if (ampm === 'PM' && hours !== 12) hours += 12;
    if (ampm === 'AM' && hours === 12) hours = 0;

    var time24 = String(hours).padStart(2, '0') + ':' + minutes;
    TC.timeChanged(TC.timePickerIndex - 1, time24);

    bootstrap.Modal.getInstance(document.getElementById('timePickerModal')).hide();
  };

  TC.adjustTime = function (field, delta) {
    var $field = $('#tp' + field);
    var val = parseInt($field.val());
    
    if (field === 'Hour') {
      val += delta;
      if (val > 12) val = 1;
      if (val < 1) val = 12;
      $field.val(val);
    } else {
      val += delta * 5;
      if (val >= 60) val = 0;
      if (val < 0) val = 55;
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
      var value = $('#playListNameInput')[0].value;
      
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
    var entry = TC.stored.list[TC.stored.selectedPlayList].list[TC.playerIndex],
        player = $('#audioPlayer'), stamp = Date.now().toString();
    
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
    
    var entry = TC.stored.list[TC.stored.selectedPlayList].list[index - 1],
        source, compositeVolume,
        player = $('#audioPlayer'), fileVolume = 100;
        
    TC.playerIndex = index - 1;
    
    compositeVolume = TC.compositeVolume();
    

    if (!TC.system || (!TC.systemPreview && previewCall)) {
      if (entry.what.toLowerCase() === 'chime') {
        source = '.system/Chime_start.flac'
        entry.whatSelectedLocal = source;
        entry.hashSelectedLocal = '';
      } else {
        //If this is a directory then make the selection
        source = entry.whatSelectedLocal;
      }
      
      console.log('Playing ' + source + ' at volume ' + compositeVolume + '% for ' + entry.howLong + ' seconds');
      
      TC.playEngine(player, source, compositeVolume);
      TC.howLong();
      $( '#nowPlayingTag' ).empty().append( source );
    } else {
      console.log('Playing ' + entry.whatSelectedRemote + ' at volume ' + compositeVolume + '% for ' + entry.howLong + ' seconds');
    }
    if (TC.system && TC.systemPreview && previewCall) {
      $.ajax({ url: 'php/tc.php?action=play&index=' + TC.playerIndex,
        error: function (xhr) {
          console.error(xhr.status + ': ' + xhr.responseText)
        }
      });    
    }
    
    //Choose next track
    if (entry.mime === 'directory') {
      $.ajax({ url: 'php/tc.php?action=listFiles&phash=' + entry.hash,
        error: function (xhr) {
          console.error(xhr.status + ': ' + xhr.responseText)
        }
      }).always(function ( data ) {
        TC.directorySelect(entry.hash, JSON.parse( data )) ;
        TC.storeAll(false);
      });
    }
  }
  
  TC.stop = function ( index ) {
    var player = $('#audioPlayer');

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
    var aBits = TC.timeToBits(a.time),
        bBits = TC.timeToBits(b.time);
        
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
    var len, list, i, needsSorting = false;
    
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
    var timeBits = eventTime.replace(/\s/g, '').split(':');
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
    var bestTime = -1, len,
        listItem, i, timeBits,
        weekNumber = parseInt(d.getDate() / 7) + 1, day = d.getDay(), dayMatch,
        hour = d.getHours(), minute = d.getMinutes(),
        weekDay = [ 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday' ],
        itemDate = new Date();

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
        if ((listItem.exception === 'every') !== dayMatch) {
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
      var d = new Date(), minuteNow = d.getMinutes(), hourNow = d.getHours(), beenSleeping = ((d.getTime() - TC.lastTimeLoop) > 10000);
      
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
    var $btn = $('.audio-device-container .bi-arrow-clockwise');
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
    var $select = $('#audioDeviceSelect'),
        html = '', i, device;
    
    for (i = 0; i < TC.audioDevices.length; i++) {
      device = TC.audioDevices[i];
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
    var currentTimeZone = moment.tz.guess();
     
    TC.loadAll();
    TC.purifyList();
    TC.renderAll();
    TC.bindPlayListInput();
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
    $('#audioPlayer').bind('pause ended', function(){
      //Clear the player 10 seconds from now
      if (TC.hidePlayerTimeout) {
        clearTimeout(TC.hidePlayerTimeout);
      }
      TC.hidePlayerTimeout = setTimeout(function() {
        $('#audioPlayerDiv').fadeOut(200);
      }, 3000);
    });
    $('#audioPlayer').bind('play', function(){
      if (TC.hidePlayerTimeout) {
        clearTimeout(TC.hidePlayerTimeout);
      }      
    });
    $('#audioPlayer').bind('volumechange', function(){
      var volume = TC.reverseCompositeVolume(Math.round($('#audioPlayer').prop('volume') * 100));
      
      if (!TC.fading && TC.playerIndex >= 0) {
        TC.stored.list[TC.stored.selectedPlayList].list[TC.playerIndex]['volume'] = volume;
        var volSlider = $('#volume' + (TC.playerIndex + 1));
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
    
    //Check server availability and LAN status
    $.ajax({ url: 'php/tc.php?action=lan', timeout: 3000 })
      .done(function (result) {
        TC.serverAvailable = true;
        
        if (result !== 'lan') {
          TC.system = false;
          TC.systemPreview = false;
          TC.lan = false;
        }
        
        //Always load from server first
        $.ajax({ url: 'php/tc.php?action=load', timeout: 5000 })
          .done(function (data) {
            if (data) {
              try {
                TC.stored = JSON.parse(data);
                if (!Array.isArray(TC.stored.list)) {
                  TC.stored.list = [];
                }
                localStorage.setItem('tcPersistent', JSON.stringify(TC.stored));
                if (TC.stored.system !== undefined) {
                  TC.system = TC.stored.system && TC.lan;
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
            TC.init2();
          })
          .fail(function () {
            console.log('Server load failed, using local storage');
            TC.loadAll();
            TC.init2();
          });
      })
      .fail(function () {
        console.log('Server not available, using local storage only');
        TC.loadAll();
        TC.init2();
      });
  }  
}(TC || {});
