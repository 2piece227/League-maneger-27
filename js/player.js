// 선수: 프로필 창 · 재계약/영입 문의 창 · 로스터 > 선수 비교 · 계약 현황 · 컨디션·폼
// 연봉·이적료는 목업 추정치. TODO: 기능 연결 — 실제 계약 데이터·협상 시스템
const Player = {
  all() { return App.db.teams.flatMap(t => [...t.players, ...(t.staff || [])].map(p => ({ p, t }))); },
  find(id) { return this.all().find(x => x.p.id === id) || null; },
  team() { return Roster.team(); },
  today() { return Clock.today(); },
  isMine(t) { return t && t.id === App.state.teamId; },
  shortlist() { return (App.state.shortlist ||= []); },

  // 목업 연봉(억 원) · 시장가치: 구단 재정·주전 여부·시그니처·나이로
  salary(p, t) {
    const sig = (typeof Mastery !== 'undefined' && Mastery.pools) ? Mastery.signatures(p.id).length : 0;
    const base = { LCK: 1.6, LPL: 2.0, LEC: 1.0, LCS: 1.2 }[t.league] || 1;
    let v = base * (0.5 + (t.fin || 2) * 0.35) * (p.sub ? 0.45 : 1) * (1 + sig * 0.35) * (0.75 + G.rand(p.id, 'pay') * 0.6);
    if (p.role === 'COACH') v *= 0.55;
    return Math.max(0.3, Math.round(v * 10) / 10);
  },
  value(p, t) {
    const age = p.age || 22;
    const ageMul = age <= 21 ? 1.4 : age <= 24 ? 1.2 : age <= 27 ? 1 : 0.7;
    return Math.round(this.salary(p, t) * 1.8 * ageMul * 10) / 10;
  },
  money(v) { return v >= 10 ? `${Math.round(v)}억` : `${v.toFixed(1)}억`; },
  days(p) { return p.contractEnd ? Fmt.daysBetween(this.today(), p.contractEnd) : null; },
  contractState(p) {
    const d = this.days(p);
    if (d == null) return ['정보 없음', 'na'];
    if (d < 0) return ['계약 만료 (FA)', 'fa'];
    if (d <= 60) return [`D-${d} · 만료 임박`, 'soon'];
    if (d <= 365) return ['1년 이내 만료', 'mid'];
    return ['장기 계약', 'ok'];
  },
  roleLabel(p) { return p.role === 'COACH' ? '코칭스태프' : G.ROLE_KO[p.role] || p.role; },

  // ---------- 프로필 창 ----------
  async open(id) {
    await Promise.all([Portal.ready, Mastery.load()]);
    const hit = this.find(id);
    if (!hit) return;
    const { p, t } = hit;
    const st = p.role !== 'COACH' ? Roster.status(p) : null;
    const pool = Mastery.pool(p.id);
    const sq = (SoloQ.cache || SoloQ.build()).ladder.find(a => a.player && a.player.id === p.id);
    const [cs, cc] = this.contractState(p);
    const listed = this.shortlist().includes(p.id);
    document.querySelectorAll('.pp-back').forEach(x => x.remove());
    const back = document.createElement('div');
    back.className = 'pp-back';
    back.innerHTML = `
      <div class="pp" role="dialog" aria-modal="true">
        <button class="pp-x" aria-label="닫기">×</button>
        <div class="pp-head" style="--c:${t.color || '#555'}">
          ${G.face(p, 'pp-photo')}
          <div class="pp-id">
            <div class="pp-team">${G.team(t, 'xs')}<span>${UI.esc(t.name)}</span>${p.sub ? '<i class="sub-tag">후보</i>' : ''}</div>
            <h2>${UI.esc(p.name)}</h2>
            <div class="pp-sub">${UI.esc(p.nativeName || p.realName || '')}${p.realName && p.nativeName ? ` · ${UI.esc(p.realName)}` : ''}</div>
            <div class="pp-tags">${p.role !== 'COACH' ? G.pos(p.role, true) : '<span class="ch-tag">코칭스태프</span>'}<span class="nat">${G.flag(p.nation)} ${G.nationName(p.nation)}</span>${p.age ? `<span>${p.age}세</span>` : ''}</div>
          </div>
          <div class="pp-val"><span>시장 가치 (추정)</span><b>${this.money(this.value(p, t))}</b></div>
        </div>
        <div class="pp-body">
          <div class="pp-col">
            <h4>계약</h4>
            <dl class="cr-dl">
              <dt>소속</dt><dd>${UI.esc(t.name)} (${t.league})</dd>
              <dt>계약 만료</dt><dd>${p.contractEnd ? p.contractEnd.replace(/-/g, '.') : '-'} <span class="ct-st ${cc}">${cs}</span></dd>
              <dt>연봉 (추정)</dt><dd>${this.money(this.salary(p, t))} 원</dd>
              <dt>생년월일</dt><dd>${p.birthdate ? p.birthdate.replace(/-/g, '.') : '-'}</dd>
            </dl>
            ${st ? `<h4>상태</h4>
              ${Career.meter('컨디션', st.condition)}
              <div class="pp-morale"><span>사기</span><b class="morale ${Roster.MORALE[st.morale][1]}">${Roster.MORALE[st.morale][0]}</b></div>
              <div class="pp-morale"><span>최근 폼</span><span class="form-pts">${st.form.map(v => `<i class="${+v >= 12 ? 'hi' : +v >= 8 ? 'mid' : 'lo'}">${v}</i>`).join('')}</span></div>` : ''}
            ${sq ? `<h4>솔랭</h4><p class="pp-line">${SoloQ.SERVER[t.league]} 서버 <b>${sq.rank}위</b> · ${sq.lpNow.toLocaleString()} LP · 승률 ${SoloQ.wr(sq)}%</p>` : ''}
          </div>
          <div class="pp-col">
            ${p.role !== 'COACH' ? `<h4>챔피언 폭 <small>최근 3시즌 프로 경기</small></h4>
              ${pool.length ? `<div class="ms-sigs pp-pool">${pool.slice(0, 8).map(e => Mastery.chip(e, true)).join('')}</div>` : '<p class="ms-none">프로 경기 기록이 없습니다.</p>'}
              <a class="pp-link" href="#roster-mastery">숙련도 자세히 →</a>` : `<h4>코칭 정보</h4><p class="ms-none">직책 구분 정보가 아직 없습니다.</p>`}
          </div>
        </div>
        <div class="pp-foot">
          <button class="btn-ghost pp-list">${listed ? '관심 목록에서 빼기' : '관심 목록에 추가'}</button>
          ${this.isMine(t) ? '<button class="btn-primary pp-talk">재계약 협상</button>' : '<button class="btn-primary pp-ask">영입 문의</button>'}
        </div>
      </div>`;
    document.body.appendChild(back);
    const close = () => { back.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = e => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    back.addEventListener('click', e => { if (e.target === back || e.target.closest('.pp-x') || e.target.closest('.pp-link')) close(); });
    $('.pp-list', back).onclick = () => { this.toggleShortlist(p.id); close(); this.open(id); };
    const talk = $('.pp-talk', back), ask = $('.pp-ask', back);
    if (talk) talk.onclick = () => this.contractModal(p.id);
    if (ask) ask.onclick = () => this.inquiryModal(p.id);
  },

  toggleShortlist(id) {
    const L = this.shortlist(), i = L.indexOf(id);
    if (i >= 0) L.splice(i, 1); else L.push(id);
    UI.toast(i >= 0 ? '관심 목록에서 뺐습니다' : '관심 목록에 추가했습니다');
  },

  // 재계약 협상 (레이아웃만)
  contractModal(id) {
    const { p, t } = this.find(id);
    const cur = this.salary(p, t);
    UI.modal({
      title: `${p.name} — 재계약 협상`,
      body: `
        <div class="neg">
          <div class="neg-row"><span>현재 연봉</span><b>${this.money(cur)} 원</b></div>
          <div class="neg-row"><span>선수 요구 (에이전트)</span><b>${this.money(cur * (1.15 + G.rand(p.id, 'ask') * .3))} 원 · ${G.rand(p.id, 'yrs') > .5 ? 2 : 1}년</b></div>
          <label class="field"><span>제시 연봉 (억 원)</span><input type="number" step="0.1" min="0.1" value="${cur.toFixed(1)}"></label>
          <label class="field"><span>계약 기간</span><select><option>1년</option><option selected>2년</option><option>3년</option></select></label>
          <label class="field"><span>옵션</span><select><option>없음</option><option>우승 보너스</option><option>국제대회 출전 보너스</option><option>바이아웃 조항</option></select></label>
          <p class="cr-note">협상 기능은 준비 중입니다. 제안을 보내도 아직 답이 오지 않습니다.</p>
        </div>`,
      actions: [{ label: '취소' }, { label: '제안 보내기', primary: true, onClick: () => UI.toast('제안을 보냈습니다 (협상 기능 준비 중)') }], // TODO: 기능 연결 — 협상 응답
    });
  },
  inquiryModal(id) {
    const { p, t } = this.find(id);
    UI.modal({
      title: `${p.name} — 영입 문의`,
      body: `
        <div class="neg">
          <div class="neg-row"><span>소속</span><b>${UI.esc(t.name)}</b></div>
          <div class="neg-row"><span>계약 만료</span><b>${p.contractEnd ? p.contractEnd.replace(/-/g, '.') : '-'}</b></div>
          <div class="neg-row"><span>예상 이적료 (추정)</span><b>${this.days(p) != null && this.days(p) < 0 ? '없음 (FA)' : this.money(this.value(p, t)) + ' 원'}</b></div>
          <label class="field"><span>문의 방식</span><select><option>구단에 이적 문의</option><option>임대 문의</option><option>계약 만료 후 FA 접촉 예약</option></select></label>
          <p class="cr-note">문의는 영입 › 이적 제안에 기록됩니다.</p>
        </div>`,
      actions: [{ label: '취소' }, {
        label: '문의 보내기', primary: true, onClick: () => {
          (App.state.offers ||= []).push({ id: p.id, team: t.id, date: this.today(), status: '답변 대기' }); // TODO: 기능 연결 — 구단 응답
          UI.toast('영입 문의를 보냈습니다');
        },
      }],
    });
  },

  // ---------- 로스터 > 선수 비교 ----------
  cmp: [null, null],
  async compare(el) {
    await Promise.all([Portal.ready, Mastery.load()]);
    const mine = this.team().players;
    if (!this.cmp[0]) this.cmp = [mine[0]?.id, mine[1]?.id];
    const opts = sel => App.db.teams.map(t => `<optgroup label="${UI.esc(t.name)}">${t.players.map(p => `<option value="${p.id}" ${p.id === sel ? 'selected' : ''}>${UI.esc(p.name)} (${p.role})</option>`).join('')}</optgroup>`).join('');
    const card = (id, i) => {
      const hit = this.find(id);
      if (!hit) return '<div class="card"></div>';
      const { p, t } = hit;
      const st = Roster.status(p);
      const pool = Mastery.pool(p.id);
      const sq = (SoloQ.cache || SoloQ.build()).ladder.find(a => a.player && a.player.id === p.id);
      return `
        <div class="card cmp-card">
          <select class="ch-sort cmp-sel" data-i="${i}">${opts(id)}</select>
          <div class="cmp-head">${G.face(p, 'pl-ph')}<div><b>${UI.esc(p.name)}</b><span>${G.team(t, 'xs')} ${UI.esc(t.short)} · ${G.pos(p.role, true)}</span></div></div>
          <dl class="cr-dl">
            <dt>나이</dt><dd>${p.age || '-'}세</dd>
            <dt>국적</dt><dd>${G.flag(p.nation)} ${G.nationName(p.nation)}</dd>
            <dt>계약 만료</dt><dd>${p.contractEnd ? p.contractEnd.replace(/-/g, '.') : '-'}</dd>
            <dt>연봉 (추정)</dt><dd>${this.money(this.salary(p, t))}</dd>
            <dt>시장 가치</dt><dd>${this.money(this.value(p, t))}</dd>
            <dt>솔랭</dt><dd>${sq ? `${sq.rank}위 · ${SoloQ.wr(sq)}%` : '100위 밖'}</dd>
          </dl>
          ${Career.meter('컨디션', st.condition)}
          <h4>시그니처·주력 챔피언</h4>
          <div class="ms-chips">${pool.slice(0, 6).map(e => Mastery.chip(e)).join('') || '<span class="ms-none">기록 없음</span>'}</div>
          <div class="cmp-stats">
            <div><span>챔피언 폭 (9+)</span><b>${pool.filter(e => e.m >= 9).length}</b></div>
            <div><span>시그니처</span><b>${pool.filter(e => e.sig).length}</b></div>
            <div><span>3시즌 판수</span><b>${pool.reduce((s, e) => s + e.g, 0)}</b></div>
          </div>
        </div>`;
    };
    el.innerHTML = `
      <div class="cr-page">
        ${Career.head('선수 비교', '리그 전체 선수 중 두 명을 골라 비교합니다. 능력치는 기본값이라 아직 비교하지 않습니다.')}
        <div class="cmp-grid">${card(this.cmp[0], 0)}<div class="cmp-vs">VS</div>${card(this.cmp[1], 1)}</div>
      </div>`;
    $$('.cmp-sel', el).forEach(s => s.onchange = () => { this.cmp[+s.dataset.i] = s.value; this.compare(el); });
  },

  // ---------- 로스터 > 계약 현황 ----------
  async contracts(el) {
    await Promise.all([Portal.ready, Mastery.load()]);
    const t = this.team();
    const rows = [...t.players, ...(t.staff || [])].sort((a, b) => (a.contractEnd || '9').localeCompare(b.contractEnd || '9'));
    const total = t.players.reduce((s, p) => s + this.salary(p, t), 0);
    const soon = rows.filter(p => { const d = this.days(p); return d != null && d <= 60; });
    el.innerHTML = `
      <div class="cr-page">
        <div class="card rs-head">
          <div class="rs-title"><h2>계약 현황 <small>${UI.esc(t.name)}</small></h2><span>연봉은 구단 재정·주전 여부 기반 추정치입니다</span></div>
          <div class="rs-stats">
            <div><span class="k">선수 연봉 합계</span><b>${this.money(total)}</b></div>
            <div><span class="k">60일 내 만료</span><b class="${soon.length ? 'warn' : ''}">${soon.length}</b></div>
            <div><span class="k">계약 인원</span><b>${rows.length}</b></div>
          </div>
        </div>
        <div class="card rs-table-wrap" style="padding:0">
          <table class="rs-table ct-table">
            <thead><tr><th>이름</th><th>역할</th><th>계약 만료</th><th>상태</th><th class="num">연봉 (추정)</th><th>남은 기간</th><th></th></tr></thead>
            <tbody>${rows.map(p => {
              const d = this.days(p), [cs, cc] = this.contractState(p);
              const pct = d == null ? 0 : Math.max(2, Math.min(100, d / 1095 * 100));
              return `<tr data-id="${p.id}">
                <td><div class="pl-cell">${G.face(p, 'pl-ph')}<div><b>${UI.esc(p.name)}</b><small class="pl-real">${UI.esc(p.nativeName || p.realName || '')}</small></div></div></td>
                <td>${p.role === 'COACH' ? '코칭스태프' : G.pos(p.role, true)}</td>
                <td class="num">${p.contractEnd ? p.contractEnd.replace(/-/g, '.') : '-'}</td>
                <td><span class="ct-st ${cc}">${cs}</span></td>
                <td class="num">${this.money(this.salary(p, t))}</td>
                <td><div class="ct-bar"><i class="${cc}" style="width:${pct}%"></i></div></td>
                <td><button class="btn-ghost ct-btn" data-id="${p.id}">${d != null && d < 0 ? '재계약 제안' : '협상'}</button></td>
              </tr>`;
            }).join('')}</tbody>
          </table>
        </div>
      </div>`;
    $('.ct-table tbody', el).onclick = e => {
      const b = e.target.closest('.ct-btn');
      if (b) { this.contractModal(b.dataset.id); return; }
      const tr = e.target.closest('tr[data-id]');
      if (tr) this.open(tr.dataset.id);
    };
  },

  // ---------- 로스터 > 컨디션·폼 ----------
  async condition(el) {
    await Portal.ready;
    const t = this.team();
    // 목업 피로도·훈련 부하. TODO: 기능 연결 — 훈련·경기·솔랭 판수로 계산
    const extra = p => ({ fatigue: Math.round(10 + G.rand(p.id, 'fat') * 50), load: ['낮음', '보통', '높음'][Math.floor(G.rand(p.id, 'load') * 3)], sleep: (6 + G.rand(p.id, 'slp') * 2.5).toFixed(1) });
    el.innerHTML = `
      <div class="cr-page">
        ${Career.head('컨디션·폼', `${UI.esc(t.name)} 선수단 상태. 스토브 기간이라 경기 폼은 지난 시즌 마지막 5경기 평점입니다.`)}
        <div class="cd-grid">${t.players.map(p => {
          const st = Roster.status(p), x = extra(p);
          const avg = (st.form.reduce((s, v) => s + +v, 0) / st.form.length).toFixed(1);
          return `
          <div class="card cd-card" data-id="${p.id}">
            <div class="cd-head">${G.face(p, 'pl-ph')}<div><b>${UI.esc(p.name)}</b>${G.pos(p.role, true)}${p.sub ? '<i class="sub-tag">후보</i>' : ''}</div><span class="morale ${Roster.MORALE[st.morale][1]}">${Roster.MORALE[st.morale][0]}</span></div>
            ${Career.meter('컨디션', st.condition)}
            ${Career.meter('피로도', x.fatigue, 'inv')}
            <div class="cd-form"><span>최근 폼</span>
              <svg viewBox="0 0 100 30" preserveAspectRatio="none"><polyline fill="none" stroke="var(--gold)" stroke-width="2" points="${st.form.map((v, i) => `${i * 25},${30 - (+v - 4) * 2.2}`).join(' ')}"/></svg>
              <b class="num">${avg}</b></div>
            <div class="cd-meta"><span>훈련 부하 <b>${x.load}</b></span><span>평균 수면 <b>${x.sleep}h</b></span><span>부상 <b>없음</b></span></div>
          </div>`;
        }).join('')}</div>
      </div>`;
    $('.cd-grid', el).onclick = e => { const c = e.target.closest('.cd-card'); if (c) this.open(c.dataset.id); };
  },
};

Views['roster-compare'] = el => Player.compare(el);
Views['roster-contracts'] = el => Player.contracts(el);
Views['roster-condition'] = el => Player.condition(el);
