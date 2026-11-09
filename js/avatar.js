// 감독 아바타: 옵션 조합 → SVG 문자열
const Avatar = {
  options: {
    face: [{ id: 'oval', label: '갸름형' }, { id: 'round', label: '둥근형' }, { id: 'square', label: '각진형' }],
    skin: ['#f5d7c0', '#eac09f', '#d6a27c', '#b07a55', '#7d5338'],
    hair: [
      { id: 'short', label: '짧은 머리' }, { id: 'part', label: '가르마' }, { id: 'long', label: '장발' },
      { id: 'curly', label: '곱슬' }, { id: 'buzz', label: '버즈컷' }, { id: 'none', label: '민머리' },
    ],
    hairColor: ['#1b1b1f', '#3b2a20', '#6b4a2e', '#a77b4f', '#d8c7a5', '#8a8f99'],
    glasses: [{ id: 'none', label: '없음' }, { id: 'round', label: '동그란 테' }, { id: 'square', label: '사각 테' }],
    outfit: [{ id: 'suit', label: '정장' }, { id: 'jacket', label: '팀 재킷' }, { id: 'hoodie', label: '후드티' }],
    outfitColor: ['#1f2a44', '#2b2b2f', '#6b1f2a', '#1f4d3a', '#b08a36', '#e8e8ec'],
  },

  // UI에 노출할 그룹 정의 (key, 라벨, 타입)
  groups: [
    ['face', '얼굴형', 'text'], ['skin', '피부톤', 'color'],
    ['hair', '헤어스타일', 'text'], ['hairColor', '머리색', 'color'],
    ['outfit', '복장', 'text'], ['outfitColor', '복장 색', 'color'],
    ['glasses', '안경', 'text'],
  ],

  defaults() {
    return { face: 'oval', skin: 1, hair: 'short', hairColor: 0, glasses: 'none', outfit: 'suit', outfitColor: 0 };
  },

  random() {
    const a = {};
    for (const [key, opts] of Object.entries(this.options)) {
      const i = Math.floor(Math.random() * opts.length);
      a[key] = typeof opts[0] === 'string' ? i : opts[i].id;
    }
    return a;
  },

  shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const f = c => Math.max(0, Math.min(255, Math.round(c + 255 * amt)));
    return '#' + [f(n >> 16), f((n >> 8) & 255), f(n & 255)].map(v => v.toString(16).padStart(2, '0')).join('');
  },

  render(a) {
    const skin = this.options.skin[a.skin];
    const hc = this.options.hairColor[a.hairColor];
    const oc = this.options.outfitColor[a.outfitColor];
    const ocDark = this.shade(oc, -0.12);
    const hw = a.face === 'round' ? 42 : 38;
    const p = [];

    // 뒷머리
    if (a.hair === 'long') {
      p.push(`<path d="M56,92 C50,40 150,40 144,92 L150,165 C138,170 128,158 130,135 L70,135 C72,158 62,170 50,165 Z" fill="${hc}"/>`);
    }

    // 몸통
    p.push(`<path d="M28,220 C28,178 58,156 100,156 C142,156 172,178 172,220 Z" fill="${oc}"/>`);
    if (a.outfit === 'hoodie') {
      p.push(`<path d="M64,172 C62,140 138,140 136,172 C120,160 80,160 64,172 Z" fill="${ocDark}"/>`);
    }

    // 목
    p.push(`<path d="M88,126 L112,126 L112,160 Q100,168 88,160 Z" fill="${skin}"/>`);
    p.push(`<path d="M88,126 L112,126 L112,142 Q100,150 88,142 Z" fill="#000" opacity=".12"/>`);

    // 복장 디테일
    if (a.outfit === 'suit') {
      const tie = a.outfitColor === 2 ? '#1f2a44' : '#8b1e2b';
      p.push(`<path d="M84,157 L100,190 L116,157 Z" fill="#f2f2f4"/>`);
      p.push(`<path d="M97,163 L103,163 L107,200 L100,210 L93,200 Z" fill="${tie}"/>`);
      p.push(`<path d="M84,157 L100,196 L76,176 L80,160 Z" fill="${ocDark}"/>`);
      p.push(`<path d="M116,157 L100,196 L124,176 L120,160 Z" fill="${ocDark}"/>`);
    } else if (a.outfit === 'jacket') {
      p.push(`<path d="M80,158 Q100,172 120,158 L122,150 Q100,164 78,150 Z" fill="${ocDark}"/>`);
      p.push(`<path d="M100,168 L100,220" stroke="#d8dbe2" stroke-width="2"/>`);
      p.push(`<path d="M40,190 C50,175 62,168 74,165 M160,190 C150,175 138,168 126,165" stroke="#fff" stroke-opacity=".55" stroke-width="5" fill="none"/>`);
    } else {
      p.push(`<path d="M93,166 L91,196 M107,166 L109,196" stroke="#e6e6ea" stroke-width="2" stroke-linecap="round"/>`);
      p.push(`<path d="M72,205 L128,205 L122,220 L78,220 Z" fill="${ocDark}"/>`);
    }

    // 귀
    p.push(`<ellipse cx="${100 - hw}" cy="100" rx="6" ry="10" fill="${skin}"/>`);
    p.push(`<ellipse cx="${100 + hw}" cy="100" rx="6" ry="10" fill="${skin}"/>`);

    // 얼굴
    if (a.face === 'square') p.push(`<rect x="62" y="50" width="76" height="90" rx="24" fill="${skin}"/>`);
    else if (a.face === 'round') p.push(`<ellipse cx="100" cy="96" rx="42" ry="43" fill="${skin}"/>`);
    else p.push(`<ellipse cx="100" cy="95" rx="38" ry="46" fill="${skin}"/>`);

    // 눈썹 / 눈 / 코 / 입
    p.push(`<path d="M77,89 Q85,85 92,89 M108,89 Q115,85 123,89" stroke="${this.shade(hc, 0.05)}" stroke-width="3" stroke-linecap="round" fill="none"/>`);
    p.push(`<ellipse cx="85" cy="100" rx="3.6" ry="4.2" fill="#1d1d22"/><ellipse cx="115" cy="100" rx="3.6" ry="4.2" fill="#1d1d22"/>`);
    p.push(`<circle cx="86.2" cy="98.6" r="1.1" fill="#fff"/><circle cx="116.2" cy="98.6" r="1.1" fill="#fff"/>`);
    p.push(`<path d="M100,104 Q96,113 101,114" stroke="${this.shade(skin, -0.25)}" stroke-width="2" fill="none" stroke-linecap="round"/>`);
    p.push(`<path d="M90,123 Q100,129 110,123" stroke="#8a4a3c" stroke-width="2.5" fill="none" stroke-linecap="round"/>`);

    // 앞머리
    const front = {
      short: 'M60,92 C56,52 80,40 100,40 C120,40 144,52 140,92 C136,74 124,62 100,62 C76,62 64,74 60,92 Z',
      part: 'M58,96 C54,50 84,38 104,40 C130,42 146,60 142,96 C140,78 132,66 118,62 C104,72 82,74 62,82 Z',
      long: 'M58,100 C52,30 148,30 142,100 C138,80 126,64 104,62 C92,74 74,80 60,100 Z',
      buzz: 'M60,90 C58,35 142,35 140,90 C136,72 122,62 100,62 C78,62 64,72 60,90 Z',
    };
    if (front[a.hair]) {
      p.push(`<path d="${front[a.hair]}" fill="${hc}" ${a.hair === 'buzz' ? 'opacity=".85"' : ''}/>`);
    } else if (a.hair === 'curly') {
      p.push(`<path d="${front.short}" fill="${hc}"/>`);
      for (let i = 0; i <= 8; i++) {
        const t = Math.PI * (1.08 + i * 0.105);
        const x = 100 + Math.cos(t) * (hw + 2), y = 86 + Math.sin(t) * 44;
        p.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="11" fill="${hc}"/>`);
      }
    }

    // 안경
    if (a.glasses === 'round') {
      p.push(`<g stroke="#202228" stroke-width="2.5" fill="#fff" fill-opacity=".08"><circle cx="85" cy="100" r="10"/><circle cx="115" cy="100" r="10"/><path d="M95,100 Q100,96 105,100 M75,99 L${100 - hw},96 M125,99 L${100 + hw},96" fill="none"/></g>`);
    } else if (a.glasses === 'square') {
      p.push(`<g stroke="#202228" stroke-width="2.5" fill="#fff" fill-opacity=".08"><rect x="73" y="92" width="24" height="16" rx="3"/><rect x="103" y="92" width="24" height="16" rx="3"/><path d="M97,99 L103,99 M73,98 L${100 - hw},96 M127,98 L${100 + hw},96" fill="none"/></g>`);
    }

    return `<svg viewBox="0 0 200 220" xmlns="http://www.w3.org/2000/svg">${p.join('')}</svg>`;
  },
};
