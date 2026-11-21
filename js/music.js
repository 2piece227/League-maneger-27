/* LM 27 — 배경 음악
   화면마다 플레이리스트가 바뀐다: 밴픽(match-draft)은 밴픽 음악(연주곡), 그 밖의 메뉴는 월즈 주제가.
   경기 중계(match-live)에서는 같은 곡을 작게 깔아 둔다.
   음원은 라이엇 공식 사운드클라우드(soundcloud.com/leagueoflegends)를 사운드클라우드 퍼가기 재생기로 튼다
   (광고 없음 · 저장소에 음원 파일을 올리지 않는다). 곡을 바꾸려면 LISTS만 고치면 된다.
   직접 가진 음원 파일은 { src: 'assets/music/파일.mp3', title, artist }처럼 적으면 된다.
   화면: 오른쪽 아래 떠 있는 재생기. 접으면 음표 버튼 하나. 밴픽 · 중계 화면에서는 자동으로 접힌다. */
const Music = {
  SC: 'https://soundcloud.com/leagueoflegends/',
  LISTS: {
    worlds: { name: '월즈 플레이리스트', tracks: [
      { sc: 'worlds-collide-2015-world-championship-ft-nicki-taylor', title: 'Worlds Collide', artist: 'Nicki Taylor', year: 2015 },
      { sc: 'legends-never-die', title: 'Legends Never Die', artist: 'Against The Current', year: 2017 },
      { sc: 'rise-ft-the-glitch-mob-mako-1', title: 'RISE', artist: 'The Glitch Mob, Mako, The Word Alive', year: 2018 },
      { sc: 'phoenix-ft-cailin-russo-and-chrissy-costanza-worlds-2019', title: 'Phoenix', artist: 'Cailin Russo, Chrissy Costanza', year: 2019 },
      { sc: 'take-over-worlds-2020', title: 'Take Over', artist: 'Jeremy McKinnon, MAX, Henry', year: 2020 },
      { sc: 'burn-it-all-down', title: 'Burn It All Down', artist: 'PVRIS', year: 2021 },
      { sc: 'gods', title: 'GODS', artist: 'NewJeans', year: 2023 },
      { sc: 'awaken-ft-valerie-broussard-ray-chen', title: 'Awaken', artist: 'Valerie Broussard, Ray Chen', year: 2019 },
      { sc: 'legends-never-die-remix', title: 'Legends Never Die (Remix)', artist: 'League of Legends', year: 2017 },
      { sc: 'worlds-collide-arty-remix', title: 'Worlds Collide (Arty Remix)', artist: 'Arty', year: 2015 },
    ] },
    draft: { name: '밴픽', tracks: [
      { sc: 'worlds-2020-orchestral-theme', title: 'Worlds 2020 Orchestral Theme', artist: 'League of Legends', year: 2020 },
      { sc: 'rise-ft-the-glitch-mob-mako', title: 'RISE (Instrumental)', artist: 'The Glitch Mob', year: 2018 },
      { sc: 'worlds-collide-instrumental', title: 'Worlds Collide (Instrumental)', artist: 'League of Legends', year: 2015 },
      { sc: 'awaken', title: 'Awaken', artist: 'League of Legends', year: 2019 },
    ] },
  },
  KEY: 'lm27.music',
  pref: { on: true, vol: 50, open: true },
  list: null, idx: 0, order: [], w: null, audio: null, ready: false, playing: false, unlocked: false, duck: 1, bad: new Set(), art: {},

  init() {
    try { Object.assign(this.pref, JSON.parse(localStorage.getItem(this.KEY) || '{}')); } catch (e) {}
    this.mount();
    Router.onRoute(r => this.route(r));
    // 브라우저는 사용자가 한 번 누르기 전에는 소리를 못 낸다: 첫 터치에서 시작
    const go = () => { this.unlocked = true; document.removeEventListener('pointerdown', go, true); if (this.pref.on && this.inGame()) this.start(); };
    document.addEventListener('pointerdown', go, true);
    // 게임 화면에서만: 메인 화면 등으로 나가면 멈추고 재생기도 숨긴다
    const show = App.show.bind(App);
    App.show = id => { show(id); this.el.hidden = id !== 'game'; if (id === 'game') { if (this.pref.on && this.unlocked) this.start(); } else this.pause(); };
    this.el.hidden = !this.inGame();
  },
  save() { try { localStorage.setItem(this.KEY, JSON.stringify(this.pref)); } catch (e) {} },
  inGame() { return !!document.querySelector('#screen-game.active'); },
  want(r = Router.current()) { return r === 'match-draft' ? 'draft' : 'worlds'; },
  track() { const L = this.LISTS[this.list]; return L && L.tracks[this.order[this.idx]]; },
  url(t) { return t.sc ? this.SC + t.sc : t.src; },

  // ---------- 화면: 오른쪽 아래 떠 있는 재생기 ----------
  mount() {
    const el = document.createElement('div'); el.className = 'mu'; el.id = 'mu';
    el.innerHTML = `
      <div class="mu-card" role="region" aria-label="배경 음악">
        <div class="mu-art"><img alt=""><i class="mu-eq"><b></b><b></b><b></b></i></div>
        <div class="mu-main">
          <div class="mu-now"><b class="mu-t">음악</b><small class="mu-a"></small></div>
          <div class="mu-ctl">
            <button class="mu-btn mu-prev" aria-label="이전 곡">${this.ic('prev')}</button>
            <button class="mu-btn big mu-play" aria-label="재생">${this.ic('play')}</button>
            <button class="mu-btn mu-next" aria-label="다음 곡">${this.ic('next')}</button>
            <button class="mu-btn mu-more" aria-label="곡 목록 · 음량">${this.ic('list')}</button>
          </div>
        </div>
        <div class="mu-pop" hidden>
          <div class="mu-pop-h"><b class="mu-list"></b><label class="mu-off"><input type="checkbox" id="mu-on"> 켜기</label></div>
          <label class="mu-vol">${this.ic('vol')}<input type="range" min="0" max="100" id="mu-vol" aria-label="음량"></label>
          <ol class="mu-tracks"></ol>
          <a class="mu-src" href="https://soundcloud.com/leagueoflegends" target="_blank" rel="noopener">League of Legends 공식 사운드클라우드</a>
        </div>
      </div>
      <button class="mu-fab" aria-label="음악 플레이어">${this.ic('note')}</button>
      <div class="mu-sc" aria-hidden="true"></div>`;
    document.body.appendChild(el);
    this.el = el;
    $('.mu-play', el).onclick = () => this.toggle();
    $('.mu-next', el).onclick = () => this.step(1);
    $('.mu-prev', el).onclick = () => this.step(-1);
    $('.mu-more', el).onclick = () => { const p = $('.mu-pop', el); p.hidden = !p.hidden; this.paint(); };
    $('.mu-fab', el).onclick = () => { const open = !this.el.classList.contains('open'); if (this.el.classList.contains('busy')) this._userOpen = open; else { this.pref.open = open; this.save(); } this.layout(); };
    const vol = $('#mu-vol', el); vol.value = this.pref.vol; vol.oninput = () => { this.pref.vol = +vol.value; this.applyVol(); this.save(); };
    const on = $('#mu-on', el); on.checked = this.pref.on; on.onchange = () => this.setOn(on.checked);
    $('.mu-tracks', el).onclick = e => { const li = e.target.closest('[data-i]'); if (!li) return; if (!this.pref.on) this.setOn(true); this.idx = this.order.indexOf(+li.dataset.i); this.load(true); };
    document.addEventListener('pointerdown', e => { if (!el.contains(e.target)) $('.mu-pop', el).hidden = true; });
    this.layout(); this.paint();
  },
  // 밴픽 · 중계 · 휴대폰에서는 접은 채로 (게임 화면을 가리지 않게), 그 밖에는 마지막으로 둔 대로
  layout(r = Router.current()) {
    const busy = r === 'match-draft' || r === 'match-live' || r === 'match-locker';
    this.el.classList.toggle('busy', busy);
    this.el.classList.toggle('open', busy ? !!this._userOpen : !!this.pref.open);
  },
  ic(k) {
    return { play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>', pause: '<svg viewBox="0 0 24 24"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>',
      next: '<svg viewBox="0 0 24 24"><path d="M6 5v14l9-7zM16 5h2v14h-2z"/></svg>', prev: '<svg viewBox="0 0 24 24"><path d="M18 5v14l-9-7zM6 5h2v14H6z"/></svg>',
      list: '<svg viewBox="0 0 24 24"><path d="M4 6h12v2H4zM4 11h12v2H4zM4 16h8v2H4zM18 13v-7h3v2h-1.5v8a2.5 2.5 0 1 1-1.5-2.3z"/></svg>',
      note: '<svg viewBox="0 0 24 24"><path d="M9 4v10.6A3.5 3.5 0 1 0 11 18V8h7V4z"/></svg>',
      vol: '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 8.5a4.5 4.5 0 0 1 0 7" fill="none" stroke="currentColor" stroke-width="2"/></svg>' }[k];
  },
  paint() {
    if (!this.el) return;
    const t = this.track(), L = this.LISTS[this.list || this.want()], el = this.el;
    el.classList.toggle('off', !this.pref.on);
    el.classList.toggle('on', this.playing);
    $('.mu-t', el).textContent = !this.pref.on ? '음악 꺼짐' : t ? t.title : '월즈 플레이리스트';
    $('.mu-a', el).textContent = !this.pref.on ? '재생 버튼을 누르면 켜집니다' : t ? `${t.artist}${t.year ? ' · ' + t.year : ''}` : (this.unlocked ? '불러오는 중…' : '화면을 누르면 시작합니다');
    const pb = $('.mu-play', el); pb.innerHTML = this.ic(this.playing ? 'pause' : 'play'); pb.setAttribute('aria-label', this.playing ? '일시정지' : '재생');
    const img = $('.mu-art img', el), a = t && this.art[this.url(t)];
    img.style.visibility = a ? '' : 'hidden'; if (a && img.src !== a) img.src = a;
    $('.mu-list', el).textContent = L ? L.name : '';
    $('.mu-tracks', el).innerHTML = L ? L.tracks.map((x, i) => `<li data-i="${i}" class="${t === x ? 'cur' : ''} ${this.bad.has(this.url(x)) ? 'bad' : ''}"><b>${UI.esc(x.title)}</b><small>${x.year || ''}</small></li>`).join('') : '';
  },

  // ---------- 재생 ----------
  setOn(on) {
    this.pref.on = on; this.save(); $('#mu-on', this.el).checked = on;
    if (on) { this.unlocked = true; this.start(); } else this.pause();
    this.paint();
  },
  start() {
    if (!this.pref.on) return;
    const w = this.want();
    if (this.list !== w || !this.order.length) this.use(w); else this.play();
  },
  // 화면이 바뀌면: 밴픽 ↔ 메뉴 플레이리스트 전환, 중계 중에는 작게, 재생기 접기
  route(r) {
    this._userOpen = false; this.layout(r);
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
      if (this.w && this.ready) this.w.pause();
      this.audio ||= Object.assign(new Audio(), { onended: () => this.step(1), onerror: () => this.skip(this.track()), onplay: () => this.set(true), onpause: () => this.set(false) });
      this.audio.src = t.src; this.applyVol(); if (play) this.audio.play().catch(() => this.set(false));
      return;
    }
    if (this.audio) this.audio.pause();
    this.withSC(() => {
      clearTimeout(this._to);
      this._to = setTimeout(() => { if (this.track() === t && !this.playing) this.skip(t); }, 15000);   // 15초 안에 안 나오면(지워진 곡 등) 다음 곡
      this.w.load(this.url(t), { auto_play: !!play, show_artwork: true, visual: false, callback: () => {
        this.applyVol();
        this.w.getCurrentSound(s => { if (s && s.artwork_url) { this.art[this.url(t)] = s.artwork_url.replace('-large', '-t300x300'); this.paint(); } });
      } });
    });
  },
  skip(t) {
    if (!t) return; this.bad.add(this.url(t));
    if (this.LISTS[this.list].tracks.every(x => this.bad.has(this.url(x)))) { this.set(false); $('.mu-a', this.el).textContent = '사운드클라우드에 연결할 수 없습니다'; return; }
    this.step(1);
  },
  play() { const t = this.track(); if (!t) return; if (t.src && this.audio) this.audio.play().catch(() => {}); else this.withSC(() => this.w.play()); },
  pause() { if (this.audio) this.audio.pause(); if (this.w && this.ready) this.w.pause(); this.set(false); },
  toggle() { if (!this.pref.on) return this.setOn(true); this.unlocked = true; if (this.playing) this.pause(); else if (!this.list) this.start(); else this.play(); },
  set(p) { this.playing = p; if (p) clearTimeout(this._to); this.paint(); },
  vol() { return Math.round(this.pref.vol * this.duck * (this.fadeK ?? 1)); },
  applyVol() { const v = this.vol(); if (this.audio) this.audio.volume = v / 100; if (this.w && this.ready) this.w.setVolume(v); },
  // 플레이리스트가 바뀔 때 0.6초 동안 소리를 줄였다가 넘긴다
  fade(then) {
    if (!this.playing) { then(); return; }
    let k = 1; clearInterval(this._fade);
    this._fade = setInterval(() => { k -= .1; this.fadeK = Math.max(0, k); this.applyVol(); if (k <= 0) { clearInterval(this._fade); this.fadeK = 1; then(); } }, 60);
  },
  // 사운드클라우드 퍼가기 재생기: 처음 한 번만 만든다 (소리만 쓰므로 화면 밖에 둔다)
  withSC(fn) {
    if (this.ready) return fn();
    (this._q ||= []).push(fn);
    if (this._loading) return; this._loading = true;
    const make = () => {
      const f = document.createElement('iframe');
      f.allow = 'autoplay'; f.title = '사운드클라우드 재생기';
      f.src = 'https://w.soundcloud.com/player/?url=' + encodeURIComponent(this.url(this.track() || this.LISTS.worlds.tracks[0])) + '&auto_play=false&visual=false';
      $('.mu-sc', this.el).appendChild(f);
      this.w = SC.Widget(f);
      const E = SC.Widget.Events;
      this.w.bind(E.READY, () => { this.ready = true; const q = this._q; this._q = []; q.forEach(g => g()); });
      this.w.bind(E.PLAY, () => this.set(true));
      this.w.bind(E.PAUSE, () => this.set(false));
      this.w.bind(E.FINISH, () => this.step(1));
      this.w.bind(E.ERROR, () => this.skip(this.track()));
    };
    if (window.SC && SC.Widget) return make();
    const s = document.createElement('script'); s.src = 'https://w.soundcloud.com/player/api.js';
    s.onload = make; s.onerror = () => { this._loading = false; $('.mu-a', this.el).textContent = '사운드클라우드에 연결할 수 없습니다'; };
    document.head.appendChild(s);
  },
};
document.addEventListener('DOMContentLoaded', () => Music.init());
