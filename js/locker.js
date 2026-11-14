// 라커룸 회의: 세트가 끝나고 다음 세트 밴픽 전에 채팅방처럼 진행한다.
// 코치가 방금 세트를 짚고, 선수들이 한마디씩 하고, 감독이 말투와 방향을 고른다.
// 결과는 숫자로 보여 주지 않는다. 다음 세트에만 작게 반영:
//   - 선수에게 한 말 → 그 선수의 다음 세트 집중(series.boost, OVR 몇 점) · 사기(World.morale)
//   - 밴 방향 → 다음 밴픽의 코치 추천·위임 밴(series.plan.banRole)
//   - 공략 방향 → 정글 동선(엔진 side.focus) · 코치가 채우는 전술
//   - 진영 → 진 팀이 고른다
// 상대도 세트마다 우리에서 가장 잘한 선수 쪽을 묶으러 온다(series.oppPlan).
const Locker = {
  st() { return App.state.locker || null; },
  // Live.finish 에서: 방금 세트를 요약해 두고 라커룸으로
  open(S, g) { this.prepare(S, g); Router.go('match-locker'); },
  // 세트가 끝나자마자 회의 내용을 만들어 저장한다 (이미 만든 세트면 그대로 둔다)
  prepare(S, g) {
    const cur = this.st(); if (cur && cur.key === S.series.key && cur.game === S.game) return;
    const us = S.teams.B === App.state.teamId ? 'B' : 'R', them = us === 'B' ? 'R' : 'B', won = g.over.win === us;
    const rate = p => Math.round(Math.max(3, Math.min(10, Season.rating(p.k, p.d, p.a, p.side === g.over.win, g.over.mvp === p))) * 10) / 10;
    const pl = g.pl.map(p => ({ id: p.p.id, name: p.name, role: p.role, side: p.side, c: p.c, k: p.k, d: p.d, a: p.a, gold: Math.round(p.gold), r: rate(p) }));
    const lane = r => { const a = pl.find(x => x.side === us && x.role === r), b = pl.find(x => x.side === them && x.role === r); return a && b ? a.gold - b.gold : 0; };
    const early = s => g.kills.filter(x => x.t < 900 && x.k.side === s).length;
    const ojg = g.pl.find(p => p.side === them && p.role === 'JGL');
    // 상대 정글이 초반(15분 전)에 킬을 낸 라인
    const gankLanes = {}; g.kills.filter(x => x.t < 900 && x.k === ojg).forEach(x => { const l = ['top', 'mid', 'bot'].sort((a, b) => Sim.distLane(x.at, a) - Sim.distLane(x.at, b))[0]; gankLanes[l] = (gankLanes[l] || 0) + 1; });
    App.state.locker = {
      key: S.series.key, game: S.game, us, them, won, t: g.t, kills: { us: g.side[us].kills, them: g.side[them].kills },
      drag: { us: g.side[us].drag.length, them: g.side[them].drag.length }, baron: { us: g.side[us].baron, them: g.side[them].baron }, towers: { us: g.side[them].down, them: g.side[us].down },
      lanes: Object.fromEntries(G.ROLES.map(r => [r, lane(r)])), early: { us: early(us), them: early(them) }, gankLanes, pl,
      oppTeam: Draft.side(S, them).id, mode: S.mode, bo: S.series.bo, scrim: S.scrim || null, official: !!S.official,
      step: 0, log: [], picks: {},
    };
  },
  coach() { const t = Roster.team(); return ((t.staff || [])[1] || (t.staff || [])[0] || { name: '코치' }); },
  // 선수 성격: 침착함(멘탈) · 야망(숨은) · 특성
  mind(pid) {
    const hit = Player.find(pid), p = hit ? hit.p : {}, a = p.attributes || {}, tr = (typeof Traits !== 'undefined' ? Traits.of(pid) : []).map(t => t.id);
    return { calm: (a.mental || {}).composure || 12, amb: (a.hidden || {}).ambition || 11, vet: tr.includes('veteran') || (p.age || 20) >= 26, iron: tr.includes('iron-mind'), wild: tr.includes('dice') || tr.includes('killer'), young: (p.age || 20) <= 20, p };
  },
  laneOf: { TOP: 'top', JGL: 'jgl', MID: 'mid', BOT: 'bot', SUP: 'bot' },
  laneKo: { top: '탑', mid: '미드', bot: '바텀', jgl: '정글', fight: '한타' },

  // 회의 대본: [말하는 사람, 문장] 과 선택 주제
  script(L) {
    const co = this.coach().name, mine = L.pl.filter(x => x.side === L.us), theirs = L.pl.filter(x => x.side === L.them);
    const worst = mine.slice().sort((a, b) => a.r - b.r)[0], best = mine.slice().sort((a, b) => b.r - a.r)[0], star = theirs.slice().sort((a, b) => b.r - a.r)[0];
    const opp = Schedule.team(L.oppTeam), cn = id => (Champions.byId[id] || {}).name || id;
    const lanes = Object.entries(L.lanes).filter(([r]) => r !== 'SUP' && r !== 'JGL').sort((a, b) => a[1] - b[1]);
    const lost = lanes[0], ahead = lanes[lanes.length - 1];
    const say = [];
    // 1. 코치 요약
    if (L.won) say.push(['coach', `${L.game}세트 잡았습니다. 킬 ${L.kills.us}:${L.kills.them}${L.drag.us > L.drag.them ? `, 드래곤도 ${L.drag.us}개 챙겼고요` : ''}. ${ahead[1] > 1500 ? `${G.ROLE_KO[ahead[0]]}에서 벌어 둔 게 끝까지 갔습니다.` : '운영으로 이긴 판입니다.'}`]);
    else say.push(['coach', `${L.game}세트 내줬습니다. ${lost[1] < -1500 ? `${G.ROLE_KO[lost[0]]} 라인에서 골드가 ${(Math.abs(lost[1]) / 1000).toFixed(1)}K 벌어졌어요.` : L.drag.them >= L.drag.us + 2 ? `드래곤을 ${L.drag.them}개나 내준 게 컸습니다.` : L.early.them > L.early.us + 2 ? '초반 교전에서 계속 끌려다녔습니다.' : '후반 한타 한 번에 무너졌습니다.'}`]);
    const gl = Object.entries(L.gankLanes).sort((a, b) => b[1] - a[1])[0];
    if (gl && gl[1] >= 2) say.push(['coach', `상대 정글이 ${this.laneKo[gl[0]]} 쪽으로 자주 옵니다. 초반 ${gl[1]}번 거기서 킬이 났어요.`]);
    // 2. 선수 한마디
    const mb = this.mind(best.id);
    say.push([best.id, best.r >= 7.6 ? (mb.amb >= 14 ? `${cn(best.c)} 손에 잘 맞았어요. 다음 판도 저한테 몰아주셔도 됩니다.` : '오늘 컨디션 괜찮아요. 하던 대로 가면 될 것 같아요.') : '다들 수고했어요. 다음 판 집중해요.']);
    if (worst.id !== best.id) {
      const mw = this.mind(worst.id);
      say.push([worst.id, worst.r < 5 ? (mw.calm <= 9 ? '죄송해요... 제가 너무 말렸어요.' : mw.wild ? '아 그 싸움은 될 줄 알았는데. 다음엔 제가 풀게요.' : '라인전이 생각보다 힘드네요. 정글 도움이 좀 필요해요.') : '저는 괜찮아요. 상대 정글 동선만 봐 주세요.']);
    }
    if (star) say.push([mine.find(x => x.role === star.role)?.id || best.id, `${opp.short} ${star.name} 오늘 감이 좋아 보여요. ${cn(star.c)} 같은 거 또 주면 안 될 것 같아요.`]);
    // 3. 주제
    const topics = [];
    if (worst.r < 5.6 && worst.id !== best.id) topics.push({ id: 'talk', pid: worst.id, ask: `${worst.name}에게 한마디 하시겠습니까?`, opts: [['enc', '격려한다', `${worst.name}, 괜찮아. 한 판 졌다고 네 실력이 어디 가는 거 아니야. 네 플레이 해.`], ['firm', '강하게 말한다', `${worst.name}, 이렇게 하면 다음 판 장담 못 한다. 정신 차려.`], ['calm', '무리하지 말라고 한다', `${worst.name}, 지금은 뭐 하려고 하지 마. 기본만 하자. 보여줄 건 더 큰 무대에서 보여줘.`], ['none', '넘어간다', '(아무 말 없이 다음으로 넘어간다)']] });
    if (best.r >= 7.4) topics.push({ id: 'praise', pid: best.id, ask: `${best.name}이(가) 잘했습니다.`, opts: [['praise', '칭찬한다', `${best.name}, 좋았어. 다음 판도 그 감 그대로.`], ['steady', '들뜨지 말라고 한다', `${best.name}, 잘했는데 아직 안 끝났다. 들뜨지 말자.`], ['none', '넘어간다', '(고개만 끄덕인다)']] });
    const roleOpts = ['TOP', 'JGL', 'MID', 'BOT', 'SUP'].map(r => { const o = theirs.find(x => x.role === r); return [r, `상대 ${G.ROLE_KO[r]}${o ? ` (${o.name})` : ''} 묶기`, `밴은 상대 ${G.ROLE_KO[r]} 쪽으로 가자.`]; });
    const sr = star ? star.role : 'MID';
    topics.push({ id: 'ban', ask: `다음 밴은 어디로 갈까요? 저는 ${G.ROLE_KO[sr]} 쪽을 묶는 게 좋아 보입니다.`, rec: sr, opts: [roleOpts.find(o => o[0] === sr), ...roleOpts.filter(o => o[0] !== sr).slice(0, 3), ['none', '평소대로', '밴은 코치 판단대로 가자.']] });
    const fr = ahead[1] > 800 ? this.laneOf[ahead[0]] : gl ? gl[0] : 'bot';
    topics.push({ id: 'focus', ask: `이번엔 어디서 풀어갈까요?`, rec: fr, opts: [['top', '탑 위주', '이번 판은 탑에서 풀어 가자. 정글 동선 탑 쪽으로.'], ['mid', '미드 위주', '미드 주도권부터 잡자. 정글은 미드 중심.'], ['bot', '바텀 위주', '바텀 2대2부터 이기자. 드래곤 쪽으로.'], ['none', '맡긴다', '라인 동선은 정글 판단에 맡기자.']].sort((a, b) => (b[0] === fr) - (a[0] === fr)) });
    if (!L.won && !L.scrim) topics.push({ id: 'side', ask: '진영은 우리가 고릅니다.', opts: [['B', '블루', '블루로 가자. 첫 픽 가져간다.'], ['R', '레드', '레드로 가자. 마지막 픽으로 받아친다.']] });
    return { say, topics };
  },

  // 선수의 대답과 효과 (숫자는 보이지 않는다)
  react(pid, tone) {
    const m = this.mind(pid), name = m.p.name || '선수';
    // 효과: 다음 세트 OVR 보정 · 사기
    let v = 0, line = '';
    if (tone === 'enc') { v = m.calm <= 11 || m.young ? 2 : 1; line = m.calm <= 11 ? '...네. 감사합니다. 다음 판은 제대로 할게요.' : '네, 알겠습니다.'; }
    else if (tone === 'firm') { const good = m.iron || m.amb >= 14 || m.vet; v = good ? 2 : m.calm <= 9 ? -2 : 0; line = good ? '알겠습니다. 다음 판 보여드릴게요.' : m.calm <= 9 ? '...네.' : '네. 집중하겠습니다.'; }
    else if (tone === 'calm') { v = m.wild ? 2 : m.calm <= 10 ? 1 : 0; line = m.wild ? '...알겠어요. 무리 안 할게요.' : '네, 기본부터 할게요.'; }
    else if (tone === 'praise') { v = m.amb >= 15 && !m.vet ? 0 : 1; line = m.amb >= 15 ? '당연하죠. 이번 판도 캐리할게요.' : '감사합니다! 계속 이렇게 갈게요.'; }
    else if (tone === 'steady') { v = m.vet || m.calm >= 13 ? 1 : 0; line = m.vet ? '네, 아직 한 판 남았죠.' : '네... 알겠습니다.'; }
    return { v, line, name };
  },

  // ---------- 화면 ----------
  async render(el) {
    el.innerHTML = '<div class="placeholder-view"><p>라커룸 준비 중…</p></div>';
    await Promise.all([Portal.ready, Champions.load(), Mastery.load()]);   // 새로고침 직후 라커룸으로 바로 올 수 있다
    const L = this.st();
    if (!L) { if (MatchLock.on()) return Router.go('match-draft'); el.innerHTML = `<div class="cr-page">${Career.head('라커룸', '진행 중인 회의가 없습니다.')}</div>`; return; }
    this.el = el; L.sc ||= this.script(L);
    const my = Roster.team(), opp = Schedule.team(L.oppTeam);
    el.innerHTML = `<div class="lk-wrap">
      <div class="lk-head">${G.team(my, 'sm')}<div><b>라커룸</b><small>${UI.esc(my.short)} vs ${UI.esc(opp.short)} · ${L.game}세트 ${L.won ? '승리' : '패배'} 후</small></div><button class="btn-ghost lk-skip">코치에게 맡기고 다음 세트</button></div>
      <div class="lk-chat"></div>
      <div class="lk-opts"></div>
    </div>`;
    $('.lk-skip', el).onclick = () => this.finish(true);
    this.chat = $('.lk-chat', el); this.opts = $('.lk-opts', el);
    // 이미 지난 대화는 그대로 다시 그린다
    L.log.forEach(x => this.bubble(x, false));
    this.run();
  },
  face(who) {
    if (who === 'me') { const m = App.state.manager || {}; return `<div class="lk-av me">${typeof Avatar !== 'undefined' && m.avatar ? Avatar.render(m.avatar) : '감'}</div>`; }
    if (who === 'coach') { const c = this.coach(); return c.photo ? G.face(c, 'lk-av') : '<div class="lk-av">코</div>'; }
    const hit = Player.find(who); return hit ? G.face(hit.p, 'lk-av') : '<div class="lk-av">?</div>';
  },
  nameOf(who) { if (who === 'me') return '감독'; if (who === 'coach') return `${this.coach().name} 코치`; const hit = Player.find(who); return hit ? hit.p.name : ''; },
  bubble(x, anim = true) {
    const d = document.createElement('div'); d.className = `lk-msg ${x.who === 'me' ? 'me' : ''} ${anim ? 'new' : ''}`;
    d.innerHTML = `${this.face(x.who)}<div><small>${UI.esc(this.nameOf(x.who))}</small><p>${UI.esc(x.text)}</p></div>`;
    this.chat.appendChild(d); this.chat.scrollTop = this.chat.scrollHeight;
  },
  push(who, text) { const L = this.st(); if (!L) return; const x = { who, text }; L.log.push(x); this.bubble(x); },
  // 대본을 한 줄씩 (타이핑하듯 약간의 간격)
  async run() {
    const L = this.st(), el = this.el;
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const gone = () => this.st() !== L || !document.body.contains(el);   // 회의를 건너뛰었거나 화면을 떠났다
    while (L.step < L.sc.say.length) {
      if (gone()) return;
      await wait(L.log.length ? 650 : 250);
      if (gone()) return;
      const [who, text] = L.sc.say[L.step]; L.step++; this.push(who, text);
    }
    const ti = L.step - L.sc.say.length, tp = L.sc.topics[ti];
    if (!tp) return this.end();
    await wait(500); if (gone()) return;
    if (!L.asked || L.asked !== tp.id) { this.push('coach', tp.ask); L.asked = tp.id; }
    this.opts.innerHTML = tp.opts.map(o => `<button class="${o[0] === tp.rec ? 'btn-primary' : 'btn-ghost'}" data-v="${o[0]}">${UI.esc(o[1])}</button>`).join('');
    this.opts.onclick = async e => {
      const b = e.target.closest('button'); if (!b) return;
      this.opts.innerHTML = ''; this.opts.onclick = null;
      this.choose(tp, b.dataset.v);
      L.step++; await wait(400); this.run();
    };
  },
  choose(tp, v) {
    const L = this.st(), o = tp.opts.find(x => x[0] === v);
    this.push('me', o[2]); L.picks[tp.id] = v;
    if ((tp.id === 'talk' || tp.id === 'praise') && v !== 'none') {
      const r = this.react(tp.pid, v); (L.boost ||= {})[tp.pid] = r.v;
      const mor = World.morale(); mor[tp.pid] = (mor[tp.pid] || 0) + Math.sign(r.v);
      if (typeof Rel !== 'undefined') Rel.add(tp.pid, Math.sign(r.v) * 2, `라커룸: ${o[1]}`);
      setTimeout(() => this.push(tp.pid, r.line), 450);
    }
    if (tp.id === 'ban' && v !== 'none') setTimeout(() => this.push('coach', `알겠습니다. ${G.ROLE_KO[v]} 쪽 위주로 밴 준비하겠습니다.`), 450);
    if (tp.id === 'focus' && v !== 'none') { const jg = L.pl.find(x => x.side === L.us && x.role === 'JGL'); if (jg) setTimeout(() => this.push(jg.id, `네, ${this.laneKo[v]} 쪽으로 동선 짤게요.`), 450); }
  },
  end() {
    const L = this.st();
    this.push('coach', `좋습니다. ${L.game + 1}세트 밴픽 들어가겠습니다.`);
    this.opts.innerHTML = `<button class="btn-primary lk-go">${L.game + 1}세트 밴픽으로 →</button>`;
    $('.lk-go', this.opts).onclick = () => this.finish(false);
  },
  // 다음 세트로: 선택을 시리즈에 남기고 밴픽 시작
  finish(skip) {
    const L = this.st(); if (!L) return;
    const S = App.state.draft; if (!S || S.series.key !== L.key) { App.state.locker = null; Router.go('portal-overview'); return; }
    if (skip) { const sc = L.sc || this.script(L); sc.topics.forEach(tp => { if (L.picks[tp.id] == null && (tp.id === 'ban' || tp.id === 'focus')) L.picks[tp.id] = tp.rec || 'none'; }); }
    const series = S.series;
    series.plan = { banRole: L.picks.ban && L.picks.ban !== 'none' ? L.picks.ban : null, focus: L.picks.focus && L.picks.focus !== 'none' ? L.picks.focus : null };
    series.boost = L.boost || {};
    // 상대: 우리 쪽에서 가장 잘한 선수의 포지션을 묶으러 온다
    const best = L.pl.filter(x => x.side === L.us).sort((a, b) => b.r - a.r)[0];
    series.oppPlan = { banRole: best ? best.role : null, focus: null };
    const side = L.picks.side || (L.scrim ? (L.game % 2 ? 'R' : 'B') : L.won ? 'R' : 'B');
    App.state.locker = null;
    Draft.start({ opp: L.oppTeam, side, mode: L.mode, bo: L.bo, key: L.official ? L.key : null, continueSeries: true });
    Router.go('match-draft');
  },
};
Views['match-locker'] = el => Locker.render(el);
