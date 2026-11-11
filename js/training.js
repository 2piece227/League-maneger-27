// 훈련: 팀 훈련 일정 · 개인 훈련 · 스크림 (레이아웃 + 상태 저장, 효과는 TODO)
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
    if (!s.grid) { s.preset = 'stove'; s.grid = this.PRESETS.stove.grid.map(r => r.split(',')); }
    return s;
  },
  today() { return Clock.today(); },

  // ---------- 팀 훈련 일정 ----------
  async schedule(el) {
    await Portal.ready;
    const s = this.plan(), keys = Object.keys(this.ACT);
    const count = {}; s.grid.flat().forEach(a => count[a] = (count[a] || 0) + 1);
    el.innerHTML = `
      <div class="cr-page">
        <div class="card rs-head">
          <div class="rs-title"><h2>팀 훈련 일정</h2><span>칸을 누르면 활동이 바뀝니다 · 훈련 효과(컨디션·숙련도·팀워크)는 준비 중</span></div>
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
          <div class="card"><div class="card-head"><h3>예상 효과 <small>목업</small></h3></div>
            ${Career.meter('컨디션 회복', Math.min(95, 30 + (count.rest || 0) * 7))}
            ${Career.meter('팀워크', Math.min(95, 25 + (count.scrim || 0) * 6 + (count.review || 0) * 3))}
            ${Career.meter('개인 기량', Math.min(95, 25 + (count.ind || 0) * 7 + (count.soloq || 0) * 3))}
            ${Career.meter('피로 누적', Math.min(95, 15 + ((count.scrim || 0) + (count.soloq || 0)) * 4 - (count.rest || 0) * 2), 'inv')}
          </div>
        </div>
      </div>`;
    $('.tr-preset', el).onchange = e => { s.preset = e.target.value; s.grid = this.PRESETS[s.preset].grid.map(r => r.split(',')); this.schedule(el); };
    $('.tr-grid', el).onclick = e => {
      const c = e.target.closest('.tr-cell'); if (!c) return;
      const row = s.grid[+c.dataset.d], i = +c.dataset.s;
      row[i] = keys[(keys.indexOf(row[i]) + 1) % keys.length]; // TODO: 기능 연결 — 하루 진행 시 훈련 효과 반영
      this.schedule(el);
    };
  },

  // ---------- 개인 훈련 ----------
  FOCUS: [['lane', '라인전'], ['macro', '운영·시야'], ['teamfight', '한타'], ['mechanics', '피지컬'], ['champ', '챔피언 연습'], ['mental', '멘탈 관리']],
  INT: [['low', '가볍게'], ['mid', '보통'], ['high', '강하게']],
  async individual(el) {
    await Promise.all([Portal.ready, Mastery.load()]);
    const t = Roster.team(), s = (App.state.individual ||= {});
    el.innerHTML = `
      <div class="cr-page">
        ${Career.head('개인 훈련', '선수마다 집중 분야와 강도를 정합니다. 챔피언 연습은 솔랭 순위의 "연습 챔피언 지시"와 연결됩니다.')}
        <div class="card rs-table-wrap" style="padding:0">
          <table class="rs-table in-table"><thead><tr><th>선수</th><th>집중 분야</th><th>강도</th><th>연습 챔피언</th><th>컨디션</th></tr></thead>
          <tbody>${t.players.map(p => {
            const cur = s[p.id] ||= { focus: this.FOCUS[Math.floor(G.rand(p.id, 'fc') * 4)][0], int: 'mid' };
            const prac = (App.state.practice || {})[p.id];
            const st = Roster.status(p);
            return `<tr data-id="${p.id}">
              <td><div class="pl-cell">${G.face(p, 'pl-ph')}<div><b>${UI.esc(p.name)}</b>${G.pos(p.role)}</div></div></td>
              <td><select class="ch-sort" data-k="focus">${this.FOCUS.map(([v, l]) => `<option value="${v}" ${cur.focus === v ? 'selected' : ''}>${l}</option>`).join('')}</select></td>
              <td><div class="seg in-int">${this.INT.map(([v, l]) => `<button data-k="int" data-v="${v}" class="${cur.int === v ? 'on' : ''}">${l}</button>`).join('')}</div></td>
              <td>${prac ? `<div class="ms-c">${SoloQ.ic(prac.c)}${UI.esc(Champions.byId[prac.c].name)}</div>` : '<a href="#training-soloq" class="cr-dim">지정 안 함 →</a>'}</td>
              <td style="min-width:140px">${Career.meter('', st.condition)}</td>
            </tr>`;
          }).join('')}</tbody></table>
        </div>
      </div>`;
    $('.in-table', el).addEventListener('change', e => { const tr = e.target.closest('tr'); s[tr.dataset.id][e.target.dataset.k] = e.target.value; UI.toast('개인 훈련을 바꿨습니다'); });
    $('.in-table', el).addEventListener('click', e => {
      const b = e.target.closest('button[data-k]'); if (!b) return;
      const tr = b.closest('tr'); s[tr.dataset.id].int = b.dataset.v; // TODO: 기능 연결 — 강도에 따른 성장·피로
      $$('button', b.parentNode).forEach(x => x.classList.toggle('on', x === b));
    });
  },

  scrimState(s) {
    if (!s.status) return '<span class="ot-st seeking">답변 대기</span>';
    if (s.status === 'declined') return '<span class="ot-st stable">거절됨</span>';
    if (s.result) return `<span class="ot-st mine">결과 ${s.result}</span>`;
    return `<span class="ot-st vacant">${Fmt.dayLabel(s.on)} 확정</span>`;
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
        <button class="btn-ghost sm-btn" data-t="${x.id}" ${!avail(x) || b ? 'disabled' : ''}>${b ? '신청함' : '스크림 신청'}</button></div>`;
    };
    el.innerHTML = `
      <div class="cr-page">
        ${Career.head('스크림', '연습 경기 상대를 잡습니다. 답장과 결과는 메시지로 옵니다. 훈련 효과는 준비 중입니다.')}
        <div class="cr-grid">
          <div class="card"><div class="card-head"><h3>같은 리그 팀</h3></div>${others.map(row).join('')}</div>
          <div class="card"><div class="card-head"><h3>해외 팀 (온라인·부트캠프)</h3></div>${intl.map(row).join('')}
            <h4 class="sv-h">신청한 스크림</h4>
            ${booked.length ? booked.map(s => { const x = Schedule.team(s.team); return `<div class="sm-row">${G.team(x, 'xs')}<div><b>${UI.esc(x.name)}</b><span>${s.date.replace(/-/g, '.')} ${s.incoming ? '요청받음' : '신청'} · ${s.sets}세트</span></div>${this.scrimState(s)}</div>`; }).join('') : '<p class="ms-none">아직 신청한 스크림이 없습니다.</p>'}
          </div>
        </div>
      </div>`;
    el.querySelector('.cr-grid').onclick = e => {
      const b = e.target.closest('.sm-btn'); if (!b || b.disabled) return;
      booked.push({ team: b.dataset.t, date: this.today(), sets: 3 }); // TODO: 기능 연결 — 상대 수락·스크림 결과
      UI.toast('스크림을 신청했습니다');
      this.scrims(el);
    };
  },
};

Views['training-schedule'] = el => Training.schedule(el);
Views['training-individual'] = el => Training.individual(el);
Views['training-scrims'] = el => Training.scrims(el);
