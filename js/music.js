/* LM 27 — 배경 음악
   화면마다 플레이리스트가 바뀐다: 밴픽(match-draft)은 밴픽 음악(연주곡), 그 밖의 메뉴는 월즈 주제가.
   경기 중계(match-live)에서는 같은 곡을 작게 깔아 둔다.
   음원은 라이엇 공식 사운드클라우드(soundcloud.com/leagueoflegends)를 사운드클라우드 퍼가기 재생기로 튼다
   (광고 없음 · 저장소에 음원 파일을 올리지 않는다). 곡을 바꾸려면 LISTS만 고치면 된다.
   음원 파일: assets/music/worlds/ · draft/ · victory/ · decider/(Bo5 5세트 입장) 폴더에 mp3를 넣으면 그 폴더 곡이 플레이리스트가 된다
   (GitHub 웹에서 올리기만 하면 됨, 코드 수정 없음). 파일 이름은 "가수 - 제목 (연도).mp3".
   폴더 목록은 GitHub API로 읽고, 안 되면 assets/music/playlist.json을 읽는다. 폴더 곡과 아래 사운드클라우드 곡을 함께 튼다.
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
    ] },
    victory: { name: '승리', tracks: [] },
    decider: { name: '마지막 세트', tracks: [] },   // assets/music/decider/ : Bo5 5세트 밴픽 들어가기 전에 잠깐 (비어 있으면 없음)   // assets/music/victory/ (비어 있으면 승리 음악 없음)
    draft: { name: '밴픽', tracks: [
      { sc: 'worlds-2020-orchestral-theme', title: 'Worlds 2020 Orchestral Theme', artist: 'League of Legends', year: 2020 },
      { sc: 'rise-ft-the-glitch-mob-mako', title: 'RISE (Instrumental)', artist: 'The Glitch Mob', year: 2018 },
      { sc: 'worlds-collide-instrumental', title: 'Worlds Collide (Instrumental)', artist: 'League of Legends', year: 2015 },
      { sc: 'awaken', title: 'Awaken', artist: 'League of Legends', year: 2019 },
    ] },
  },
  KEY: 'lm27.music',
  pref: { on: true, vol: 50, open: true, hide: false },   // hide: 재생기 자체를 숨긴다 (휴대폰에서 화면을 가린다 — 베타 건의). 숨기면 음악도 끈다
  list: null, idx: 0, order: [], w: null, audio: null, ready: false, playing: false, unlocked: false, duck: 1, bad: new Set(), art: {},

  init() {
    this.files = this.scan();
    try { Object.assign(this.pref, JSON.parse(localStorage.getItem(this.KEY) || '{}')); } catch (e) {}
    this.mount();
    Router.onRoute(r => this.route(r));
    // 브라우저는 사용자가 화면을 한 번 누르기 전에는 소리를 못 낸다 (어느 사이트나 같다).
    // 그래서 첫 곡을 미리 불러와 대기시켜 두고, 첫 터치 · 클릭 · 키 입력 그 순간에 바로 튼다.
    // 휴대폰은 손을 뗄 때(touchend · click)가 '누름'으로 쳐지므로 여러 이벤트에서 시도하고, 소리가 나면 그만둔다
    this.files.then(() => this.cue());
    const EV = ['pointerdown', 'touchend', 'click', 'keydown'];
    this._kick = e => {
      if (e.target && e.target.closest && e.target.closest('.mu')) return;   // 재생기 버튼은 그 버튼이 처리
      this.unlocked = true; this.unlockAudio();
      if (this.pref.on && !this.playing) { if (this.cued && this.list === this.want()) this.play(); else this.start(); }
    };
    this._unkick = () => EV.forEach(k => document.removeEventListener(k, this._kick, true));
    EV.forEach(k => document.addEventListener(k, this._kick, true));
    // 메인 화면 · 감독 만들기 화면에서도 같은 월즈 플레이리스트가 이어진다. 게임 화면에서는 화면에 맞는 목록으로
    const show = App.show.bind(App);
    App.show = id => { show(id); this.screen(); };
  },
  save() { try { localStorage.setItem(this.KEY, JSON.stringify(this.pref)); } catch (e) {} },
  inGame() { return !!document.querySelector('#screen-game.active'); },
  want(r = Router.current()) { return this.inGame() && r === 'match-draft' ? 'draft' : 'worlds'; },
  // 화면(메인 ↔ 게임)이 바뀔 때: 게임 밖에서는 늘 월즈 목록, 작게 줄인 소리도 원래대로
  screen() {
    const r = this.inGame() ? Router.current() : '';
    if (this.el.classList.contains('out') !== !this.inGame()) this._userOpen = false;
    this.el.classList.toggle('out', !this.inGame());   // 게임 밖(메인 화면): 아래 날짜 바가 없다
    this.layout(r); this.duck = r === 'match-live' ? .35 : 1; this.applyVol();
    if (!this.pref.on || !this.unlocked) return;
    const w = this.want(r); if (w !== this.list) this.fade(() => this.use(w)); else if (!this.playing && !this.held) this.play();
  },
  // ---------- 음원 폴더 ----------
  EXT: /\.(mp3|m4a|aac|ogg|opus|wav|flac)$/i,
  IMG: /\.(jpe?g|png|webp)$/i,
  async scan() {
    const KEY = 'lm27.music.files2', now = Date.now();
    let got = null;
    try { const c = JSON.parse(localStorage.getItem(KEY) || 'null'); if (c && now - c.t < 30 * 60 * 1000) got = c.d; } catch (e) {}   // 30분 캐시 (GitHub API는 시간당 60번 제한)
    if (!got) {
      got = {};
      const gh = location.hostname.match(/^([^.]+)\.github\.io$/), repo = location.pathname.split('/')[1];
      if (gh && repo) {
        for (const k of ['worlds', 'draft', 'victory', 'decider']) {
          try {
            const r = await fetch(`https://api.github.com/repos/${gh[1]}/${repo}/contents/assets/music/${k}`);
            if (r.ok) got[k] = (await r.json()).filter(f => f.type === 'file' && (this.EXT.test(f.name) || this.IMG.test(f.name))).map(f => f.name);
          } catch (e) {}
        }
      }
      if (!got.worlds && !got.draft) {   // API가 안 되면(로컬 · 제한 초과) 목록 파일
        try { const r = await fetch('assets/music/playlist.json', { cache: 'no-cache' }); if (r.ok) got = await r.json(); } catch (e) {}
      }
      try { localStorage.setItem(KEY, JSON.stringify({ t: now, d: got })); } catch (e) {}
    }
    for (const k of ['worlds', 'draft', 'victory', 'decider']) {
      const names = (got[k] || []).filter(n => this.EXT.test(n));
      // 메뉴(worlds)만: 올린 파일 + 원래 사운드클라우드 월즈 주제가를 함께 (밴픽은 올린 연주곡만 — 사운드클라우드 곡은 폴더가 비었을 때만). 예전에는 파일을 올리면 사운드클라우드 곡이 목록에서 빠졌다). 같은 제목은 파일 쪽을 쓴다
      this._sc ||= Object.fromEntries(Object.entries(this.LISTS).map(([x, L]) => [x, L.tracks.filter(t => t.sc)]));
      if (names.length) { const files = names.map(n => this.parse(n, `assets/music/${k}/`)), low = t => t.title.toLowerCase(); this.LISTS[k].tracks = [...files, ...(k === 'worlds' ? this._sc[k] || [] : []).filter(t => !files.some(f => low(f) === low(t)))]; }
      // 표지: 곡과 같은 이름의 이미지(예: "가수 - 제목 (2024).jpg"), 없으면 폴더의 cover.jpg
      const imgs = (got[k] || []).filter(n => this.IMG.test(n)), base = n => n.replace(this.EXT, '').replace(this.IMG, '');
      const cover = imgs.find(n => /^cover\./i.test(n));
      names.forEach((n, i) => { const im = imgs.find(x => base(x) === base(n)) || cover; if (im && this.LISTS[k].tracks[i]) this.art[this.LISTS[k].tracks[i].src] = `assets/music/${k}/` + encodeURIComponent(im); });
    }
    if (this.el) this.paint();
  },
  // "가수 - 제목 (2024).mp3" → { artist, title, year }. 하이픈이 없으면 파일 이름이 제목
  parse(n, dir) {
    let b = n.replace(this.EXT, '').replace(/_/g, ' ').trim(), year = null, start = 0;
    const st = b.match(/\s*\[(\d+)s\]/); if (st) { start = +st[1]; b = b.replace(st[0], '').trim(); }   // "[55s]": 55초부터 (하이라이트가 뒤에 있는 곡)
    const y = b.match(/[\(\[]\s*((?:19|20)\d\d)\s*[\)\]]/); if (y) { year = +y[1]; b = b.replace(y[0], '').trim(); }
    const i = b.indexOf(' - ');
    return { src: dir + encodeURIComponent(n), title: i > 0 ? b.slice(i + 3).trim() : b, artist: i > 0 ? b.slice(0, i).trim() : 'League of Legends', year, start };
  },
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
    this.el = el; el.style.display = this.pref.hide ? 'none' : '';
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
    // 밴픽 · 중계 · 라커룸, 그리고 게임 밖 화면(처음 화면 · 감독 만들기 · 팀 선택: 오른쪽 아래에 '다음' 버튼이 있다)에서는 접어 둔다
    const busy = !this.inGame() || r === 'match-draft' || r === 'match-live' || r === 'match-locker';
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
    $('.mu-src', el).hidden = !!(t && t.src);
    $('.mu-tracks', el).innerHTML = L ? L.tracks.map((x, i) => `<li data-i="${i}" class="${t === x ? 'cur' : ''} ${this.bad.has(this.url(x)) ? 'bad' : ''}"><b>${UI.esc(x.title)}</b><small>${x.year || ''}</small></li>`).join('') : '';
  },

  // ---------- 재생 ----------
  // 첫 곡을 미리 불러 둔다 (첫 터치에서 기다림 없이 바로 나오게)
  cue() {
    if (!this.pref.on || this.list) return;
    const L = this.LISTS[this.want()]; this.list = this.want();
    this.order = L.tracks.map((_, i) => i);
    for (let i = this.order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [this.order[i], this.order[j]] = [this.order[j], this.order[i]]; }
    this.idx = 0; const t = this.track(); this.paint();
    if (t.src) { const a = this.mkAudio(); a.src = t.src; a.load(); this.cued = true; }
    else this.withSC(() => { this.cued = true; this.applyVol(); this.w.getCurrentSound(s => { if (s && s.artwork_url) { this.art[this.url(t)] = s.artwork_url.replace('-large', '-t300x300'); this.paint(); } }); });
  },
  // 승리 음악: 세트 승리는 앞 25초(끝에서 서서히 줄임), 매치 승리는 최대 90초. 그동안 원래 음악은 멈췄다가 끝나면 이어서
  victory(kind = 'set') { this.shot('victory', kind === 'match' ? 90 : 25); },
  // Bo5 마지막(5)세트: 밴픽 들어가기 전에 입장 음악을 잠깐 (밴픽이 시작되거나 중계로 넘어가면 줄어들며 끝난다)
  decider(S) {
    if (!S || S.series.bo !== 5 || S.game !== 5 || S.series._dec) return;
    S.series._dec = 1; this.shot('decider', 60);
  },
  shot(list, lim) {
    const L = this.LISTS[list].tracks; if (!L.length || !this.pref.on || this.pref.hide || this.held || !this.unlocked) return;
    const t = L[Math.floor(Math.random() * L.length)], was = this.playing;
    if (this.vAudio) { this.vAudio.pause(); clearInterval(this._vf); }
    if (was) this.pause();
    this._resume = false; this.shotKind = list;
    const a = this.vAudio = new Audio(t.src), vol = (this.pref.vol / 100) * .9;
    const t0 = t.start || 0;
    a.volume = vol; if (t0) { a.currentTime = t0; a.addEventListener('loadedmetadata', () => { if (a.currentTime < t0) a.currentTime = t0; }, { once: true }); } a.play().catch(() => {});
    const done = () => { clearInterval(this._vf); a.pause(); if (this.vAudio !== a) return; this.vAudio = null; this.endShot = null; if ((was || this._resume) && !this.held) this.play(); };
    this.endShot = () => { lim = Math.min(lim, a.currentTime - t0 + 3); };   // 3초에 걸쳐 줄이고 끝
    a.onended = done;
    this._vf = setInterval(() => { const left = lim - (a.currentTime - t0); if (left <= 3) a.volume = Math.max(0, vol * left / 3); if (left <= 0) done(); }, 200);
  },
  setHidden(h) {
    this.pref.hide = h; this.save(); if (this.el) this.el.style.display = h ? 'none' : '';
    if (h) this.setOn(false); else if (!this.pref.on) this.setOn(true);
  },
  setOn(on) {
    this.pref.on = on; this.save(); $('#mu-on', this.el).checked = on;
    if (on) { this.unlocked = true; this.start(); } else this.pause();
    this.paint();
  },
  async start() {
    if (!this.pref.on) return;
    await this.files;
    const w = this.want();
    if (this.list !== w || !this.order.length) this.use(w); else this.play();
  },
  // 화면이 바뀌면: 밴픽 ↔ 메뉴 플레이리스트 전환, 중계 중에는 작게, 재생기 접기
  route(r) {
    this._userOpen = false; this.layout(r);
    this.duck = r === 'match-live' ? .35 : 1; this.applyVol();
    if (!this.pref.on || !this.unlocked) return;
    if (this.endShot && this.shotKind === 'decider' && r !== 'match-draft') this.endShot();
    if (this.endShot && this.shotKind === 'victory' && !/^match-(live|locker|draft)$/.test(r)) this.endShot();   // 승리 음악이 메인 화면까지 따라오지 않게
    const w = this.want(r); if (w !== this.list) this.fade(() => this.use(w));
  },
  async use(name) {
    await this.files;
    const L = this.LISTS[name]; this.list = name;
    this.order = L.tracks.map((_, i) => i);
    for (let i = this.order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [this.order[i], this.order[j]] = [this.order[j], this.order[i]]; }   // 매번 다른 순서
    this.idx = 0; this.load(!this.held);   // 일시정지해 둔 상태면 목록만 바꾸고 멈춘 채로
  },
  step(d) {
    this.held = false;
    if (!this.pref.on) return this.setOn(true);
    if (!this.list) return this.start();
    const n = this.order.length; this.idx = (this.idx + d + n) % n; this.load(true);
  },
  load(play) {
    const t = this.track(); if (!t) return;
    if (play && this.vAudio) { this._resume = true; play = false; }   // 승리 · 입장 음악이 끝나면 이어서 튼다
    this.paint();
    if (t.src) {
      if (this.w && this.ready) this.w.pause();
      this.mkAudio();
      this.audio.src = t.src; if (t.start) this.audio.addEventListener('loadedmetadata', () => { this.audio.currentTime = t.start; }, { once: true }); this.applyVol(); if (play) this.audio.play().catch(() => this.set(false));
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
  mkAudio() { return this.audio ||= Object.assign(new Audio(), { preload: 'auto', onended: () => { if (!this.audio.src.startsWith('data:')) this.step(1); }, onerror: () => { if (this.audio.src.startsWith('data:')) return; this.skip(this.track()); }, onplay: () => { if (!this.audio.src.startsWith('data:')) this.set(true); }, onpause: () => { if (!this.audio.src.startsWith('data:')) this.set(false); } }); },   // 무음(잠금 풀기)은 재생으로 치지 않는다
  // 아이폰 사파리는 사용자가 누른 그 순간에 한 번 재생해 둔 오디오만 나중에 틀 수 있다: 첫 터치에서 무음으로 한 번 열어 둔다
  unlockAudio() {
    const a = this.mkAudio(); if (a.src) return;
    a.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
    const p = a.play(); if (p) p.then(() => { a.pause(); }).catch(() => {});
  },
  skip(t) {
    if (!t) return; this.bad.add(this.url(t));
    if (this.LISTS[this.list].tracks.every(x => this.bad.has(this.url(x)))) { this.set(false); $('.mu-a', this.el).textContent = '사운드클라우드에 연결할 수 없습니다'; return; }
    this.step(1);
  },
  play() { const t = this.track(); if (!t) return; if (t.src && this.audio) this.audio.play().catch(() => {}); else this.withSC(() => this.w.play()); },
  pause() { if (this.audio) this.audio.pause(); if (this.w && this.ready) this.w.pause(); this.set(false); },
  // 사용자가 직접 일시정지하면 화면을 옮겨도 다시 켜지 않는다 (베타 건의). 다시 재생 · 다음 곡을 누르면 풀린다
  toggle() { if (!this.pref.on) return this.setOn(true); this.unlocked = true; if (this.playing) { this.held = true; this.pause(); } else { this.held = false; if (!this.list) this.start(); else this.play(); } },
  set(p) { this.playing = p; if (p) { clearTimeout(this._to); if (this._unkick) { this._unkick(); this._unkick = null; } } this.paint(); },
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
