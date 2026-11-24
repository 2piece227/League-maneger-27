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
    // 누가 15분 전에 잘렸나 · 누구에게 가장 많이 당했나 · 퍼스트 블러드 · 큰 오브젝트
    const early15 = {}, byKiller = {}; g.kills.forEach(x => { if (x.v.side === us) { if (x.t < 900) early15[x.v.p.id] = (early15[x.v.p.id] || 0) + 1; byKiller[x.k.p.id] = (byKiller[x.k.p.id] || 0) + 1; } });
    const nem = Object.entries(byKiller).sort((a, b) => b[1] - a[1])[0];
    const fb = g.kills[0] ? { side: g.kills[0].k.side === us ? 'us' : 'them', t: g.kills[0].t, v: g.kills[0].v.p.id } : null;
    const soul = g.side[us].drag.length >= 4 ? 'us' : g.side[them].drag.length >= 4 ? 'them' : null;
    App.state.locker = {
      early15, nemesis: nem ? { id: nem[0], n: nem[1] } : null, fb, soul, elder: { us: g.side[us].elder || 0, them: g.side[them].elder || 0 },
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
  // 코치는 경기 기록에서 결정적인 원인 하나와 고칠 점을, 선수는 자기 포지션 시점에서 말한다. 다음 세트 계획은 근거가 붙은 안 중에서 고른다.
  LANE_ROLE: { TOP: 'top', MID: 'mid', BOT: 'bot' },
  script(L) {
    const mine = L.pl.filter(x => x.side === L.us), theirs = L.pl.filter(x => x.side === L.them);
    const worst = mine.slice().sort((a, b) => a.r - b.r)[0], best = mine.slice().sort((a, b) => b.r - a.r)[0], star = theirs.slice().sort((a, b) => b.r - a.r)[0];
    const opp = Schedule.team(L.oppTeam), cn = id => (Champions.byId[id] || {}).name || id, nameOf = id => (L.pl.find(x => x.id === id) || {}).name || '';
    const vs = r => theirs.find(x => x.role === r), lanes = ['TOP', 'MID', 'BOT'].map(r => [r, L.lanes[r] || 0]).sort((a, b) => a[1] - b[1]);
    const lost = lanes[0], ahead = lanes[2], k = v => (Math.abs(v) / 1000).toFixed(1) + 'K';
    const fed = Object.entries(L.early15 || {}).sort((a, b) => b[1] - a[1])[0];
    const gl = Object.entries(L.gankLanes || {}).sort((a, b) => b[1] - a[1])[0];
    const say = [];
    // 1. 코치: 결정적 원인 + 고칠 점
    const reasons = [];
    if (L.won) {
      if (L.soul === 'us') reasons.push([4, `드래곤 영혼까지 가져간 게 결정적이었습니다.`]);
      if (L.baron.us > L.baron.them) reasons.push([3, `바론을 ${L.baron.us}번 챙기면서 굳혔고요.`]);
      if (ahead[1] > 1500) reasons.push([3 + ahead[1] / 2000, `${G.ROLE_KO[ahead[0]]} 라인에서 ${k(ahead[1])} 앞선 게 끝까지 이어졌습니다.`]);
      if (L.early.us >= L.early.them + 3) reasons.push([3, `15분 전 교전에서 ${L.early.us}:${Sim.josa(L.early.them, '으로', '로')} 주도권을 잡았습니다.`]);
      reasons.push([1, `한타 집중력이 좋았습니다.`]);
    } else {
      if (fed && fed[1] >= 3) reasons.push([2 + fed[1], `${nameOf(fed[0])} 선수가 15분 전에만 ${fed[1]}번 잘렸어요. 거기서 흐름이 넘어갔습니다.`]);
      if (lost[1] < -1500) reasons.push([2 + -lost[1] / 2000, `${G.ROLE_KO[lost[0]]} 맞대결에서 골드가 ${k(lost[1])} 벌어졌습니다${vs(lost[0]) ? ` — ${cn(vs(lost[0]).c)} 상대가 버거웠어요` : ''}.`]);
      if (L.soul === 'them') reasons.push([4, `드래곤 영혼을 내준 뒤로 한타가 안 됐습니다.`]);
      else if (L.drag.them >= L.drag.us + 2) reasons.push([3, `드래곤을 ${L.drag.them}:${Sim.josa(L.drag.us, '으로', '로')} 내줬어요. 오브젝트 앞 시야가 없었습니다.`]);
      if (L.baron.them > L.baron.us) reasons.push([2.5, `바론을 내주면서 사실상 끝났습니다.`]);
      reasons.push([1, `한타에서 앞라인이 먼저 무너졌습니다.`]);
    }
    reasons.sort((a, b) => b[0] - a[0]);
    say.push(['coach', `${L.game}세트 ${L.won ? '가져왔습니다' : '내줬습니다'}. 킬은 ${L.kills.us} 대 ${Sim.josa(String(L.kills.them), '이었고요', '였고요')}. ${reasons[0][1]}`]);
    if (reasons[1] && reasons[1][0] > 1) say.push(['coach', reasons[1][1]]);
    if (L.nemesis && L.nemesis.n >= 4) say.push(['coach', `상대 ${nameOf(L.nemesis.id)}에게만 ${L.nemesis.n}번 잡혔습니다. 저 ${Sim.josa(cn((L.pl.find(x => x.id === L.nemesis.id) || {}).c), '을', '를')} 막을 방법이 필요해요.`]);
    else if (gl && gl[1] >= 2) say.push(['coach', `상대 정글이 초반에 ${this.laneKo[gl[0]]} 쪽만 ${gl[1]}번 왔습니다. 동선을 읽고 대비해야 합니다.`]);
    // 2. 선수: 자기 포지션 시점
    const line = (p, good) => {
      const m = this.mind(p.id), lr = this.LANE_ROLE[p.role], d = L.lanes[p.role] || 0, o = vs(p.role), died = (L.early15 || {})[p.id] || 0;
      if (good) {
        if (p.role === 'JGL') return `초반 동선이 잘 맞았어요. 다음 판도 ${gl ? '같은 쪽' : '라인 상황 보고'} 먼저 풀게요.`;
        if (p.role === 'SUP') return '시야는 제가 계속 잡을게요. 들어갈 때 콜만 주세요.';
        return d > 1000 ? `${Sim.josa(cn(p.c), '으로', '로')} 라인전 이겼어요. ${m.amb >= 14 ? '다음 판도 저한테 몰아주세요.' : '이쪽은 걱정 안 하셔도 돼요.'}` : '한타 각이 잘 보였어요. 하던 대로 가면 될 것 같아요.';
      }
      if (p.role === 'JGL') return died >= 2 ? '제가 동선 들켜서 계속 먼저 잡혔어요. 시야부터 잡고 움직일게요.' : '오브젝트 앞에서 제가 판단이 늦었어요. 다음엔 먼저 자리 잡을게요.';
      if (p.role === 'SUP') return died >= 2 ? '와드 박다가 너무 많이 잘렸어요. 혼자 깊게 안 들어갈게요.' : '로밍 타이밍이 계속 엇갈렸어요. 바텀에 더 붙어 있을게요.';
      if (m.calm <= 9 && died >= 3) return '죄송해요… 제가 너무 많이 말렸어요.';
      if (d < -1000 && o) return `${cn(o.c)} 상대로 라인전이 생각보다 힘들어요.${gl && gl[0] === lr ? ' 상대 정글까지 오니까 버티기가 어려웠어요.' : ''}`;
      return m.wild ? '그 싸움은 될 줄 알았는데… 다음엔 제가 풀어 볼게요.' : '한타에서 제 자리를 못 잡았어요. 다음엔 집중할게요.';
    };
    if (best.r >= 7) say.push([best.id, line(best, true)]);
    if (worst.id !== best.id && worst.r < 6) say.push([worst.id, line(worst, false)]);
    if (star && star.r >= 7.5) { const me = mine.find(x => x.role === star.role); if (me && me.id !== worst.id) say.push([me.id, `${opp.short} ${star.name}의 ${Sim.josa(cn(star.c), '이', '가')} 오늘 제일 위험했어요. 다음 판엔 꼭 대비해야 해요.`]); }
    // 3. 주제
    const topics = [];
    if (worst.r < 5.6 && worst.id !== best.id) topics.push({ id: 'talk', pid: worst.id, ask: `${worst.name}에게 한마디 하시겠습니까?`, opts: [['enc', '격려한다', `${worst.name}, 괜찮아. 한 판 졌다고 네 실력이 어디 가는 거 아니야. 네 플레이 해.`], ['firm', '강하게 말한다', `${worst.name}, 이렇게 하면 다음 판 장담 못 한다. 정신 차려.`], ['calm', '무리하지 말라고 한다', `${worst.name}, 지금은 뭐 하려고 하지 마. 기본만 하자. 보여줄 건 더 큰 무대에서 보여줘.`], ['none', '넘어간다', '(아무 말 없이 다음으로 넘어간다)']] });
    else if (best.r >= 8.2) topics.push({ id: 'praise', pid: best.id, ask: `${Sim.josa(best.name, '이', '가')} 경기를 지배했습니다.`, opts: [['praise', '칭찬한다', `${best.name}, 좋았어. 다음 판도 그 감 그대로.`], ['steady', '들뜨지 말라고 한다', `${best.name}, 잘했는데 아직 안 끝났다. 들뜨지 말자.`], ['none', '넘어간다', '(고개만 끄덕인다)']] });
    // 다음 세트 계획: 근거가 붙은 안 (밴 방향 + 공략 라인을 한 번에)
    const plans = [];
    if (star && star.r >= 7) plans.push(['star', `${star.name} 묶기`, `상대 에이스 ${star.name}(${G.ROLE_KO[star.role]}) 쪽 챔피언을 밴으로 묶습니다.`, star.role, null, `밴은 ${star.name} 쪽으로 간다. 그 선수 손에 맞는 챔피언은 다 빼.`]);
    if (ahead[1] > 800) plans.push(['ahead', `${G.ROLE_KO[ahead[0]]} 몰아주기`, `이긴 ${G.ROLE_KO[ahead[0]]} 라인(+${k(ahead[1])})에 정글 동선을 몰아 더 굴립니다.`, ahead[0], this.LANE_ROLE[ahead[0]], `${Sim.josa(G.ROLE_KO[ahead[0]], '이', '가')} 이기고 있으니 거기를 더 키운다. 정글은 그쪽으로.`]);
    if (lost[1] < -800) plans.push(['help', `${G.ROLE_KO[lost[0]]} 지원`, `밀린 ${G.ROLE_KO[lost[0]]}(${k(lost[1])} 열세)를 정글이 받쳐 주고, 상대 그 라인 챔피언을 밴합니다.`, lost[0], this.LANE_ROLE[lost[0]], `${Sim.josa(G.ROLE_KO[lost[0]], '을', '를')} 살린다. 밴은 그쪽 상대 챔피언, 정글은 초반에 거기부터.`]);
    if (L.drag.them >= L.drag.us + 2 || L.soul === 'them') plans.push(['drag', '드래곤 싸움 준비', '바텀 주도권을 잡고 드래곤 앞 시야를 먼저 잡습니다.', 'BOT', 'bot', '이번엔 드래곤을 안 준다. 바텀부터 이기고 시야 먼저.']);
    const rec = plans.find(p => p[0] === (L.won ? 'ahead' : 'help')) || plans[0];
    if (plans.length) topics.push({ id: 'plan', ask: `다음 세트 어떻게 갈까요?${rec ? ` 저는 '${rec[1]}' 쪽이 좋아 보입니다.` : ''}`, rec: rec && rec[0], plans,
      opts: [...plans.map(p => [p[0], p[1], p[5]]), ['none', '코치에게 맡긴다', '밴과 동선은 코치 판단대로 가자.']] });
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
    if (who === 'me') { const m = App.state.manager || {}; return `<div class="lk-av me">${(m.avatar || m.photo) && typeof Faces !== 'undefined' ? Faces.manager(m) : '감'}</div>`; }
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
    if (tp.id === 'plan' && v !== 'none') {
      const p = tp.plans.find(x => x[0] === v); L.picks.ban = p[3]; L.picks.focus = p[4] || 'none';
      setTimeout(() => this.push('coach', `알겠습니다. 밴은 상대 ${G.ROLE_KO[p[3]]} 쪽 위주로${p[4] ? `, 정글 동선은 ${this.laneKo[p[4]]} 쪽부터` : ''} 준비하겠습니다.`), 450);
      const jg = L.pl.find(x => x.side === L.us && x.role === 'JGL'); if (jg && p[4]) setTimeout(() => this.push(jg.id, `네, ${this.laneKo[p[4]]} 쪽 먼저 볼게요.`), 900);
    }
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
    if (skip) { const sc = L.sc || this.script(L), tp = sc.topics.find(x => x.id === 'plan'); if (tp && L.picks.ban == null) { const p = tp.plans.find(x => x[0] === tp.rec); if (p) { L.picks.ban = p[3]; L.picks.focus = p[4] || 'none'; } } }
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
