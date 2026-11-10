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

  // 포지션 아이콘: 롤 클라이언트 공식 아이콘 모양 (assets/positions/*.svg 와 동일)
  POS_SVG: {
    TOP: '<path class="pi-dim" fill-rule="evenodd" d="M21,14H14v7h7V14Zm5-3V26L11.014,26l-4,4H30V7.016Z"/><polygon class="pi-on" points="4 4 4.003 28.045 9 23 9 9 23 9 28.045 4.003 4 4"/>',
    JGL: '<path class="pi-on" fill-rule="evenodd" d="M25,3c-2.128,3.3-5.147,6.851-6.966,11.469A42.373,42.373,0,0,1,20,20a27.7,27.7,0,0,1,1-3C21,12.023,22.856,8.277,25,3ZM13,20c-1.488-4.487-4.76-6.966-9-9,3.868,3.136,4.422,7.52,5,12l3.743,3.312C14.215,27.917,16.527,30.451,17,31c4.555-9.445-3.366-20.8-8-28C11.67,9.573,13.717,13.342,13,20Zm8,5a15.271,15.271,0,0,1,0,2l4-4c0.578-4.48,1.132-8.864,5-12C24.712,13.537,22.134,18.854,21,25Z"/>',
    MID: '<path class="pi-dim" fill-rule="evenodd" d="M30,12.968l-4.008,4L26,26H17l-4,4H30ZM16.979,8L21,4H4V20.977L8,17,8,8h8.981Z"/><polygon class="pi-on" points="25 4 4 25 4 30 9 30 30 9 30 4 25 4"/>',
    BOT: '<path class="pi-dim" fill-rule="evenodd" d="M13,20h7V13H13v7ZM4,4V26.984l3.955-4L8,8,22.986,8l4-4H4Z"/><polygon class="pi-on" points="29.997 5.955 25 11 25 25 11 25 5.955 29.997 30 30 29.997 5.955"/>',
    SUP: '<path class="pi-on" fill-rule="evenodd" d="M26,13c3.535,0,8-4,8-4H23l-3,3,2,7,5-2-3-4h2ZM22,5L20.827,3H13.062L12,5l5,6Zm-5,9-1-1L13,28l4,3,4-3L18,13ZM11,9H0s4.465,4,8,4h2L7,17l5,2,2-7Z"/>',
  },
  pos(role, withLabel = false) {
    const svg = this.POS_SVG[role];
    if (!svg) return `<span class="pos-ic none">${UI.esc(role || '-')}</span>`;
    return `<span class="pos-ic" title="${this.ROLE_KO[role]}"><svg viewBox="0 0 34 34" aria-hidden="true">${svg}</svg>${withLabel ? `<b>${role}</b>` : ''}</span>`;
  },

  NATION: {
    'South Korea': ['kr', '대한민국'], China: ['cn', '중국'], Taiwan: ['tw', '대만'], 'Hong Kong': ['hk', '홍콩'],
    Vietnam: ['vn', '베트남'], Spain: ['es', '스페인'], Germany: ['de', '독일'], Romania: ['ro', '루마니아'],
    Greece: ['gr', '그리스'], Denmark: ['dk', '덴마크'], France: ['fr', '프랑스'], Sweden: ['se', '스웨덴'],
    Croatia: ['hr', '크로아티아'], Portugal: ['pt', '포르투갈'], 'Czech Republic': ['cz', '체코'],
    'United Kingdom': ['gb', '영국'], 'United States': ['us', '미국'], Canada: ['ca', '캐나다'],
    Ukraine: ['ua', '우크라이나'], Turkey: ['tr', '튀르키예'], Poland: ['pl', '폴란드'], Slovenia: ['si', '슬로베니아'],
    Norway: ['no', '노르웨이'], Lithuania: ['lt', '리투아니아'], Australia: ['au', '호주'], Japan: ['jp', '일본'], Argentina: ['ar', '아르헨티나'],
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
