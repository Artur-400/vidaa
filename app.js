// VIDAA IPTV v0.3.18
// Основа сохранена максимально близко к рабочей версии пользователя.

const player = document.getElementById('player');
const channelListEl = document.getElementById('channelList');
const groupsEl = document.getElementById('groups');
const nowTitle = document.getElementById('now-title');
const volLabel = document.getElementById('vol-label');
const btnPlay = document.getElementById('btn-play');
const btnPrev = document.getElementById('btn-prev');
const btnNext = document.getElementById('btn-next');
const videoMessage = document.getElementById('videoMessage');

let channels = [];
let groups = ['Все'];
let currentGroup = 'Все';
let visibleChannels = [];
let currentIndex = null;
let focusedVisibleIndex = 0;
let hls = null;

const STORAGE_KEY = 'vidaa_iptv_last';
const PLAYLIST_KEY = 'vidaa_iptv_playlist';

// Playlists (loaded from playlists.json, see initPlaylists)
let playlists = [];
let playlistIndex = -1;
let loadSeq = 0;
const playlistHeaderEl = document.getElementById('playlistHeader');

function currentPlaylistUrl() {
  const p = playlists[playlistIndex];
  return p ? p.url : (typeof M3U_URL !== 'undefined' ? M3U_URL : '');
}
// last watched channel is remembered separately for every playlist
function lastKey() { return STORAGE_KEY + '|' + currentPlaylistUrl(); }
const VOLUME_KEY = 'vidaa_vol';

function setVolume(v) {
  v = Math.max(0, Math.min(1, v));
  player.volume = v;
  if (volLabel) volLabel.textContent = Math.round(v * 100) + '%';
  localStorage.setItem(VOLUME_KEY, String(v));
}

function togglePlay() {
  if (!player.src && !player.currentSrc) return;
  if (player.paused) player.play().catch(() => {});
  else player.pause();
}

if (btnPlay) btnPlay.addEventListener('click', togglePlay);
if (btnPrev) btnPrev.addEventListener('click', () => stepVisible(-1, true));
if (btnNext) btnNext.addEventListener('click', () => stepVisible(1, true));

function parseAttribute(line, name) {
  const re = new RegExp(name + '="([^"]*)"', 'i');
  const m = line.match(re);
  return m ? m[1] : '';
}

function parseExtInf(line) {
  // Более терпимый разбор: даже одна битая кавычка в соседнем атрибуте
  // не ломает весь плейлист.
  const comma = line.indexOf(',');
  const title = comma >= 0
    ? line.slice(comma + 1).trim()
    : 'Без названия';

  let group = parseAttribute(line, 'group-title');
  let logo = parseAttribute(line, 'tvg-logo');
  let tvgId = parseAttribute(line, 'tvg-id');

  if (!group) group = 'Без категории';

  return {
    title: title || 'Без названия',
    group,
    logo,
    tvgId,
    url: ''
  };
}

function extractM3U(text) {
  const outChannels = [];
  const outGroups = ['Все'];

  const lines = text.split(/\r?\n/).map(line => line.trim());
  let cur = null;

  for (const line of lines) {
    if (!line) continue;

    if (line.startsWith('#EXTINF')) {
      cur = parseExtInf(line);
      continue;
    }

    if (!line.startsWith('#') && cur) {
      cur.url = line;
      if (cur.url) outChannels.push(cur);

      if (cur.group && !outGroups.includes(cur.group)) {
        outGroups.push(cur.group);
      }
      cur = null;
    }
  }

  // Порядок плейлиста сохраняем — так номера каналов не прыгают.
  return { channels: outChannels, groups: outGroups };
}

function parseM3U(text) {
  const r = extractM3U(text);
  channels = r.channels;
  groups = r.groups;
  renderGroups();
  renderChannels(currentGroup);
}

function renderGroups() {
  groupsEl.innerHTML = '';

  groups.forEach((group, index) => {
    const button = document.createElement('button');
    button.textContent = group;
    button.dataset.group = group;
    button.className = group === currentGroup ? 'active' : '';

    button.addEventListener('click', () => {
      currentGroup = group;
      renderGroups();
      renderChannels(group);
      focusFirstChannel();
    });

    groupsEl.appendChild(button);
  });
}

function getVisibleChannels(group) {
  if (!group || group === 'Все') return channels;
  return channels.filter(ch => ch.group === group);
}

function renderChannels(filterGroup = 'Все') {
  currentGroup = filterGroup || 'Все';
  visibleChannels = getVisibleChannels(currentGroup);
  channelListEl.innerHTML = '';

  visibleChannels.forEach((ch, visibleIndex) => {
    const globalIndex = channels.indexOf(ch);

    const li = document.createElement('li');
    li.tabIndex = 0;
    li.dataset.visibleIndex = String(visibleIndex);
    li.dataset.globalIndex = String(globalIndex);

    const img = document.createElement('img');
    if (ch.logo) {
      img.src = ch.logo;
      img.onerror = () => {
        img.removeAttribute('src');
        img.style.display = 'none';
      };
    } else {
      img.style.display = 'none';
    }

    const meta = document.createElement('div');
    meta.className = 'meta';

    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = ch.title;

    const sub = document.createElement('div');
    sub.className = 'sub';
    sub.textContent = ch.group || '';

    meta.appendChild(title);
    meta.appendChild(sub);
    li.appendChild(img);
    li.appendChild(meta);

    li.addEventListener('click', () => playVisibleIndex(visibleIndex));
    li.addEventListener('focus', () => {
      focusedVisibleIndex = visibleIndex;
      updateFocus();
    });

    channelListEl.appendChild(li);
  });

  if (visibleChannels.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'empty';
    empty.textContent = 'Нет каналов';
    empty.tabIndex = 0;
    channelListEl.appendChild(empty);
  }

  updateFocus();
}

function updateFocus() {
  const items = channelListEl.querySelectorAll('li[data-visible-index]');
  items.forEach((li, i) => {
    const globalIndex = Number(li.dataset.globalIndex);
    li.classList.toggle('active', globalIndex === currentIndex);
    li.classList.toggle('focused', i === focusedVisibleIndex);
  });

  const focused = items[focusedVisibleIndex];
  if (focused) focused.scrollIntoView({ block: 'nearest' });
}

function focusFirstChannel() {
  focusedVisibleIndex = 0;
  const item = channelListEl.querySelector('li[data-visible-index="0"]');
  if (item) item.focus();
  updateFocus();
}

function playVisibleIndex(index) {
  if (!visibleChannels.length) return;

  index = Math.max(0, Math.min(index, visibleChannels.length - 1));
  focusedVisibleIndex = index;

  const ch = visibleChannels[index];
  const globalIndex = channels.indexOf(ch);
  if (globalIndex < 0) return;

  playByIndex(globalIndex);
}

function stepVisible(delta, play = true) {
  if (!visibleChannels.length) return;

  let next = focusedVisibleIndex + delta;
  next = Math.max(0, Math.min(next, visibleChannels.length - 1));

  focusedVisibleIndex = next;
  const item = channelListEl.querySelector(`li[data-visible-index="${next}"]`);
  if (item) item.focus();

  if (play) playVisibleIndex(next);
}

function changeGroup(delta) {
  if (groups.length < 2) return;

  let index = groups.indexOf(currentGroup);
  if (index < 0) index = 0;

  index = (index + delta + groups.length) % groups.length;
  currentGroup = groups[index];

  renderGroups();
  renderChannels(currentGroup);
  focusFirstChannel();
}

function playByIndex(idx) {
  const ch = channels[idx];
  if (!ch) return;

  currentIndex = idx;

  const visibleIndex = visibleChannels.indexOf(ch);
  if (visibleIndex >= 0) {
    focusedVisibleIndex = visibleIndex;
  }

  updateFocus();
  playStream(ch.url);

  nowTitle.textContent = ch.title + (ch.group ? ' — ' + ch.group : '');
  videoMessage.style.display = 'none';

  localStorage.setItem(lastKey(), JSON.stringify({
    index: idx,
    url: ch.url,
    title: ch.title,
    time: Date.now()
  }));
}

function stopPlayback() {
  if (hls) {
    try { hls.destroy(); } catch (_) {}
    hls = null;
  }

  try {
    player.pause();
    player.removeAttribute('src');
    player.load();
  } catch (_) {}

  nowTitle.textContent = '';
  videoMessage.textContent = 'Канал не выбран';
  videoMessage.style.display = 'flex';
}

function playStream(url) {
  if (!url) return;

  if (hls) {
    try { hls.destroy(); } catch (_) {}
    hls = null;
  }

  player.removeAttribute('src');
  player.load();

  if (!window.__forceHls && player.canPlayType('application/vnd.apple.mpegurl')) {
    player.src = url;
    player.play().catch(() => {});
  } else if (window.Hls && Hls.isSupported()) {
    hls = new Hls({
      enableWorker: true,
      lowLatencyMode: false
    });

    if (window.__onHlsCreated) { try { window.__onHlsCreated(hls); } catch (_) {} }
    hls.loadSource(url);
    hls.attachMedia(player);

    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      player.play().catch(() => {});
    });

    hls.on(Hls.Events.ERROR, (event, data) => {
      console.warn('HLS error:', data);
      if (data && data.fatal) {
        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR:
            hls.startLoad();
            break;
          case Hls.ErrorTypes.MEDIA_ERROR:
            hls.recoverMediaError();
            break;
          default:
            // hls.js was only forced for subtitles: if it cannot play this stream, go back to the native player
            if (window.__forceHls) { window.__forceHls = false; playStream(url); }
            break;
        }
      }
    });
  } else {
    player.src = url;
    player.play().catch(() => {});
  }
}

// Returns true = loaded, false = failed, null = superseded by a newer request
async function loadM3U(url, opts) {
  opts = opts || {};
  const seq = ++loadSeq;
  let parsed;

  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);

    const text = await res.text();
    if (!text.includes('#EXTINF')) throw new Error('Плейлист не содержит #EXTINF');

    parsed = extractM3U(text);
    if (!parsed.channels.length) throw new Error('Не найдено ни одного канала');
  } catch (e) {
    console.error('M3U:', e);
    if (seq !== loadSeq) return null;

    if (opts.keepOnError && channels.length) {
      // switching playlists: keep the old list and the running channel
      if (window.__toast) window.__toast('Не удалось загрузить плейлист');
      return false;
    }

    channelListEl.innerHTML = '';
    const error = document.createElement('li');
    error.className = 'empty error';
    error.textContent = 'Ошибка загрузки плейлиста';
    channelListEl.appendChild(error);
    nowTitle.textContent = 'Не удалось загрузить плейлист';
    return false;
  }

  if (seq !== loadSeq) return null;

  if (opts.stopFirst) stopPlayback();

  channels = parsed.channels;
  groups = parsed.groups;
  currentGroup = 'Все';
  currentIndex = null;
  focusedVisibleIndex = 0;

  renderGroups();
  renderChannels('Все');
  restoreLast();
  return true;
}

// ---------- playlists ----------
const DEFAULT_PLAYLISTS = [
  { name: 'DE_My', url: (typeof M3U_URL !== 'undefined' ? M3U_URL : ''), default: true }
];

async function loadPlaylistsConfig() {
  try {
    const res = await fetch('playlists.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const list = Array.isArray(data) ? data : (data && data.playlists);

    const clean = (list || [])
      .filter(p => p && p.url)
      .map(p => ({
        name: String(p.name || String(p.url).split('/').pop().replace(/\.m3u8?$/i, '')),
        url: String(p.url),
        default: !!p.default
      }));

    if (clean.length) return clean;
  } catch (e) {
    console.warn('playlists.json:', e);
  }
  return DEFAULT_PLAYLISTS;
}

function renderPlaylistHeader() {
  if (!playlistHeaderEl) return;
  const p = playlists[playlistIndex];
  playlistHeaderEl.textContent = 'Плейлист' + (p ? ': ' + p.name : '') +
    (playlists.length > 1 ? '  ▾ (7)' : '');
}

async function selectPlaylist(idx, opts) {
  opts = opts || {};
  if (idx < 0 || idx >= playlists.length) return false;

  const prev = playlistIndex;
  playlistIndex = idx;          // needed by restoreLast() (per-playlist "last channel")
  renderPlaylistHeader();

  const ok = await loadM3U(playlists[idx].url, {
    stopFirst: !opts.initial,
    keepOnError: !opts.initial
  });

  if (ok === null) return false;              // a newer selection is in charge now
  if (!ok) {
    if (playlistIndex === idx && !opts.initial) playlistIndex = prev;   // stay on the old playlist
    renderPlaylistHeader();
    return false;
  }

  try { localStorage.setItem(PLAYLIST_KEY, playlists[idx].url); } catch (_) {}
  if (!opts.initial && window.__toast) window.__toast('Плейлист: ' + playlists[idx].name);
  return true;
}

async function initPlaylists() {
  playlists = await loadPlaylistsConfig();

  let saved = null;
  try { saved = localStorage.getItem(PLAYLIST_KEY); } catch (_) {}

  let idx = playlists.findIndex(p => p.url === saved);
  if (idx < 0) idx = playlists.findIndex(p => p.default);
  if (idx < 0) idx = 0;

  await selectPlaylist(idx, { initial: true });
}

if (playlistHeaderEl) {
  playlistHeaderEl.style.cursor = 'pointer';
  playlistHeaderEl.addEventListener('click', () => {
    if (window.__openPlaylistPicker) window.__openPlaylistPicker();
  });
}

function restoreLast() {
  try {
    let raw = localStorage.getItem(lastKey());
    // older versions stored one global "last channel" (that was the DE_My playlist)
    if (!raw && /DE_My\.m3u/i.test(currentPlaylistUrl())) raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      focusFirstChannel();
      return;
    }

    const saved = JSON.parse(raw);

    // Сначала URL: он надежнее номера, если плейлист был изменен.
    let index = -1;
    if (saved && saved.url) {
      index = channels.findIndex(ch => ch.url === saved.url);
    }

    if (index < 0 && saved && Number.isInteger(saved.index)) {
      if (saved.index >= 0 && saved.index < channels.length) {
        index = saved.index;
      }
    }

    if (index >= 0) {
      const ch = channels[index];
      const group = ch.group || 'Все';

      if (currentGroup !== 'Все' && currentGroup !== group) {
        currentGroup = 'Все';
        renderGroups();
        renderChannels('Все');
      }

      playByIndex(index);
      return;
    }

    focusFirstChannel();
  } catch (e) {
    console.warn('restore:', e);
    focusFirstChannel();
  }
}

window.addEventListener('keydown', (e) => {
  const items = channelListEl.querySelectorAll('li[data-visible-index]');

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (items.length) {
      focusedVisibleIndex = Math.min(focusedVisibleIndex + 1, items.length - 1);
      items[focusedVisibleIndex].focus();
    }
    return;
  }

  if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (items.length) {
      focusedVisibleIndex = Math.max(focusedVisibleIndex - 1, 0);
      items[focusedVisibleIndex].focus();
    }
    return;
  }

  if (e.key === 'Enter') {
    e.preventDefault();
    playVisibleIndex(focusedVisibleIndex);
    return;
  }

  if (e.key === 'ArrowLeft') {
    e.preventDefault();
    changeGroup(-1);
    return;
  }

  if (e.key === 'ArrowRight') {
    e.preventDefault();
    changeGroup(1);
    return;
  }

  if (e.key === ' ' || e.key === 'MediaPlayPause') {
    e.preventDefault();
    togglePlay();
    return;
  }

  if (e.key === 'Backspace' || e.key === 'Escape') {
    e.preventDefault();
    stopPlayback();
    focusFirstChannel();
    return;
  }

  if (e.key === '+' || e.key === '=') {
    e.preventDefault();
    setVolume(player.volume + 0.1);
    return;
  }

  if (e.key === '-' || e.key === '_') {
    e.preventDefault();
    setVolume(player.volume - 0.1);
    return;
  }

  if (e.key === 'ChannelUp') {
    e.preventDefault();
    stepVisible(1, true);
    return;
  }

  if (e.key === 'ChannelDown') {
    e.preventDefault();
    stepVisible(-1, true);
  }
});

player.addEventListener('playing', () => {
  videoMessage.style.display = 'none';
});

player.addEventListener('waiting', () => {
  videoMessage.textContent = 'Загрузка…';
  videoMessage.style.display = 'flex';
});

player.addEventListener('error', () => {
  if (currentIndex !== null) {
    videoMessage.textContent = 'Ошибка воспроизведения';
    videoMessage.style.display = 'flex';
  }
});

const savedVol = parseFloat(localStorage.getItem(VOLUME_KEY) || '1');
setVolume(Number.isFinite(savedVol) ? savedVol : 1);

initPlaylists();

window.__vidaa = {
  get channels() { return channels; },
  playByIndex,
  playStream,
  loadM3U,
  parseM3U,
  selectPlaylist,
  get playlists() { return playlists; },
  get visibleChannels() { return visibleChannels; }
};



/* VIDAA IPTV v0.3.18 — stable fullscreen channel picker for Hisense/VIDAA */
(function(){
  const playerSection = document.getElementById('playerSection');
  const overlay = document.getElementById('fullscreenChannelOverlay');
  const overlayList = document.getElementById('fullscreenChannelList');
  const video = document.getElementById('player');
  const subButton = document.getElementById('btn-subtitle');
  let fsFocus = 0;

  function inFullscreen(){
    return !!(document.fullscreenElement || document.webkitFullscreenElement) ||
           document.body.classList.contains('tv-video-fullscreen') ||
           playerSection.classList.contains('is-fullscreen');
  }

  // Temporary on-screen key debug (shows keyCode / fullscreen state on the TV).
  // Set to false once everything works.
  const DEBUG_KEYS = true;
  let dbgEl = null, dbgKeyText = '', dbgSubText = '';
  function dbgRefresh(){
    if(!DEBUG_KEYS) return;
    if(!dbgEl){
      dbgEl = document.createElement('div');
      dbgEl.style.cssText = 'position:absolute;right:8px;top:8px;max-width:70%;z-index:100001;' +
        'padding:4px 10px;background:rgba(0,0,0,.75);color:#2ee6c9;font:16px monospace;pointer-events:none';
      playerSection.appendChild(dbgEl);
    }
    dbgEl.textContent = dbgKeyText + (dbgSubText ? '\n' + dbgSubText : '');
    dbgEl.style.whiteSpace = 'pre-wrap';
  }
  function dbg(text){ dbgKeyText = text; dbgRefresh(); }
  function dbgSub(text){ dbgSubText = text; dbgRefresh(); }

  function getIndices(){
    const list = Array.isArray(visibleChannels) && visibleChannels.length ? visibleChannels : channels;
    return list.map(ch => channels.indexOf(ch)).filter(i => i >= 0);
  }

  function paint(){
    const items = overlayList ? overlayList.children : [];
    if(!items.length) return;
    if(fsFocus < 0) fsFocus = 0;
    if(fsFocus >= items.length) fsFocus = items.length - 1;
    for(let i=0;i<items.length;i++) items[i].classList.toggle('fs-selected', i === fsFocus);
    // Do not use scrollIntoView on VIDAA; it can move the browser pointer/focus.
    const selected = items[fsFocus];
    if(selected && overlayList) {
      const top = selected.offsetTop;
      const bottom = top + selected.offsetHeight;
      if(top < overlayList.scrollTop) overlayList.scrollTop = top;
      else if(bottom > overlayList.scrollTop + overlayList.clientHeight)
        overlayList.scrollTop = bottom - overlayList.clientHeight;
    }
  }

  function buildOverlay(){
    if(!overlayList) return false;
    const indices = getIndices();
    overlayList.innerHTML = '';
    const current = indices.indexOf(currentIndex);
    fsFocus = current >= 0 ? current : 0;

    for(let i=0;i<indices.length;i++){
      const channelIndex = indices[i];
      const ch = channels[channelIndex];
      if(!ch) continue;
      const li = document.createElement('li');
      li.textContent = ch.title || 'Без названия';
      li.dataset.channelIndex = String(channelIndex);
      li.onclick = function(e){
        e.stopPropagation();
        fsFocus = i;
        playSelected();
      };
      overlayList.appendChild(li);
    }
    paint();
    return overlayList.children.length > 0;
  }

  function showOverlay(){
    if(!overlay || !overlayList) return;
    try { buildOverlay(); } catch(err) { console.log('picker build', err); dbg('build error: ' + err); }
    overlay.classList.add('show');
    overlay.setAttribute('aria-hidden','false');
    paint();
  }

  function hideOverlay(){
    if(!overlay) return;
    overlay.classList.remove('show');
    overlay.setAttribute('aria-hidden','true');
  }

  function move(delta){
    if(!overlay.classList.contains('show')) showOverlay();
    else { fsFocus += delta; paint(); }
  }

  function playSelected(){
    const items = overlayList ? overlayList.children : [];
    if(!items.length) return;
    const idx = Number(items[fsFocus].dataset.channelIndex);
    if(Number.isInteger(idx) && channels[idx]) playByIndex(idx);
    hideOverlay();
  }

  function previousChannel(){
    if(!channels.length) return;
    let i = (typeof currentIndex === 'number' ? currentIndex : 0) - 1;
    if(i < 0) i = channels.length - 1;
    playByIndex(i);
  }

  function nextChannel(){
    if(!channels.length) return;
    let i = (typeof currentIndex === 'number' ? currentIndex : -1) + 1;
    if(i >= channels.length) i = 0;
    playByIndex(i);
  }

  async function enterFullscreen(){
    try{
      if(document.fullscreenElement === playerSection) return;
      if(playerSection.requestFullscreen) await playerSection.requestFullscreen();
      else {
        document.body.classList.add('tv-video-fullscreen');
        playerSection.classList.add('is-fullscreen');
      }
    }catch(e){
      document.body.classList.add('tv-video-fullscreen');
      playerSection.classList.add('is-fullscreen');
    }
  }

  // On this VIDAA browser OK is delivered as a click.
  document.addEventListener('click', function(e){
    if(e.isTrusted && !inFullscreen()) enterFullscreen();
  }, true);

  document.addEventListener('fullscreenchange', function(){
    const active = document.fullscreenElement === playerSection;
    playerSection.classList.toggle('is-fullscreen', active);
    hideOverlay();
  });

  // IMPORTANT: VIDAA was previously proven to deliver these number keys as keydown
  // with keyCodes 50/52/53/54/56. Keep exactly one keydown handler.
  window.addEventListener('keydown', function(e){
    let k = e.keyCode || e.which;
    // Fallback if the TV reports key names instead of numeric codes
    if(!k && /^[0-9]$/.test(e.key || '')) k = 48 + Number(e.key);
    dbg('key=' + k + ' name=' + (e.key || '-') + ' fs=' + inFullscreen() + ' overlay=' + (overlay ? overlay.classList.contains('show') : 'none'));

    if(pickerOpen){
      e.preventDefault(); e.stopImmediatePropagation();
      if(k === 50 || k === 38){ pickIdx--; paintPicker(); }
      else if(k === 56 || k === 40){ pickIdx++; paintPicker(); }
      else if(k === 53 || k === 13){ pickerChoose(); }
      else if(k === 55 || k === 27 || k === 8 || k === 10009 || k === 461){ closePicker(); }
      return;
    }
    if(k === 55){ e.preventDefault(); e.stopImmediatePropagation(); openPicker(); return; }

    if(k === 50){
      e.preventDefault(); e.stopImmediatePropagation();
      if(inFullscreen()) move(-1);
      else {
        const items=channelListEl.querySelectorAll('li[data-visible-index]');
        if(items.length){ focusedVisibleIndex=Math.max(0,focusedVisibleIndex-1); items[focusedVisibleIndex].focus(); }
      }
      return;
    }
    if(k === 56){
      e.preventDefault(); e.stopImmediatePropagation();
      if(inFullscreen()) move(1);
      else {
        const items=channelListEl.querySelectorAll('li[data-visible-index]');
        if(items.length){ focusedVisibleIndex=Math.min(items.length-1,focusedVisibleIndex+1); items[focusedVisibleIndex].focus(); }
      }
      return;
    }
    if(SUBTITLE_KEYCODES.indexOf(k) >= 0 || SUBTITLE_KEYNAMES.indexOf(e.key) >= 0){ e.preventDefault(); e.stopImmediatePropagation(); window.__cycleSubtitles(); return; }
    if(k === 52){ e.preventDefault(); e.stopImmediatePropagation(); previousChannel(); return; }
    if(k === 54){ e.preventDefault(); e.stopImmediatePropagation(); nextChannel(); return; }
    if(k === 53){
      e.preventDefault(); e.stopImmediatePropagation();
      if(inFullscreen() && overlay.classList.contains('show')) playSelected();
      else playVisibleIndex(focusedVisibleIndex);
      return;
    }
  }, true);


  // ---- Playlist picker: key 7 opens, 2/8 (or up/down) select, 5 (or OK/Enter) load, 7/Back close ----
  let pickerEl = null, pickerList = null, pickerOpen = false, pickIdx = 0;

  function buildPicker(){
    if(pickerEl) return;
    pickerEl = document.createElement('div');
    pickerEl.style.cssText = 'display:none;position:absolute;left:50%;top:8%;margin-left:-220px;width:440px;' +
      'z-index:100002;background:rgba(3,20,24,.98);border:2px solid #2ee6c9;border-radius:10px;' +
      'padding:14px 12px 10px;box-sizing:border-box;color:#e6f7ff;font-family:Arial,Helvetica,sans-serif';

    const title = document.createElement('div');
    title.textContent = 'Плейлисты';
    title.style.cssText = 'font-size:22px;font-weight:700;padding:2px 10px 10px';

    pickerList = document.createElement('ul');
    pickerList.style.cssText = 'list-style:none;margin:0;padding:0;max-height:50vh;overflow:hidden;position:relative';

    const hint = document.createElement('div');
    hint.textContent = '2 / 8 — выбор   5 — ок   7 — закрыть';
    hint.style.cssText = 'margin-top:8px;padding:6px 10px;font-size:13px;color:#b9f0e8';

    pickerEl.appendChild(title);
    pickerEl.appendChild(pickerList);
    pickerEl.appendChild(hint);
    playerSection.appendChild(pickerEl);
  }

  function fillPicker(){
    pickerList.innerHTML = '';
    playlists.forEach(function(p, i){
      const li = document.createElement('li');
      li.textContent = (i === playlistIndex ? '● ' : '') + p.name;
      li.style.cssText = 'height:48px;padding:9px 14px;box-sizing:border-box;' +
        'border-bottom:1px solid rgba(255,255,255,.07);font-size:18px;line-height:30px;' +
        'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer';
      li.onclick = function(e){ e.stopPropagation(); pickIdx = i; pickerChoose(); };
      pickerList.appendChild(li);
    });
  }

  function paintPicker(){
    const items = pickerList.children;
    if(!items.length) return;
    if(pickIdx < 0) pickIdx = items.length - 1;
    if(pickIdx >= items.length) pickIdx = 0;
    for(let i = 0; i < items.length; i++){
      const sel = i === pickIdx;
      items[i].style.outline = sel ? '3px solid #2ee6c9' : 'none';
      items[i].style.outlineOffset = '-3px';
      items[i].style.background = sel ? 'rgba(46,230,201,.22)' : 'transparent';
    }
    const s = items[pickIdx];
    const top = s.offsetTop, bottom = top + s.offsetHeight;
    if(top < pickerList.scrollTop) pickerList.scrollTop = top;
    else if(bottom > pickerList.scrollTop + pickerList.clientHeight) pickerList.scrollTop = bottom - pickerList.clientHeight;
  }

  function openPicker(){
    if(!playlists.length) return;
    hideOverlay();
    buildPicker();
    fillPicker();
    pickIdx = Math.max(0, playlistIndex);
    pickerEl.style.display = 'block';
    pickerOpen = true;
    paintPicker();
  }

  function closePicker(){
    if(pickerEl) pickerEl.style.display = 'none';
    pickerOpen = false;
  }

  function pickerChoose(){
    const idx = pickIdx;
    closePicker();
    if(idx !== playlistIndex) selectPlaylist(idx);
  }

  window.__openPlaylistPicker = openPicker;

  // Keys that cycle subtitles. 460 = standard HbbTV/OIPF VK_SUBTITLE code,
  const SUBTITLE_KEYCODES = [460];
  const SUBTITLE_KEYNAMES = ['Subtitle', 'Subtitles', 'ClosedCaption', 'Captions', 'MediaTrackSubtitle'];

  // ---- Subtitles: cycle Off -> track 1 -> track 2 ... -> Off ----
  let subIdx = -1;          // -1 = off
  let toastEl = null, toastTimer = null;

  function toast(text){
    if(!toastEl){
      toastEl = document.createElement('div');
      toastEl.style.cssText = 'position:absolute;left:50%;top:24px;margin-left:-160px;width:320px;' +
        'text-align:center;z-index:100001;padding:8px 14px;background:rgba(0,0,0,.8);color:#e6f7ff;' +
        'font:20px sans-serif;border-radius:8px;pointer-events:none;box-sizing:border-box';
      playerSection.appendChild(toastEl);
    }
    toastEl.textContent = text;
    toastEl.style.display = 'block';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function(){ toastEl.style.display = 'none'; }, 2200);
  }
  window.__toast = toast;

  function nativeTracks(){
    const all = video && video.textTracks ? Array.from(video.textTracks) : [];
    return all.filter(function(t){ return t.kind === 'subtitles' || t.kind === 'captions'; });
  }

  function subtitleEntries(){
    const list = [];
    if(hls && hls.subtitleTracks && hls.subtitleTracks.length){
      hls.subtitleTracks.forEach(function(t, i){
        list.push({ hlsIndex: i, name: t.name || t.lang || ('#' + (i + 1)), label: t.name, lang: t.lang });
      });
      // CEA-608/708 captions embedded in the video are exposed as native "captions" tracks
      nativeTracks().filter(function(t){ return t.kind === 'captions'; }).forEach(function(t, i){
        list.push({ track: t, name: t.label || t.language || ('CC ' + (i + 1)) });
      });
    } else {
      nativeTracks().forEach(function(t, i){
        list.push({ track: t, name: t.label || t.language || ('#' + (i + 1)) });
      });
    }
    return list;
  }

  window.__cycleSubtitles = function(){
    // Native (built-in) HLS playback on this TV gives an empty subtitle track without any cues.
    // Restart the current channel through hls.js, which reads WebVTT subtitles itself.
    if(!hls && window.Hls && Hls.isSupported() && typeof currentIndex === 'number' && channels[currentIndex]){
      window.__forceHls = true;
      pendingSub = true;
      toast('Субтитры: перезапуск потока…');
      playStream(channels[currentIndex].url);
      return null;
    }
    const entries = subtitleEntries();
    if(!entries.length){ subIdx = -1; toast('Субтитров в этом канале нет'); updateSubButton(); return null; }

    subIdx++;
    if(subIdx >= entries.length) subIdx = -1;

    // switch everything off first
    try { if(hls){ hls.subtitleTrack = -1; hls.subtitleDisplay = false; } } catch(_) {}
    nativeTracks().forEach(function(t){ try { t.mode = 'disabled'; } catch(_) {} });

    if(subIdx >= 0){
      const en = entries[subIdx];
      subActiveEntry = en;
      try {
        if(en.track) en.track.mode = 'hidden';
        // subtitleDisplay=false -> track is selected/loaded but kept 'hidden' (we render the text ourselves)
        else if(hls){ hls.subtitleDisplay = false; hls.subtitleTrack = en.hlsIndex; }
      } catch(_) {}
      toast('Субтитры: ' + en.name);
      startSubRender();
    } else {
      subActiveEntry = null;
      stopSubRender();
      toast('Субтитры: выкл');
    }
    updateSubButton();
    return subIdx >= 0;
  };

  // ---- Own subtitle renderer: reads cues of the selected track and draws them in a div ----
  let subActiveEntry = null, subTimer = null, subBox = null, subSpan = null;

  function ensureSubBox(){
    if(subBox) return;
    subBox = document.createElement('div');
    subBox.style.cssText = 'position:absolute;left:8%;right:8%;bottom:9%;text-align:center;z-index:5;' +
      'pointer-events:none;display:none';
    subSpan = document.createElement('span');
    subSpan.style.cssText = 'display:inline-block;max-width:100%;padding:4px 14px;background:rgba(0,0,0,.65);' +
      'color:#fff;font:600 34px/1.3 Arial,Helvetica,sans-serif;white-space:pre-line;' +
      'text-shadow:0 0 4px #000,0 0 4px #000;border-radius:4px';
    subBox.appendChild(subSpan);
    playerSection.appendChild(subBox);
  }

  function cleanCue(text){
    return String(text || '').replace(/<[^>]*>/g, '')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').trim();
  }

  function findNativeFor(en){
    if(!en) return [];
    if(en.track) return [en.track];
    return nativeTracks().filter(function(t){
      return t.kind === 'subtitles' &&
        ((en.label && t.label === en.label) || (en.lang && t.language === en.lang));
    });
  }

  // ---- hls.js diagnostics for subtitles (shown in the debug line) ----
  let pendingSub = false;
  const diag = { sw: 0, pl: 0, pfr: '-', live: '-', fl: 0, proc: 0, cp: 0, err: '' };
  window.__onHlsCreated = function(h){
    diag.sw = 0; diag.pl = 0; diag.pfr = '-'; diag.live = '-'; diag.fl = 0; diag.proc = 0; diag.cp = 0; diag.err = '';
    const E = (window.Hls && Hls.Events) || {};
    function on(name, fn){ if(E[name]) h.on(E[name], fn); }
    on('MANIFEST_PARSED', function(){
      if(!pendingSub) return;
      pendingSub = false;
      let tries = 0;
      (function wait(){
        if(hls !== h) return;                       // channel changed meanwhile
        if((h.subtitleTracks && h.subtitleTracks.length) || ++tries > 15) window.__cycleSubtitles();
        else setTimeout(wait, 300);
      })();
    });
    on('SUBTITLE_TRACK_SWITCH', function(){ diag.sw++; });
    on('SUBTITLE_TRACK_LOADED', function(ev, d){
      diag.pl++;
      diag.pfr = d && d.details && d.details.fragments ? d.details.fragments.length : '?';
      diag.live = d && d.details ? (d.details.live ? 'live' : 'vod') : '?';
    });
    on('FRAG_LOADED', function(ev, d){ if(d && d.frag && d.frag.type === 'subtitle') diag.fl++; });
    on('SUBTITLE_FRAG_PROCESSED', function(){ diag.proc++; });
    on('CUES_PARSED', function(){ diag.cp++; });
    on('ERROR', function(ev, d){
      if(!d) return;
      const isSub = (d.frag && d.frag.type === 'subtitle') || /subtitle/i.test(d.details || '') ||
                    (d.context && d.context.type === 'subtitleTrack');
      if(isSub) diag.err = (d.details || d.type || '?') + (d.response && d.response.code ? ' ' + d.response.code : '');
    });
  };
  function diagText(){
    return (hls ? 'hls.js' : 'native') + ': sw=' + diag.sw + ' pl=' + diag.pl + ' frags=' + diag.pfr + ' ' + diag.live +
           ' loaded=' + diag.fl + ' proc=' + diag.proc + (diag.err ? ' ERR=' + diag.err : '');
  }

  function renderSubs(){
    if(subIdx < 0 || !subActiveEntry){ stopSubRender(); return; }
    const trs = findNativeFor(subActiveEntry);
    if(!trs.length){
      subBox.style.display = 'none';
      dbgSub('sub: track "' + subActiveEntry.name + '" not created yet (native tracks: ' + nativeTracks().length + ')\n' + diagText());
      return;
    }
    // If hls.js has not activated any of them, activate the newest one (hidden = cues load, no native drawing)
    if(trs.every(function(t){ return t.mode === 'disabled'; })){
      try { trs[trs.length - 1].mode = 'hidden'; } catch(_) {}
    }
    const t = video.currentTime;
    const lines = [];
    let total = 0;
    trs.forEach(function(tr){
      if(tr.mode === 'showing'){ try { tr.mode = 'hidden'; } catch(_) {} }   // no double text
      const cues = tr.cues;
      if(!cues) return;
      total += cues.length;
      for(let i = 0; i < cues.length; i++){
        const c = cues[i];
        if(c.startTime <= t && t < c.endTime){
          const s = cleanCue(c.text);
          if(s && lines.indexOf(s) < 0) lines.push(s);
        }
      }
    });
    if(lines.length){
      subSpan.textContent = lines.join('\n');
      subBox.style.display = 'block';
    } else {
      subBox.style.display = 'none';
    }
    dbgSub('sub: ' + subActiveEntry.name + ' tracks=' + trs.length + ' cues=' + total +
           ' t=' + t.toFixed(0) + ' shown=' + lines.length + '\n' + diagText());
  }

  function startSubRender(){
    stopSubRender();
    ensureSubBox();
    subTimer = setInterval(renderSubs, 200);
    renderSubs();
  }

  function stopSubRender(){
    if(subTimer){ clearInterval(subTimer); subTimer = null; }
    if(subBox) subBox.style.display = 'none';
    dbgSub('');
  }

  function updateSubButton(){
    if(subButton) subButton.textContent = subIdx >= 0 ? 'SUB ✓' : 'SUB';
  }

  // New channel -> new stream -> subtitles start off again
  if(video) video.addEventListener('emptied', function(){ subIdx = -1; subActiveEntry = null; stopSubRender(); updateSubButton(); });

  if(subButton) subButton.addEventListener('click', function(e){
    e.stopPropagation();
    window.__cycleSubtitles();
  });
})();
