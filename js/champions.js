// 경기 > 챔피언: 전체 챔피언 도감 (검색·포지션·역할군 필터 + 상세 패널)
const Champions = {
  list: null,
  meta: null,
  q: '',
  pos: 'ALL',
  tag: 'ALL',
  sort: 'name',
  selId: null,

  TAGS: [['Fighter', '전사'], ['Tank', '탱커'], ['Mage', '마법사'], ['Assassin', '암살자'], ['Marksman', '원거리 딜러'], ['Support', '서포터']],
  INFO: [['attack', '공격'], ['defense', '방어'], ['magic', '마법'], ['difficulty', '난이도']],
  DMG: { PHYSICAL_DAMAGE: '물리', MAGIC_DAMAGE: '마법' },

  // 처음 열 때 한 번만 불러온다. 다른 화면(밴픽·숙련도)에서도 Champions.load()를 쓴다.
  load() {
    if (!this._p) {
      this._p = fetch('data/champions.json').then(r => r.json()).then(d => {
        this.meta = d.meta;
        this.list = d.champions;
        this.byId = Object.fromEntries(d.champions.map(c => [c.id, c]));
        return this.list;
      });
    }
    return this._p;
  },

  filtered() {
    const q = this.q.trim().toLowerCase();
    const out = this.list.filter(c =>
      (this.pos === 'ALL' || c.positions.includes(this.pos)) &&
      (this.tag === 'ALL' || c.tags.includes(this.tag)) &&
      (!q || c.name.includes(q) || c.nameEn.toLowerCase().includes(q) || c.title.includes(q)));
    const by = {
      name: (a, b) => a.name.localeCompare(b.name, 'ko'),
      diff: (a, b) => b.info.difficulty - a.info.difficulty || a.name.localeCompare(b.name, 'ko'),
      new: (a, b) => (b.releaseDate || '9999').localeCompare(a.releaseDate || '9999'),
    }[this.sort];
    return out.sort(by);
  },

  async render(el) {
    el.innerHTML = '<div class="placeholder-view"><p>챔피언 정보를 불러오는 중…</p></div>';
    await this.load();
    if (!this.selId) this.selId = this.list[0].id;
    const chip = (group, val, label, cur) =>
      `<button class="${val === cur ? 'on' : ''}" data-${group}="${val}">${label}</button>`;
    el.innerHTML = `
      <div class="champ-page">
        <div class="ch-main">
          <div class="card ch-head">
            <div class="rs-title">
              <h2>챔피언 <small>${this.list.length}명</small></h2>
              <span>패치 ${UI.esc(this.meta.patch)} 기준 · 포지션은 프로 경기 기준 주 라인</span>
            </div>
            <input class="ch-search" type="search" placeholder="이름·영문명·칭호 검색" value="${UI.esc(this.q)}">
          </div>
          <div class="ch-bar">
            <div class="seg ch-pos">${chip('pos', 'ALL', '전체', this.pos)}${['TOP', 'JGL', 'MID', 'BOT', 'SUP'].map(r =>
              chip('pos', r, G.pos(r) + G.ROLE_KO[r], this.pos)).join('')}</div>
            <div class="seg ch-tag">${chip('tag', 'ALL', '모든 역할군', this.tag)}${this.TAGS.map(([t, k]) => chip('tag', t, k, this.tag)).join('')}</div>
            <select class="ch-sort">
              <option value="name">가나다순</option><option value="diff">난이도 높은 순</option><option value="new">최신 출시 순</option>
            </select>
            <span class="ch-count"></span>
          </div>
          <div class="ch-grid"></div>
        </div>
        <aside class="card ch-detail"></aside>
      </div>`;
    $('.ch-sort', el).value = this.sort;

    $('.ch-search', el).addEventListener('input', e => { this.q = e.target.value; this.drawGrid(el); });
    $('.ch-sort', el).addEventListener('change', e => { this.sort = e.target.value; this.drawGrid(el); });
    $$('.ch-bar .seg', el).forEach(seg => seg.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.pos) this.pos = b.dataset.pos;
      if (b.dataset.tag) this.tag = b.dataset.tag;
      $$('button', seg).forEach(x => x.classList.toggle('on', x === b));
      this.drawGrid(el);
    }));
    $('.ch-grid', el).addEventListener('click', e => {
      const card = e.target.closest('.ch-card');
      if (!card) return;
      this.selId = card.dataset.id;
      $$('.ch-card', el).forEach(c => c.classList.toggle('sel', c === card));
      this.drawDetail(el);
      if (matchMedia('(max-width: 1023px)').matches) $('.ch-detail', el).scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    this.drawGrid(el);
    this.drawDetail(el);
  },

  drawGrid(el) {
    const list = this.filtered();
    $('.ch-count', el).textContent = `${list.length}명`;
    $('.ch-grid', el).innerHTML = list.length ? list.map(c => `
      <button class="ch-card ${c.id === this.selId ? 'sel' : ''}" data-id="${c.id}" title="${UI.esc(c.name)} — ${UI.esc(c.title)}">
        <img src="${c.icon}" alt="" loading="lazy">
        <b>${UI.esc(c.name)}</b>
        <span class="ch-card-pos">${c.positions.map(p => G.pos(p)).join('')}</span>
      </button>`).join('') : '<p class="ch-empty">조건에 맞는 챔피언이 없습니다.</p>';
  },

  drawDetail(el) {
    const c = this.byId[this.selId];
    const s = c.stats;
    const stat = (k, v, per) => `<div><span>${k}</span><b class="num">${v}${per ? `<small>+${per}</small>` : ''}</b></div>`;
    const skill = (key, sk) => `
      <div class="ch-skill">
        <img src="${sk.icon}" alt="" loading="lazy">
        <div>
          <div class="ch-sk-head"><i>${key}</i><b>${UI.esc(sk.name)}</b>${sk.cooldown ? `<span>재사용 ${UI.esc(sk.cooldown)}초</span>` : ''}</div>
          <p>${UI.esc(sk.desc)}</p>
        </div>
      </div>`;
    $('.ch-detail', el).innerHTML = `
      <div class="ch-splash" style="background-image:url('${c.splash}')">
        <div class="ch-splash-txt">
          <span>${UI.esc(c.title)}</span>
          <h3>${UI.esc(c.name)} <small>${UI.esc(c.nameEn)}</small></h3>
        </div>
      </div>
      <div class="ch-tags">
        ${c.positions.map(p => `<span class="ch-tag pos">${G.pos(p)}${G.ROLE_KO[p]}</span>`).join('')}
        ${c.tagsKo.map(t => `<span class="ch-tag">${t}</span>`).join('')}
        <span class="ch-tag dim">${c.attackType === 'RANGED' ? '원거리' : '근거리'}</span>
        ${c.damageType ? `<span class="ch-tag dim">${this.DMG[c.damageType] || ''} 피해</span>` : ''}
        ${c.positionsGuessed ? '<span class="ch-tag warn" title="프로 경기 데이터가 아직 없어 역할군으로 추정">포지션 추정</span>' : ''}
      </div>
      <div class="ch-info">${this.INFO.map(([k, label]) => `
        <div><span>${label}</span><div class="ch-info-bar"><i class="${k}" style="width:${c.info[k] * 10}%"></i></div><b class="num">${c.info[k]}</b></div>`).join('')}
      </div>
      <h4>기본 능력치 <small>1레벨 · +레벨당</small></h4>
      <div class="ch-stats">
        ${stat('체력', s.hp, s.hpPerLevel)}
        ${stat(UI.esc(c.resource || '자원'), s.mp || '-', s.mpPerLevel || 0)}
        ${stat('공격력', s.ad, s.adPerLevel)}
        ${stat('공격 속도', s.as.toFixed(3), s.asPerLevel + '%')}
        ${stat('방어력', s.armor, s.armorPerLevel)}
        ${stat('마법 저항력', s.mr, s.mrPerLevel)}
        ${stat('사거리', s.range)}
        ${stat('이동 속도', s.ms)}
      </div>
      <h4>스킬</h4>
      <div class="ch-skills">
        ${skill('P', c.passive)}
        ${c.spells.map(sp => skill(sp.key, sp)).join('')}
      </div>
      <h4>소개 ${c.releaseDate ? `<small>출시 ${c.releaseDate.replace(/-/g, '.')}</small>` : ''}</h4>
      <p class="ch-lore">${UI.esc(c.lore)}</p>
      <!-- TODO: 기능 연결 — 메타 티어·프로 픽밴률·선수별 숙련도 -->`;
  },
};

Views['match-champions'] = el => Champions.render(el);
