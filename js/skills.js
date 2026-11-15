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
      return { key, name: names[0], mega: names[1] || null, icon: s.icon || ch.icon, ...(t ? { kind, shape: shape === 'self' ? '' : shape, cc } : this.auto(s, key)) };
    }));
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
      const cd = (p.skc ||= {}), ready = s => s.key === 'R' ? g.t >= (p.rFx || 0) && m >= 6 && !Sim.ULT_JOIN.includes(p.c) && !(s.shape === 'global' && s.kind === 'dash') : g.t >= (cd[s.key] || 0);
      const S = this.of(p.c).filter(ready); if (!S.length) return;
      const foes = live.filter(q => q.side !== p.side && !q.fled), us = live.filter(q => q.side === p.side);
      const early = g.t - f.t0 <= 1, front = p.kind === 'tank' || p.kind === 'bruiser' || p.kind === 'dive', low = p.hp < .3 || p.fled;
      const pick = (...ks) => S.filter(s => ks.includes(s.kind));
      let opts;
      if (low) opts = pick('esc', 'dash', 'self');
      else if (early && front) opts = pick('init', 'dash');
      else if (p.kind === 'ench') opts = pick('ally', 'atk');
      else opts = pick('atk', 'init', 'self', 'dash');
      if (!opts.length || g.r() > (early && front ? .9 : .5)) return;
      // 궁극기: 한타(4인 이상)에서만, 이니시 궁은 초반에 · 나머지는 싸움이 무르익은 뒤
      let s = opts.find(x => x.key !== 'R') || opts[0];
      const R = opts.find(x => x.key === 'R');
      if (R && f.size >= 4 && (R.kind === 'init' ? early || g.r() < .35 : g.t - f.t0 >= 2 && g.r() < .45)) s = R;
      if (s.key === 'R' && f.size < 4) { s = opts.find(x => x.key !== 'R'); if (!s) return; }
      const tg = s.kind === 'ally' ? us.filter(q => q !== p).sort((a, b) => a.hp - b.hp)[0] || p
        : p.hitTo && !p.hitTo.dead && foes.includes(p.hitTo) ? p.hitTo : foes.sort((a, b) => D(a.pos, p.pos) - D(b.pos, p.pos))[0];
      if (!tg && s.kind !== 'self' && s.kind !== 'esc') return;
      if (s.key === 'R') p.rFx = g.t + 90; else cd[s.key] = g.t + this.CD[s.key] + g.r() * 2;
      const to = s.kind === 'self' ? [...p.pos] : s.kind === 'esc' ? Sim.toward(p.pos, p.side, 6) : [...tg.pos];
      // 맞은 적 (원형 4 · 부채꼴 5 · 직선 폭 2 · 전역은 체력 낮은 적 전부)
      const seg = (a, b, q) => { const vx = b[0] - a[0], vy = b[1] - a[1], L = vx * vx + vy * vy || 1, u = Math.max(0, Math.min(1, ((q[0] - a[0]) * vx + (q[1] - a[1]) * vy) / L)); return D(q, [a[0] + vx * u, a[1] + vy * u]); };
      const hit = s.kind === 'ally' || s.kind === 'self' || s.kind === 'esc' ? [] : s.shape === 'global' ? foes
        : s.shape === 'circle' ? foes.filter(q => D(q.pos, to) < 4) : s.shape === 'cone' ? foes.filter(q => D(q.pos, p.pos) < 6 && D(q.pos, to) < 5)
        : s.shape === 'line' ? foes.filter(q => seg(p.pos, to, q.pos) < 2) : tg ? [tg] : [];
      const ally = s.kind === 'ally' ? (s.shape === 'circle' || s.shape === 'global' ? us : [tg]) : [];
      const form = this.FORM[p.c] === 'mega' ? (s.key === 'R' || (p.mega || 0) > g.t || (m >= 8 && g.r() < .45) ? 'mega' : '') : '';
      if (form === 'mega') p.mega = Math.max(p.mega || 0, g.t + 6);
      g.sk.push({ t: g.t, i: g.pl.indexOf(p), key: s.key, kind: s.kind, shape: s.shape, cc: s.cc, name: form === 'mega' && s.mega ? s.mega : s.name, icon: s.icon, form,
        from: [...p.pos], to, hit: hit.map(q => g.pl.indexOf(q)), ally: ally.filter(Boolean).map(q => g.pl.indexOf(q)), big: f.size >= 4 });
      // 해설: 여러 명을 묶은 이니시 궁
      if (s.key === 'R' && hit.length >= 3 && ['up', 'stun', 'pull', 'back'].includes(s.cc) && g.r() < .6)
        Sim.say(g, 'cast', Sim.pick(g, [`${p.name}의 ${s.name}! ${hit.length}명이 한꺼번에 걸립니다!`, `${s.name}! ${Sim.josa(p.name, '이', '가')} ${hit.length}명을 묶어 버려요!`, `들어갑니다! ${Sim.cn(p)}의 ${s.name}, ${hit.length}명 적중!`]));
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
