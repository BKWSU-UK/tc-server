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
  TC.lan    = true;
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
      //$('#playListTableDiv').animate({ scrollTop: $('#playListTableDiv')[0].scrollHeight}, 1000);
    }
  }
  
  TC.nudgeList = function (pickiBox) {
    var boxBotLeft = pickiBox.offset().top + (pickiBox.height() * 3.3), // 3.3 Magic. I really want to full size of this item
        d = $('#playListTableDiv'), scrollPos = d.scrollTop(),
        scrollWindowBotLeft = d.offset().top + d.height(),
        offset = boxBotLeft - scrollWindowBotLeft;
    
    if (offset > 0) {
      d.scrollTop(scrollPos + offset);
    }
  }
  
  //Render the JS generated parts of the page
  TC.renderAll = function () {
    var listHtml = '', listSelHtml = '', len = 0, i = 0, ip1, listItem, tInput, tCurrent, scrollPos;
    
    TC.purifyList();
   
    $('#modeToggleButton').prop('checked', TC.system);
    $('#previewToggleButton').prop('checked', TC.systemPreview);
    $('.previewButton').css('visibility',(TC.system)?'visible':'hidden');
    $('.modeButton').css('visibility',(TC.lan)?'visible':'hidden');
    
    //Playlist selector table
    listSelHtml+='                  <table class="table table-hover table-bordered table-condensed playListSelectorTable">\n';
    listSelHtml+='                    <tbody>\n';
    listSelHtml+='                      <tr id="playListSelRow">\n';
    listSelHtml+='                        <td class="tdCust playListButtons">\n';
    if (TC.stored.list.length === 0) {
      listSelHtml+='                          <span class="playListButtonSpace1"></span><span  data-bs-toggle="modal" data-bs-placement="auto" data-bs-animation="true" data-bs-target="#editPlaylistName" onclick="TC.playListAdd();"><i class="bi bi-plus-circle" data-bs-toggle="tooltip" data-bs-placement="auto" data-bs-animation="true" title="Add a playlist"></i></span>\n';
      listSelHtml+='                        </td>\n';
      listSelHtml+='                        <th class="tdCust" playListTitle>Start a playlist\</th>\n';
      listSelHtml+='                      </tr>\n';
      listSelHtml+='                    </tbody>\n';
      listSelHtml+='                  </table>\n';
    } else {
      len = TC.stored.list[TC.stored.selectedPlayList].list.length;
      listSelHtml+='                          <span data-bs-toggle="modal" data-bs-placement="auto" data-bs-animation="true" data-bs-target="#editPlaylistName" onclick="TC.playListAdd();"><i class="bi bi-plus-circle" data-bs-toggle="tooltip" data-bs-placement="auto" data-bs-animation="true" title="Add a playlist"></i></span>\n';
      listSelHtml+='                          <span class="playListButtonSpace1"></span><span  data-bs-toggle="modal" data-bs-placement="auto" data-bs-animation="true" data-bs-target="#editPlaylistName" onclick="TC.playListCopy();"><i class="bi bi-copy" data-bs-toggle="tooltip" data-bs-placement="auto" data-bs-animation="true" title="Copy current playlist"></i></span>\n';
      listSelHtml+='                          <span class="playListButtonSpace1"></span><span  data-bs-toggle="modal" data-bs-placement="auto" data-bs-animation="true" data-bs-target="#editPlaylistName" onclick="TC.playListEdit();"><i class="bi bi-pencil-fill" data-bs-toggle="tooltip" data-bs-placement="auto" data-bs-animation="true" title="Rename selected playlist"></i></span>\n';
      listSelHtml+='                          <span class="playListButtonSpace2"></span><span  data-bs-toggle="modal" data-bs-placement="auto" data-bs-animation="true" data-bs-target="#confirmDeletePlaylist" onclick="TC.playListDelete();"><i class="bi bi-x-circle" data-bs-toggle="tooltip" data-bs-placement="auto" data-bs-animation="true" title="Delete the selected playlist"></i></span>\n';
      listSelHtml+='                        </td>\n';
      listSelHtml+='                        <th class="tdCust playListSelectTitle">Playlist</th>\n';
      listSelHtml+='                        <td class="tdCust">\n';
      listSelHtml+='                          <select id="playListSelect" name="playList" class="form-control fixplayListWidth" data-bs-toggle="tooltip" data-bs-placement="auto" data-bs-animation="true" title="Playlist selection">\n';
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
      //Playlist table
      listHtml+='        <div id="playListTableDiv" class="scrollable-area">\n';
      listHtml+='          <table id="playListTable" class="playListTableClass table table-hover table-bordered table-condensed">\n';
      listHtml+='            <thead>\n';
      listHtml+='              <tr class="playListRowClass">\n';
      listHtml+='                <th class="tdCust leftTableButtonWidth">\n';
      if (len === 0) {
        listHtml+='                  <i class="bi bi-plus-circle" data-bs-toggle="tooltip" data-bs-placement="auto" data-bs-animation="true" title="Add row" onclick="TC.listAdd(0);"></i>\n';
        listHtml+='                </th>\n';
        listHtml+='                <th>\n';
        listHtml+='                 Add new items to playlist\n';
      }
      listHtml+='                </th>\n';
      if (len > 0) {
        listHtml+='                <th colspan="4">When</th>\n';
        listHtml+='                <th>What</th>\n';
        listHtml+='                <th>How</th>\n';
        listHtml+='                <th>Volume</th>\n';
        listHtml+='                <th>Length</th>\n';
        listHtml+='                <th></th>\n';
      }
      listHtml+='              </tr>\n';
      listHtml+='            </thead>\n';
      listHtml+='            <tbody>\n';
      for (i = 0; i < len && TC.stored.selectedPlayList >= 0; i++) {
        listItem = TC.stored.list[TC.stored.selectedPlayList].list[i];
        if (!listItem.hasOwnProperty('what')) {
          continue;
        }
        ip1 = i + 1;
        listHtml+='              <tr id="tableRow' + ip1 + '" onclick="TC.rowClick(' + ip1 + ');" class="playListRowClass">\n';
        listHtml+='                <td class="tdCust leftTableButtonWidth">\n';
        listHtml+='                  <i class="bi bi-x-circle" data-bs-toggle="tooltip" data-bs-placement="auto" data-bs-animation="true" title="Remove row" onclick="TC.listDelete(' + ip1 + ');"></i>\n';
        listHtml+='                  <br /><i class="bi bi-plus-circle" data-bs-toggle="tooltip" data-bs-placement="auto" data-bs-animation="true" title="Add row" onclick="TC.listAdd(' + ip1 + ');"></i>\n';
        listHtml+='                </td>\n';
        listHtml+='                <td class="tdCust"><input size="8" value="' + listItem.time + '" id="time' + ip1 + '" type="text" name="time' + ip1 + '" class="time_element" data-bs-toggle="tooltip" data-bs-placement="auto" data-bs-animation="true" title="Click to set time" /></td>\n';
        listHtml+='                <td class="tableExceptionWidth tdCust">\n';
        listHtml+='                  <select id="exception' + ip1 + '" name="exception' + ip1 + '" class="form-control fixExceptWidth" data-bs-toggle="tooltip" data-bs-placement="auto" data-bs-animation="true" title="Rule or exception">\n';
        listHtml+='                    <option value="every" ' + ((listItem.exception === 'every') ? 'selected' : '') + '>Every</option>\n';
        listHtml+='                    <option value="except" ' + ((listItem.exception === 'except') ? 'selected' : '') + '>Except</option>\n';
        listHtml+='                    <option value="never" ' + ((listItem.exception === 'never') ? 'selected' : '') + '>Manual</option>\n';
        listHtml+='                  </select>\n';
        listHtml+='                </td>\n';
        listHtml+='                <td class="tdCust">\n';
        listHtml+='                  <select id="week' + ip1 + '" name="week' + ip1 + '" class="form-control fixWeekWidth" data-bs-toggle="tooltip" data-bs-placement="auto" data-bs-animation="true" title="Which week of month">\n';
        listHtml+='                    <option value="all" ' + ((listItem.week === 'all') ? 'selected' : '') + '></option>\n';
        listHtml+='                    <option value="1st" ' + ((listItem.week === '1st') ? 'selected' : '') + '>1st</option>\n';
        listHtml+='                     <option value="2nd" ' + ((listItem.week === '2nd') ? 'selected' : '') + '>2nd</option>\n';
        listHtml+='                    <option value="3rd" ' + ((listItem.week === '3rd') ? 'selected' : '') + '>3rd</option>\n';
        listHtml+='                 </select>\n';
        listHtml+='                </td>\n';
        listHtml+='                <td class="tdCust">\n';
        listHtml+='                  <select id="day' + ip1 + '" name="day' + ip1 + '" class="form-control fixDayWidth" data-bs-toggle="tooltip" data-bs-placement="auto" data-bs-animation="true" title="Which day of week ">\n';
        listHtml+='                    <option value="day" ' + ((listItem.day === 'day') ? 'selected' : '') + '>Day</option>\n';
        listHtml+='                    <option value="monday" ' + ((listItem.day === 'monday') ? 'selected' : '') + '>Monday</option>\n';
        listHtml+='                    <option value="tuesday" ' + ((listItem.day === 'tuesday') ? 'selected' : '') + '>Tuesday</option>\n';
        listHtml+='                    <option value="wednesday" ' + ((listItem.day === 'wednesday') ? 'selected' : '') + '>Wednesday</option>\n';
        listHtml+='                    <option value="thursday" ' + ((listItem.day === 'thursday') ? 'selected' : '') + '>Thursday</option>\n';
        listHtml+='                    <option value="friday" ' + ((listItem.day === 'friday') ? 'selected' : '') + '>Friday</option>\n';
        listHtml+='                    <option value="saturday" ' + ((listItem.day === 'saturday') ? 'selected' : '') + '>Saturday</option>\n';
        listHtml+='                    <option value="sunday" ' + ((listItem.day === 'sunday') ? 'selected' : '') + '>Sunday</option>\n';
        //listHtml+='                    <option value="bank" ' + ((listItem.day === 'bank') ? 'selected' : '') + '>Bank Holiday</option>\n';
        listHtml+='                  </select>\n';
        listHtml+='                </td>\n';
        listHtml+='                <td class="tdCust">\n';
        listHtml+='                  <input type="text" value="' + listItem.what + '"class="fixWhatWidth" id="what' + ip1 + '" name="what' + ip1 + '"\n';
        listHtml+='                               data-bs-toggle="tooltip" data-bs-placement="auto" data-bs-animation="true"\n';
        listHtml+='                               title="' + ((listItem.what.length > 0 && listItem.what !== 'Chime') ? listItem.what : 'Click to select this row then pick file/directory in browser, or type \'Chime\'') + '" />\n';
        listHtml+='                </td>\n';
        listHtml+='                <td class="tdCust">\n';
        listHtml+='                  <select id="how' + ip1 + '" name="how' + ip1 + '" class="form-control fixHowWidth" data-bs-toggle="tooltip" data-bs-placement="auto" data-bs-animation="true" title="Play directory in random or sequencial order">\n';
        listHtml+='                    <option value="single" ' + ((listItem.how === 'single') ? 'selected' : '') + '></option>\n';
        listHtml+='                    <option value="rand" ' + ((listItem.how === 'rand') ? 'selected' : '') + '>Rand</option>\n';
        listHtml+='                     <option value="seq" ' + ((listItem.how === 'seq') ? 'selected' : '') + '>Seq</option>\n';
        listHtml+='                 </select>\n';
        listHtml+='                </td>\n';
        listHtml+='                <td class="tdCust slider-class">\n';
        listHtml+='                  <input id="volume' + ip1 + '" name="volume' + ip1 + '" class="form-control" data-slider-id="vol' + ip1 + 'Slider" type="text" data-slider-min="0" data-slider-max="99" data-slider-step="' + ip1 + '" data-slider-value="' + listItem.volume + '"/>\n';
        listHtml+='                </td>\n';
        listHtml+='                <td class="tdCust">\n';
        listHtml+='                  <select id="howLong' + ip1 + '" name="howLong' + ip1 + '" class="form-control fixHowLongWidth" data-bs-toggle="tooltip" data-bs-placement="auto" data-bs-animation="true" title="How many seconds to play for">\n';
        if (!listItem.hasOwnProperty('howLong')) {
          listItem.howLong = 0;
        }
        listHtml+='                    <option value="0" ' + ((listItem.howLong === '0') ? 'selected' : '') + '>Full</option>\n';
        listHtml+='                    <option value="10" ' + ((listItem.howLong === '10') ? 'selected' : '') + '>10</option>\n';
        listHtml+='                    <option value="20" ' + ((listItem.howLong === '20') ? 'selected' : '') + '>20</option>\n';
        listHtml+='                    <option value="30" ' + ((listItem.howLong === '30') ? 'selected' : '') + '>30</option>\n';
        listHtml+='                    <option value="40" ' + ((listItem.howLong === '40') ? 'selected' : '') + '>40</option>\n';
        listHtml+='                    <option value="50" ' + ((listItem.howLong === '50') ? 'selected' : '') + '>50</option>\n';
        listHtml+='                    <option value="60" ' + ((listItem.howLong === '60') ? 'selected' : '') + '>60</option>\n';
        listHtml+='                    <option value="70" ' + ((listItem.howLong === '70') ? 'selected' : '') + '>70</option>\n';
        listHtml+='                    <option value="80" ' + ((listItem.howLong === '80') ? 'selected' : '') + '>80</option>\n';
        listHtml+='                    <option value="90" ' + ((listItem.howLong === '90') ? 'selected' : '') + '>90</option>\n';
        listHtml+='                    <option value="100" ' + ((listItem.howLong === '100') ? 'selected' : '') + '>100</option>\n';
        listHtml+='                    <option value="110" ' + ((listItem.howLong === '110') ? 'selected' : '') + '>110</option>\n';
        listHtml+='                    <option value="120" ' + ((listItem.howLong === '120') ? 'selected' : '') + '>120</option>\n';
        listHtml+='                    <option value="130" ' + ((listItem.howLong === '130') ? 'selected' : '') + '>130</option>\n';
        listHtml+='                    <option value="140" ' + ((listItem.howLong === '140') ? 'selected' : '') + '>140</option>\n';
        listHtml+='                    <option value="150" ' + ((listItem.howLong === '150') ? 'selected' : '') + '>150</option>\n';
        listHtml+='                    <option value="160" ' + ((listItem.howLong === '160') ? 'selected' : '') + '>160</option>\n';
        listHtml+='                    <option value="170" ' + ((listItem.howLong === '170') ? 'selected' : '') + '>170</option>\n';
        listHtml+='                    <option value="180" ' + ((listItem.howLong === '180') ? 'selected' : '') + '>180</option>\n';
        listHtml+='                  </select>\n';
        listHtml+='                </td>\n';
        listHtml+='                <td class="tdCust">\n';
        listHtml+='                  <i class="bi bi-play-fill" data-bs-toggle="tooltip" data-bs-placement="auto" data-bs-animation="true" title="Play audio" onclick="TC.rowClick(' + ip1 + ');TC.play(' + ip1 + ', true);"></i>\n';
        listHtml+='                  <br /><i class="bi bi-stop-fill" data-bs-toggle="tooltip" data-bs-placement="auto" data-bs-animation="true" title="Stop audio" onclick="TC.rowClick(' + ip1 + ');TC.stop(' + ip1 + ');"></i>\n';
        listHtml+='                </td>\n';
        listHtml+='              </tr>\n';
      }
      listHtml+='            </tbody>\n';
      listHtml+='          </table>\n';
      listHtml+='        </div>\n';
    }
    $( '#playListSelector' ).empty().append( listSelHtml );
    //Preserve scroll position while re-rendering playlist
    scrollPos = $('#playListTableDiv').scrollTop();
    $( '#playList' ).empty().append( listHtml );
    //Restore scroll position
    $('#playListTableDiv').scrollTop(scrollPos);
    //Render the volume controls and scroll file names to end
    for (ip1 = 1; ip1 <= len; ip1++) {
      $('#volume' + ip1).bootstrapSlider({
        formatter: function (value) {
          return 'Volume: ' + value;
        }
      });
      $('#vol' + ip1 + 'Slider').addClass('fixVolumeWidth');
      
      $('#what' + ip1).scrollLeft(999);
      
    }
    //Initialise tooltip
    $('[data-bs-toggle="tooltip"]').tooltip()
    //Initialise time picker
    for (i=0; i < len && TC.stored.selectedPlayList >= 0; i++) {
      tInput = '#time' + (i + 1);
      tCurrent = $(tInput)[0].value.replace(/\s/g,'').split(':');
      $(tInput).timepicki({custom_classes:'timePicker', on_change:TC.timeChanged, increase_direction:'up', start_time: [tCurrent[0], tCurrent[1], tCurrent[2]]});
    }
    //Initialise toggle buttons
    $('#modeToggleButton').bootstrapToggle({
      on: 'System',
      off: 'Local'
    });
    $('#previewToggleButton').bootstrapToggle({
      on: 'System',
      off: 'Local'
    });
    //Click event trap
    $('#playListForm').on('propertychange change keyup paste input', function (event) {
      TC.formChange(event);
    });
    //Scroll wheel on volume control
    $('.slider-class').on('mousewheel', function (e) {
      let delta = e.originalEvent.wheelDelta,
          volControl = $(this).children('input:first'),
          index = volControl[0].id.replace(/[^\d]/g, '') - 1;
      volControl.bootstrapSlider('setValue', volControl.bootstrapSlider('getValue') + ((delta < 0)?-1:1));
      TC.stored.list[TC.stored.selectedPlayList].list[index]['volume'] = volControl.bootstrapSlider('getValue');
      //If volume change on playing song then update player slider
      if ((TC.playerIndex === index ) && (!TC.fading)) {
        TC.heldOffVolume = TC.compositeVolume();
        if (!TC.controlsHoldOff) {
          $('#audioPlayer').prop('volume', TC.compositeVolume() / 100);
        }
      }          
      //Update the cookie with the change
      TC.storeAll(false);
      console.log('ScrollVal : ' + delta);      
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
    var expires, d = new Date();
    
    TC.purifyList();
    
    if (!TC.loaded) {
      return
    }
    
    if (!TC.controlsHoldOff) {
      //Trigger re-selection of next event
      TC.nextEventReIndex = true;
      
      if (TC.lan) {
        //Only change these values if able to operate in remote mode
        TC.stored.system = TC.system;
        TC.stored.systemPreview = TC.systemPreview;
      }
        
      //Also store on remote server if possible
      if (TC.lan) {
        
        $.ajax({ url: 'php/tc.php?action=load',
          error: function (xhr) {
            console.error(xhr.status + ': ' + xhr.responseText)
          }
        }).always(function ( data ) {
          var remoteStored, i, j;
          //If in remote mode then merge remote sequencial and random counters and records into store
          if ( data ) {
            remoteStored = JSON.parse( data );
            if (remoteStored.hasOwnProperty('list')) {
              if (TC.system) {
                //Restore last play parameters
                TC.stored.lastPlay = $.extend(true, {}, remoteStored.lastPlay);
                //Iterate play lists
                for ( i = 0; (remoteStored.list.length > 0) && (i < remoteStored.list.length); i++ ) {
                  //Iterate play list items
                  for ( j = 0; (remoteStored.list[i].list.length > 0) && (j < remoteStored.list[i].list.length); j++ ) {
                    //Check same item is on both local and remote
                    if ((remoteStored.list[i] && remoteStored.list[i].list[j]) &&
                        (TC.stored.list[i] && (j in TC.stored.list[i].list)) &&
                        (TC.stored.list[i] && TC.stored.list[i].list[j]) &&
                        (TC.stored.list[i] && TC.stored.list[i].list[j].how !== 'single')) {
                      //Copy relavant properties from remote to local item
                      if (remoteStored.list[i].list[j].hasOwnProperty('whatSelectedRemote')) {
                        TC.stored.list[i].list[j].whatSelectedRemote = remoteStored.list[i].list[j].whatSelectedRemote;
                      }
                      if (remoteStored.list[i].list[j].hasOwnProperty('hashSelectedRemote')) {
                        TC.stored.list[i].list[j].hashSelectedRemote = remoteStored.list[i].list[j].hashSelectedRemote;
                      }
                      if (remoteStored.list[i].list[j].hasOwnProperty('recentRemote')) {
                        TC.stored.list[i].list[j].recentRemote = remoteStored.list[i].list[j].recentRemote;
                      }
                    }             
                  }
                }
              }
            } else {
              console.error('Invalid playlist loaded from server');
            }
            if (remoteStored.hasOwnProperty('day')) {
              TC.stored.day = remoteStored.day;
            }
          } else {
            console.log('No data in existing store');
          }
          //If in remote mode save data on the server
          if (TC.system || TC.forceRemoteSave) {
            TC.forceRemoteSave = false;
            if (TC.stored.hasOwnProperty('list')) {
              $.post('php/tc.php', {action: 'store', tcPersistent: encodeURI(JSON.stringify(TC.stored))})
                .fail( function (xhr) {
                  console.error('Storing data on server failed: ' + xhr.status + ': ' + xhr.responseText)
                });
            } else {
              console.error('Not saving invalid playlist to server');
            }
          }
        });
      }
      
      //Store the local opject
      if (TC.stored.hasOwnProperty('list')) {
        localStorage.setItem('tcPersistent', JSON.stringify(TC.stored));     
      } else {
        console.error('Not saving invalid playlist to local storage');
      }
      
      //Prevent too many calls to PHP helper script
      if (!endTimeout) {
        TC.controlsHoldOff = true;
        setTimeout(function () {
          TC.controlsHoldOff = false;
          // Catch up on any missing action
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
      newTime = TC.stored.list[TC.stored.selectedPlayList].list[i - 1].time.replace(/\s/g,'').split(':');
      newTime[0] = (parseInt(newTime[0]) + 1).toString();
      if (newTime[0].length < 2) {
        newTime[0] = '0' + newTime[0]; 
      }
      if (parseInt(newTime[0]) === 12) {
        if (newTime[2] === 'PM') {
          newTime[2] = 'AM';
        } else {
          newTime[2] = 'PM';
        }
      }
      if (parseInt(newTime[0]) > 12) {
        newTime[0] = '01';
      }
      newTime = newTime[0] + ' : ' + newTime[1] + ' : ' + newTime[2];
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
    TC.stored.list.push({list : Array(), name : listName});
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
    if (event.target.id && event.target.value) {
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
            //Make sure this state is saved whatever happens
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
        default:
          prop = event.target.id.replace(/[\d]/g, '');
          index = event.target.id.replace(/[^\d]/g, '') - 1;
          TC.stored.list[TC.stored.selectedPlayList].list[index][prop] = event.target.value;
          //If volume change on playing song then update player slider
          if ((prop === 'volume') && (TC.playerIndex === index ) && (!TC.fading)) {
            TC.heldOffVolume = TC.compositeVolume();
            if (!TC.controlsHoldOff) {
              $('#audioPlayer').prop('volume', TC.compositeVolume() / 100);
            }
          }          
          //Update the cookie with the change
          TC.storeAll(false);
          break;
      }
    }
  };
  
  //Hook added on timepicki.js to call this on time change
  TC.timeChanged = function (target) {
    var prop, index, value;
    prop = target.id.replace(/[\d]/g, '');
    index = target.id.replace(/[^\d]/g, '') - 1;
    if (target.value.length == 8) {
      let hours = target.value.substring(0,2);
      let minutes = target.value.substring(3,5);
      let amPm = target.value.substring(6,8);
      target.value = hours + " : " + minutes + " : " + amPm;
    }
    TC.stored.list[TC.stored.selectedPlayList].list[index][prop] = target.value;
    TC.storeAll(false);
    TC.nextEventReIndex = true;
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
    //TC.stored.list[TC.stored.selectedPlayList].list.sort(TC.sortCompareTime);
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
   //Check time every 500 ms
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
    }, 500);
  }  
  
  TC.init2 = function () {
    var currentTimeZone = moment.tz.guess();
     
    TC.loadAll();
    TC.purifyList();
    TC.renderAll();
    TC.bindPlayListInput();
    TC.eventClock();
    TC.loaded = true;
    //Check time zone and save to server if required
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
      
      if (!TC.fading) {
        TC.stored.list[TC.stored.selectedPlayList].list[TC.playerIndex]['volume'] = volume;
        $('#volume' + (TC.playerIndex + 1)).bootstrapSlider('setValue', volume);
        if (volume === 100) {
          $('#audioPlayer').prop('volume', TC.compositeVolume() / 100);       
        }
      }
    });
    
    
    $.ajax({ url: 'php/tc.php?action=lan' })
      .done(function ( result ) {
        var action = 'load';
        
        //Initial load of persistent data to set System mode
        TC.loadAll();
        TC.system = TC.stored.system
        
        if (result !== 'lan') {
          //Not controlling music on TC system unless on same LAN
          TC.system = false;
          TC.systemPreview = false;
          TC.lan = false;
          TC.holdOff = 1000;
          action = 'defaults';
        }
        
        if (TC.system || !localStorage.getItem('tcPersistent')) {
                  
          $.ajax({ url: 'php/tc.php?action=' + action,
            error: function (xhr) {
              console.error(xhr.status + ': ' + xhr.responseText)
            }
          }).always(function ( data ) {
             
            //Load and save settings from system
            if ( data ) {
              try {
                TC.stored = JSON.parse( data );
              } catch (err) {
                $('.titleBlock').html(data);
                return;
              }
              if (TC.stored.hasOwnProperty('list')) {
                localStorage.setItem('tcPersistent', JSON.stringify(TC.stored));
              } else {
                console.error('Loaded playlist from server is invalid');
              }
            }
            TC.init2();
          });
        } else {
          TC.init2();
        }
      }); 
  }  
}(TC || {});
