// VIDAA IPTV v0.2.1
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



/* VIDAA IPTV v0.3.3 — unified numeric remote + fullscreen channel picker */
(function(){
  const playerSection = document.getElementById('playerSection');
  const overlay = document.getElementById('fullscreenChannelOverlay');
  const overlayList = document.getElementById('fullscreenChannelList');
  const video = document.getElementById('player');
  const subButton = document.getElementById('btn-subtitle');
  let fsFocus = 0;

  function inFullscreen(){
    return document.fullscreenElement === playerSection ||
           document.body.classList.contains('tv-video-fullscreen') ||
           playerSection.classList.contains('is-fullscreen');
  }

  function filteredChannelIndices(){
    return Array.from(channelListEl.querySelectorAll('li[data-global-index]'))
      .map(li => Number(li.dataset.globalIndex))
      .filter(i => Number.isInteger(i) && channels[i]);
  }

  function paint(){
    const items = Array.from(overlayList.children);
    if(!items.length) return;
    fsFocus = Math.max(0, Math.min(fsFocus, items.length - 1));
    items.forEach((li,i)=>li.classList.toggle('fs-selected', i===fsFocus));
    items[fsFocus].scrollIntoView({block:'nearest'});
  }

  function buildOverlay(){
    overlayList.innerHTML='';
    const indices=filteredChannelIndices();
    const current=indices.indexOf(currentIndex);
    fsFocus=current>=0 ? current : 0;

    indices.forEach((channelIndex,i)=>{
      const ch=channels[channelIndex];
      const li=document.createElement('li');
      li.textContent=ch.title;
      li.dataset.channelIndex=String(channelIndex);
      li.addEventListener('click',function(e){
        e.stopPropagation();
        fsFocus=i;
        playSelected();
      });
      overlayList.appendChild(li);
    });
    paint();
  }

  function showOverlay(){
    buildOverlay();
    overlay.classList.add('show');
    overlay.setAttribute('aria-hidden','false');
    paint();
  }

  function hideOverlay(){
    overlay.classList.remove('show');
    overlay.setAttribute('aria-hidden','true');
  }

  function move(delta){
    if(!overlay.classList.contains('show')) showOverlay();
    else { fsFocus += delta; paint(); }
  }

  function playSelected(){
    const items=Array.from(overlayList.children);
    if(!items.length) return;
    const idx=Number(items[fsFocus].dataset.channelIndex);
    if(Number.isInteger(idx) && channels[idx]) playByIndex(idx);
    hideOverlay();
  }

  function previousChannel(){
    if(!channels.length) return;
    let i=(typeof currentIndex==='number' ? currentIndex : 0)-1;
    if(i<0) i=channels.length-1;
    playByIndex(i);
  }

  function nextChannel(){
    if(!channels.length) return;
    let i=(typeof currentIndex==='number' ? currentIndex : -1)+1;
    if(i>=channels.length) i=0;
    playByIndex(i);
  }

  async function enterFullscreen(){
    try{
      if(document.fullscreenElement===playerSection) return;
      if(playerSection.requestFullscreen){
        await playerSection.requestFullscreen();
      }else{
        document.body.classList.add('tv-video-fullscreen');
        playerSection.classList.add('is-fullscreen');
      }
    }catch(e){
      console.warn('Fullscreen:',e);
      document.body.classList.add('tv-video-fullscreen');
      playerSection.classList.add('is-fullscreen');
    }
  }

  // Physical OK arrives as click on this TV. First OK enters fullscreen.
  document.addEventListener('click',function(e){
    if(!e.isTrusted) return;
    if(!inFullscreen()) enterFullscreen();
  },true);

  document.addEventListener('fullscreenchange',function(){
    const active=document.fullscreenElement===playerSection;
    playerSection.classList.toggle('is-fullscreen',active);
    if(active) hideOverlay();
    else hideOverlay();
  });

  // One — and only one — numeric remote handler. This fixes the old
  // stopImmediatePropagation handler that prevented the fullscreen picker
  // from ever receiving 2/8/5.
  window.addEventListener('keydown',function(e){
    const k=e.keyCode;

    if(k===50){ // 2 = up
      e.preventDefault(); e.stopImmediatePropagation();
      if(inFullscreen()) move(-1);
      else {
        const items=channelListEl.querySelectorAll('li[data-visible-index]');
        if(items.length){
          const n=Math.max(0,focusedVisibleIndex-1);
          focusedVisibleIndex=n;
          items[n].focus();
        }
      }
      return;
    }

    if(k===56){ // 8 = down
      e.preventDefault(); e.stopImmediatePropagation();
      if(inFullscreen()) move(1);
      else {
        const items=channelListEl.querySelectorAll('li[data-visible-index]');
        if(items.length){
          const n=Math.min(items.length-1,focusedVisibleIndex+1);
          focusedVisibleIndex=n;
          items[n].focus();
        }
      }
      return;
    }

    if(k===52){ // 4 = previous channel
      e.preventDefault(); e.stopImmediatePropagation();
      previousChannel();
      return;
    }

    if(k===54){ // 6 = next channel
      e.preventDefault(); e.stopImmediatePropagation();
      nextChannel();
      return;
    }

    if(k===53){ // 5 = confirm
      e.preventDefault(); e.stopImmediatePropagation();
      if(inFullscreen() && overlay.classList.contains('show')) playSelected();
      else playVisibleIndex(focusedVisibleIndex);
      return;
    }
  },true);

  // HLS subtitles. Use the actual lexical `hls` variable, not window.hls.
  window.__toggleSubtitles=function(){
    if(hls && hls.subtitleTracks && hls.subtitleTracks.length){
      hls.subtitleDisplay=!hls.subtitleDisplay;
      return hls.subtitleDisplay;
    }
    if(video && video.textTracks){
      const subs=Array.from(video.textTracks).filter(t=>t.kind==='subtitles'||t.kind==='captions');
      if(subs.length){
        const active=subs.findIndex(t=>t.mode==='showing');
        subs.forEach(t=>t.mode='disabled');
        if(active<0){ subs[0].mode='showing'; return true; }
        return false;
      }
    }
    return null;
  };

  if(subButton){
    subButton.addEventListener('click',function(e){
      e.stopPropagation();
      const state=window.__toggleSubtitles();
      subButton.textContent=state===true?'SUB ✓':'SUB';
    });
  }
})();
