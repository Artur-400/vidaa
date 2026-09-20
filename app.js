// VIDAA IPTV v0.3.14
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
const VOLUME_KEY = 'vidaa_vol';

function setVolume(v) {
  v = Math.max(0, Math.min(1, v));
  player.volume = v;
  volLabel.textContent = Math.round(v * 100) + '%';
  localStorage.setItem(VOLUME_KEY, String(v));
}

function togglePlay() {
  if (!player.src && !player.currentSrc) return;
  if (player.paused) player.play().catch(() => {});
  else player.pause();
}

btnPlay.addEventListener('click', togglePlay);
btnPrev.addEventListener('click', () => stepVisible(-1, true));
btnNext.addEventListener('click', () => stepVisible(1, true));

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

function parseM3U(text) {
  channels = [];
  groups = ['Все'];

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
      if (cur.url) channels.push(cur);

      if (cur.group && !groups.includes(cur.group)) {
        groups.push(cur.group);
      }
      cur = null;
    }
  }

  // Сохраняем порядок плейлиста — так номера каналов не прыгают.
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

  localStorage.setItem(STORAGE_KEY, JSON.stringify({
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

  if (player.canPlayType('application/vnd.apple.mpegurl')) {
    player.src = url;
    player.play().catch(() => {});
  } else if (window.Hls && Hls.isSupported()) {
    hls = new Hls({
      enableWorker: true,
      lowLatencyMode: false
    });

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
        }
      }
    });
  } else {
    player.src = url;
    player.play().catch(() => {});
  }
}

async function loadM3U(url) {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) {
      throw new Error('HTTP ' + res.status);
    }

    const text = await res.text();

    if (!text.includes('#EXTINF')) {
      throw new Error('Плейлист не содержит #EXTINF');
    }

    parseM3U(text);

    if (!channels.length) {
      throw new Error('Не найдено ни одного канала');
    }

    restoreLast();
  } catch (e) {
    console.error('M3U:', e);
    channelListEl.innerHTML = '';
    const error = document.createElement('li');
    error.className = 'empty error';
    error.textContent = 'Ошибка загрузки плейлиста';
    channelListEl.appendChild(error);
    nowTitle.textContent = 'Не удалось загрузить плейлист';
  }
}

function restoreLast() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
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

loadM3U(M3U_URL);

window.__vidaa = {
  get channels() { return channels; },
  playByIndex,
  playStream,
  loadM3U,
  parseM3U,
  get visibleChannels() { return visibleChannels; }
};



/* VIDAA IPTV v0.3.14 — stable fullscreen channel picker for Hisense/VIDAA */
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

  // Keys that cycle subtitles. 460 = standard HbbTV/OIPF VK_SUBTITLE code,
  // 48 = "0", 403 = red button. If the remote's Subtitle button reports another code
  // (see the debug line), add that number here.
  const SUBTITLE_KEYCODES = [460, 48, 403];
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
    if(!en) return null;
    if(en.track) return en.track;
    const subs = nativeTracks().filter(function(t){ return t.kind === 'subtitles'; });
    for(let i = 0; i < subs.length; i++){
      const t = subs[i];
      if((en.label && t.label === en.label) || (en.lang && t.language === en.lang)) return t;
    }
    return null;
  }

  function renderSubs(){
    if(subIdx < 0 || !subActiveEntry){ stopSubRender(); return; }
    const tr = findNativeFor(subActiveEntry);
    if(!tr){
      subBox.style.display = 'none';
      dbgSub('sub: track "' + subActiveEntry.name + '" not created yet (native tracks: ' + nativeTracks().length + ')');
      return;
    }
    // Keep the native renderer out of the way (no double text)
    if(tr.mode !== 'hidden'){ try { tr.mode = 'hidden'; } catch(_) {} }

    const cues = tr.cues;
    const n = cues ? cues.length : 0;
    const t = video.currentTime;
    const lines = [];
    for(let i = 0; i < n; i++){
      const c = cues[i];
      if(c.startTime <= t && t < c.endTime){
        const s = cleanCue(c.text);
        if(s) lines.push(s);
      }
    }
    if(lines.length){
      subSpan.textContent = lines.join('\n');
      subBox.style.display = 'block';
    } else {
      subBox.style.display = 'none';
    }
    dbgSub('sub: ' + subActiveEntry.name + ' cues=' + n + ' t=' + t.toFixed(1) + ' shown=' + lines.length);
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
