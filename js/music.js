/* LM 27 — 배경 음악
   화면마다 플레이리스트가 바뀐다: 밴픽(match-draft)은 밴픽 음악, 그 밖의 메뉴는 월즈 주제가.
   경기 중계(match-live)에서는 같은 곡을 작게 깔아 둔다.
   음원은 라이엇 공식 유튜브 영상을 그대로 재생한다 (저장소에 음원 파일을 올리지 않는다).
   유튜브 재생기는 상단바의 작은 화면으로 늘 보이게 둔다. 곡을 바꾸려면 LISTS만 고치면 된다.
   직접 가진 음원 파일을 쓰려면 { src: 'assets/music/파일.mp3' }처럼 적으면 된다. */
const Music = {
  LISTS: {
    worlds: { name: '월즈 플레이리스트', tracks: [
      { yt: 'mlFxxNsExJc', title: 'Know My Name', artist: 'True Damage', year: 2026 },
      { yt: 'pzt6SmvGpXk', title: 'Sacrifice', artist: 'G.E.M.', year: 2025 },
      { yt: '5FrhtahQiRc', title: 'Heavy Is The Crown', artist: 'Linkin Park', year: 2024 },
      { yt: 'C3GouGa0noM', title: 'GODS', artist: 'NewJeans', year: 2023 },
      { yt: 'HYsz1hP0BFo', title: "STAR WALKIN'", artist: 'Lil Nas X', year: 2022 },
      { yt: 'r6zIGXun57U', title: 'Legends Never Die', artist: 'Against The Current', year: 2017 },
    ] },
    draft: { name: '밴픽', tracks: [
      { yt: 'yPpffxzc9h4', title: 'World Championship Theme', artist: 'Riot Games Music', year: 2025 },
      { yt: '2XNxXXjqcSs', title: 'Dragon Of The West', artist: 'Worlds 2026 밴픽', year: 2026 },
    ] },
  },
  KEY: 'lm27.music',
  pref: { on: true, vol: 50 },
  list: null, idx: 0, order: [], yt: null, audio: null, ready: false, playing: false, unlocked: false, duck: 1, bad: new Set(),

  init() {
    try { Object.assign(this.pref, JSON.parse(localStorage.getItem(this.KEY) || '{}')); } catch (e) {}
    this.mount();
    Router.onRoute(r => this.route(r));
    // 브라우저는 사용자가 한 번 누르기 전에는 소리를 못 낸다: 첫 클릭에서 시작
    const go = () => { this.unlocked = true; document.removeEventListener('pointerdown', go, true); if (this.pref.on && this.inGame()) this.start(); };
    document.addEventListener('pointerdown', go, true);
    // 게임 화면을 떠나면(메인 화면 등) 멈춘다
    const show = App.show.bind(App);
    App.show = id => { show(id); if (id === 'game') { if (this.pref.on && this.unlocked) this.start(); } else this.pause(); };
  },
  save() { try { localStorage.setItem(this.KEY, JSON.stringify(this.pref)); } catch (e) {} },
  inGame() { return !!document.querySelector('#screen-game.active'); },
  want(r = Router.current()) { return r === 'match-draft' ? 'draft' : 'worlds'; },
  track() { const L = this.LISTS[this.list]; return L && L.tracks[this.order[this.idx]]; },

  // ---------- 화면 ----------
  mount() {
    const tb = document.querySelector('#screen-game .topbar'), badge = tb && tb.querySelector('.tb-badge'); if (!tb) return;
    const el = document.createElement('div'); el.className = 'mu'; el.id = 'mu';
    el.innerHTML = `
      <div class="mu-chip">
        <div class="mu-vid"><div id="mu-yt"></div><button class="mu-open" aria-label="음악 플레이어 열기"></button></div>
        <div class="mu-now"><b class="mu-t">음악</b><small class="mu-a">화면을 누르면 시작합니다</small></div>
        <button class="mu-btn mu-play" aria-label="재생">${this.ic('play')}</button>
        <button class="mu-btn mu-next" aria-label="다음 곡">${this.ic('next')}</button>
      </div>
      <div class="mu-pop" hidden>
        <div class="mu-pop-art"><img alt=""><span class="mu-list"></span></div>
        <div class="mu-pop-now"><b class="mu-t"></b><small class="mu-a"></small></div>
        <div class="mu-pop-ctl">
          <button class="mu-btn mu-prev" aria-label="이전 곡">${this.ic('prev')}</button>
          <button class="mu-btn big mu-play" aria-label="재생">${this.ic('play')}</button>
          <button class="mu-btn mu-next" aria-label="다음 곡">${this.ic('next')}</button>
        </div>
        <label class="mu-vol">${this.ic('vol')}<input type="range" min="0" max="100" id="mu-vol" aria-label="음량"></label>
        <ol class="mu-tracks"></ol>
        <label class="mu-off"><input type="checkbox" id="mu-on"> 배경 음악 켜기</label>
        <p class="mu-note">라이엇 공식 유튜브 영상을 재생합니다.</p>
      </div>`;
    tb.insertBefore(el, badge || tb.querySelector('.tb-clock'));
    this.el = el;
    el.querySelectorAll('.mu-play').forEach(b => b.onclick = () => this.toggle());
    el.querySelectorAll('.mu-next').forEach(b => b.onclick = () => this.step(1));
    el.querySelector('.mu-prev').onclick = () => this.step(-1);
    el.querySelector('.mu-open').onclick = () => this.pop();
    el.querySelector('.mu-now').onclick = () => this.pop();
    const vol = el.querySelector('#mu-vol'); vol.value = this.pref.vol; vol.oninput = () => { this.pref.vol = +vol.value; this.applyVol(); this.save(); };
    const on = el.querySelector('#mu-on'); on.checked = this.pref.on; on.onchange = () => this.setOn(on.checked);
    el.querySelector('.mu-tracks').onclick = e => { const li = e.target.closest('[data-i]'); if (!li) return; this.idx = this.order.indexOf(+li.dataset.i); this.load(true); };
    document.addEventListener('pointerdown', e => { if (!el.contains(e.target)) this.pop(false); });
    this.paint();
  },
  ic(k) {
    return { play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>', pause: '<svg viewBox="0 0 24 24"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>',
      next: '<svg viewBox="0 0 24 24"><path d="M6 5v14l9-7zM16 5h2v14h-2z"/></svg>', prev: '<svg viewBox="0 0 24 24"><path d="M18 5v14l-9-7zM6 5h2v14H6z"/></svg>',
      vol: '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 8.5a4.5 4.5 0 0 1 0 7" fill="none" stroke="currentColor" stroke-width="2"/></svg>' }[k];
  },
  pop(open) {
    const p = this.el.querySelector('.mu-pop'), on = open == null ? p.hidden : open;
    p.hidden = !on; if (on) this.paint();
  },
  paint() {
    if (!this.el) return;
    const t = this.track(), L = this.LISTS[this.list || this.want()];
    this.el.classList.toggle('off', !this.pref.on);
    this.el.classList.toggle('on', this.playing);
    this.el.querySelectorAll('.mu-t').forEach(b => b.textContent = !this.pref.on ? '음악 꺼짐' : t ? t.title : '음악');
    this.el.querySelectorAll('.mu-a').forEach(b => b.textContent = !this.pref.on ? '눌러서 켜기' : t ? `${t.artist}${t.year ? ' · ' + t.year : ''}` : (this.unlocked ? '불러오는 중…' : '화면을 누르면 시작합니다'));
    this.el.querySelectorAll('.mu-play').forEach(b => { b.innerHTML = this.ic(this.playing ? 'pause' : 'play'); b.setAttribute('aria-label', this.playing ? '일시정지' : '재생'); });
    const img = this.el.querySelector('.mu-pop-art img'); img.onerror = () => { img.style.visibility = 'hidden'; }; img.onload = () => { img.style.visibility = ''; }; if (t && t.yt) img.src = `https://i.ytimg.com/vi/${t.yt}/mqdefault.jpg`;
    this.el.querySelector('.mu-list').textContent = L ? L.name : '';
    this.el.querySelector('.mu-tracks').innerHTML = L ? L.tracks.map((x, i) => `<li data-i="${i}" class="${t === x ? 'cur' : ''} ${this.bad.has(x.yt) ? 'bad' : ''}"><b>${UI.esc(x.title)}</b><small>${UI.esc(x.artist)}</small></li>`).join('') : '';
  },

  // ---------- 재생 ----------
  setOn(on) {
    this.pref.on = on; this.save();
    if (on) { this.unlocked = true; this.start(); } else this.pause();
    this.paint();
  },
  start() {
    if (!this.pref.on) return;
    const w = this.want();
    if (this.list !== w || !this.order.length) this.use(w);
    else this.play();
  },
  // 화면이 바뀌면: 밴픽 ↔ 메뉴 플레이리스트 전환, 중계 중에는 작게
  route(r) {
    this.duck = r === 'match-live' ? .35 : 1; this.applyVol();
    if (!this.pref.on || !this.unlocked) return;
    const w = this.want(r); if (w !== this.list) this.fade(() => this.use(w));
  },
  use(name) {
    const L = this.LISTS[name]; this.list = name;
    this.order = L.tracks.map((_, i) => i);
    for (let i = this.order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [this.order[i], this.order[j]] = [this.order[j], this.order[i]]; }   // 매번 다른 순서
    this.idx = 0; this.load(true);
  },
  step(d) {
    if (!this.pref.on) return this.setOn(true);
    if (!this.list) return this.start();
    const n = this.order.length; this.idx = (this.idx + d + n) % n; this.load(true);
  },
  load(play) {
    const t = this.track(); if (!t) return;
    this.paint();
    if (t.src) {
      if (this.yt && this.ready) this.yt.stopVideo();
      this.audio ||= Object.assign(new Audio(), { onended: () => this.step(1), onerror: () => this.skip(t) });
      this.audio.src = t.src; this.applyVol(); if (play) this.audio.play().then(() => this.set(true)).catch(() => this.set(false));
      return;
    }
    if (this.audio) this.audio.pause();
    this.withYT(() => { this.yt.loadVideoById(t.yt); this.applyVol(); if (!play) this.yt.pauseVideo(); });
  },
  skip(t) { this.bad.add(t.yt || t.src); if (this.LISTS[this.list].tracks.every(x => this.bad.has(x.yt || x.src))) { this.set(false); return; } this.step(1); },
  play() { const t = this.track(); if (!t) return; if (t.src && this.audio) this.audio.play().then(() => this.set(true)).catch(() => {}); else this.withYT(() => this.yt.playVideo()); },
  pause() { if (this.audio) this.audio.pause(); if (this.yt && this.ready) this.yt.pauseVideo(); this.set(false); },
  toggle() { if (!this.pref.on) return this.setOn(true); this.unlocked = true; if (this.playing) this.pause(); else if (!this.list) this.start(); else this.play(); },
  set(p) { this.playing = p; this.paint(); },
  vol() { return Math.round(this.pref.vol * this.duck * (this.fadeK ?? 1)); },
  applyVol() { const v = this.vol(); if (this.audio) this.audio.volume = v / 100; if (this.yt && this.ready) this.yt.setVolume(v); },
  // 플레이리스트가 바뀔 때 0.6초 동안 소리를 줄였다가 넘긴다
  fade(then) {
    if (!this.playing) { then(); return; }
    let k = 1; clearInterval(this._fade);
    this._fade = setInterval(() => { k -= .1; this.fadeK = Math.max(0, k); this.applyVol(); if (k <= 0) { clearInterval(this._fade); this.fadeK = 1; then(); } }, 60);
  },
  // 유튜브 재생기: 처음 한 번만 만든다
  withYT(fn) {
    if (this.ready) return fn();
    (this._q ||= []).push(fn);
    if (this._loading) return; this._loading = true;
    const make = () => {
      this.yt = new YT.Player('mu-yt', { width: 64, height: 36, playerVars: { controls: 0, disablekb: 1, playsinline: 1, rel: 0, modestbranding: 1, iv_load_policy: 3, fs: 0 },
        events: {
          onReady: () => { this.ready = true; const q = this._q; this._q = []; q.forEach(f => f()); },
          onStateChange: e => { if (e.data === YT.PlayerState.ENDED) this.step(1); else if (e.data === YT.PlayerState.PLAYING) this.set(true); else if (e.data === YT.PlayerState.PAUSED) this.set(false); },
          onError: () => { const t = this.track(); if (t) this.skip(t); },   // 퍼가기 막힌 영상 · 지워진 영상은 건너뛴다
        } });
    };
    if (window.YT && YT.Player) return make();
    const prev = window.onYouTubeIframeAPIReady; window.onYouTubeIframeAPIReady = () => { if (prev) prev(); make(); };
    const s = document.createElement('script'); s.src = 'https://www.youtube.com/iframe_api'; s.onerror = () => { this._loading = false; this.el.querySelectorAll('.mu-a').forEach(b => b.textContent = '유튜브에 연결할 수 없습니다'); }; document.head.appendChild(s);
  },
};
document.addEventListener('DOMContentLoaded', () => Music.init());
