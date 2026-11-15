// 경기 관전: 옵저버 중계 화면 (엔진은 js/matchsim.js)
// 화면 전체를 덮는 오버레이로 띄우고, 창 크기에 맞춰 맵 크기를 정한다 (태블릿에서도 스크롤 없이 한 화면).
const Live = {
  g: null, speed: 1, timer: null, raf: null, tickAt: 0, feedSeen: 0, banners: [], bannerOn: false,
  SPEEDS: [1, 2, 4, 8],
  vmode: (() => { try { return localStorage.getItem('lm27.lvvis') || 'off'; } catch (e) { return 'off'; } })(),   // 시야 보기: off · all(양 팀) · B · R
  mode: (() => { try { return localStorage.getItem('lm27.lvmode') || 'hl'; } catch (e) { return 'hl'; } })(),   // hl 하이라이트 · full 전체 보기
  // 하이라이트 보기의 진행 속도 배율: 조용할 때 2배, 장면이 클수록 느리게 (5인 이상 한타는 0.15배 = 거의 실시간)
  pace(g) {
    if (this.mode !== 'hl' || g.over) return 1;
    const big = g.fights.reduce((a, f) => Math.max(a, f.size), 0);
    if (big) return big >= 5 ? .15 : big >= 3 ? .28 : .5;
    if (g.t < 12) return 1;
    // 곧 붙을 것 같으면 미리 늦춘다: 양 팀 셋 이상이 10 안쪽으로 가까워졌을 때
    const A = g.pl.filter(p => !p.dead && !p.recall), close = A.filter(p => A.some(q => q.side !== p.side && Sim.dist(p.pos, q.pos) < 10)); if (close.length >= 3 && g.t > 840) return .7;
    if (g.pl.some(p => p.tpCh)) return .6;
    const lk = g.kills[g.kills.length - 1]; if (lk && g.t - lk.t <= 3) return .5;
    if (Object.values(g.obj).some(ob => ob.prog && (ob.prog.B || ob.prog.R))) return .8;
    if (g.side.B.nxhp < 1 || g.side.R.nxhp < 1 || g.side.B.nexusT < 2 || g.side.R.nexusT < 2) return .6;
    return 2;
  },
  // 확대할 장면: 4인 이상 교전의 중심 (하이라이트 보기에서만). 끝난 뒤에도 잠깐 머문다
  zoomTo(g, now) {
    if (this.mode !== 'hl' || g.over) return null;
    const f = g.fights.filter(x => x.size >= 4).sort((a, b) => b.size - a.size)[0];
    if (f) { this.zHold = { at: f.at, until: now + 1300 }; return f.at; }
    return this.zHold && this.zHold.until > now ? this.zHold.at : null;
  },
  start(S) { Draft.useTac(S); this.g = Sim.create(S, S.game); this.speed = 1; this.feedSeen = 0; this.banners = []; Router.go('match-live'); },
  ico(n, cls = '') { return `<img class="ob-ic ${cls}" src="assets/obj/${n}.png" alt="">`; },
  // 인벤토리: 아이템 6칸(제어 와드 포함) + 장신구
  // 정글 펫 아이템: 자란 단계(●●○)와 강타 강화 표시
  inventory(p) { const pet = it => p.role === 'JGL' && p.build.start && it.n === p.build.start.n && p.pet; return [...p.inv.map(it => pet(it) ? `<span class="it-pet s${p.pet}" title="정글 펫 · ${JunglePet.NAME[p.pet - 1]}${p.pet === 3 ? ' (강타 강화)' : ''}">${Stats.icon(it)}<b>${'●'.repeat(p.pet)}${'○'.repeat(3 - p.pet)}</b></span>` : Stats.icon(it)), p.wards ? `<span class="it-w">${Stats.icon(p.build.ward)}<b>${p.wards}</b></span>` : '', p.trinket ? `<span class="it-t">${Stats.icon(p.trinket)}</span>` : '', p.smite2 && p.petItem ? `<span class="it-smite" title="강타 강화 (정글 펫 완전 성장)">${Stats.icon(p.petItem)}</span>` : ''].join(''); },
  // 시리즈 스코어 (이 세트 전까지 + 끝났으면 이 세트 포함)
  score(S) { const sc = Season.seriesScore(S.series); return { B: sc[S.teams.B] || 0, R: sc[S.teams.R] || 0, need: Math.ceil((S.series.bo || 1) / 2) }; },
  pips(n, need, cls) { return `<span class="lv-pips ${cls}">${Array.from({ length: need }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</span>`; },

  async render(el) {
    clearInterval(this.timer); cancelAnimationFrame(this.raf); this.el = el;
    try {
      await Promise.all([Portal.ready, Mastery.load(), Champions.load(), Stats.load()]);
      if (!this.g || this.g.S !== App.state.draft && MatchLock.on()) { if (MatchLock.on()) return Router.go('match-draft'); return this.empty(el); }
      this.build(el);
    } catch (e) {
      console.error('[live]', e);
      el.innerHTML = `<div class="cr-page"><div class="card fx-empty"><b>경기 화면을 여는 중 문제가 생겼습니다</b><span>${UI.esc(String(e && e.message || e))}</span><a class="btn-ghost" href="#portal-overview">포털로</a></div></div>`;
    }
  },
  build(el) {
    const g = this.g, S = g.S, B = g.side.B.t, R = g.side.R.t, sc = this.score(S);
    el.innerHTML = `
      <div class="lv-full"><div class="lv-wrap">
        <div class="lv-bc">
          <div class="lv-top">
            <div class="lv-tm blue">${G.team(B, 'sm')}<div><b>${UI.esc(B.short)}</b>${this.pips(sc.B, sc.need, 'b')}</div><em class="lv-ms b">${sc.B}</em></div>
            <div class="lv-sc">
              <div class="lv-row">
                <span class="lv-tw b"></span><span class="lv-gd b"></span><b class="lv-k b"></b>${this.ico('kills', 'sw')}<b class="lv-k r"></b><span class="lv-gd r"></span><span class="lv-tw r"></span>
              </div>
              <div class="lv-sub"><span class="lv-dr b"></span><em class="lv-clock"></em><span class="lv-dr r"></span></div>
            </div>
            <div class="lv-tm red"><em class="lv-ms r">${sc.R}</em><div><b>${UI.esc(R.short)}</b>${this.pips(sc.R, sc.need, 'r')}</div>${G.team(R, 'sm')}</div>
          </div>
          <div class="lv-mid">
            <div class="lv-side b"></div>
            <div class="lv-mapbox"><div class="lv-map"><div class="lv-zoom"><img class="lv-bg" src="assets/map/rift.webp" alt=""><svg class="lv-svg" viewBox="0 0 100 100" preserveAspectRatio="none">${this.structures()}</svg><div class="lv-objs"></div><canvas class="lv-cv"></canvas></div><div class="lv-feed"></div><div class="lv-klog"></div><div class="lv-cap"></div><div class="lv-over"></div></div></div>
            <div class="lv-side r"></div>
          </div>
          <div class="lv-bot">
            <div class="lv-cam b"></div>
            <div class="lv-stats"></div>
            <div class="lv-cam r"></div>
          </div>
        </div>
        <div class="lv-panel">
          <div class="lv-ctrl">
            ${MatchLock.on() ? '' : '<button class="btn-ghost lv-exit" title="밴픽 화면으로">✕ 나가기</button>'}
            <button class="btn-ghost lv-pause">일시정지</button>
            <div class="seg lv-speed">${this.SPEEDS.map(s => `<button class="${this.speed === s ? 'on' : ''}" data-s="${s}">${s}x</button>`).join('')}</div>
            <button class="btn-ghost lv-skip">결과로</button>
          </div>
          <div class="seg lv-mode" title="하이라이트: 평소에는 빠르게 넘기고, 교전 · 오브젝트 · 순간이동 때는 느리게 보여 주며 한타는 확대합니다">${[['hl', '하이라이트'], ['full', '전체 보기']].map(([m, n]) => `<button class="${this.mode === m ? 'on' : ''}" data-m="${m}">${n}</button>`).join('')}</div>
          <div class="lv-visrow"><div class="seg lv-vis" title="시야 보기: 와드와 시야가 닿는 곳. 한 팀을 고르면 그 팀이 못 보는 곳은 어둡게, 안 보이는 상대는 숨깁니다">${[['off', '시야 끄기'], ['all', '양 팀'], ['B', B.short], ['R', R.short]].map(([m, n]) => `<button class="${this.vmode === m ? 'on' : ''}" data-v="${m}">${UI.esc(n)}</button>`).join('')}</div><span class="lv-vispct"></span></div>
          <div class="lv-info">${S.series.bo > 1 ? `Bo${S.series.bo} · ${S.game}세트` : '단판'} · ${S.official ? '공식 경기' : '연습 경기'}</div>
          <div class="lv-graph" title="골드 차이 흐름 (위 = 블루 우세, 아래 = 레드 우세) · 점: 드래곤 · 바론 · 큰 한타"></div>
          <div class="lv-evs"></div>
          <div class="lv-comm"></div>
        </div>
      </div></div>`;
    $('.lv-speed', el).onclick = e => { const b = e.target.closest('button'); if (!b) return; this.acc = this.acc * this.speed / +b.dataset.s; this.speed = +b.dataset.s; $$('.lv-speed button', el).forEach(x => x.classList.toggle('on', x === b)); };
    $('.lv-mode', el).onclick = e => { const b = e.target.closest('button'); if (!b) return; this.mode = b.dataset.m; try { localStorage.setItem('lm27.lvmode', this.mode); } catch (x) {} $$('.lv-mode button', el).forEach(x => x.classList.toggle('on', x === b)); };
    $('.lv-vis', el).onclick = e => { const b = e.target.closest('button'); if (!b) return; this.vmode = b.dataset.v; try { localStorage.setItem('lm27.lvvis', this.vmode); } catch (x) {} $$('.lv-vis button', el).forEach(x => x.classList.toggle('on', x === b)); };
    $('.lv-pause', el).onclick = e => { if (g.over) return; this.playing = !this.playing; e.target.textContent = this.playing ? '일시정지' : '계속'; };
    $('.lv-skip', el).onclick = () => { this.playing = false; while (!g.over) Sim.step(g); this.feedSeen = g.feed.length; this.banners = []; this.capQ = []; this.capSeen = g.comm.length; this.acc = 1e9; this.draw(); this.finish(); };
    const ex = $('.lv-exit', el); if (ex) ex.onclick = () => { this.playing = false; Router.go('match-draft'); };
    this.feedSeen = Math.max(this.feedSeen, g.feed.length); this.banners = []; this.bannerOn = false;
    this.fit(); this._fit ||= (() => { if (this.el && document.body.contains(this.el)) this.fit(); }); window.removeEventListener('resize', this._fit); window.addEventListener('resize', this._fit);
    this.acc = 0; this.pk = 1; this.zm = { s: 1, x: 50, y: 50 }; this.capQ = []; this.capSeen = g.comm.length; this.capUntil = 0;
    this.playing = !g.over; this.draw(); this.animate();
    if (g.over) this.finish();
  },
  // 맵을 남는 공간에 맞춰 최대 크기로 (가로세로 비율 유지)
  fit() {
    const box = this.el && this.el.querySelector('.lv-mapbox'), map = box && box.querySelector('.lv-map'); if (!map) return;
    const w = box.clientWidth, h = box.clientHeight, r = 1000 / 946, mw = Math.min(w, h * r);
    map.style.width = Math.floor(mw) + 'px'; map.style.height = Math.floor(mw / r) + 'px';
    this.mw = Math.floor(mw); this.mh = Math.floor(mw / r);
    // 캔버스: 화면 배율보다 넉넉히 (확대해도 흐려지지 않게), 최대 3배
    const cv = map.querySelector('.lv-cv'); if (cv) { const d = Math.min(3, (window.devicePixelRatio || 1) * 1.5); cv.width = Math.round(this.mw * d); cv.height = Math.round(this.mh * d); this.dpr = d; this.ctx = cv.getContext('2d'); }
  },
  structures() {
    Rift.init();
    const out = [];
    ['B', 'R'].forEach(k => ['top', 'mid', 'bot'].forEach(l => {
      Rift.TOWER[k][l].forEach((n, i) => { const [x, y] = Rift.pos(n); out.push(`<circle class="tw ${k.toLowerCase()}" data-tw="${k}-${l}-${i}" cx="${x}" cy="${y}" r="1.25"/>`); });
      const [x, y] = Rift.INHIB[k][l]; out.push(`<circle class="ih ${k.toLowerCase()}" data-ih="${k}-${l}" cx="${x}" cy="${y}" r="1.4"/>`);
    }));
    // 쌍둥이 포탑
    ['B', 'R'].forEach(k => { const nx = Rift.pos(k === 'B' ? 'bN' : 'rN'); [0, 1].forEach(ti => out.push(`<circle class="tw ${k.toLowerCase()}" data-nt="${k}-${ti}" cx="${nx[0] + (k === 'B' ? 3 : -3) * (ti ? -1 : 1)}" cy="${nx[1] + (k === 'B' ? -3 : 3)}" r="1.1"/>`)); });
    return out.join('');
  },
  // 한 틱(경기 1초) = 실제 0.1초 / 배속 (1배속 = 경기 10초가 실제 1초). 화면 프레임마다 시간을 쌓고, 한 틱이 차면 그 프레임에서 바로 다음 틱을 계산한다
  TICK: 100,
  advance(dt) {
    // 느려질 때는 바로. 빨라지는 건 장면이 끝나고 2.5초 지난 뒤부터 천천히 (잠깐 빨라졌다 다시 느려지는 출렁임을 막는다)
    const g = this.g, want = this.pace(g), nowT = performance.now(), old = this.period;
    if (want < this.pk - .01) { this.pk += (want - this.pk) * .35; this.slowAt = nowT; }
    else if (want > this.pk && nowT - (this.slowAt || 0) > 2500) this.pk += Math.min(want - this.pk, dt / 1000 * .3);
    const period = this.period = this.TICK / (this.speed * this.pk);
    if (old && old !== period) this.acc *= period / old;   // 속도가 바뀌어도 쌓인 시간이 한꺼번에 여러 틱으로 터지지 않게
    if (!this.playing || g.over) return;
    this.acc += Math.min(dt, 250);                                   // 탭이 잠깐 멈췄다 돌아와도 한꺼번에 몰아 돌지 않게
    let n = 0;
    while (this.acc >= period && !g.over && n++ < 40) {
      this.acc -= period;
      try { Sim.step(g); } catch (e) { console.error('[sim]', e); this.playing = false; UI.toast('경기 진행 중 오류: ' + e.message, 5000); return; }
      this.dirty = true;
    }
    if (g.over) { this.playing = false; this.acc = period; setTimeout(() => this.finish(), 900 / this.speed); }
  },
  // 틱 사이: 각 선수가 지나간 길(trail)을 따라 부드럽게 그린다
  at(trail, f) {
    if (!trail || trail.length < 2) return trail ? trail[trail.length - 1] : null;
    let total = 0; const seg = [];
    for (let i = 1; i < trail.length; i++) { const d = Math.hypot(trail[i][0] - trail[i - 1][0], trail[i][1] - trail[i - 1][1]); seg.push(d); total += d; }
    let rest = f * total;
    for (let i = 0; i < seg.length; i++) { if (rest <= seg[i] || i === seg.length - 1) { const q = seg[i] ? Math.min(1, rest / seg[i]) : 1; return [trail[i][0] + (trail[i + 1][0] - trail[i][0]) * q, trail[i][1] + (trail[i + 1][1] - trail[i][1]) * q]; } rest -= seg[i]; }
    return trail[trail.length - 1];
  },
  animate() {
    cancelAnimationFrame(this.raf);
    let last = performance.now();
    const tick = now => {
      if (!this.el || !document.body.contains(this.el) || !this.el.querySelector('.lv-wrap')) return;
      this.advance(now - last); last = now;
      if (this.dirty) { this.dirty = false; this.draw(); }
      const g = this.g, f = g.over ? 1 : Math.min(1, this.acc / (this.period || this.TICK / this.speed));
      this.camera(g, now); this.caption(now);
      this.paint(g, f);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  },
  // 한타 확대: 맵 층(.lv-zoom)을 교전 중심으로 부드럽게 당긴다
  camera(g, now) {
    const z = this.zm ||= { s: 1, x: 50, y: 50 }, to = this.zoomTo(g, now), ts = to ? 1.9 : 1, k = .1;
    if (to) { z.x += (to[0] - z.x) * k; z.y += (to[1] - z.y) * k; }
    z.s += (ts - z.s) * k; if (Math.abs(z.s - ts) < .004) z.s = ts;
    const key = z.s === 1 ? '1' : `${z.s.toFixed(3)},${z.x.toFixed(1)},${z.y.toFixed(1)}`; if (key === this._zk) return; this._zk = key;
    const el = this.el && this.el.querySelector('.lv-zoom'); if (!el) return;
    const W = this.mw, H = this.mh, cl = (v, lo) => Math.max(lo, Math.min(0, v));
    el.style.transform = z.s === 1 ? '' : `translate(${cl(W / 2 - z.x / 100 * W * z.s, W - W * z.s).toFixed(1)}px, ${cl(H / 2 - z.y / 100 * H * z.s, H - H * z.s).toFixed(1)}px) scale(${z.s.toFixed(3)})`;
  },
  // 자막 해설: 맵 아래쪽에 한 줄씩. 선수 이름이 나오면 그 선수 사진, 아니면 중계진 표시
  caption(now) {
    const g = this.g, box = this.el && this.el.querySelector('.lv-cap'); if (!box) return;
    for (; this.capSeen < g.comm.length; this.capSeen++) this.capQ.push(g.comm[this.capSeen]);
    if (this.capQ.length > 3) this.capQ = this.capQ.slice(-3);
    if (now < this.capUntil) return;
    const c = this.capQ.shift(); if (!c) { if (box.firstChild && now > this.capUntil + 1500) box.innerHTML = ''; return; }
    const p = g.pl.filter(x => x.name && x.name.length >= 2 && c.text.includes(x.name)).sort((a, b) => c.text.indexOf(a.name) - c.text.indexOf(b.name))[0];
    const who = Sim.CAST[c.who] || '', face = p && p.p.photo ? `<img class="${p.side === 'B' ? 'b' : 'r'}" src="${p.p.photo}" alt="" referrerpolicy="no-referrer" onerror="this.outerHTML='<i class=&quot;${c.who}&quot;>${UI.esc(who.slice(-2, -1))}</i>'">` : p ? `<span class="${p.side === 'B' ? 'b' : 'r'}">${SoloQ.ic(p.c)}</span>` : `<i class="${c.who}">${UI.esc(who.slice(-2, -1))}</i>`;
    box.innerHTML = `<div class="lv-cap-in ${c.who}">${face}<div><b>${UI.esc(who)}</b><p>${UI.esc(c.text)}</p></div></div>`;
    this.capUntil = now + Math.max(2000, Math.min(4200, 1300 + c.text.length * 42)) / Math.sqrt(this.speed);
  },
  // 맵 위 챔피언 · 효과를 캔버스 한 장에 그린다 (프레임마다). f = 이번 틱의 진행도 0~1
  icon(p) { const m = (this.imgs ||= new Map()); let im = m.get(p.c); if (!im) { im = new Image(); im.src = Champions.byId[p.c].icon; m.set(p.c, im); } return im; },
  // 효과용 챔피언 얼굴 (동그라미 + 테두리)
  face(c, champ, x, y, r, stroke, a = 1) {
    const im = this.icon({ c: champ }); c.save(); c.globalAlpha = Math.max(0, Math.min(1, a));
    c.fillStyle = '#0b111d'; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    if (im.complete && im.naturalWidth) { c.save(); c.beginPath(); c.arc(x, y, r - 1, 0, Math.PI * 2); c.clip(); c.drawImage(im, x - r, y - r, r * 2, r * 2); c.restore(); }
    c.lineWidth = 2.5; c.strokeStyle = stroke; c.beginPath(); c.arc(x, y, r - 1, 0, Math.PI * 2); c.stroke(); c.restore();
  },
  MOFF: [[0, 0], [.9, .5], [-.8, .6], [.3, -.9], [-.9, -.5], [1.2, -.6], [-.2, 1.2], [.2, -1.7]],   // 미니언 점 자리 (맵 %)
  paint(g, f) {
    const c = this.ctx; if (!c) return;
    const W = this.mw, H = this.mh, X = v => v * W / 100, Y = v => v * H / 100, now = g.t + (g.over ? 0 : f), R = W * .024 / (1 + ((this.zm ? this.zm.s : 1) - 1) * .45), TAU = Math.PI * 2;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); c.clearRect(0, 0, W, H);
    const col = k => k === 'B' ? '59,140,255' : '239,75,95';
    // 효과: 귀환(점선 고리가 돌고 흰 고리가 차오른다) · 텔레포트(도착 지점 고리 + 출발 지점) · 교전 · 파괴
    for (const e of g.fx) {
      const q = Math.max(0, Math.min(1, (now - e.t) / (e.dur || 2))), x = X(e.at[0]), y = Y(e.at[1]);
      if (e.type === 'recall') {
        c.save(); c.translate(x, y); c.rotate(now * 1.6); c.setLineDash([R * .5, R * .35]); c.lineWidth = 2; c.strokeStyle = `rgba(${e.side === 'B' ? '142,197,255' : '255,176,188'},.9)`; c.beginPath(); c.arc(0, 0, R * 1.35, 0, TAU); c.stroke(); c.restore();
        c.lineWidth = 3; c.strokeStyle = 'rgba(255,255,255,.85)'; c.beginPath(); c.arc(x, y, R * 1.35, -Math.PI / 2, -Math.PI / 2 + TAU * q); c.stroke();
      } else if (e.type === 'tp') {
        const pc = e.side === 'B' ? '197,140,255' : '255,154,208';
        c.lineWidth = 2; c.strokeStyle = `rgba(${pc},${.5 + q * .5})`; c.fillStyle = `rgba(${pc},${.12 + q * .2})`; c.beginPath(); c.arc(x, y, R * (2 - q * .7), 0, TAU); c.fill(); c.stroke();
        c.strokeStyle = `rgba(${pc},${.8 * (1 - q)})`; c.beginPath(); c.arc(X(e.from[0]), Y(e.from[1]), R * (1 + q * .6), 0, TAU); c.stroke();
        if (e.c) { this.face(c, e.c, x, y, R * (1.3 - q * .3), `rgb(${pc})`, .5 + q * .5); c.font = `700 ${Math.round(R * .85)}px sans-serif`; c.textAlign = 'center'; c.fillStyle = `rgba(${pc},1)`; c.fillText(e.name || '', x, y - R * 2.2); }
      } else if (e.type === 'beam') {
        // 맵을 가로지르는 궁: 쏜 곳에서 맞은 곳까지 빛줄기, 끝에 챔피언 얼굴
        const fx0 = X(e.from[0]), fy0 = Y(e.from[1]), hx = fx0 + (x - fx0) * Math.min(1, q * 1.6), hy = fy0 + (y - fy0) * Math.min(1, q * 1.6), a = 1 - Math.max(0, q - .6) / .4;
        c.lineCap = 'round'; c.strokeStyle = `rgba(255,236,160,${.35 * a})`; c.lineWidth = R * 1.1; c.beginPath(); c.moveTo(fx0, fy0); c.lineTo(hx, hy); c.stroke();
        c.strokeStyle = `rgba(255,255,255,${.9 * a})`; c.lineWidth = 2.5; c.beginPath(); c.moveTo(fx0, fy0); c.lineTo(hx, hy); c.stroke();
        this.face(c, e.c, hx, hy, R * 1.05, `rgb(${col(e.side)})`, a);
      } else if (e.type === 'ult') {
        // 한타를 가른 궁: 큰 고리 + 챔피언 얼굴 + 궁 이름
        const a = 1 - Math.max(0, q - .7) / .3, rr = R * (2.2 + q * 1.6);
        c.strokeStyle = `rgba(${col(e.side)},${.8 * a})`; c.lineWidth = 3; c.beginPath(); c.arc(x, y, rr, 0, TAU); c.stroke();
        c.fillStyle = `rgba(255,220,140,${.12 * a})`; c.beginPath(); c.arc(x, y, rr, 0, TAU); c.fill();
        this.face(c, e.c, x, y - rr - R * .2, R * 1.25, `rgb(${col(e.side)})`, a);
        c.font = `700 ${Math.round(R * .95)}px sans-serif`; c.textAlign = 'center'; c.fillStyle = `rgba(255,236,170,${a})`; c.strokeStyle = `rgba(0,0,0,${.8 * a})`; c.lineWidth = 3;
        c.strokeText(e.name || '', x, y - rr - R * 1.7); c.fillText(e.name || '', x, y - rr - R * 1.7);
      } else if (e.type === 'dark') {
        // 녹턴 궁: 맵 전체가 잠깐 어두워진다
        c.fillStyle = `rgba(0,0,8,${.45 * (1 - q)})`; c.fillRect(0, 0, W, H);
      } else {
        const big = e.type === 'fight' ? 2 : 1.4, rr = R * big * (.6 + q), gr = c.createRadialGradient(x, y, 0, x, y, rr), a = 1 - q;
        gr.addColorStop(0, e.type === 'fight' ? `rgba(255,210,120,${.5 * a})` : `rgba(255,255,255,${.8 * a})`); gr.addColorStop(.6, `rgba(255,130,60,${.2 * a})`); gr.addColorStop(1, 'rgba(255,120,60,0)');
        c.fillStyle = gr; c.beginPath(); c.arc(x, y, rr, 0, TAU); c.fill();
      }
    }
    // 미니언 웨이브: 무리마다 남은 수만큼 작은 점 (슈퍼 미니언이 낀 무리는 큰 점 하나 더). 틱 사이는 걸어온 만큼 이어 그린다
    if (g.wv) for (const l of Sim.LANES3) for (const k of ['B', 'R']) for (const w of g.wv[l][k]) {
      const a = w.pp || w.p, px = a[0] + (w.p[0] - a[0]) * (g.over ? 1 : f), py = a[1] + (w.p[1] - a[1]) * (g.over ? 1 : f), n = Math.min(8, Math.ceil(w.n)), r = Math.max(1.6, R * .17);
      c.fillStyle = k === 'B' ? '#7db8ff' : '#ff8d9b'; c.strokeStyle = 'rgba(5,8,14,.9)'; c.lineWidth = 1;
      for (let i = 0; i < n; i++) { const o = this.MOFF[i]; c.beginPath(); c.arc(X(px + o[0]), Y(py + o[1]), i === 0 && w.sup ? r * 1.9 : r, 0, TAU); c.fill(); c.stroke(); }
    }
    // 시야 보기: 한 팀을 고르면 그 팀 시야 밖은 어둡게, 안 보이는 상대는 숨긴다. 양 팀은 각 팀 시야를 옅은 색으로
    const vm = this.vmode, srcOf = k => typeof Vision !== 'undefined' ? Vision.sources(g, k) : [];
    if (vm === 'B' || vm === 'R') {
      const fog = this.fog ||= document.createElement('canvas'); if (fog.width !== c.canvas.width || fog.height !== c.canvas.height) { fog.width = c.canvas.width; fog.height = c.canvas.height; } const fc = fog.getContext('2d'); fc.setTransform(1, 0, 0, 1, 0, 0); fc.globalCompositeOperation = 'source-over'; fc.clearRect(0, 0, fog.width, fog.height);
      fc.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); fc.fillStyle = 'rgba(2,4,10,.74)'; fc.fillRect(0, 0, W, H); fc.globalCompositeOperation = 'destination-out';
      for (const [sx, sy, r] of srcOf(vm)) { const gx = X(sx), gy = Y(sy), rr = X(r), gd = fc.createRadialGradient(gx, gy, rr * .7, gx, gy, rr); gd.addColorStop(0, 'rgba(0,0,0,1)'); gd.addColorStop(1, 'rgba(0,0,0,0)'); fc.fillStyle = gd; fc.beginPath(); fc.arc(gx, gy, rr, 0, TAU); fc.fill(); }
      fc.globalCompositeOperation = 'source-over'; c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.drawImage(fog, 0, 0); c.restore();
    } else if (vm === 'all') {
      for (const k of ['B', 'R']) { c.fillStyle = `rgba(${col(k)},.07)`; for (const [sx, sy, r] of srcOf(k)) { c.beginPath(); c.arc(X(sx), Y(sy), X(r), 0, TAU); c.fill(); } }
    }
    // 와드: 노란 마름모(투명 와드, 남은 시간만큼 테두리) · 분홍 마름모(제어 와드). 한 팀 보기에서는 그 팀 와드 + 그 팀 시야 안의 상대 제어 와드만
    for (const w of g.wards || []) {
      if ((vm === 'B' || vm === 'R') && w.side !== vm && !(w.type === 'control' && typeof Vision !== 'undefined' && Vision.seen(g, vm, w.at))) continue;
      const x = X(w.at[0]), y = Y(w.at[1]), s = R * .55;
      c.save(); c.translate(x, y); c.rotate(Math.PI / 4); c.fillStyle = w.type === 'control' ? '#ff4fa3' : '#ffd84a'; c.strokeStyle = `rgb(${col(w.side)})`; c.lineWidth = 1.6; c.fillRect(-s / 2, -s / 2, s, s); c.strokeRect(-s / 2, -s / 2, s, s); c.restore();
      if (w.type === 'stealth') { const left = Math.max(0, Math.min(1, (w.until - now) / (w.until - w.t))); c.strokeStyle = 'rgba(255,216,74,.55)'; c.lineWidth = 1.2; c.beginPath(); c.arc(x, y, s * 1.15, -Math.PI / 2, -Math.PI / 2 + TAU * left); c.stroke(); }
    }
    const hide = (vm === 'B' || vm === 'R') && typeof Vision !== 'undefined' ? p => p.side !== vm && !Vision.seen(g, vm, p.pos) : () => false;
    const P = g.pl.map(p => ({ p, pos: this.at(p.trail, f) || p.pos })).filter(o => !o.p.dead && !hide(o.p));
    // 스킬 연출(하이라이트): 밀침 · 끌어당김은 맞은 선수를 잠깐 밀어 그리고, 띄움은 위로 띄운다
    const SK = this.mode === 'hl' ? (g.sk || []).filter(e => now - e.t >= 0 && now - e.t < (e.key === 'R' ? 2.4 : 1.6)) : [];
    for (const e of SK) {
      if (!['back', 'pull', 'up'].includes(e.cc)) continue;
      const a = now - e.t, env = Math.sin(Math.min(1, a / 1.1) * Math.PI);
      for (const o of P) {
        if (!e.hit.includes(g.pl.indexOf(o.p))) continue;
        if (e.cc === 'up') { o.lift = Math.max(o.lift || 0, env * R * 1.1); continue; }
        const src = e.kind === 'dash' || e.kind === 'init' ? e.to : e.from, d = Sim.dist(o.pos, src) || 1, k = (e.cc === 'back' ? 2.6 : -Math.min(2.2, d * .6)) * env;
        o.pos = [o.pos[0] + (o.pos[0] - src[0]) / d * k, o.pos[1] + (o.pos[1] - src[1]) / d * k];
      }
    }
    this.skillFx(c, g, SK, P, now, X, Y, R, col);
    const where = new Map(P.map(o => [o.p, o.pos]));
    // 공격선: 이번 1초에 누가 누구를 쳤나 (원거리는 가늘고 길게, 근접은 굵고 짧게 보인다)
    c.lineCap = 'round';
    for (const { p, pos } of P) {
      const t = p.hitAt === g.t && p.hitTo && where.get(p.hitTo); if (!t) continue;
      c.strokeStyle = `rgba(${col(p.side)},${(.75 - f * .5).toFixed(2)})`; c.lineWidth = p.rng > 5 ? 1.6 : 2.6; c.beginPath(); c.moveTo(X(pos[0]), Y(pos[1])); c.lineTo(X(t[0]), Y(t[1])); c.stroke();
    }
    // 포탑: 깎인 체력 막대(외곽 포탑은 14분까지 방패 5칸) · 이번 1초에 쏜 포탑은 대상까지 노란 선
    if (g.tw) for (const k of ['B', 'R']) for (const tw of Sim.twList(g, k)) {
      const x = X(tw.pos[0]), y = Y(tw.pos[1]), st = g.tw[tw.key];
      if (tw.hp < 1) {
        const bw = R * 2, bh = Math.max(3, R * .2), bx = x - bw / 2, by = y - R * .95;
        c.fillStyle = 'rgba(5,8,14,.85)'; c.fillRect(bx - 1, by - 1, bw + 2, bh + 2); c.fillStyle = k === 'B' ? '#3b8cff' : '#ef4b5f'; c.fillRect(bx, by, bw * Math.max(0, tw.hp), bh);
        if (tw.i === 0 && g.t < 840) { c.fillStyle = 'rgba(5,8,14,.9)'; for (let i = 1; i < 5; i++) c.fillRect(bx + bw * i / 5 - .5, by, 1, bh); }
      }
      if (st && st.at === g.t && st.to) {
        const t = st.to.role ? where.get(st.to) : st.to.p; if (!t) continue;
        c.strokeStyle = `rgba(255,214,90,${(.95 - f * .6).toFixed(2)})`; c.lineWidth = st.to.role ? 2.6 : 1.4; c.beginPath(); c.moveTo(x, y); c.lineTo(X(t[0]), Y(t[1])); c.stroke();
        if (st.to.role) { c.strokeStyle = `rgba(255,120,60,${(.8 - f * .5).toFixed(2)})`; c.lineWidth = 2; c.beginPath(); c.arc(X(t[0]), Y(t[1]), R * 1.25, 0, TAU); c.stroke(); }
      }
    }
    // 챔피언: 아래쪽에 있는 선수가 위에 그려진다
    P.sort((a, b) => a.pos[1] - b.pos[1]);
    for (const { p, pos, lift } of P) {
      const x = X(pos[0]), y = Y(pos[1]) - (lift || 0), im = this.icon(p);
      if (lift) { c.fillStyle = 'rgba(0,0,0,.35)'; c.beginPath(); c.ellipse(x, y + lift + R * .7, R * .8, R * .3, 0, 0, TAU); c.fill(); }
      if ((p.mega || 0) > now && this.mode === 'hl') { c.fillStyle = 'rgba(255,120,40,.25)'; c.beginPath(); c.arc(x, y, R * 1.45, 0, TAU); c.fill(); }
      c.save(); c.shadowColor = p.recall ? 'rgba(90,170,255,.9)' : 'rgba(0,0,0,.8)'; c.shadowBlur = p.recall ? 12 : 5; c.fillStyle = '#0b111d'; c.beginPath(); c.arc(x, y, R, 0, TAU); c.fill(); c.restore();
      if (im.complete && im.naturalWidth) { c.save(); c.beginPath(); c.arc(x, y, R - 1, 0, TAU); c.clip(); c.drawImage(im, x - R, y - R, R * 2, R * 2); c.restore(); }
      c.lineWidth = 2; c.strokeStyle = `rgb(${col(p.side)})`; c.beginPath(); c.arc(x, y, R - 1, 0, TAU); c.stroke();
      // 체력 막대
      const bw = R * 1.9, bh = Math.max(3, R * .22), bx = x - bw / 2, by = y + R + 2;
      c.fillStyle = 'rgba(5,8,14,.85)'; c.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
      c.fillStyle = p.hp > .5 ? '#4cd964' : p.hp > .25 ? '#f0b400' : '#ef4b5f'; c.fillRect(bx, by, bw * Math.max(0, Math.min(1, p.hp)), bh);
    }
    this.skillPops(c, g, SK, P, now, X, Y, R, col);
  },
  // 스킬 효과: 돌진 꼬리 · 도주 · 직선 · 원형 · 부채꼴 · 대상 · 전역 · 팀원 버프 · 본인 버프 · 묶음
  simg(src) { const m = (this.sims ||= new Map()); let im = m.get(src); if (!im) { im = new Image(); im.src = src; m.set(src, im); } return im; },
  skillFx(c, g, SK, P, now, X, Y, R, col) {
    if (!SK.length) return;
    const TAU = Math.PI * 2, posOf = i => { const o = P.find(o => o.p === g.pl[i]); return o && o.pos; };
    const KC = { atk: null, dash: null, init: '255,196,70', esc: '235,240,255', ally: '90,230,140', self: '255,226,110' };
    c.save(); c.lineCap = 'round';
    for (const e of SK) {
      const a = now - e.t, dur = e.key === 'R' ? 2.4 : 1.6, q = a / dur, al = Math.max(0, 1 - q), me = posOf(e.i) || e.from, pl = g.pl[e.i];
      const rgb = KC[e.kind] || col(pl.side), big = e.key === 'R' ? 1.5 : 1;
      const fx = X(e.from[0]), fy = Y(e.from[1]), tx = X(e.to[0]), ty = Y(e.to[1]);
      if (e.kind === 'dash' || e.kind === 'esc' || (e.kind === 'init' && !e.shape)) {
        c.setLineDash(e.kind === 'esc' ? [4, 5] : []); c.strokeStyle = `rgba(${rgb},${.55 * al})`; c.lineWidth = R * .7 * big;
        c.beginPath(); c.moveTo(fx, fy); c.lineTo(X(me[0]), Y(me[1])); c.stroke(); c.setLineDash([]);
      }
      if (e.kind === 'self') { c.strokeStyle = `rgba(${rgb},${.8 * al})`; c.lineWidth = 2.5; c.beginPath(); c.arc(X(me[0]), Y(me[1]), R * (1.3 + q * .5) * big, 0, TAU); c.stroke(); }
      else if (e.kind === 'ally') {
        e.ally.forEach(i => { const p = posOf(i); if (!p) return; c.strokeStyle = `rgba(${rgb},${.85 * al})`; c.lineWidth = 2.5; c.beginPath(); c.arc(X(p[0]), Y(p[1]), R * (1.25 + Math.sin(a * 8) * .08) * big, 0, TAU); c.stroke();
          c.fillStyle = `rgba(${rgb},${.15 * al})`; c.fill(); if (i !== e.i) { c.lineWidth = 1.2; c.beginPath(); c.moveTo(X(me[0]), Y(me[1])); c.lineTo(X(p[0]), Y(p[1])); c.stroke(); } });
      } else if (e.shape === 'global') {
        c.strokeStyle = `rgba(${rgb},${.7 * al})`; c.lineWidth = 6; c.strokeRect(3, 3, X(100) - 6, Y(100) - 6);
        if (e.kind !== 'dash') { c.strokeStyle = `rgba(255,240,180,${.8 * al})`; c.lineWidth = R * .5; c.beginPath(); c.moveTo(fx, fy); c.lineTo(fx + (tx - fx) * Math.min(1, q * 3), fy + (ty - fy) * Math.min(1, q * 3)); c.stroke(); }
      } else if (e.shape === 'line') {
        const L = Math.hypot(tx - fx, ty - fy) || 1, ux = (tx - fx) / L, uy = (ty - fy) / L, len = Math.max(L + X(2), X(8)) * Math.min(1, q * 3.5);
        c.strokeStyle = `rgba(${rgb},${.35 * al})`; c.lineWidth = X(2.4) * big; c.beginPath(); c.moveTo(fx, fy); c.lineTo(fx + ux * len, fy + uy * len); c.stroke();
        c.strokeStyle = `rgba(255,255,255,${.7 * al})`; c.lineWidth = 1.5; c.beginPath(); c.moveTo(fx, fy); c.lineTo(fx + ux * len, fy + uy * len); c.stroke();
      } else if (e.shape === 'circle') {
        const rr = X(4) * big * Math.min(1, .45 + q * 2);
        c.fillStyle = `rgba(${rgb},${.18 * al})`; c.beginPath(); c.arc(tx, ty, rr, 0, TAU); c.fill();
        c.strokeStyle = `rgba(${rgb},${.85 * al})`; c.lineWidth = 2; c.stroke();
      } else if (e.shape === 'cone') {
        const mx = X(me[0]), my = Y(me[1]), ang = Math.atan2(ty - my, tx - mx), rr = X(6) * big * Math.min(1, .4 + q * 2.5);
        c.fillStyle = `rgba(${rgb},${.22 * al})`; c.beginPath(); c.moveTo(mx, my); c.arc(mx, my, rr, ang - .55, ang + .55); c.closePath(); c.fill();
        c.strokeStyle = `rgba(${rgb},${.7 * al})`; c.lineWidth = 1.5; c.stroke();
      } else if (e.shape === 'target' && e.kind !== 'dash') {
        c.strokeStyle = `rgba(${rgb},${.8 * al})`; c.lineWidth = 2; c.beginPath(); c.moveTo(X(me[0]), Y(me[1])); c.lineTo(tx, ty); c.stroke();
        c.beginPath(); c.arc(tx, ty, R * (.6 + q * .9), 0, TAU); c.stroke();
      }
      // 묶음(기절 · 속박 등): 맞은 선수 머리 위에 도는 별
      if (e.cc === 'stun') e.hit.forEach(i => { const p = posOf(i); if (!p) return; for (let k = 0; k < 3; k++) { const an = a * 5 + k * TAU / 3; c.fillStyle = `rgba(255,230,90,${al})`; c.beginPath(); c.arc(X(p[0]) + Math.cos(an) * R * .8, Y(p[1]) - R * 1.35 + Math.sin(an) * R * .25, R * .17, 0, TAU); c.fill(); } });
    }
    c.restore();
  },
  // 스킬 아이콘: 챔피언 옆에 쓴 순서대로 잠깐씩 (궁은 크게 + 이름)
  skillPops(c, g, SK, P, now, X, Y, R, col) {
    if (!SK.length) return;
    const by = new Map(); SK.forEach(e => { if (!by.has(e.i)) by.set(e.i, []); by.get(e.i).push(e); });
    for (const [i, list] of by) {
      const o = P.find(o => o.p === g.pl[i]); if (!o) continue;
      const x = X(o.pos[0]), y = Y(o.pos[1]) - (o.lift || 0), side = col(g.pl[i].side);
      const arr = list.sort((a, b) => a.t - b.t).slice(-3);
      arr.forEach((e, k) => {
        const a = now - e.t, dur = e.key === 'R' ? 2.4 : 1.6, al = Math.min(1, a * 6, (dur - a) * 3), slide = Math.max(0, 1 - a * 5) * R;
        const s = e.key === 'R' ? R * 1.25 : R * .9, px = x + R * 1.05 + slide, py = y - R * .9 + (k - (arr.length - 1) / 2) * (s + 3);
        const im = this.simg(e.icon);
        c.save(); c.globalAlpha = Math.max(0, al);
        c.fillStyle = '#0b111d'; c.fillRect(px - 1, py - 1, s + 2, s + 2);
        if (im.complete && im.naturalWidth) c.drawImage(im, px, py, s, s);
        if (e.form === 'mega') { c.fillStyle = 'rgba(255,110,30,.35)'; c.fillRect(px, py, s, s); }
        c.lineWidth = e.key === 'R' ? 2 : 1.2; c.strokeStyle = e.key === 'R' ? '#ffd36a' : `rgb(${side})`; c.strokeRect(px - .5, py - .5, s + 1, s + 1);
        c.font = `800 ${Math.round(s * .42)}px sans-serif`; c.textAlign = 'center'; c.fillStyle = '#fff'; c.strokeStyle = 'rgba(0,0,0,.9)'; c.lineWidth = 2.5;
        c.strokeText(e.key, px + s * .82, py + s * .98); c.fillText(e.key, px + s * .82, py + s * .98);
        if (e.key === 'R' || e.form === 'mega') {
          const t = (e.form === 'mega' && e.key !== 'R' ? '메가 ' : '') + e.name;
          c.font = `700 ${Math.round(R * .78)}px sans-serif`; c.textAlign = 'left';
          c.strokeText(t, px + s + 4, py + s * .68); c.fillStyle = e.key === 'R' ? '#ffe2a0' : '#ffb078'; c.fillText(t, px + s + 4, py + s * .68);
        }
        c.restore();
      });
    }
  },
  draw() {
    const g = this.g, el = this.el; if (!el || !document.body.contains(el) || !el.querySelector('.lv-wrap')) return;
    const gb = Sim.gold(g, 'B'), gr = Sim.gold(g, 'R');
    $('.lv-k.b', el).textContent = g.side.B.kills; $('.lv-k.r', el).textContent = g.side.R.kills;
    $('.lv-gd.b', el).textContent = (gb / 1000).toFixed(1) + 'K'; $('.lv-gd.r', el).textContent = (gr / 1000).toFixed(1) + 'K';
    // 부순 포탑 수 = 상대 포탑이 깨진 수
    const set = (sel, html) => { const n = $(sel, el); if (n && n._h !== html) { n._h = html; n.innerHTML = html; } };   // 내용이 바뀔 때만 다시 그린다 (이미지를 매번 새로 만들지 않게)
    set('.lv-tw.b', this.ico('tower') + g.side.R.down); set('.lv-tw.r', g.side.B.down + this.ico('tower'));
    const objs = k => { const s = g.side[k]; return [...s.drag.map(d => `<i title="${d[0]} 드래곤">${this.ico(d[1])}</i>`), s.grubs ? `<i title="공허 유충">${this.ico('grub')}<b>${s.grubs}</b></i>` : '', s.herald ? `<i title="전령">${this.ico('riftherald')}</i>` : '', s.baron ? `<i title="바론" class="${s.baronUntil > g.t ? 'bn' : 'off'}">${this.ico('baron')}</i>` : '']; };
    set('.lv-dr.b', objs('B').join('')); set('.lv-dr.r', objs('R').reverse().join(''));
    $('.lv-clock', el).textContent = Sim.clock(g.t);
    const vis = g.vis || {}; set('.lv-vispct', `시야 장악 <b class="b">${UI.esc(g.side.B.t.short)} ${vis.B || 0}%</b> · <b class="r">${UI.esc(g.side.R.t.short)} ${vis.R || 0}%</b> · 와드 ${(g.wards || []).filter(w => w.side === 'B').length}:${(g.wards || []).filter(w => w.side === 'R').length}`);
    // 맵 위 오브젝트: 나와 있는 동안 둥지에 아이콘 (드래곤은 다음에 나올 속성)
    set('.lv-objs', ['drag', 'grubs', 'herald', 'baron'].filter(o => Sim.objUp(g, o)).map(o => {
      const [x, y] = Rift.pos(Sim.PIT[o]), n = g.side.B.drag.length + g.side.R.drag.length;
      const el2 = o === 'drag' && Sim.elder(g), ic = el2 ? 'dragon_elder' : o === 'drag' ? g.dragSeq[Math.min(n, 2)][1] : Sim.ICON[o], nm = el2 ? '장로 드래곤' : o === 'drag' ? `${g.dragSeq[Math.min(n, 2)][0]} 드래곤` : Sim.OBJ[o];
      return `<div class="lv-obj ${o}" style="left:${x}%;top:${y}%" title="${nm}">${this.ico(ic)}</div>`;
    }).join(''));
    // 양옆 선수 · 맵 아이콘: 처음 한 번 만들고 값만 바꾼다
    if (!el.querySelector('.lv-pl')) {
      ['B', 'R'].forEach(k => {
        $('.lv-side.' + k.toLowerCase(), el).innerHTML = g.pl.filter(p => p.side === k).map(p => `
          <div class="lv-pl" data-i="${g.pl.indexOf(p)}">
            <div class="lv-pic">${SoloQ.ic(p.c)}<i></i><em></em></div>
            <div class="lv-pi"><small>${UI.esc(g.side[k].t.short)} ${UI.esc(p.name)}</small><div class="lv-hp"><i></i></div><div class="lv-items"></div></div>
          </div>`).join('');
      });
    }
    $$('.lv-pl', el).forEach(row => {
      const p = g.pl[row.dataset.i];
      row.classList.toggle('dead', !!p.dead); row.querySelector('.lv-pic i').textContent = p.lvl;
      row.querySelector('.lv-pic em').textContent = p.dead ? Math.max(0, p.dead - g.t) : '';
      row.querySelector('.lv-hp i').style.width = Math.round(p.hp * 100) + '%';
      const its = row.querySelector('.lv-items'), key = p.inv.map(x => x.id).join(',') + '|' + p.wards + '|' + (p.trinket ? p.trinket.id : '') + '|' + (p.pet || 0);
      if (its.dataset.k !== key) { its.dataset.k = key; its.innerHTML = this.inventory(p); }
    });
    ['B', 'R'].forEach(k => ['top', 'mid', 'bot'].forEach(l => {
      Rift.TOWER[k][l].forEach((n, i) => { const c = el.querySelector(`[data-tw="${k}-${l}-${i}"]`); if (c) c.classList.toggle('down', g.side[k].thp[l][i] <= 0); });
      const ih = el.querySelector(`[data-ih="${k}-${l}"]`); if (ih) ih.classList.toggle('down', !g.side[k].inhib[l]);
    }));
    ['B', 'R'].forEach(k => g.side[k].ntp.forEach((h, ti) => { const c = el.querySelector(`[data-nt="${k}-${ti}"]`); if (c) c.classList.toggle('down', h <= 0); }));
    // 킬·오브젝트 로그(맵 오른쪽 위, 최근 5개) + 가운데 알림은 새 사건마다 한 번씩
    set('.lv-klog', g.feed.slice(-5).reverse().map(f => f.obj
      ? `<div class="lv-kl ${f.side === 'B' ? 'b' : 'r'}"><span>${Sim.clock(f.t)}</span>${G.team(g.side[f.side].t, 'xs')}<i>›</i>${this.ico(f.icon)}</div>`
      : `<div class="lv-kl ${f.killer.side === 'B' ? 'b' : 'r'}"><span>${Sim.clock(f.t)}</span>${SoloQ.ic(f.killer.c)}${this.ico('kills', 'sw')}${SoloQ.ic(f.victim.c)}</div>`).join(''));
    for (; this.feedSeen < g.feed.length; this.feedSeen++) this.banners.push(g.feed[this.feedSeen]);
    this.banner();
    // 하단 선수 캠: 최근 처치한 선수, 없으면 1분마다 번갈아
    ['B', 'R'].forEach(k => {
      const recent = g.feed.slice().reverse().find(x => !x.obj && x.killer.side === k && g.t - x.t <= 40);
      const ps = g.pl.filter(p => p.side === k), p = recent ? recent.killer : ps[Math.floor(g.t / 60 + (k === 'B' ? 0 : 2)) % 5];
      const cam = $('.lv-cam.' + k.toLowerCase(), el);
      if (cam.dataset.pid !== p.p.id) { cam.dataset.pid = p.p.id; cam.innerHTML = `${p.p.photo ? `<img src="${p.p.photo}" alt="" referrerpolicy="no-referrer" onerror="this.outerHTML='<div class=&quot;lv-cam-empty&quot;>${UI.esc(p.name[0] || '?')}</div>'">` : `<div class="lv-cam-empty">${UI.esc(p.name[0] || '?')}</div>`}<b>${UI.esc(p.name)}</b>`; }
    });
    const st = $('.lv-stats', el);
    if (!st.firstElementChild) st.innerHTML = G.ROLES.map(r => { const a = g.pl.find(p => p.side === 'B' && p.role === r), b = g.pl.find(p => p.side === 'R' && p.role === r); return `
      <div class="lv-st" data-r="${r}"><span class="its"></span>${SoloQ.ic(a.c)}<span class="kda a"></span><span class="cs a"></span><em></em><span class="cs b"></span><span class="kda b"></span>${SoloQ.ic(b.c)}<span class="its r"></span></div>`; }).join('');
    [...st.children].forEach(row => {
      const r = row.dataset.r, a = g.pl.find(p => p.side === 'B' && p.role === r), b = g.pl.find(p => p.side === 'R' && p.role === r), q = s2 => row.querySelector(s2);
      q('.kda.a').textContent = `${a.k}/${a.d}/${a.a}`; q('.kda.b').textContent = `${b.k}/${b.d}/${b.a}`; q('.cs.a').textContent = Math.round(a.cs); q('.cs.b').textContent = Math.round(b.cs);
      const em = q('em'); em.className = a.gold >= b.gold ? 'b' : 'r'; em.textContent = `${a.gold >= b.gold ? '◀' : '▶'} ${(Math.abs(a.gold - b.gold) / 1000).toFixed(1)}K`;
      [['.its:not(.r)', a], ['.its.r', b]].forEach(([s2, p]) => { const n = q(s2), h = this.inventory(p); if (n._h !== h) { n._h = h; n.innerHTML = h; } });
    });
    // 골드 차이 그래프: 20초마다 기록, 사건 점(드래곤 · 바론 · 4킬 이상 한타)
    const lh = (g._lh ||= []); if (!lh.length || g.t - lh[lh.length - 1][0] >= 20 || g.over) { if (!lh.length || lh[lh.length - 1][0] !== g.t) lh.push([g.t, Sim.lead(g, 'B')]); }
    if (g.t % 20 === 0 || g.over) {
      const T = Math.max(1500, g.t), M = Math.max(3000, ...lh.map(x => Math.abs(x[1]))), px = t => (t / T * 100).toFixed(1), py = v => (20 - v / M * 18).toFixed(1);
      const pts = lh.map(([t, v]) => `${px(t)},${py(v)}`).join(' '), area = `0,20 ${pts} ${px(lh[lh.length - 1][0])},20`;
      const dots = g.ev.filter(e => /drag|baron|elder/.test(e.kind) || /드래곤|바론/.test(e.txt)).map(e => `<circle cx="${px(e.t)}" cy="${e.side === 'B' ? 3 : 37}" r="1.6" class="${e.side === 'B' ? 'b' : 'r'}"><title>${Sim.clock(e.t)} ${UI.esc(e.txt)}</title></circle>`).join('');
      const kills = []; g.kills.forEach(k => { const last = kills[kills.length - 1]; if (last && k.t - last.t < 15) { last.n++; last[k.k.side]++; } else kills.push({ t: k.t, n: 1, B: k.k.side === 'B' ? 1 : 0, R: k.k.side === 'R' ? 1 : 0 }); });
      const fights = kills.filter(x => x.n >= 4).map(x => `<rect x="${(+px(x.t) - .6).toFixed(1)}" y="17" width="1.2" height="6" class="${x.B >= x.R ? 'b' : 'r'}"><title>${Sim.clock(x.t)} 한타 ${x.B}:${x.R}</title></rect>`).join('');
      const lead = Sim.lead(g, 'B');
      set('.lv-graph', `<div class="lv-graph-h"><span>골드 차이</span><b class="${lead >= 0 ? 'b' : 'r'}">${lead >= 0 ? UI.esc(g.side.B.t.short) : UI.esc(g.side.R.t.short)} +${(Math.abs(lead) / 1000).toFixed(1)}K</b></div><svg viewBox="0 0 100 40" preserveAspectRatio="none"><line x1="0" y1="20" x2="100" y2="20" class="mid"/><clipPath id="lvgB"><rect x="0" y="0" width="100" height="20"/></clipPath><clipPath id="lvgR"><rect x="0" y="20" width="100" height="20"/></clipPath><polygon points="${area}" class="ab" clip-path="url(#lvgB)"/><polygon points="${area}" class="ar" clip-path="url(#lvgR)"/><polyline points="${pts}" class="ln"/>${fights}${dots}</svg>`);
    }
    set('.lv-evs', g.ev.slice(-7).reverse().map(e => `<div class="lv-ev ${e.side === 'B' ? 'b' : 'r'}"><span>${Sim.clock(e.t)}</span>${this.ico(e.icon)}<b>${UI.esc(g.side[e.side].t.short)}</b> ${UI.esc(e.txt)}</div>`).join('') || '<p class="cr-dim">오브젝트·포탑 기록</p>');
    const comm = $('.lv-comm', el);
    if (comm.dataset.n != g.comm.length) {
      comm.dataset.n = g.comm.length;
      comm.innerHTML = g.comm.slice(-30).map(c => `<div class="lv-line ${c.who}"><span>${Sim.clock(c.t)}</span><b>${Sim.CAST[c.who]}</b><p>${UI.esc(c.text)}</p></div>`).join('');
      comm.scrollTop = comm.scrollHeight;
    }
  },
  // 가운데 알림: 처치 · 오브젝트를 하나씩 1.6초 (한꺼번에 많이 밀리면 최근 것만)
  banner() {
    if (this.bannerOn || !this.el) return;
    const box = this.el.querySelector('.lv-feed'); if (!box) return;
    if (this.banners.length > 3) this.banners = this.banners.slice(-2);
    const f = this.banners.shift(); if (!f) { box.innerHTML = ''; return; }
    const g = this.g; this.bannerOn = true;
    box.innerHTML = f.obj
      ? `<div class="lv-kill obj ${f.side === 'B' ? 'b' : 'r'}">${G.team(g.side[f.side].t, 'sm')}<span><b>${UI.esc(g.side[f.side].t.short)}</b> ${UI.esc(f.txt)}</span>${this.ico(f.icon, 'lg')}</div>`
      : `<div class="lv-kill ${f.killer.side === 'B' ? 'b' : 'r'}">${SoloQ.ic(f.killer.c)}<span><b>${UI.esc(g.side[f.killer.side].t.short)} ${UI.esc(f.killer.name)}</b> ${f.first ? '퍼스트 블러드!' : '처치'} <b>${UI.esc(g.side[f.victim.side].t.short)} ${UI.esc(f.victim.name)}</b></span>${SoloQ.ic(f.victim.c)}</div>`;
    setTimeout(() => { this.bannerOn = false; this.banner(); }, 1600);
  },
  finish() {
    const g = this.g, w = g.side[g.over.win], el = this.el, S = g.S;
    if (!el || !document.body.contains(el) || !el.querySelector('.lv-over')) return;
    const game = S.series.games.find(x => x.game === S.game); if (game && !game.result) game.result = Season.gameResult(g);
    const plan = (App.state.plans || {})[S.series.key]; if (plan) plan.series = S.series;
    const my = App.state.teamId, sc = this.score(S), over = Season.seriesOver(S.series);
    if (over && S.official) Season.recordSeries(S.series.key, S.series);
    if (over && S.scrim) Scrim.finish(S.scrim, S.series);
    // 시리즈가 안 끝났으면 라커룸을 바로 준비해 둔다 (새로고침해도 라커룸으로 이어진다)
    if (!over) Locker.prepare(S, g);
    // 상단 매치 스코어 갱신
    $('.lv-ms.b', el).textContent = sc.B; $('.lv-ms.r', el).textContent = sc.R;
    $('.lv-tm.blue .lv-pips', el).outerHTML = this.pips(sc.B, sc.need, 'b'); $('.lv-tm.red .lv-pips', el).outerHTML = this.pips(sc.R, sc.need, 'r');
    const mine = w.t.id === my, us = S.teams.B === my ? 'B' : 'R', them = us === 'B' ? 'R' : 'B';
    $('.lv-over', el).innerHTML = `<div class="lv-res ${mine ? 'win' : 'lose'}"><small>${Sim.clock(g.t)}${S.series.bo > 1 ? ` · ${S.game}세트` : ''}</small><b>${mine ? 'VICTORY' : 'DEFEAT'}</b><span>${G.team(w.t, 'sm')} ${UI.esc(w.t.name)} 승리 · 킬 ${g.side.B.kills} : ${g.side.R.kills}</span>
      ${S.series.bo > 1 ? `<span class="lv-series">매치 스코어 ${UI.esc(g.side[us].t.short)} ${sc[us]} : ${sc[them]} ${UI.esc(g.side[them].t.short)}${over ? ' · 경기 종료' : ''}</span>` : ''}
      <div class="lv-mvp">${SoloQ.ic(g.over.mvp.c)}<div><small>POG</small><b>${UI.esc(g.over.mvp.name)}</b><span>${g.over.mvp.k}/${g.over.mvp.d}/${g.over.mvp.a}</span></div></div>
      <div class="lv-res-btn">${!over ? `<button class="btn-primary lv-next">라커룸으로 → <small class="lv-cd"></small></button>` : `<button class="btn-primary lv-back">${S.official || S.scrim ? '계속' : '닫기'}</button>`}${!over ? '<button class="btn-ghost lv-stay">결과 더 보기</button>' : ''}</div></div>`;
    clearInterval(this._cd);
    // 다음 세트 전에 라커룸 회의 (진영 선택 · 밴 방향 · 선수에게 한마디)
    const next = () => { clearInterval(this._cd); Router.go('match-locker'); };
    const bk = $('.lv-back', el);
    if (bk) bk.onclick = () => { if (S.official || S.scrim) App.state.draft = null; Router.go(S.official ? 'portal-overview' : S.scrim ? 'training-scrims' : 'match-draft'); };
    const nx = $('.lv-next', el);
    if (nx) {
      nx.onclick = next;
      // FM처럼 잠시 뒤 다음 세트 밴픽으로 자동으로 넘어간다 (결과 더 보기를 누르면 멈춘다)
      let left = 8; const cd = $('.lv-cd', el); cd.textContent = `(${left})`;
      this._cd = setInterval(() => { if (!document.body.contains(nx)) { clearInterval(this._cd); return; } left--; cd.textContent = `(${left})`; if (left <= 0) next(); }, 1000);
      $('.lv-stay', el).onclick = e => { clearInterval(this._cd); cd.textContent = ''; e.target.remove(); };
    }
  },
  empty(el) {
    const S = App.state.draft, ready = S && S.phase === 'ready' && !(S.series.games.find(x => x.game === S.game) || {}).result;
    el.innerHTML = `<div class="cr-page">${Career.head('경기 관전', '밴픽과 전술을 확정하면 경기를 옵저버 화면으로 볼 수 있습니다.')}
      <div class="card fx-empty"><b>${ready ? `${UI.esc(Draft.side(S, 'B').short)} vs ${UI.esc(Draft.side(S, 'R').short)} ${S.game}세트 준비 완료` : '관전할 경기가 없습니다'}</b><span>${ready ? '밴픽과 전술이 확정돼 있습니다.' : '경기날에는 계속 버튼이 경기로 바뀝니다. 연습으로 한 판 보려면 아래 버튼을 누르세요.'}</span>
      <div style="display:flex;gap:10px;justify-content:center;margin-top:12px;flex-wrap:wrap">${ready ? '<button class="btn-primary lv-go">경기 시작</button>' : ''}<button class="${ready ? 'btn-ghost' : 'btn-primary'} lv-quick">빠른 연습 경기 (양 팀 코치 밴픽)</button></div></div></div>`;
    const go = $('.lv-go', el); if (go) go.onclick = () => { this.g = Sim.create(S, S.game); this.speed = 1; this.feedSeen = 0; this.render(el); };
    $('.lv-quick', el).onclick = () => {
      const my = Roster.team(), nm = Schedule.next(my.id, Clock.today()), opp = (nm && Schedule.opponent(nm, my.id)) || App.db.teams.find(t => t.league === my.league && t.id !== my.id);
      Draft.start({ opp: opp.id, side: 'B', mode: 'delegate', bo: 1 });
      const D = Draft.st(); while (!D.done) Draft.aiAct(D); Draft.confirm(D);
      this.g = Sim.create(D, D.game); this.speed = 1; this.feedSeen = 0; this.render(el);
    };
  },
};

Views['match-live'] = el => Live.render(el);
