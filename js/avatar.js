// 감독 아바타: 옵션 조합 → SVG 문자열 (사실적인 증명사진 느낌: 실제 비율 + 그라데이션 음영)
const Avatar = {
  options: {
    face: [{ id: 'oval', label: '갸름형' }, { id: 'round', label: '둥근형' }, { id: 'square', label: '각진형' }],
    skin: ['#f3d5bf', '#e8bf9f', '#d4a07c', '#b27b57', '#80563b'],
    hair: [
      { id: 'short', label: '단정한 숏컷' }, { id: 'part', label: '가르마' }, { id: 'slick', label: '넘긴 머리' },
      { id: 'long', label: '장발' }, { id: 'curly', label: '곱슬' }, { id: 'buzz', label: '짧게 깎음' }, { id: 'none', label: '민머리' },
    ],
    hairColor: ['#17171a', '#2f241d', '#4f3a2a', '#7a5a3c', '#5d5f66', '#a9abb0'],
    beard: [{ id: 'none', label: '없음' }, { id: 'stubble', label: '수염 자국' }, { id: 'mustache', label: '콧수염' }, { id: 'full', label: '턱수염' }],
    glasses: [{ id: 'none', label: '없음' }, { id: 'round', label: '얇은 금속테' }, { id: 'square', label: '뿔테' }],
    outfit: [{ id: 'suit', label: '정장' }, { id: 'jacket', label: '팀 재킷' }, { id: 'shirt', label: '셔츠' }],
    outfitColor: ['#1c2436', '#2a2b2f', '#14151a', '#3b4250', '#4a2228', '#24372f'],
  },

  // UI에 노출할 그룹 정의 (key, 라벨, 타입)
  groups: [
    ['face', '얼굴형', 'text'], ['skin', '피부톤', 'color'],
    ['hair', '헤어스타일', 'text'], ['hairColor', '머리색', 'color'],
    ['beard', '수염', 'text'], ['glasses', '안경', 'text'],
    ['outfit', '복장', 'text'], ['outfitColor', '복장 색', 'color'],
  ],

  defaults() {
    return { face: 'oval', skin: 1, hair: 'short', hairColor: 0, beard: 'none', glasses: 'none', outfit: 'suit', outfitColor: 0 };
  },

  random() {
    const a = {};
    for (const [key, opts] of Object.entries(this.options)) {
      const i = Math.floor(Math.random() * opts.length);
      a[key] = typeof opts[0] === 'string' ? i : opts[i].id;
    }
    if (Math.random() < .6) a.beard = 'none';
    if (Math.random() < .6) a.glasses = 'none';
    return a;
  },

  shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const f = c => Math.max(0, Math.min(255, Math.round(c + 255 * amt)));
    return '#' + [f(n >> 16), f((n >> 8) & 255), f(n & 255)].map(v => v.toString(16).padStart(2, '0')).join('');
  },

  FACE: {
    oval: 'M100,40 C126,40 138,60 138,92 C138,112 134,126 124,138 C116,147 108,152 100,152 C92,152 84,147 76,138 C66,126 62,112 62,92 C62,60 74,40 100,40 Z',
    round: 'M100,42 C128,42 140,62 140,94 C140,116 135,131 123,141 C115,148 107,151 100,151 C93,151 85,148 77,141 C65,131 60,116 60,94 C60,62 72,42 100,42 Z',
    square: 'M100,40 C127,40 139,58 139,90 C139,110 138,124 133,135 C126,147 113,151 100,151 C87,151 74,147 67,135 C62,124 61,110 61,90 C61,58 73,40 100,40 Z',
  },

  _n: 0,

  render(a) {
    a = { ...this.defaults(), ...a };
    if (a.outfit === 'hoodie') a.outfit = 'shirt'; // 예전 저장 호환
    const id = 'av' + (++this._n);
    const skin = this.options.skin[a.skin] || this.options.skin[1];
    const hc = this.options.hairColor[a.hairColor] || this.options.hairColor[0];
    const oc = this.options.outfitColor[a.outfitColor] || this.options.outfitColor[0];
    const face = this.FACE[a.face] || this.FACE.oval;
    const sD = this.shade(skin, -0.12), sDD = this.shade(skin, -0.22), sL = this.shade(skin, 0.06);
    const hL = this.shade(hc, 0.14);
    const p = [];

    p.push(`<defs>
      <radialGradient id="${id}f" cx="50%" cy="42%" r="62%"><stop offset="0" stop-color="${sL}"/><stop offset=".65" stop-color="${skin}"/><stop offset="1" stop-color="${sD}"/></radialGradient>
      <linearGradient id="${id}n" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sDD}"/><stop offset=".55" stop-color="${sD}"/><stop offset="1" stop-color="${skin}"/></linearGradient>
      <linearGradient id="${id}h" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${hL}"/><stop offset="1" stop-color="${hc}"/></linearGradient>
      <linearGradient id="${id}o" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${this.shade(oc, 0.07)}"/><stop offset="1" stop-color="${this.shade(oc, -0.05)}"/></linearGradient>
      <clipPath id="${id}c"><path d="${face}"/></clipPath>
    </defs>`);

    // 뒷머리 (장발)
    if (a.hair === 'long') p.push(`<path d="M57,96 C52,48 148,48 143,96 L146,150 Q139,160 131,150 L132,112 L68,112 L69,150 Q61,160 54,150 Z" fill="url(#${id}h)"/>`);

    // 몸통
    p.push(`<path d="M4,220 C8,192 24,180 50,172 C62,168 74,164 86,159 L114,159 C126,164 138,168 150,172 C176,180 192,192 196,220 Z" fill="url(#${id}o)"/>`);

    // 목 (턱 아래 그림자)
    p.push(`<path d="M84,132 L84,164 C90,171 110,171 116,164 L116,132 Z" fill="url(#${id}n)"/>`);

    // 복장
    if (a.outfit === 'suit') {
      const tie = [3, 5].includes(a.outfitColor) ? '#6e1f2b' : a.outfitColor === 4 ? '#1d2a44' : '#7b1d2a';
      p.push(`<path d="M86,159 L100,202 L114,159 C108,166 92,166 86,159 Z" fill="#eef0f3"/>`);
      p.push(`<path d="M86,158 L94,177 L100,166 Z M114,158 L106,177 L100,166 Z" fill="#fff"/>`);
      p.push(`<path d="M96,167 L104,167 L102.5,175 L97.5,175 Z" fill="${this.shade(tie, -0.06)}"/><path d="M97.5,175 L102.5,175 L106,204 L100,212 L94,204 Z" fill="${tie}"/>`);
      p.push(`<path d="M85,159 L100,203 L91,208 L74,180 L81,171 L77,165 Z" fill="${this.shade(oc, -0.07)}"/><path d="M115,159 L100,203 L109,208 L126,180 L119,171 L123,165 Z" fill="${this.shade(oc, -0.07)}"/>`);
      p.push(`<path d="M85,159 L100,203 M115,159 L100,203" stroke="#000" stroke-opacity=".25" stroke-width="1"/>`);
      p.push(`<path d="M140,190 L156,188" stroke="#fff" stroke-opacity=".45" stroke-width="2"/>`);
    } else if (a.outfit === 'jacket') {
      p.push(`<path d="M80,156 C88,170 112,170 120,156 L124,168 C114,180 86,180 76,168 Z" fill="${this.shade(oc, -0.08)}"/>`);
      p.push(`<path d="M100,176 L100,220" stroke="#c9ccd3" stroke-width="1.6"/>`);
      p.push(`<path d="M34,188 C46,178 60,172 74,168 M166,188 C154,178 140,172 126,168" stroke="#c8a24a" stroke-opacity=".8" stroke-width="3" fill="none"/>`);
      p.push(`<circle cx="138" cy="192" r="6" fill="#c8a24a" fill-opacity=".85"/>`);
    } else {
      p.push(`<path d="M86,158 L100,186 L114,158 C108,165 92,165 86,158 Z" fill="url(#${id}n)"/>`);
      p.push(`<path d="M84,156 L100,188 L86,184 L78,166 Z M116,156 L100,188 L114,184 L122,166 Z" fill="${this.shade(oc, 0.1)}"/>`);
      p.push(`<path d="M100,188 L100,220" stroke="#000" stroke-opacity=".2" stroke-width="1.2"/><circle cx="100" cy="198" r="1.4" fill="#000" fill-opacity=".3"/><circle cx="100" cy="212" r="1.4" fill="#000" fill-opacity=".3"/>`);
    }

    // 귀
    p.push(`<path d="M63,94 C54,90 51,102 54,110 C56,118 61,120 65,118 Z M137,94 C146,90 149,102 146,110 C144,118 139,120 135,118 Z" fill="${sD}"/>`);
    p.push(`<path d="M60,100 C58,104 59,110 62,113 M140,100 C142,104 141,110 138,113" stroke="${sDD}" stroke-width="1.4" fill="none" stroke-linecap="round"/>`);

    // 얼굴
    p.push(`<path d="${face}" fill="url(#${id}f)"/>`);
    // 음영: 광대 아래·관자놀이·턱선
    p.push(`<g clip-path="url(#${id}c)">
      <ellipse cx="70" cy="118" rx="10" ry="16" fill="${sDD}" opacity=".18"/><ellipse cx="130" cy="118" rx="10" ry="16" fill="${sDD}" opacity=".18"/>
      <path d="M62,128 C74,150 126,150 138,128 L140,160 L60,160 Z" fill="${sDD}" opacity=".12"/>
    </g>`);

    // 수염
    if (a.beard !== 'none') {
      const op = a.beard === 'stubble' ? .22 : .55;
      if (a.beard !== 'mustache') p.push(`<g clip-path="url(#${id}c)"><path d="M64,112 C66,132 80,150 100,152 C120,150 134,132 136,112 C130,124 122,132 112,134 C108,130 92,130 88,134 C78,132 70,124 64,112 Z" fill="${hc}" opacity="${op}"/></g>`);
      p.push(`<path d="M86,127 C92,122 108,122 114,127 C108,126 103,125.5 100,126.5 C97,125.5 92,126 86,127 Z" fill="${hc}" opacity="${a.beard === 'stubble' ? .3 : .85}"/>`);
    }

    // 눈썹
    const brow = this.shade(hc, a.hairColor >= 4 ? -0.1 : 0.04);
    p.push(`<path d="M73,90 C78,86 86,85 93,88 L93,91 C86,89 79,89.5 74,92.5 Z M127,90 C122,86 114,85 107,88 L107,91 C114,89 121,89.5 126,92.5 Z" fill="${brow}"/>`);

    // 눈
    for (const cx of [84, 116]) {
      const dir = cx < 100 ? 1 : -1;
      p.push(`<path d="M${cx - 8},100.5 Q${cx},94.5 ${cx + 8},100.5 Q${cx},104.5 ${cx - 8},100.5 Z" fill="#f3efe9"/>`);
      p.push(`<circle cx="${cx + dir * 0.6}" cy="100.2" r="3.4" fill="#3a2a20"/><circle cx="${cx + dir * 0.6}" cy="100.2" r="1.6" fill="#120d0a"/><circle cx="${cx + dir * 0.6 + 1}" cy="99" r=".8" fill="#fff" opacity=".85"/>`);
      p.push(`<path d="M${cx - 8.5},100.5 Q${cx},93.8 ${cx + 8.5},100.5" stroke="#2a1f1a" stroke-width="1.4" fill="none" stroke-linecap="round"/>`);
      p.push(`<path d="M${cx - 6},103.6 Q${cx},105.4 ${cx + 6},103.6" stroke="${sDD}" stroke-width=".8" fill="none" opacity=".7"/>`);
    }

    // 코
    p.push(`<path d="M98,100 C97,108 95,113 94,116" stroke="${sDD}" stroke-width="1.2" fill="none" opacity=".55" stroke-linecap="round"/>`);
    p.push(`<path d="M93.5,117.5 Q97,121 100,119.5 Q103,121 106.5,117.5" stroke="${sDD}" stroke-width="1.4" fill="none" stroke-linecap="round"/>`);
    p.push(`<ellipse cx="100" cy="114.5" rx="3" ry="2.2" fill="#fff" opacity=".12"/>`);

    // 입
    const lip = this.shade(skin, -0.2);
    p.push(`<path d="M89,130 Q95,127.6 100,129 Q105,127.6 111,130 Q100,131.5 89,130 Z" fill="${lip}"/>`);
    p.push(`<path d="M90,130.4 Q100,136.5 110,130.4 Q100,132.8 90,130.4 Z" fill="${this.shade(skin, -0.12)}"/>`);
    p.push(`<path d="M89,130 Q100,132 111,130" stroke="${this.shade(skin, -0.3)}" stroke-width="1" fill="none" stroke-linecap="round"/>`);

    // 앞머리
    const front = {
      short: 'M61,94 C56,58 72,35 102,34 C131,34 146,56 139,94 C138,82 135,72 130,66 C118,60 104,62 92,58 C80,62 68,74 63,90 Z',
      part: 'M60,96 C53,56 73,31 104,32 C135,33 149,58 140,96 C139,80 136,69 130,62 C120,56 108,52 96,56 C82,60 68,74 62,94 Z',
      slick: 'M61,90 C57,52 76,33 101,33 C126,33 144,52 139,90 C137,74 131,62 120,57 C108,53 92,53 80,57 C69,62 63,74 61,90 Z',
      long: 'M60,100 C52,18 148,18 140,100 C137,80 128,66 112,60 C106,58 102,60 100,64 C98,60 94,58 88,60 C72,66 63,80 60,100 Z',
      buzz: 'M62,90 C60,50 76,38 100,38 C124,38 140,50 138,90 C136,76 129,66 118,62 C106,59 94,59 82,62 C71,66 64,76 62,90 Z',
    };
    if (a.hair === 'curly') {
      // 짧은 곱슬: 두피를 덮는 돔 + 촘촘한 컬 두 줄
      p.push(`<path d="M60,94 C55,54 72,32 100,32 C128,32 145,54 140,94 C137,80 132,70 126,64 C112,58 88,58 74,64 C68,70 63,80 60,94 Z" fill="${hc}"/>`);
      for (const [ry, n, r] of [[40, 13, 5.2], [33, 11, 4.6]]) {
        for (let i = 0; i < n; i++) {
          const t = Math.PI * (1.14 + i * (0.72 / (n - 1)));
          const x = 100 + Math.cos(t) * (ry === 40 ? 39 : 30), y = 84 + Math.sin(t) * (ry === 40 ? 46 : 40);
          p.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" fill="${(i + ry) % 2 ? hc : this.shade(hc, 0.05)}"/>`);
        }
      }
    } else if (front[a.hair]) {
      p.push(`<path d="${front[a.hair]}" fill="url(#${id}h)" ${a.hair === 'buzz' ? 'opacity=".72"' : ''}/>`);
      // 결: 가는 하이라이트
      if (a.hair === 'part') p.push(`<path d="M96,36 C92,44 88,52 84,60 M108,36 C118,42 128,52 134,64" stroke="${this.shade(hc, 0.22)}" stroke-width="1.2" fill="none" opacity=".5"/>`);
      if (a.hair === 'slick') p.push(`<path d="M80,56 C86,44 96,38 108,37 M92,55 C98,46 108,41 120,42 M106,54 C112,48 122,46 132,52" stroke="${this.shade(hc, 0.22)}" stroke-width="1.2" fill="none" opacity=".45"/>`);
      if (a.hair === 'short') p.push(`<path d="M74,52 C86,42 104,38 122,44" stroke="${this.shade(hc, 0.22)}" stroke-width="1.2" fill="none" opacity=".4"/>`);
    } else {
      p.push(`<ellipse cx="94" cy="54" rx="18" ry="7" fill="#fff" opacity=".1"/>`);
    }

    // 안경
    if (a.glasses === 'round') {
      p.push(`<g stroke="#9a8a6a" stroke-width="1.3" fill="#cfe3ff" fill-opacity=".1"><circle cx="84" cy="100" r="10.5"/><circle cx="116" cy="100" r="10.5"/><path d="M94.5,99 Q100,96 105.5,99 M73.5,98 L62,96 M126.5,98 L138,96" fill="none"/></g>`);
    } else if (a.glasses === 'square') {
      p.push(`<g stroke="#15151a" stroke-width="2.6" fill="#cfe3ff" fill-opacity=".08"><rect x="71" y="91.5" width="26" height="17" rx="3.5"/><rect x="103" y="91.5" width="26" height="17" rx="3.5"/><path d="M97,98 Q100,96 103,98 M71,97 L62,95 M129,97 L138,95" fill="none"/></g>`);
    }

    return `<svg viewBox="0 0 200 220" xmlns="http://www.w3.org/2000/svg">${p.join('')}</svg>`;
  },
};
