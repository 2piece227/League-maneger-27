// 게임 화면 공용 그래픽: 팀 로고 배지, 포지션 아이콘, 국기, 결정적 목업 값
const G = {
  ROLES: ['TOP', 'JGL', 'MID', 'BOT', 'SUP'],
  ROLE_KO: { TOP: '탑', JGL: '정글', MID: '미드', BOT: '원딜', SUP: '서포터' },

  // 팀 로고. 로고가 없거나 깨지면 팀 컬러 원 + 약칭.
  team(t, cls = '') {
    if (!t) return '';
    const mono = `<span class="team-badge ${cls}" style="--c:${t.color || '#555'}">${UI.esc(t.short || '?')}</span>`;
    return t.logo ? `<span class="team-logo ${cls}" title="${UI.esc(t.name)}">${UI.img(t.logo, '', mono)}</span>` : mono;
  },

  // 선수 사진(없으면 이니셜)
  face(p, cls = 'pl-ph') {
    return UI.img(p.photo, cls, `<div class="${cls} pl-ph-empty">${UI.esc((p.name || '?').slice(0, 1))}</div>`);
  },

  // 포지션 아이콘: 소환사의 협곡 미니맵 위 라인 표시
  pos(role, withLabel = false) {
    const lane = {
      TOP: '<path d="M5 19V5h14" class="pi-hl"/>',
      MID: '<path d="M6 18L18 6" class="pi-hl"/>',
      BOT: '<path d="M5 19h14V5" class="pi-hl"/>',
      JGL: '<path d="M8.5 16c0-4 1.5-7 4-9M12 16.5c0-3.5 1-6 3-8M15.5 16c0-2.5.5-4.5 2-6" class="pi-hl"/>',
      SUP: '<path d="M12 5l6 2.5v4c0 3.5-2.6 6-6 7.5-3.4-1.5-6-4-6-7.5v-4z" class="pi-hl"/>',
    }[role];
    if (!lane) return `<span class="pos-ic none">${UI.esc(role || '-')}</span>`;
    const base = role === 'JGL' || role === 'SUP' ? '' : '<path d="M5 19V5h14v14z" class="pi-map"/><path d="M6 18L18 6" class="pi-river"/>';
    return `<span class="pos-ic" title="${this.ROLE_KO[role]}"><svg viewBox="0 0 24 24" aria-hidden="true">${base}${lane}</svg>${withLabel ? `<b>${role}</b>` : ''}</span>`;
  },

  NATION: {
    'South Korea': ['kr', '대한민국'], China: ['cn', '중국'], Taiwan: ['tw', '대만'], 'Hong Kong': ['hk', '홍콩'],
    Vietnam: ['vn', '베트남'], Spain: ['es', '스페인'], Germany: ['de', '독일'], Romania: ['ro', '루마니아'],
    Greece: ['gr', '그리스'], Denmark: ['dk', '덴마크'], France: ['fr', '프랑스'], Sweden: ['se', '스웨덴'],
    Croatia: ['hr', '크로아티아'], Portugal: ['pt', '포르투갈'], 'Czech Republic': ['cz', '체코'],
    'United Kingdom': ['gb', '영국'], 'United States': ['us', '미국'], Canada: ['ca', '캐나다'],
    Ukraine: ['ua', '우크라이나'], Turkey: ['tr', '튀르키예'], Poland: ['pl', '폴란드'], Slovenia: ['si', '슬로베니아'],
    Norway: ['no', '노르웨이'], Lithuania: ['lt', '리투아니아'], Australia: ['au', '호주'], Argentina: ['ar', '아르헨티나'],
  },
  nationName(n) { return (this.NATION[n] || [null, n || '-'])[1]; },
  flag(n) {
    const hit = this.NATION[n];
    if (!hit) return '<span class="flag none"></span>';
    return `<img class="flag" src="https://flagcdn.com/w40/${hit[0]}.png" alt="" title="${hit[1]}" loading="lazy">`;
  },

  // 같은 선수는 항상 같은 값이 나오는 목업 난수 (0~1). TODO: 실제 시뮬레이션 값으로 교체
  rand(key, salt = '') {
    let h = 2166136261;
    for (const c of key + '|' + salt) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
    return ((h >>> 0) % 10000) / 10000;
  },
};
