// 챔피언 스킬 연출: Q·W·E·R을 종류로 나눠 한타 하이라이트에서 쓴 순서대로 보여 준다 (결과에는 영향 없음 — 연출만)
//  종류(kind): atk 공격 · dash 돌진 · init 이니시 · esc 도주 · ally 팀원 버프 · self 본인 버프
//  모양(shape): line 직선 · circle 원형 · cone 부채꼴 · target 대상 지정 · global 전역 (없으면 자기 자신)
//  효과(cc): up 띄움 · back 밀침 · pull 끌어당김 · stun 묶음(기절·속박·도발·매혹·공포·제압) · slow 둔화
//  프로 경기에 자주 나오는 챔피언은 손으로 정했고(T), 나머지는 스킬 설명 문장으로 자동 분류한다
const Skills = {
  T: {
    XinZhao: 'self.self.up atk.cone.slow dash.target.slow atk.circle.back',
    Rumble: 'atk.cone self atk.line.slow atk.line.slow',
    Ezreal: 'atk.line atk.line esc atk.line.global',
    Ryze: 'atk.line atk.target.stun atk.target ally.circle',
    Ambessa: 'atk.cone self atk.circle.slow init.line.stun',
    Vi: 'dash.line.back self atk.cone init.target.up',
    Pantheon: 'atk.line dash.target.stun self init.circle.slow',
    Alistar: 'init.circle.up dash.target.back atk.circle.stun self',
    Corki: 'atk.circle dash.line atk.cone atk.line',
    JarvanIV: 'dash.line.up self.self.slow atk.circle init.circle.stun',
    Nautilus: 'init.line.pull self atk.circle.slow init.target.up',
    Varus: 'atk.line self atk.circle.slow init.line.stun',
    KSante: 'atk.line.up dash.line.back ally init.target.back',
    Jhin: 'atk.target atk.line.stun atk.circle.slow atk.cone.slow',
    Taliyah: 'atk.line init.circle.up atk.cone.slow init.line',
    MonkeyKing: 'self esc dash.target init.circle.up',
    Rell: 'atk.line init.circle.up ally init.circle.pull',
    Sion: 'init.cone.up self atk.line.slow init.line.up',
    Rakan: 'atk.circle init.circle.up ally init.circle.stun',
    Aurora: 'atk.line esc atk.cone.back init.circle.slow',
    Azir: 'atk.line.slow atk.circle dash.line init.line.back',
    Jayce: 'atk.line self atk.target.back self',
    Orianna: 'atk.circle atk.circle.slow ally init.circle.pull',
    Gnar: 'atk.line.slow self dash.circle init.circle.back',
    Lucian: 'atk.line atk.line dash atk.line',
    Renekton: 'atk.circle atk.target.stun dash.line self',
    Ahri: 'atk.line atk.circle atk.line.stun dash',
    Viktor: 'atk.target atk.circle.slow atk.line atk.circle',
    Neeko: 'atk.circle esc atk.line.stun init.circle.stun',
    Bard: 'atk.line.stun ally esc init.circle.stun',
    Kaisa: 'atk.circle atk.line self dash.target',
    Ashe: 'self atk.cone.slow self init.line.stun',
    Galio: 'atk.circle init.circle.stun dash.line.up init.circle.up',
    Naafiri: 'atk.line dash.target esc self',
    Leona: 'atk.target.stun self dash.line.stun init.circle.stun',
    Lulu: 'atk.line.slow ally ally ally.circle.up',
    Annie: 'atk.target atk.cone ally init.circle.stun',
    Karma: 'atk.line.slow atk.target.stun ally self',
    Nocturne: 'atk.line self atk.target.stun dash.target',
    Skarner: 'atk.target self init.line.stun init.circle.stun',
    MissFortune: 'atk.target self atk.circle.slow atk.cone',
    Seraphine: 'atk.circle ally atk.line.stun init.line.stun',
    Sivir: 'atk.line self self ally',
    Poppy: 'atk.line.slow self dash.target.stun init.line.back',
    LeeSin: 'dash.line ally atk.circle.slow init.target.back',
    Trundle: 'atk.target self init.circle.stun atk.target',
    Xayah: 'atk.line self atk.line.stun esc',
    Braum: 'atk.line.slow ally self init.line.up',
    Caitlyn: 'atk.line atk.circle.stun esc atk.target',
    Gwen: 'atk.cone self dash atk.line.slow',
    Yone: 'dash.line.up atk.cone dash init.line.up',
    Akali: 'atk.cone esc dash.line dash.line',
    Sejuani: 'init.line.up atk.cone atk.target.stun init.line.stun',
    Yorick: 'atk.target atk.circle.stun atk.line.slow self',
    Sylas: 'atk.line dash.target init.line.up self',
    Cassiopeia: 'atk.circle atk.cone.slow atk.target init.cone.stun',
    Renata: 'atk.line.pull ally ally.line.slow init.line.stun',
    Milio: 'atk.line.back ally ally ally.circle',
    Jax: 'dash.target self self.circle.stun self',
    Nami: 'init.circle.up ally ally init.line.up',
    Kalista: 'atk.line self atk.circle init.circle.up',
    Ornn: 'atk.line.slow self dash.line.up init.line.up',
    Syndra: 'atk.circle atk.circle.slow atk.cone.stun atk.target',
    Aatrox: 'atk.line.up atk.line.pull dash self',
    Anivia: 'atk.line.stun atk.line atk.target atk.circle.slow',
    Ziggs: 'atk.circle esc atk.circle.slow atk.circle',
    Maokai: 'atk.circle.back dash.target.stun atk.circle init.line.stun',
    Camille: 'atk.target atk.cone.slow dash.line.stun init.circle',
    Shen: 'atk.line ally.circle dash.line.stun ally.global',
    Olaf: 'atk.line.slow self atk.target self',
    TwistedFate: 'atk.cone atk.target.stun self dash.global',
    Qiyana: 'atk.line dash dash.target init.line.stun',
    Zeri: 'atk.line atk.line.slow dash self.circle',
    Aphelios: 'atk.line self self atk.circle',
    Jinx: 'self atk.line.slow atk.circle.stun atk.line.global',
    Senna: 'atk.line atk.line.stun esc atk.line.global',
    Draven: 'self self atk.line.back atk.line.global',
    Karthus: 'atk.circle atk.line.slow atk.circle atk.global',
    Malphite: 'atk.target.slow self atk.circle.slow init.circle.up',
    Thresh: 'init.line.pull ally atk.line.slow init.circle.slow',
    Blitzcrank: 'init.line.pull self atk.target.up atk.circle',
    Pyke: 'init.line.pull esc dash.line.stun atk.circle',
    Zac: 'atk.line.pull self init.circle.up init.circle.up',
    Wukong: 'self esc dash.target init.circle.up',
    Smolder: 'atk.target atk.line.slow esc atk.line',
    Zyra: 'atk.line self atk.line.stun init.circle.up',
    Vayne: 'dash self atk.target.stun self',
    Hwei: 'atk.line atk.circle atk.line.stun init.circle.slow',
    Mel: 'atk.line ally atk.line.stun atk.global',
    Tristana: 'self atk.circle dash.circle atk.target.back',
    Elise: 'atk.target self atk.line.stun self',
    Nidalee: 'atk.line self ally self',
    Graves: 'atk.line atk.circle.slow dash atk.line.back',
    Kindred: 'dash self atk.target ally.circle',
    Kennen: 'atk.line self dash init.circle.stun',
    Sett: 'self atk.line init.circle.stun init.target.up',
    Gragas: 'atk.circle.slow self dash.line.up init.circle.back',
    Kled: 'atk.line.pull self dash.line init.line',
  },
  KEYS: ['Q', 'W', 'E', 'R'],
  cache: {},
  // 설명 문장으로 자동 분류 (T에 없는 챔피언)
  auto(sp, key) {
    const d = (sp.desc || '') + ' ' + (sp.name || '');
    const cc = /에어본|공중으로|띄워|띄웁/.test(d) ? 'up' : /밀어|밀쳐|밀려|넉백|날려/.test(d) ? 'back' : /끌어|당겨|당깁/.test(d) ? 'pull' : /기절|속박|도발|매혹|공포|제압|묶/.test(d) ? 'stun' : /둔화|느려/.test(d) ? 'slow' : '';
    const dash = /돌진|도약|질주|뛰어|순간이동|점멸|날아|미끄러|돌격|구르|돌파/.test(d), dmg = /피해를 입|피해를 줍|피해를 가/.test(d);
    const shape = /전역|맵 전체|모든 적 챔피언/.test(d) ? 'global' : /일직선|직선|방향으로|일렬|관통/.test(d) ? 'line' : /부채꼴|원뿔/.test(d) ? 'cone' : /주변|원형|범위|지역|지점|구역/.test(d) ? 'circle' : /대상|적 하나|적에게/.test(d) ? 'target' : '';
    let kind;
    if (/아군|팀원/.test(d) && /보호막|회복|이동 속도|공격 속도|강화/.test(d) && !dmg) kind = 'ally';
    else if (dash && /뒤로|물러|후퇴|벗어나/.test(d) && !cc) kind = 'esc';
    else if (dash && ['up', 'back', 'pull', 'stun'].includes(cc)) kind = 'init';
    else if (dash) kind = 'dash';
    else if (key === 'R' && ['up', 'back', 'pull', 'stun'].includes(cc)) kind = 'init';
    else if (!dmg && /증가|강화|보호막|은신|투명|피해 감소|회복/.test(d)) kind = 'self';
    else kind = 'atk';
    return { kind, shape: kind === 'self' || kind === 'ally' && !shape ? '' : shape, cc };
  },
  of(c) {
    if (this.cache[c]) return this.cache[c];
    const ch = (typeof Champions !== 'undefined' && Champions.byId[c]) || {}, sp = ch.spells || [], t = this.T[c] && this.T[c].split(' ');
    return (this.cache[c] = this.KEYS.map((key, i) => {
      const s = sp.find(x => x.key === key) || {}; let [kind, shape = '', cc = ''] = t ? t[i].split('.') : [];
      if (cc === 'global') { shape = 'global'; cc = ''; }   // 'atk.line.global' = 맵 전체를 가로지르는 직선 궁
      const names = (s.name || key).split(' / ');
      // 수치 연출(data/skill-fx.json): 모양 · 사거리 · 폭 · 반경 · 각도 · 속도 · 발사 수 · 채널링. 변신 챔피언은 두 번째 형태(fx2)
      const F = typeof CStats !== 'undefined' && CStats.fx[c] && CStats.fx[c][key] || [], fx = F[0] || null, fx2 = F[1] || null;
      const base = t ? { kind, shape: shape === 'self' ? '' : shape, cc } : this.auto(s, key);
      if (fx) { const SH = { line: 'line', cone: 'cone', circle: 'circle', target: 'target', global: 'global', aura: 'circle', wall: 'line' }; if (SH[fx.s]) base.shape = SH[fx.s]; if (fx.cc && !base.cc) base.cc = fx.cc; if ((fx.s === 'dash' || fx.s === 'blink') && base.kind === 'atk') base.kind = 'dash'; }
      return { key, name: names[0], mega: names[1] || null, icon: s.icon || ch.icon, fx, fx2, ...base };
    }));
  },
  // 맞는 대상 (수치 연출 기준). fx가 없으면 예전 고정 크기
  U: 150,
  hits(p, s, fx, to, tg, foes, seg) {
    const D = Sim.dist, U = this.U;
    if (s.kind === 'ally' || s.kind === 'self' || s.kind === 'esc') return [];
    if (!fx) return s.shape === 'global' ? foes : s.shape === 'circle' ? foes.filter(q => D(q.pos, to) < 4) : s.shape === 'cone' ? foes.filter(q => D(q.pos, p.pos) < 6 && D(q.pos, to) < 5) : s.shape === 'line' ? foes.filter(q => seg(p.pos, to, q.pos) < 2) : tg ? [tg] : [];
    const r = Math.min(40, (fx.r || 600) / U + 1), dx = to[0] - p.pos[0], dy = to[1] - p.pos[1], L = Math.hypot(dx, dy) || 1, end = [p.pos[0] + dx / L * r, p.pos[1] + dy / L * r];
    let h;
    switch (fx.s) {
      case 'global': return foes;
      case 'line': h = foes.filter(q => seg(p.pos, end, q.pos) < (fx.w || 90) / U / 2 + .8); break;
      case 'cone': { const a0 = Math.atan2(dy, dx), half = (fx.ang || 60) * Math.PI / 360; h = foes.filter(q => { const d = D(q.pos, p.pos); if (d > r) return false; let da = Math.abs(Math.atan2(q.pos[1] - p.pos[1], q.pos[0] - p.pos[0]) - a0); if (da > Math.PI) da = 2 * Math.PI - da; return da <= half + .15 || d < 1.2; }); break; }
      case 'circle': { const c = L > r ? end : to; h = foes.filter(q => D(q.pos, c) < (fx.rad || 200) / U + .8); break; }
      case 'aura': h = foes.filter(q => D(q.pos, p.pos) < (fx.rad || 300) / U + .8); break;
      case 'wall': { const px = -dy / L, py = dx / L; h = foes.filter(q => seg([to[0] - px * 3, to[1] - py * 3], [to[0] + px * 3, to[1] + py * 3], q.pos) < 1.2); break; }
      case 'dash': case 'blink': h = fx.rad ? foes.filter(q => D(q.pos, L > r ? end : to) < fx.rad / U + .8) : tg && L <= r + 1 ? [tg] : []; break;
      default: h = tg ? [tg] : [];
    }
    if (fx.stop && h.length > 1) h = h.sort((a, b) => D(a.pos, p.pos) - D(b.pos, p.pos)).slice(0, 1);
    return h;
  },
  // 회피: 논타겟(직선 · 원 · 부채꼴 · 벽 · 전역 · 착지 범위)은 빗나갈 수 있다. 대상 지정은 항상 맞는다.
  //  맞을 확률 = 모양 기본값 − 날아가는 시간(거리 ÷ 투사체 속도, 원은 착지 지연) + 폭 + 시전자 실력 − 대상 실력(선수 OVR · 챔피언 숙련)
  //  묶여 있으면(기절 · 에어본 · 제압) 무조건, 둔화 중이면 더 잘 맞는다
  HIT0: { line: .68, cone: .88, circle: .62, aura: .9, wall: .8, global: .55, dash: .82, blink: .85, target: 1, self: 1, passive: 1 },
  dodge(g, p, fx, list) {
    const miss = [];
    if (!fx || !list.length || (this.HIT0[fx.s] ?? 1) >= 1 || p.flashEng === g.t) return { hit: list, miss };   // 점멸 이니시는 반응할 틈이 없다
    const hit = list.filter(q => {
      if ((q.cc || 0) > g.t) return true;
      const du = Sim.dist(p.pos, q.pos) * this.U, t = fx.spd ? du / fx.spd : fx.s === 'circle' ? .5 : .25;
      let h = this.HIT0[fx.s] - Math.min(.3, t * .28) + Math.min(.15, Math.max(0, ((fx.w || fx.rad || 90) - 90) / 600))
        + ((p.ovr || 70) - (q.ovr || 70)) / 200 + Math.min(1, (p.m || 0) / 30) * .08 - Math.min(1, (q.m || 0) / 30) * .05
        + ((q.slow || 0) > g.t ? .15 : 0) - (q.kind === 'dive' || q.kind === 'adc' ? .05 : q.kind === 'tank' ? -.05 : 0);
      h = Math.max(.15, Math.min(.97, h));
      if (g.r() < h) return true;
      miss.push(q); return false;
    });
    return { hit, miss };
  },
  // 변신 챔피언: 나르는 분노가 차면 메가 나르(궁은 메가일 때만)
  FORM: { Gnar: 'mega' },
  KO: { atk: '공격', dash: '돌진', init: '이니시', esc: '도주', ally: '팀원 버프', self: '본인 버프' },

  // ---------- 엔진: 한타 1초마다 (fightTick 끝에서) ----------
  // 선수마다 1초에 많아야 하나. 첫 1~2초는 앞라인·돌진형이 이니시·돌진기부터, 체력이 낮으면 도주기, 딜러는 공격기, 보호형은 팀원 버프
  CD: { Q: 4, W: 7, E: 8 },
  cast(g, f, mem) {
    if (!g.sk) g.sk = [];
    g.sk = g.sk.filter(e => g.t - e.t < 4);
    const D = Sim.dist, live = mem.filter(p => !p.dead), m = Sim.min(g);
    live.forEach(p => {
      if (p.recall || p.tpCh) return;
      if (typeof Kits !== 'undefined' && Kits.has(p.c)) { Kits.cast(g, f, p, live); if (g.r() < .5) Kits.cast(g, f, p, live); return; }   // 사용자가 정한 키트 (js/kits.js)
      // 엔진 1초 ≈ 실제 2초: 한 번 쓰고, 절반 확률로 다른 스킬을 이어 쓴다 (콤보)
      const one = () => {
      const cd = (p.skc ||= {}), C = typeof CStats !== 'undefined', mana = s => !C || !p.mpMax || CStats.cost(p, s.key) <= p.mpCur;   // 마나가 모자라면 못 쓴다
      const ready = s => mana(s) && (s.key === 'R' ? g.t >= (p.rFx || 0) && p.lvl >= 6 && !Sim.ULT_JOIN.includes(p.c) && !(s.shape === 'global' && s.kind === 'dash') : g.t >= (cd[s.key] || 0));
      const S0 = this.of(p.c).filter(ready); if (!S0.length) return;
      // 사거리 밖 스킬은 고르지 않는다 (본인 · 팀원 · 전역 · 도주기는 상관없음)
      const nearF = live.filter(q => q.side !== p.side && !q.fled).reduce((a, q) => Math.min(a, D(q.pos, p.pos)), 99);
      const S = S0.filter(s => !s.fx || !s.fx.r || ['self', 'aura', 'global', 'passive'].includes(s.fx.s) || ['ally', 'self', 'esc'].includes(s.kind) || nearF <= s.fx.r / this.U + 2); if (!S.length) return;
      const foes = live.filter(q => q.side !== p.side && !q.fled), us = live.filter(q => q.side === p.side);
      const early = g.t - f.t0 <= 1, front = p.kind === 'tank' || p.kind === 'bruiser' || p.kind === 'dive', low = p.hp < .3 || p.fled;
      const pick = (...ks) => S.filter(s => ks.includes(s.kind));
      let opts;
      if (low) opts = pick('esc', 'dash', 'self');
      else if (early && front) opts = pick('init', 'dash');
      else if (p.kind === 'ench') opts = pick('ally', 'atk');
      else opts = pick('atk', 'init', 'self', 'dash');
      const FR = p.forceR === g.t && S.find(x => x.key === 'R');               // 점멸 이니시 직후: 궁을 바로
      if (FR) opts = [FR];
      else if (!opts.length || g.r() > (early && front ? .9 : .8)) return;
      // 궁극기: 한타(4인 이상)에서만, 이니시 궁은 초반에 · 나머지는 싸움이 무르익은 뒤
      let s = opts.find(x => x.key !== 'R') || opts[0];
      const R = opts.find(x => x.key === 'R');
      if (R && f.size >= 4 && (R.kind === 'init' ? early || g.r() < .35 : g.t - f.t0 >= 2 && g.r() < .45)) s = R;
      if (FR) { s = FR; p.forceR = 0; }
      else if (s.key === 'R' && f.size < 4) { s = opts.find(x => x.key !== 'R'); if (!s) return; }
      const tg = s.kind === 'ally' ? us.filter(q => q !== p).sort((a, b) => a.hp - b.hp)[0] || p
        : p.hitTo && !p.hitTo.dead && foes.includes(p.hitTo) ? p.hitTo : foes.sort((a, b) => D(a.pos, p.pos) - D(b.pos, p.pos))[0];
      if (!tg && s.kind !== 'self' && s.kind !== 'esc') return;
      // 재사용 대기: 챔피언별 실제 값(현재 랭크, 스킬 가속 약 20% 반영) · 마나 소모
      const rc = C && CStats.cd(p, s.key); if (s.key === 'R') p.rFx = g.t + (rc ? rc * .85 / 2 : 45); else cd[s.key] = g.t + (rc ? Math.max(1, rc * .8 / 2) : this.CD[s.key] / 2 + g.r());   // 엔진 1초 ≈ 실제 2초
      if (C && p.mpMax) p.mpCur = Math.max(0, p.mpCur - CStats.cost(p, s.key));
      const form = this.FORM[p.c] === 'mega' ? (s.key === 'R' || (p.mega || 0) > g.t || (m >= 8 && g.r() < .45) ? 'mega' : '') : '';
      if (form === 'mega') p.mega = Math.max(p.mega || 0, g.t + 6);
      const to = s.kind === 'self' ? [...p.pos] : s.kind === 'esc' ? Sim.toward(p.pos, p.side, 6) : [...tg.pos];
      // 맞은 적: 실제 수치로 (게임 단위 150 = 맵 1). 직선은 폭, 부채꼴은 각도 · 사거리, 원은 반경, 관통 못 하면 첫 대상만
      const seg = (a, b, q) => { const vx = b[0] - a[0], vy = b[1] - a[1], L = vx * vx + vy * vy || 1, u = Math.max(0, Math.min(1, ((q[0] - a[0]) * vx + (q[1] - a[1]) * vy) / L)); return D(q, [a[0] + vx * u, a[1] + vy * u]); };
      const fx = (form === 'mega' && s.fx2) || s.fx;
      const dg = this.dodge(g, p, fx, this.hits(p, s, fx, to, tg, foes, seg)), hit = dg.hit;
      // 스킬 피해: 맞은 적마다 data/skill-dmg.json 수치 그대로 (방어력 · 마저 · 보호막 · 킬 기록까지)
      const oh = C && (CStats.OH[p.c] || {})[s.key];
      if (oh) (p.oh ||= {})[s.key] = g.t + (oh.d || 3);                       // 평타 강화 · 병사: 지속 동안 평타마다 피해 (CStats.hit)
      else if (C && typeof Kits !== 'undefined') hit.forEach(q => Kits.deal(g, p, q, CStats.skillDmg(p, s.key, q), f));
      const ally = s.kind === 'ally' ? (s.shape === 'circle' || s.shape === 'global' ? us : [tg]) : [];
      // 보호막: 스킬 데이터에 보호막이 있으면 실제로 씌운다 (팀원 스킬은 팀원, 아니면 본인). 엔진 1초 ≈ 실제 2초라 지속은 절반
      if (C) { const to = ally.length ? ally.filter(Boolean) : [p]; to.forEach(q => { const sh = CStats.shield(p, s.key, q); if (sh) q.sh = { v: Math.max(q.sh && q.sh.until > g.t ? q.sh.v : 0, sh.v), until: g.t + Math.max(1, Math.round(sh.dur / 2)) }; }); }
      // 채널링(진 궁 · 미스 포츈 궁 등): 그동안 제자리에 선다 (엔진 1초 ≈ 실제 2초)
      if (fx && fx.ch) p.hold = { to: [...p.pos], until: g.t + Math.ceil(fx.ch / 2) };
      g.sk.push({ t: g.t, i: g.pl.indexOf(p), key: s.key, kind: s.kind, shape: s.shape, cc: s.cc, name: form === 'mega' && s.mega ? s.mega : s.name, icon: s.icon, form, fx,
        from: [...p.pos], to, hit: hit.map(q => g.pl.indexOf(q)), miss: dg.miss.map(q => g.pl.indexOf(q)), ally: ally.filter(Boolean).map(q => g.pl.indexOf(q)), big: f.size >= 4 });
      // 해설: 여러 명을 묶은 이니시 궁
      if (s.key === 'R' && hit.length >= 3 && ['up', 'stun', 'pull', 'back'].includes(s.cc) && g.r() < .6)
        Sim.say(g, 'cast', Sim.pick(g, [`${p.name}의 ${s.name}! ${hit.length}명이 한꺼번에 걸립니다!`, `${s.name}! ${Sim.josa(p.name, '이', '가')} ${hit.length}명을 묶어 버려요!`, `들어갑니다! ${Sim.cn(p)}의 ${s.name}, ${hit.length}명 적중!`]));
      };
      one(); if (g.r() < .5) one();
    });
  },
};
// 정글 펫: 몬스터를 잡을수록 자란다 (새끼 → 성장 → 완전 성장). 완전히 자라면 강타가 강화되고 펫 아이템은 칸에서 사라진다 (프로 최종 빌드에 펫 아이템은 없다)
const JunglePet = {
  STAGE_CS: [0, 42, 80],                     // 정글 CS 기준 (실제 프로 정글: 첫 진화 약 5~6분, 완전 성장 약 13~15분)
  NAME: ['새끼', '성장', '완전 성장'],
  stage(p) { return p.role !== 'JGL' ? 0 : this.STAGE_CS.filter(c => p.cs >= c).length; },
  tick(g) {
    g.pl.forEach(p => {
      if (p.role !== 'JGL' || p.dead) return;
      const st = this.stage(p); if (st <= (p.pet || 1)) { p.pet ||= 1; return; }
      p.pet = st;
      // 완전 성장: 펫이 강타에 흡수돼 아이템 칸에서 사라진다 (그 칸에 여섯 번째 아이템이 들어간다)
      if (st === 3) { p.smite2 = g.t; p.petItem = p.build.start; const i = p.inv.findIndex(x => p.build.start && x.n === p.build.start.n); if (i >= 0) p.inv.splice(i, 1); Sim.say(g, 'anal', Sim.pick(g, [`${p.name}의 정글 펫이 다 자랐습니다. 강타가 강화되고 펫 자리는 비었습니다. 이제 아이템 하나를 더 올릴 수 있어요.`, `${Sim.cn(p)} 정글 펫 완전 성장! ${p.name}, 이제 강화된 강타를 씁니다.`])); }
    });
  },
};
(() => { const decide = Sim.decide.bind(Sim); Sim.decide = (g, m) => { decide(g, m); if (!g.over) JunglePet.tick(g); }; })();
