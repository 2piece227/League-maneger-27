// 훈련: 팀 훈련 일정(매일 효과: 컨디션 · 팀워크 · 피로) · 개인 훈련 · 스크림
const Training = {
  ACT: {
    scrim: ['스크림', '#3aa0ff'], soloq: ['솔랭', '#a770ff'], review: ['리뷰·분석', '#c8a24a'], ind: ['개인 훈련', '#3fbf7f'],
    meet: ['미팅', '#f0a54a'], media: ['미디어', '#e2577f'], rest: ['휴식', '#3a4660'],
  },
  SLOTS: ['오전', '오후', '저녁'],
  DAYS: ['월', '화', '수', '목', '금', '토', '일'],
  // 시기별 기본 주간 계획
  PRESETS: {
    stove: { label: '스토브 (비시즌)', grid: ['rest,ind,soloq', 'rest,review,soloq', 'rest,ind,soloq', 'meet,scrim,soloq', 'rest,ind,soloq', 'rest,rest,soloq', 'rest,rest,rest'] },
    season: { label: '정규 시즌', grid: ['rest,review,soloq', 'ind,scrim,scrim', 'review,scrim,soloq', 'ind,scrim,scrim', 'meet,review,soloq', 'media,scrim,soloq', 'rest,rest,soloq'] },
    big: { label: '결전 주간 (플레이오프)', grid: ['review,scrim,scrim', 'review,scrim,scrim', 'ind,scrim,review', 'review,scrim,scrim', 'meet,review,rest', 'media,rest,rest', 'rest,rest,rest'] },
  },
  plan() {
    const s = (App.state.training ||= {});
    // 직접 고친 적이 없으면 시기에 맞는 기본 계획을 따른다 (시즌이 시작됐는데 '스토브' 계획이 그대로 남지 않게)
    const want = typeof Market !== 'undefined' && Market.stove(Clock.today()) ? 'stove' : 'season';
    const plain = s.grid && this.PRESETS[s.preset] && JSON.stringify(s.grid) === JSON.stringify(this.PRESETS[s.preset].grid.map(r => r.split(',')));   // 기본 계획 그대로인가 (고친 계획은 건드리지 않는다)
    if (!s.grid || (!s.touched && plain && s.preset !== want && s.preset !== 'big')) { s.preset = want; s.grid = this.PRESETS[want].grid.map(r => r.split(',')); }
    return s;
  },
  today() { return Clock.today(); },

  // ---------- 훈련 효과 (매일) ----------
  // 그날 요일 칸 3개로: 휴식은 컨디션 회복 · 피로 감소, 스크림·리뷰는 팀워크, 솔랭·스크림·강한 개인 훈련은 피로, 미팅은 사기
  // 팀워크(0~10, 처음 5)는 경기에서 팀 힘으로(6 = 다른 팀과 같음, -0.9 ~ +0.6), 피로(0~100)가 60을 넘으면 매일 컨디션이 깎인다
  EFF: { rest: { cond: .25, fat: -12 }, scrim: { tw: .07, fat: 4 }, review: { tw: .05, fat: 1 }, soloq: { fat: 2 }, ind: { fat: 3 }, meet: { mor: 1 }, media: { fat: 1 } },
  st() { const s = (App.state.trainFx ||= { tw: 5, fat: 25 }); return s; },
  dayIdx(d) { return (new Date(d + 'T00:00:00').getDay() + 6) % 7; },   // 월 = 0
  weekFx(grid) {
    const o = { cond: 0, tw: 0, fat: 0, mor: 0 }; grid.flat().forEach(a => { const e = this.EFF[a] || {}; Object.keys(o).forEach(k => { o[k] += e[k] || 0; }); });
    o.tw -= .03 * 7; o.fat -= 3 * 7; return o;   // 팀워크는 하루 0.03씩, 피로는 하루 3씩 자연히 빠진다
  },
  daily(today) {
    const t = Roster.team(); if (!t || App.state.unemployed) return;
    const s = this.plan(), F = this.st(), acts = s.grid[this.dayIdx(today)] || [], ind = App.state.individual || {};
    let cond = 0, tw = -.03, fat = -3, mor = 0;
    acts.forEach(a => { const e = this.EFF[a] || {}; cond += e.cond || 0; tw += e.tw || 0; fat += e.fat || 0; mor += e.mor || 0; });
    F.tw = Math.max(0, Math.min(10, F.tw + tw)); F.fat = Math.max(0, Math.min(100, F.fat + fat));
    const S = Cond.st();
    t.players.forEach(p => {
      if (p.role === 'COACH') return;
      const a = Cond.amp(p), it = (ind[p.id] || {}).int, d = cond + (F.fat > 60 ? -(F.fat - 60) / 80 : F.fat < 25 ? .08 : 0) + (it === 'high' ? -.12 : it === 'low' ? .06 : 0);
      if (d) S.f[p.id] = Math.max(-a, Math.min(a, Math.round(((S.f[p.id] || 0) + d) * 100) / 100));
    });
    if (mor) { const M = World.morale(); t.players.forEach(p => { if ((M[p.id] || 0) < 3 && G.rand(p.id + today, 'mt') < .25) M[p.id] = (M[p.id] || 0) + mor; }); }
  },
  // 경기에 들어가는 팀워크 보정 (tpow 단위, 우리 팀만 — 다른 팀은 늘 보통)
  teamPow(t) { return t && t.id === App.state.teamId && !App.state.unemployed ? (this.st().tw - 6) * .15 : 0; },

  // ---------- 팀 훈련 일정 ----------
  async schedule(el) {
    await Portal.ready;
    const s = this.plan(), keys = Object.keys(this.ACT);
    const count = {}; s.grid.flat().forEach(a => count[a] = (count[a] || 0) + 1);
    el.innerHTML = `
      <div class="cr-page">
        <div class="card rs-head">
          <div class="rs-title"><h2>팀 훈련 일정</h2><span>칸을 누르면 활동이 바뀝니다 · 매일 그날 요일의 계획대로 컨디션 · 팀워크 · 피로가 움직입니다</span></div>
          <select class="ch-sort tr-preset">${Object.entries(this.PRESETS).map(([k, p]) => `<option value="${k}" ${s.preset === k ? 'selected' : ''}>${p.label}</option>`).join('')}</select>
        </div>
        <div class="card tr-wrap">
          <div class="tr-grid">
            <div></div>${this.DAYS.map(d => `<div class="tr-day">${d}</div>`).join('')}
            ${this.SLOTS.map((sl, i) => `<div class="tr-slot">${sl}</div>${s.grid.map((day, j) => { const a = day[i], [l, c] = this.ACT[a]; return `<button class="tr-cell" data-d="${j}" data-s="${i}" style="--c:${c}">${l}</button>`; }).join('')}`).join('')}
          </div>
        </div>
        <div class="cr-grid">
          <div class="card"><div class="card-head"><h3>주간 비중</h3></div>
            ${keys.map(k => { const v = Math.round((count[k] || 0) / 21 * 100); return `<div class="cr-meter"><span><i class="tr-dot" style="background:${this.ACT[k][1]}"></i>${this.ACT[k][0]}</span><div class="cr-bar"><i style="width:${v}%;background:${this.ACT[k][1]}"></i></div><b class="num">${count[k] || 0}</b></div>`; }).join('')}
          </div>
          ${(() => { const F = this.st(), w = this.weekFx(s.grid), sg = v => (v > 0 ? '▲' : v < 0 ? '▼' : '–') + ' ' + Math.abs(v).toFixed(1);
            return `<div class="card"><div class="card-head"><h3>지금 상태 · 이 계획의 한 주</h3></div>
            ${Career.meter('팀워크', Math.round(F.tw * 10))}<p class="tr-fx">${(() => { const d = Math.round(w.tw * 100) / 10; return d >= .1 ? `이 계획이면 한 주에 약 ${d} 오릅니다.` : d <= -.1 ? `이 계획이면 한 주에 약 ${-d} 떨어집니다.` : '이 계획이면 지금 수준을 유지합니다.'; })()} 스크림과 리뷰로 오르고, 안 하면 조금씩 떨어집니다. 60을 넘으면 경기에서 다른 팀보다 손발이 잘 맞습니다.</p>
            ${Career.meter('피로', Math.round(F.fat), 'inv')}<p class="tr-fx">${w.fat <= -F.fat ? '쉬는 날이 넉넉해 한 주면 피로가 거의 풀립니다.' : w.fat < 0 ? `이 계획이면 한 주에 약 ${Math.round(-w.fat)} 줄어듭니다.` : `이 계획이면 한 주에 약 ${Math.round(w.fat)} 쌓입니다.`} 60을 넘으면 매일 선수 컨디션이 깎이고, 25 아래면 조금씩 오릅니다.</p>
            <p class="tr-fx">휴식은 컨디션을 회복하고, 미팅은 선수 사기를 올리고, 솔랭은 개인 훈련에서 정한 연습 챔피언 숙련도를 올립니다.</p></div>`; })()}
        </div>
      </div>`;
    $('.tr-preset', el).onchange = e => { s.preset = e.target.value; s.touched = true; s.grid = this.PRESETS[s.preset].grid.map(r => r.split(',')); this.schedule(el); };
    $('.tr-grid', el).onclick = e => {
      const c = e.target.closest('.tr-cell'); if (!c) return;
      const row = s.grid[+c.dataset.d], i = +c.dataset.s;
      row[i] = keys[(keys.indexOf(row[i]) + 1) % keys.length]; s.touched = true;
      this.schedule(el);
    };
  },

  // ---------- 개인 훈련 ----------
  FOCUS: [['lane', '라인전'], ['macro', '운영·시야'], ['teamfight', '한타'], ['mechanics', '피지컬'], ['champ', '챔피언 연습'], ['mental', '멘탈 관리']],
  INT: [['low', '가볍게'], ['mid', '보통'], ['high', '강하게']],
  async individual(el) {
    await Promise.all([Portal.ready, Mastery.load(), Champions.load()]);
    const t = Roster.team(), s = (App.state.individual ||= {});
    el.innerHTML = `
      <div class="cr-page">
        ${Career.head('개인 훈련', `선수마다 집중 분야와 강도를 정합니다. 연습 챔피언은 다음 날부터 ${SoloQ.PRACTICE_DAYS}일 동안 솔랭에서 그 챔피언을 자주 하게 합니다.`)}
        <div class="card rs-table-wrap" style="padding:0">
          <table class="rs-table in-table"><thead><tr><th>선수</th><th>집중 분야</th><th>강도</th><th>연습 챔피언</th><th>컨디션</th></tr></thead>
          <tbody>${t.players.map(p => {
            const cur = s[p.id] ||= { focus: this.FOCUS[Math.floor(G.rand(p.id, 'fc') * 4)][0], int: 'mid' };
            const prac = (App.state.practice || {})[p.id];
            const st = Roster.status(p);
            return `<tr data-id="${p.id}">
              <td><div class="pl-cell">${G.face(p, 'pl-ph')}<div>${G.ovr(p)}<b>${UI.esc(p.name)}</b>${G.pos(p.role)}</div></div></td>
              <td><select class="ch-sort" data-k="focus">${this.FOCUS.map(([v, l]) => `<option value="${v}" ${cur.focus === v ? 'selected' : ''}>${l}</option>`).join('')}</select></td>
              <td><div class="seg in-int">${this.INT.map(([v, l]) => `<button data-k="int" data-v="${v}" class="${cur.int === v ? 'on' : ''}">${l}</button>`).join('')}</div></td>
              <td><div class="ms-c">${prac ? SoloQ.ic(prac.c) : ''}<select class="ch-sort" data-k="prac"><option value="">지정 안 함</option>${Champions.list.filter(c => c.positions.includes(p.role)).sort((a, b) => a.name.localeCompare(b.name, 'ko')).map(c => `<option value="${c.id}" ${prac && prac.c === c.id ? 'selected' : ''}>${UI.esc(c.name)}</option>`).join('')}</select>${prac ? `<small class="cr-dim">${prac.from === SoloQ.today() ? '내일부터' : SoloQ.pracDaysLeft(p.id) > 0 ? `${SoloQ.pracDaysLeft(p.id)}일 남음` : '끝'}</small>` : ''}</div></td>
              <td style="min-width:140px">${Career.meter('', st.condition)}</td>
            </tr>`;
          }).join('')}</tbody></table>
        </div>
      </div>`;
    $('.in-table', el).addEventListener('change', e => {
      const tr = e.target.closest('tr');
      if (e.target.dataset.k === 'prac') { SoloQ.setPractice(tr.dataset.id, e.target.value || null); UI.toast(e.target.value ? '연습 챔피언을 지정했습니다. 내일부터 반영됩니다' : '연습 지시를 거뒀습니다'); this.individual(el); return; }
      s[tr.dataset.id][e.target.dataset.k] = e.target.value; UI.toast('개인 훈련을 바꿨습니다');
    });
    $('.in-table', el).addEventListener('click', e => {
      const b = e.target.closest('button[data-k]'); if (!b) return;
      const tr = b.closest('tr'); s[tr.dataset.id].int = b.dataset.v;   // 강도: 강하게는 매일 컨디션 -0.12, 가볍게는 +0.06 (Training.daily)
      $$('button', b.parentNode).forEach(x => x.classList.toggle('on', x === b));
    });
  },

  scrimState(s) {
    if (!s.status) return '<span class="ot-st seeking">답변 대기</span>';
    if (s.status === 'declined') return '<span class="ot-st stable">거절됨</span>';
    if (s.status === 'cancelled') return '<span class="ot-st stable">취소됨 (공식전)</span>';
    if (s.result) return `<span class="ot-st mine">결과 ${s.result}</span>`;
    return `<span class="ot-st vacant">${Fmt.dayLabel(s.on)} 확정${s.on === this.today() ? ' · 오늘' : ''}</span>`;
  },

  // ---------- 스크림 ----------
  async scrims(el) {
    await Portal.ready;
    const t = Roster.team(), booked = (App.state.scrims ||= []);
    const others = App.db.teams.filter(x => x.id !== t.id && x.league === t.league);
    const intl = App.db.teams.filter(x => x.league !== t.league).sort((a, b) => (b.rep || 0) - (a.rep || 0)).slice(0, 4);
    const avail = x => G.rand(x.id, 'scrim:' + this.today()) > .35;
    const row = x => {
      const b = booked.find(s => s.team === x.id && (!s.status || (s.status === 'accepted' && !s.result)));
      return `<div class="sm-row">${G.team(x, 'sm')}<div><b>${UI.esc(x.name)}</b><span>${x.league} · ${UI.stars(x.rep || 2)}</span></div>
        <span class="sm-av ${avail(x) ? 'ok' : 'no'}">${avail(x) ? '이번 주 가능' : '일정 꽉 참'}</span>
        <button class="btn-ghost sm-btn" data-t="${x.id}" ${!avail(x) || b ? 'disabled' : ''}>${b ? '신청함' : '신청'}</button></div>`;
    };
    el.innerHTML = `
      <div class="cr-page">
        ${Career.head('스크림', '날짜와 판수를 정해 신청합니다. 상대가 수락하면 그날 계속 버튼이 "스크림으로"가 되고, 실제 경기처럼 밴픽 → 전술 → 관전으로 치릅니다. 공식 기록에는 남지 않습니다.')}
        ${Scrim.today() ? `<div class="card nx-draft"><span>오늘 ${UI.esc(Sim.josa(Schedule.team(Scrim.today().team).name, '과', '와'))} 스크림이 있습니다.</span><button class="btn-primary sm-go">스크림 시작</button></div>` : ''}
        <div class="cr-grid">
          <div class="card"><div class="card-head"><h3>같은 리그 팀</h3></div>${others.map(row).join('')}</div>
          <div class="card"><div class="card-head"><h3>해외 팀 (온라인·부트캠프)</h3></div>${intl.map(row).join('')}
            <h4 class="sv-h">신청한 스크림</h4>
            ${booked.length ? booked.slice().reverse().slice(0, 12).map(s => { const x = Schedule.team(s.team); return `<div class="sm-row">${G.team(x, 'xs')}<div><b>${UI.esc(x.name)}</b><span>${s.on ? Fmt.dayLabel(s.on) : s.date.replace(/-/g, '.')} · ${s.incoming ? '요청받음' : '신청'} · ${s.sets}판</span></div>${this.scrimState(s)}</div>`; }).join('') : '<p class="ms-none">아직 신청한 스크림이 없습니다.</p>'}
          </div>
        </div>
      </div>`;
    const go = el.querySelector('.sm-go'); if (go) go.onclick = () => Scrim.go();
    el.querySelector('.cr-grid').onclick = e => {
      const b = e.target.closest('.sm-btn'); if (!b || b.disabled) return;
      const x = Schedule.team(b.dataset.t), days = Scrim.days(x.id);
      if (!days.length) { UI.toast('앞으로 7일 안에 양 팀 모두 비는 날이 없습니다'); return; }
      UI.modal({ title: `${x.name} 스크림 신청`, body: `<label class="rg-row"><span>날짜</span><select class="ch-sort sm-day">${days.map(d => `<option value="${d}">${Fmt.dayLabel(d)}</option>`).join('')}</select></label>
        <label class="rg-row"><span>판수</span><select class="ch-sort sm-sets"><option value="3">3판</option><option value="5">5판</option><option value="2">2판</option></select></label><p class="cr-dim">공식전이 있는 날은 고를 수 없습니다.</p>`,
        actions: [{ label: '취소' }, { label: '신청', primary: true, onClick: () => {
          const on = document.querySelector('.sm-day').value, sets = +document.querySelector('.sm-sets').value;
          booked.push({ id: 's' + Date.now().toString(36), team: x.id, date: this.today(), on, sets }); UI.toast('스크림을 신청했습니다'); this.scrims(el);
        } }] });
    };
  },
};

Views['training-schedule'] = el => Training.schedule(el);
Views['training-individual'] = el => Training.individual(el);
Views['training-scrims'] = el => Training.scrims(el);
window.addEventListener("DOMContentLoaded", () => Engine.on(today => Training.daily(today)));
