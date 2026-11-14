// 로스터 › 선수 관계: 감독과 선수의 관계(Rel) · 최근 변화와 이유 · 선수끼리 같이 뛴 기간(팀합) · 언어 소통
const Relations = {
  bar(v) { const c = v >= 60 ? 'good' : v >= 40 ? 'mid' : 'bad'; return `<div class="rl-bar ${c}"><i style="width:${v}%"></i></div>`; },
  ago(d) { const n = Fmt.daysBetween(d, Clock.today()); return n <= 0 ? '오늘' : n < 30 ? `${n}일 전` : d.slice(5).replace('-', '.'); },
  async render(el) {
    await Promise.all([Portal.ready, Mastery.load()]);
    const t = Roster.team(), ps = t.players.filter(p => p.role !== 'COACH').sort((a, b) => (a.sub - b.sub) || G.ROLES.indexOf(a.role) - G.ROLES.indexOf(b.role));
    const line = Draft.lineup(t).filter(Boolean), chem = Cond.chem(line), comm = Cond.comm(t, line);
    const avg = ps.length ? Math.round(ps.reduce((s, p) => s + Rel.of(p.id), 0) / ps.length) : 0;
    const warm = ps.filter(p => Rel.of(p.id) >= 75), cold = ps.filter(p => Rel.of(p.id) < 35);
    const row = p => {
      const v = Rel.of(p.id), st = Roster.status(p), [ml, mc] = Roster.MORALE[st.morale], log = Rel.log(p.id).slice(0, 3);
      return `<tr>
        <td>${G.pos(p.role)}</td>
        <td><div class="pl-cell">${G.face(p, 'pl-ph')}<div>${G.ovr(p)}<b>${UI.esc(p.name)}</b>${p.sub ? ' <small>(후보)</small>' : ''}</div></div></td>
        <td class="rl-v">${this.bar(v)}<b>${Rel.word(p.id)}</b><small>${v}</small></td>
        <td><span class="morale ${mc}">${ml}</span></td>
        <td class="rl-log">${log.length ? log.map(e => `<div><em class="${e.v > 0 ? 'up' : 'dn'}">${e.v > 0 ? '▲' : '▼'}${Math.abs(e.v)}</em> ${UI.esc(e.why || '기타')} <small>${this.ago(e.d)}</small></div>`).join('') : '<small class="cr-dim">아직 변화 없음</small>'}</td>
      </tr>`;
    };
    // 팀합 표: 두 선수가 지금 팀에서 같이 보낸 기간
    const grid = line.length >= 2 ? `<table class="rl-grid"><thead><tr><th></th>${line.map(p => `<th>${G.pos(p.role)}<span>${UI.esc(p.name)}</span></th>`).join('')}</tr></thead><tbody>
      ${line.map(a => `<tr><th>${G.pos(a.role)}<span>${UI.esc(a.name)}</span></th>${line.map(b => {
        if (a === b) return '<td class="self"></td>';
        const y = Cond.together(a, b), c = Cond.chemOf(y);
        return `<td class="c${Math.min(4, Math.floor(c / 3))}" title="${UI.esc(a.name)} · ${UI.esc(b.name)} 같이 뛴 기간 ${y.toFixed(1)}년">${y >= 1 ? y.toFixed(1) + '년' : Math.round(y * 12) + '개월'}</td>`;
      }).join('')}</tr>`).join('')}</tbody></table>` : '<p class="ms-none">주전이 두 명 이상이어야 볼 수 있습니다.</p>';
    const L = Cond.LEAGUE_LANG[t.league], foreign = line.filter(p => Cond.langOf(p.nation) !== L);
    el.innerHTML = `
      <div class="cr-page">
        <div class="card rs-head">
          <div class="rs-title"><h2>선수 관계 <small>${UI.esc(t.name)}</small></h2><span>감독과의 관계는 면담 · 약속 · 라커룸 한마디 · 트레이드설 같은 일로 움직입니다. 재계약 협상과 이적 요청에 크게, 경기력에는 아주 조금 영향을 줍니다.</span></div>
          <div class="rs-stats">
            <div><span class="k">평균 관계</span><b>${avg}</b></div>
            <div><span class="k">두터움 이상</span><b>${warm.length}</b></div>
            <div><span class="k">서먹함 이하</span><b class="${cold.length ? 'warn' : ''}">${cold.length}</b></div>
            <div><span class="k">팀합</span><b>${chem.toFixed(1)}<small>/12</small></b></div>
          </div>
        </div>
        ${cold.length ? `<div class="card rl-alert"><b>관계가 나쁜 선수</b><span>${cold.map(p => UI.esc(p.name)).join(', ')} — 재계약 협상이 어렵고, 계속 나빠지면 이적을 요청할 수 있습니다. 면담이나 약속으로 풀어 보세요.</span></div>` : ''}
        <div class="card" style="padding:0"><div class="card-head" style="padding:14px 16px 0"><h3>감독과의 관계</h3></div>
          <table class="rs-table rl-table"><thead><tr><th>포지션</th><th>선수</th><th>관계</th><th>사기</th><th>최근 변화</th></tr></thead><tbody>${ps.map(row).join('')}</tbody></table>
        </div>
        <div class="cr-grid">
          <div class="card"><div class="card-head"><h3>선수 간 호흡 <small>주전끼리 같이 뛴 기간</small></h3></div>${grid}
            <p class="cr-dim rl-note">같이 뛴 첫 1년 동안 빠르게 오르고, 그 뒤로는 천천히 오릅니다. 팀합은 주전 다섯의 평균이며 경기력에 더해집니다.</p></div>
          <div class="card"><div class="card-head"><h3>소통</h3></div>
            ${foreign.length ? foreign.map(p => { const j = Fame.joined(p), y = j ? Fmt.daysBetween(j, Clock.today()) / 365 : 0; return `<div class="rl-lang">${G.face(p, 'pl-ph')}<div><b>${UI.esc(p.name)}</b><small>${G.nationName(p.nation)} · 팀에서 ${y.toFixed(1)}년</small></div><span class="${y < 1 ? 'bad' : y < 2 ? 'mid' : 'good'}">${y < 1 ? '소통 문제 큼' : y < 2 ? '조금 불편' : y < 3 ? '거의 없음' : '문제없음'}</span></div>`; }).join('') : '<p class="ms-none">주전이 모두 리그 공용어를 씁니다.</p>'}
            <p class="cr-dim rl-note">소통 보정 ${comm.toFixed(1)} (최대 -3). 리그 언어와 다른 선수는 팀에서 3년이 지나면 문제가 사라집니다.</p></div>
        </div>
      </div>`;
  },
};
Views['roster-relations'] = el => Relations.render(el);
