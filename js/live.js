// 경기 관전: 옵저버 중계 화면 (엔진은 js/matchsim.js)
// 화면 전체를 덮는 오버레이로 띄우고, 창 크기에 맞춰 맵 크기를 정한다 (태블릿에서도 스크롤 없이 한 화면).
const Live = {
  g: null, speed: 1, timer: null, raf: null, tickAt: 0, feedSeen: 0, banners: [], bannerOn: false,
  SPEEDS: [1, 2, 4, 8],
  start(S) { Draft.useTac(S); this.g = Sim.create(S, S.game); this.speed = 1; this.feedSeen = 0; this.banners = []; Router.go('match-live'); },
  ico(n, cls = '') { return `<img class="ob-ic ${cls}" src="assets/obj/${n}.png" alt="">`; },
  // 인벤토리: 아이템 6칸(제어 와드 포함) + 장신구
  inventory(p) { return [...p.inv.map(it => Stats.icon(it)), p.wards ? `<span class="it-w">${Stats.icon(p.build.ward)}<b>${p.wards}</b></span>` : '', p.trinket ? `<span class="it-t">${Stats.icon(p.trinket)}</span>` : ''].join(''); },
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
      el.innerHTML = `<div class="cr-page"><div class="card fx-empty"><b>경기 화면을 여는 중 문제가 생겼습니다</b><span>${UI.esc(String(e && e.message || e))}</span><a class="btn-ghost" href="#match-draft">밴픽 준비로</a></div></div>`;
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
            <div class="lv-mapbox"><div class="lv-map"><img class="lv-bg" src="assets/map/rift.webp" alt=""><svg class="lv-svg" viewBox="0 0 100 100" preserveAspectRatio="none">${this.structures()}</svg><div class="lv-objs"></div><canvas class="lv-cv"></canvas><div class="lv-feed"></div><div class="lv-klog"></div><div class="lv-over"></div></div></div>
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
          <div class="lv-info">${S.series.bo > 1 ? `Bo${S.series.bo} · ${S.game}세트` : '단판'} · ${S.official ? '공식 경기' : '연습 경기'}</div>
          <div class="lv-evs"></div>
          <div class="lv-comm"></div>
        </div>
      </div></div>`;
    $('.lv-speed', el).onclick = e => { const b = e.target.closest('button'); if (!b) return; this.acc = this.acc * this.speed / +b.dataset.s; this.speed = +b.dataset.s; $$('.lv-speed button', el).forEach(x => x.classList.toggle('on', x === b)); };
    $('.lv-pause', el).onclick = e => { if (g.over) return; this.playing = !this.playing; e.target.textContent = this.playing ? '일시정지' : '계속'; };
    $('.lv-skip', el).onclick = () => { this.playing = false; while (!g.over) Sim.step(g); this.feedSeen = g.feed.length; this.banners = []; this.acc = 1e9; this.draw(); this.finish(); };
    const ex = $('.lv-exit', el); if (ex) ex.onclick = () => { this.playing = false; Router.go('match-draft'); };
    this.feedSeen = Math.max(this.feedSeen, g.feed.length); this.banners = []; this.bannerOn = false;
    this.fit(); this._fit ||= (() => { if (this.el && document.body.contains(this.el)) this.fit(); }); window.removeEventListener('resize', this._fit); window.addEventListener('resize', this._fit);
    this.acc = 0; this.playing = !g.over; this.draw(); this.animate();
    if (g.over) this.finish();
  },
  // 맵을 남는 공간에 맞춰 최대 크기로 (가로세로 비율 유지)
  fit() {
    const box = this.el && this.el.querySelector('.lv-mapbox'), map = box && box.querySelector('.lv-map'); if (!map) return;
    const w = box.clientWidth, h = box.clientHeight, r = 1000 / 946, mw = Math.min(w, h * r);
    map.style.width = Math.floor(mw) + 'px'; map.style.height = Math.floor(mw / r) + 'px';
    this.mw = Math.floor(mw); this.mh = Math.floor(mw / r);
    // 캔버스: 화면 배율(레티나)에 맞춰 선명하게, 최대 2배
    const cv = map.querySelector('.lv-cv'); if (cv) { const d = Math.min(2, window.devicePixelRatio || 1); cv.width = Math.round(this.mw * d); cv.height = Math.round(this.mh * d); this.dpr = d; this.ctx = cv.getContext('2d'); }
  },
  structures() {
    Rift.init();
    const out = [];
    ['B', 'R'].forEach(k => ['top', 'mid', 'bot'].forEach(l => {
      Rift.TOWER[k][l].forEach((n, i) => { const [x, y] = Rift.pos(n); out.push(`<circle class="tw ${k.toLowerCase()}" data-tw="${k}-${l}-${i}" cx="${x}" cy="${y}" r="1.25"/>`); });
      const [x, y] = Rift.INHIB[k][l]; out.push(`<circle class="ih ${k.toLowerCase()}" data-ih="${k}-${l}" cx="${x}" cy="${y}" r="1.4"/>`);
    }));
    return out.join('');
  },
  // 한 틱(경기 1초) = 실제 0.1초 / 배속 (1배속 = 경기 10초가 실제 1초). 화면 프레임마다 시간을 쌓고, 한 틱이 차면 그 프레임에서 바로 다음 틱을 계산한다
  TICK: 100,
  advance(dt) {
    const g = this.g, period = this.TICK / this.speed;
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
      const g = this.g, f = g.over ? 1 : Math.min(1, this.acc / (this.TICK / this.speed));
      this.paint(g, f);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  },
  // 맵 위 챔피언 · 효과를 캔버스 한 장에 그린다 (프레임마다). f = 이번 틱의 진행도 0~1
  icon(p) { const m = (this.imgs ||= new Map()); let im = m.get(p.c); if (!im) { im = new Image(); im.src = Champions.byId[p.c].icon; m.set(p.c, im); } return im; },
  paint(g, f) {
    const c = this.ctx; if (!c) return;
    const W = this.mw, H = this.mh, X = v => v * W / 100, Y = v => v * H / 100, now = g.t + (g.over ? 0 : f), R = W * .024, TAU = Math.PI * 2;
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
      } else {
        const big = e.type === 'fight' ? 2 : 1.4, rr = R * big * (.6 + q), gr = c.createRadialGradient(x, y, 0, x, y, rr), a = 1 - q;
        gr.addColorStop(0, e.type === 'fight' ? `rgba(255,210,120,${.5 * a})` : `rgba(255,255,255,${.8 * a})`); gr.addColorStop(.6, `rgba(255,130,60,${.2 * a})`); gr.addColorStop(1, 'rgba(255,120,60,0)');
        c.fillStyle = gr; c.beginPath(); c.arc(x, y, rr, 0, TAU); c.fill();
      }
    }
    const P = g.pl.map(p => ({ p, pos: this.at(p.trail, f) || p.pos })).filter(o => !o.p.dead);
    const where = new Map(P.map(o => [o.p, o.pos]));
    // 공격선: 이번 1초에 누가 누구를 쳤나 (원거리는 가늘고 길게, 근접은 굵고 짧게 보인다)
    c.lineCap = 'round';
    for (const { p, pos } of P) {
      const t = p.hitAt === g.t && p.hitTo && where.get(p.hitTo); if (!t) continue;
      c.strokeStyle = `rgba(${col(p.side)},${(.75 - f * .5).toFixed(2)})`; c.lineWidth = p.rng > 5 ? 1.6 : 2.6; c.beginPath(); c.moveTo(X(pos[0]), Y(pos[1])); c.lineTo(X(t[0]), Y(t[1])); c.stroke();
    }
    // 챔피언: 아래쪽에 있는 선수가 위에 그려진다
    P.sort((a, b) => a.pos[1] - b.pos[1]);
    for (const { p, pos } of P) {
      const x = X(pos[0]), y = Y(pos[1]), im = this.icon(p);
      c.save(); c.shadowColor = p.recall ? 'rgba(90,170,255,.9)' : 'rgba(0,0,0,.8)'; c.shadowBlur = p.recall ? 12 : 5; c.fillStyle = '#0b111d'; c.beginPath(); c.arc(x, y, R, 0, TAU); c.fill(); c.restore();
      if (im.complete && im.naturalWidth) { c.save(); c.beginPath(); c.arc(x, y, R - 1, 0, TAU); c.clip(); c.drawImage(im, x - R, y - R, R * 2, R * 2); c.restore(); }
      c.lineWidth = 2; c.strokeStyle = `rgb(${col(p.side)})`; c.beginPath(); c.arc(x, y, R - 1, 0, TAU); c.stroke();
      // 체력 막대
      const bw = R * 1.9, bh = Math.max(3, R * .22), bx = x - bw / 2, by = y + R + 2;
      c.fillStyle = 'rgba(5,8,14,.85)'; c.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
      c.fillStyle = p.hp > .5 ? '#4cd964' : p.hp > .25 ? '#f0b400' : '#ef4b5f'; c.fillRect(bx, by, bw * Math.max(0, Math.min(1, p.hp)), bh);
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
      const its = row.querySelector('.lv-items'), key = p.inv.map(x => x.id).join(',') + '|' + p.wards + '|' + (p.trinket ? p.trinket.id : '');
      if (its.dataset.k !== key) { its.dataset.k = key; its.innerHTML = this.inventory(p); }
    });
    ['B', 'R'].forEach(k => ['top', 'mid', 'bot'].forEach(l => {
      Rift.TOWER[k][l].forEach((n, i) => { const c = el.querySelector(`[data-tw="${k}-${l}-${i}"]`); if (c) c.classList.toggle('down', g.side[k].thp[l][i] <= 0); });
      const ih = el.querySelector(`[data-ih="${k}-${l}"]`); if (ih) ih.classList.toggle('down', !g.side[k].inhib[l]);
    }));
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
      <div class="card fx-empty"><b>${ready ? `${UI.esc(Draft.side(S, 'B').short)} vs ${UI.esc(Draft.side(S, 'R').short)} ${S.game}세트 준비 완료` : '관전할 경기가 없습니다'}</b><span>${ready ? '밴픽과 전술이 확정돼 있습니다.' : '밴픽 준비에서 밴픽을 마치거나, 코치에게 맡겨 바로 시작할 수 있습니다.'}</span>
      <div style="display:flex;gap:10px;justify-content:center;margin-top:12px;flex-wrap:wrap">${ready ? '<button class="btn-primary lv-go">경기 시작</button>' : ''}<a class="btn-ghost" href="#match-draft">밴픽 준비</a><button class="${ready ? 'btn-ghost' : 'btn-primary'} lv-quick">빠른 연습 경기 (양 팀 코치 밴픽)</button></div></div></div>`;
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
