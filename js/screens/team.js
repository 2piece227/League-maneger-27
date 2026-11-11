// 리그 / 팀 선택: LCK → LPL → LEC → LCS 탭, 팀 카드 목록 + 상세 패널
Screens.team = {
  init() {
    this.el = $('#screen-team');
    const tabs = $('#league-tabs');
    tabs.innerHTML = App.db.leagues.map(l =>
      `<button class="league-tab" data-league="${l.id}">${l.name}<small>${l.region}</small></button>`).join('');
    $$('.league-tab', tabs).forEach(b => b.onclick = () => this.selectLeague(b.dataset.league));
  },

  enter() {
    const m = App.state.manager;
    $('#mgr-chip').innerHTML = m
      ? `<div class="mini-av">${Avatar.render(m.avatar)}</div><div><b>${UI.esc(m.name)}</b><small>감독</small></div>`
      : '';
    this.selectLeague(App.state.leagueId);
  },

  selectLeague(id) {
    App.state.leagueId = id;
    const league = App.db.leagues.find(l => l.id === id);
    const teams = App.db.teams.filter(t => t.league === id);
    if (!teams.some(t => t.id === App.state.teamId)) App.state.teamId = null;

    $$('.league-tab').forEach(b => b.classList.toggle('on', b.dataset.league === id));
    $('#league-info').innerHTML = `
      <span><span class="li-k">참가 팀</span>${teams.length}</span>
      <span><span class="li-k">연봉 규정</span>${league.rules.join(' · ')}</span>
      <span><span class="li-k">FA 개장</span>${league.faOpen}</span>
      ${App.db.source === 'mock' ? '<span class="mock-tag">목업 데이터 · 수집 스크립트 실행 전</span>' : ''}`;

    $('#team-list').innerHTML = teams.map(t => this.card(t)).join('');
    $$('.team-card').forEach(c => c.onclick = () => this.selectTeam(c.dataset.team));
    this.renderDetail();
  },

  selectTeam(id) {
    App.state.teamId = id;
    $$('.team-card').forEach(c => c.classList.toggle('on', c.dataset.team === id));
    this.renderDetail();
  },

  avgOvr(t) {
    const s = t.players.filter(p => !p.sub);
    return (s.reduce((a, p) => a + p.ovr, 0) / s.length).toFixed(1);
  },

  card(t) {
    return `
      <button class="team-card ${App.state.teamId === t.id ? 'on' : ''}" data-team="${t.id}" style="--c:${t.color}">
        <div class="tc-top">
          ${UI.img(t.logo, 'tc-logo', `<div class="tc-mono">${UI.esc(t.short)}</div>`)}
          <div><div class="tc-name">${UI.esc(t.name)}</div><div class="tc-city">${t.city}</div></div>
        </div>
        <div class="tc-stats">
          <span class="k">명성</span>${UI.stars(t.rep)}
          <span class="k">자본</span><div class="bar"><span style="width:${t.fin * 20}%"></span></div>
          <span class="k">로스터</span><span>주전 평균 OVR <b>${this.avgOvr(t)}</b></span>
        </div>
      </button>`;
  },

  renderDetail() {
    const box = $('#team-detail');
    const t = App.db.teams.find(x => x.id === App.state.teamId);
    if (!t) {
      box.innerHTML = '<div class="td-empty">왼쪽에서 맡을 팀을 선택하세요.<br>명성·자본·로스터 정보가 여기에 표시됩니다.</div>';
      box.style.removeProperty('--c');
      return;
    }
    const starters = t.players.filter(p => !p.sub);
    const ages = starters.filter(p => p.age);
    const avgAge = ages.length ? (ages.reduce((a, p) => a + p.age, 0) / ages.length).toFixed(1) : '-';
    const initial = p => `<div class="pl-ph pl-ph-empty">${UI.esc(p.name.slice(0, 1))}</div>`;
    const rows = t.players.map(p => `
      <tr class="${p.sub ? 'sub' : ''}">
        <td class="pos">${p.role || '-'}</td>
        <td><div class="pl-cell">${UI.img(p.photo, 'pl-ph', initial(p))}
          <div><b>${UI.esc(p.name)}</b>${p.sub ? ' <small>(후보)</small>' : ''}${p.realName ? `<small class="pl-real">${UI.esc(p.nativeName || p.realName)}</small>` : ''}</div></div></td>
        <td>${p.age || '-'}</td>
        <td>${p.nation}</td>
        <td class="ovr">${p.ovr}</td>
      </tr>`).join('');

    box.style.setProperty('--c', t.color);
    box.innerHTML = `
      ${t.photo ? `<div class="td-photo">${UI.img(t.photo, '', '')}</div>` : ''}
      <div class="td-head">
        ${UI.img(t.logo, 'td-logo', '')}
        <div class="td-name">${UI.esc(t.name)}</div>
        <div class="td-sub">${t.league} · ${t.city}</div>
      </div>
      <div class="td-sec td-grid">
        <div class="td-stat"><div class="k">명성</div><div class="v">${UI.stars(t.rep)}</div></div>
        <div class="td-stat"><div class="k">자본 (연간 예산)</div><div class="v">${t.budget}</div></div>
        <div class="td-stat"><div class="k">주전 평균 OVR</div><div class="v">${this.avgOvr(t)}</div></div>
        <div class="td-stat"><div class="k">주전 평균 나이</div><div class="v">${avgAge}</div></div>
      </div>
      <div class="td-sec">
        <div class="panel-title">이사회 기대</div>
        <div class="td-goal">${t.boardGoal}</div>
      </div>
      ${t.tags.length ? `<div class="td-sec">
        <div class="panel-title">팀 스타일</div>
        <div class="tags">${t.tags.map(x => `<span>${x}</span>`).join('')}</div>
      </div>` : ''}
      <div class="td-sec">
        <div class="panel-title">로스터</div>
        <table class="roster">
          <thead><tr><th>포지션</th><th>선수</th><th>나이</th><th>국적</th><th style="text-align:right">OVR</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      ${(t.staff || []).length ? `<div class="td-sec">
        <div class="panel-title">코칭스태프</div>
        <div class="staff">${t.staff.map(s => `<div class="pl-cell">${UI.img(s.photo, 'pl-ph', initial(s))}
          <div><b>${UI.esc(s.name)}</b>${s.realName ? `<small class="pl-real">${UI.esc(s.nativeName || s.realName)}</small>` : ''}</div></div>`).join('')}</div>
      </div>` : ''}
      <div class="td-foot"><button class="btn-primary" id="td-start">이 팀으로 커리어 시작 →</button></div>`;
    $('#td-start').onclick = () => this.confirmStart(t);
  },

  confirmStart(t) {
    UI.modal({
      title: '커리어 시작',
      body: `<b>${UI.esc(App.state.manager.name)}</b> 감독으로 <b>${UI.esc(t.name)}</b>(${t.league})의 지휘봉을 잡습니다.<br>이사회 기대: ${t.boardGoal}`,
      actions: [
        { label: '취소' },
        {
          label: '시작', primary: true,
          onClick: () => {
            Game.start(App.state.manager, t);
            App.show('game');
          },
        },
      ],
    });
  },
};
