// 선수: 프로필 창 · 재계약/영입 문의 창 · 로스터 > 선수 비교 · 계약 현황 · 컨디션·폼
// 연봉·이적료는 목업 추정치. TODO: 기능 연결 — 실제 계약 데이터·협상 시스템
const Player = {
  all() { return [...App.db.teams, ...(App.db.free ? [App.db.free] : [])].flatMap(t => [...t.players, ...(t.cl || []), ...(t.academy || []), ...(t.staff || [])].map(p => ({ p, t }))); },
  MILITARY: { exempt: ['병역 혜택', 'ok'], served: ['군필', 'ok'], none: ['미필', 'soon'] },
  military(p) { const m = this.MILITARY[p.military]; return m ? `<span class="ct-st ${m[1]}">${m[0]}</span>` : ''; },
  find(id) { return this.all().find(x => x.p.id === id) || null; },
  team() { return Roster.team(); },
  today() { return Clock.today(); },
  isMine(t) { return t && t.id === App.state.teamId; },
  shortlist() { return (App.state.shortlist ||= []); },

  // 연봉·시장가치(억 원)는 js/contract.js
  salary(p, t) { return Contract.of(p, t).salary; },
  value(p, t) { return Contract.value(p, t); },
  money(v) { return v >= 100 ? `${Math.round(v)}억` : `${(+v.toFixed(1)).toString()}억`; },
  days(p) { return p.contractEnd ? Fmt.daysBetween(this.today(), p.contractEnd) : null; },
  contractState(p) {
    if (p.free) return ['무소속', 'fa'];
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
    await Promise.all([Portal.ready, Mastery.load(), Traits.load()]);
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
            <div class="pp-team">${G.team(p.level === 'cl' && t.clTeam ? { ...t.clTeam, color: t.color } : t, 'xs')}<span>${UI.esc(p.level === 'cl' && t.clTeam ? t.clTeam.name : p.level === 'academy' ? t.name + ' 아카데미' : t.name)}</span>${p.sub ? '<i class="sub-tag">후보</i>' : ''}</div>
            <h2>${G.ovr(p, 'xl')}${UI.esc(p.name)}</h2>
            <div class="pp-sub">${UI.esc(p.nativeName || p.realName || '')}${p.realName && p.nativeName ? ` · ${UI.esc(p.realName)}` : ''}</div>
            <div class="pp-tags">${p.role !== 'COACH' ? G.pos(p.role, true) : '<span class="ch-tag">코칭스태프</span>'}<span class="nat">${G.flag(p.nation)} ${G.nationName(p.nation)}</span>${p.age ? `<span>${p.age}세</span>` : ''}</div>
          </div>
          <div class="pp-val"><span>시장 가치</span><b>${this.money(this.value(p, t))}</b></div>
        </div>
        <div class="pp-body">
          <div class="pp-col">
            <h4>계약</h4>
            <dl class="cr-dl">
              <dt>소속</dt><dd>${UI.esc(t.name)}${t.league ? ` (${t.league})` : ''}</dd>
              <dt>계약 만료</dt><dd>${Contract.label(Contract.of(p, t))} <span class="ct-st ${cc}">${cs}</span></dd>
              <dt>연봉</dt><dd>${this.money(this.salary(p, t))} 원</dd>
              ${p.role !== 'COACH' ? `<dt>평판</dt><dd>${Fame.label(p)}${Fame.icon(p) ? ' <span class="ch-tag">종목 간판</span>' : ''}</dd>` : ''}
              <dt>생년월일</dt><dd>${p.birthdate ? p.birthdate.replace(/-/g, '.') : '-'}</dd>
              ${p.military ? `<dt>병역</dt><dd>${this.military(p)}</dd>` : ''}
            </dl>
            ${st ? `<h4>상태</h4>
              ${Career.meter('컨디션', st.condition)}
              <div class="pp-morale"><span>사기</span><b class="morale ${Roster.MORALE[st.morale][1]}">${Roster.MORALE[st.morale][0]}</b></div>
              ${this.isMine(t) && typeof Rel !== 'undefined' ? `<div class="pp-morale"><span>감독과의 관계</span><b>${Rel.word(p.id)}</b></div>` : ''}
              <div class="pp-morale"><span>최근 폼</span><span class="form-pts">${st.form.map(v => `<i class="${Roster.formCls(v)}">${v}</i>`).join('')}</span></div>` : ''}
            ${sq ? `<h4>솔랭</h4><p class="pp-line">${SoloQ.SERVER[t.league]} 서버 <b>${sq.rank}위</b> · ${sq.lpNow.toLocaleString()} LP · 승률 ${SoloQ.wr(sq)}%</p>` : ''}
          </div>
          <div class="pp-col">
            ${p.role !== 'COACH' ? `<h4>특성</h4>${Traits.rows(p.id)}` : ''}
            ${p.role !== 'COACH' ? `<h4>챔피언 폭 <small>최근 3시즌 프로 경기</small></h4>
              ${pool.length ? `<div class="ms-sigs pp-pool">${pool.slice(0, 8).map(e => Mastery.chip(e, true)).join('')}</div>` : '<p class="ms-none">프로 경기 기록이 없습니다.</p>'}
              <a class="pp-link" href="#roster-mastery">숙련도 자세히 →</a>` : `<h4>코칭 정보</h4><p class="ms-none">직책 구분 정보가 아직 없습니다.</p>`}
          </div>
        </div>
        ${p.attributes && p.role !== 'COACH' ? `<div class="pp-attrs"><h4>능력치 <small>OVR ${p.ovr} · 기술 40% 운영 30% 멘탈 10% 특화 20%</small></h4>${Attributes.table(p.attributes, p.role)}</div>` : ''}
        <div class="pp-foot">
          ${this.isMine(t) && p.role !== 'COACH' ? `<span class="pp-mv" data-pid="${p.id}">${Squad.buttons(p)}</span>` : ''}
          <button class="btn-ghost pp-list">${listed ? '관심 목록에서 빼기' : '관심 목록에 추가'}</button>
          ${this.isMine(t) ? '<button class="btn-primary pp-talk">재계약 협상</button>' : (p.free || this.days(p) < 0 ? '<button class="btn-primary pp-ask">계약 협상</button>' : '<button class="btn-ghost pp-trade">트레이드 제안</button><button class="btn-primary pp-ask">영입 문의</button>')}
        </div>
      </div>`;
    document.body.appendChild(back);
    const close = () => { back.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = e => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    back.addEventListener('click', e => { if (e.target === back || e.target.closest('.pp-x') || e.target.closest('.pp-link')) close(); });
    Squad.bind(back, () => { close(); Router.go(Router.current()); });
    $('.pp-list', back).onclick = () => { this.toggleShortlist(p.id); close(); this.open(id); };
    const talk = $('.pp-talk', back), ask = $('.pp-ask', back);
    // 협상 창을 열면 프로필은 닫는다 (사인 뒤 예전 정보가 뒤에 남지 않게)
    if (talk) talk.onclick = () => { close(); this.contractModal(p.id); };
    if (ask) ask.onclick = () => { close(); this.inquiryModal(p.id); };
    const trd = $('.pp-trade', back); if (trd) trd.onclick = () => { close(); Trade.propose(p.id); };
  },

  toggleShortlist(id) {
    const L = this.shortlist(), i = L.indexOf(id);
    if (i >= 0) L.splice(i, 1); else L.push(id);
    UI.toast(i >= 0 ? '관심 목록에서 뺐습니다' : '관심 목록에 추가했습니다');
  },

  // 재계약 협상 → js/negotiate.js (1군급은 에이전트 채팅, 2군·아카데미는 계약서)
  contractModal(id) { Neg.open(id, 'renew'); },
  // 영입 문의: FA는 바로 협상, 계약 중이면 원 소속 구단과 이적료 협상 (js/transfer.js)
  inquiryModal(id) { Transfer.open(id); },

  // ---------- 로스터 > 선수 비교 ----------
  cmp: [null, null],
  async compare(el) {
    await Promise.all([Portal.ready, Mastery.load(), Traits.load()]);
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
          <div class="cmp-head">${G.face(p, 'pl-ph')}<div>${G.ovr(p)}<b>${UI.esc(p.name)}</b><span>${G.team(t, 'xs')} ${UI.esc(t.short)} · ${G.pos(p.role, true)}</span></div></div>
          <dl class="cr-dl">
            <dt>나이</dt><dd>${p.age || '-'}세</dd>
            <dt>국적</dt><dd>${G.flag(p.nation)} ${G.nationName(p.nation)}</dd>
            ${p.military ? `<dt>병역</dt><dd>${this.military(p)}</dd>` : ''}
            <dt>계약 만료</dt><dd>${p.contractEnd ? p.contractEnd.replace(/-/g, '.') : '-'}</dd>
            <dt>연봉</dt><dd>${this.money(this.salary(p, t))}</dd>
            <dt>평판</dt><dd>${Fame.label(p)}</dd>
            <dt>시장 가치</dt><dd>${this.money(this.value(p, t))}</dd>
            <dt>솔랭</dt><dd>${sq ? `${sq.rank}위 · ${SoloQ.wr(sq)}%` : '100위 밖'}</dd>
          </dl>
          ${Career.meter('컨디션', st.condition)}
          <h4>특성</h4>${Traits.chips(p.id, '<span class="ms-none">없음</span>')}
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
        ${Career.head('선수 비교', '리그 전체 선수 중 두 명을 골라 비교합니다. ')}
        <div class="cmp-grid">${card(this.cmp[0], 0)}<div class="cmp-vs">VS</div>${card(this.cmp[1], 1)}</div>
      </div>`;
    $$('.cmp-sel', el).forEach(s => s.onchange = () => { this.cmp[+s.dataset.i] = s.value; this.compare(el); });
  },

  // ---------- 로스터 > 계약 현황 ----------
  async contracts(el) {
    await Promise.all([Portal.ready, Mastery.load(), Traits.load()]);
    const t = this.team();
    const rows = [...t.players, ...(t.staff || [])].sort((a, b) => (a.contractEnd || '9').localeCompare(b.contractEnd || '9'));
    const total = t.players.reduce((s, p) => s + this.salary(p, t), 0);
    const soon = rows.filter(p => { const d = this.days(p); return d != null && d <= 60; });
    el.innerHTML = `
      <div class="cr-page">
        <div class="card rs-head">
          <div class="rs-title"><h2>계약 현황 <small>${UI.esc(t.name)}</small></h2><span>1군급은 에이전트와 협상, 2군·아카데미·코칭스태프는 계약서로 처리합니다</span></div>
          <div class="rs-stats">
            <div><span class="k">선수 연봉 합계</span><b>${this.money(total)}</b></div>
            <div><span class="k">60일 내 만료</span><b class="${soon.length ? 'warn' : ''}">${soon.length}</b></div>
            <div><span class="k">계약 인원</span><b>${rows.length}</b></div>
          </div>
        </div>
        <div class="card rs-table-wrap" style="padding:0">
          <table class="rs-table ct-table">
            <thead><tr><th>이름</th><th>역할</th><th>계약 만료</th><th>옵션</th><th>상태</th><th class="num">연봉</th><th>남은 기간</th><th></th></tr></thead>
            <tbody>${rows.map(p => {
              const d = this.days(p), [cs, cc] = this.contractState(p);
              const pct = d == null ? 0 : Math.max(2, Math.min(100, d / 1095 * 100));
              return `<tr data-id="${p.id}">
                <td><div class="pl-cell">${G.face(p, 'pl-ph')}<div>${G.ovr(p)}<b>${UI.esc(p.name)}</b><small class="pl-real">${UI.esc(p.nativeName || p.realName || '')}</small></div></div></td>
                <td>${p.role === 'COACH' ? '코칭스태프' : G.pos(p.role, true)}</td>
                <td class="num">${p.contractEnd ? p.contractEnd.replace(/-/g, '.') : '-'}</td>
                <td>${(o => o.option ? `+1년 ${Contract.OPT[o.option]}` : '-')(Contract.of(p, t))}</td>
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
        ${Career.head('컨디션·폼', `${UI.esc(t.name)} 선수단 상태. 최근 폼은 공식전 최근 5경기 평점(10점 만점). 경기 오버롤 = 오버롤 + 컨디션 · 사기 · 감독 관계 보정 (오버롤 옆 ▲▼).`)}
        <div class="cd-grid">${t.players.map(p => {
          const st = Roster.status(p), x = extra(p);
          const avg = (st.form.reduce((s, v) => s + +v, 0) / st.form.length).toFixed(1);
          return `
          <div class="card cd-card" data-id="${p.id}">
            <div class="cd-head">${G.face(p, 'pl-ph')}<div>${G.ovr(p)}<b>${UI.esc(p.name)}</b>${G.pos(p.role, true)}${p.sub ? '<i class="sub-tag">후보</i>' : ''}</div><span class="morale ${Roster.MORALE[st.morale][1]}">${Roster.MORALE[st.morale][0]}</span></div>
            ${Career.meter('컨디션', st.condition)}
            ${(() => { const b = Cond.parts(p), e = Math.round(p.ovr + b.total), sg = v => (v >= 0 ? '+' : '') + v.toFixed(1), h = Cond.hist(p.id), a = Cond.amp(p);
              return `<div class="cd-eff"><span>경기 오버롤</span><b class="num">${p.ovr} → ${e}</b><small>컨디션 ${sg(b.form)} · 사기 ${sg(b.morale)} · 관계 ${sg(b.rel)}</small></div>
              <div class="cd-form"><span>컨디션 흐름</span>${h.length > 1 ? `<svg viewBox="0 0 100 30" preserveAspectRatio="none"><line x1="0" y1="15" x2="100" y2="15" stroke="#2a3550"/><polyline fill="none" stroke="#7fb0ff" stroke-width="2" points="${h.map((v, i) => `${(i / (h.length - 1) * 100).toFixed(1)},${(15 - v / a * 13).toFixed(1)}`).join(' ')}"/></svg>` : '<small class="cr-dim">경기를 치르면 쌓입니다</small>'}<b class="num">${Cond.word(p)}</b></div>`; })()}
            ${Career.meter('피로도', x.fatigue, 'inv')}
            <div class="cd-form"><span>최근 폼</span>
              <svg viewBox="0 0 100 30" preserveAspectRatio="none"><polyline fill="none" stroke="var(--gold)" stroke-width="2" points="${st.form.map((v, i) => `${i * 25},${30 - (+v - 3) * 4}`).join(' ')}"/></svg>
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
