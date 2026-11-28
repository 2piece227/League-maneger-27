// 가상 신상: 생년월일 · 본명이 없는 선수(생성 유스 · 2군 채움 선수 · 기록이 없는 실명 선수)에게 국적에 맞는 가상 본명과 생년월일을 붙인다.
//   같은 선수는 언제 불러와도 같은 값이 나온다 (선수 id로 정한 난수). 생성 유스는 만들 때 한 번 정해 저장본에 남는다.
//   생년월일이 있으면 실명 선수처럼 생일마다 나이를 먹는다 (예전에는 테스트로 뽑은 유스 · 2군 채움 선수가 입단 나이에서 멈춰 있었다 — 베타 제보)
const Ident = {
  rng(seed) {
    let h = 2166136261 >>> 0; for (const ch of String(seed)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
    let a = h;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  },
  pick(r, a) { return a[Math.floor(r() * a.length)]; },

  // 국적별 이름표: [성, 이름] (본명은 Leaguepedia 표기처럼 "성 이름", 한국 · 중국은 원어 이름도)
  KO: {
    fam: [['Kim', '김'], ['Lee', '이'], ['Park', '박'], ['Choi', '최'], ['Jung', '정'], ['Kang', '강'], ['Cho', '조'], ['Yoon', '윤'], ['Jang', '장'], ['Lim', '임'], ['Han', '한'], ['Oh', '오'], ['Seo', '서'], ['Shin', '신'], ['Kwon', '권'], ['Hwang', '황'], ['Ahn', '안'], ['Song', '송'], ['Yoo', '유'], ['Hong', '홍'], ['Jeon', '전'], ['Moon', '문'], ['Baek', '백'], ['Noh', '노']],
    given: [['Cheol-su', '철수'], ['Yeong-ho', '영호'], ['Min-jun', '민준'], ['Seo-jun', '서준'], ['Do-yun', '도윤'], ['Ye-jun', '예준'], ['Si-u', '시우'], ['Ha-jun', '하준'], ['Ji-ho', '지호'], ['Jun-seo', '준서'], ['Geon-u', '건우'], ['Hyeon-u', '현우'], ['U-jin', '우진'], ['Ji-hun', '지훈'], ['Seon-u', '선우'], ['Yeon-u', '연우'], ['Jeong-u', '정우'], ['Seung-u', '승우'], ['Seung-hyeon', '승현'], ['Min-jae', '민재'], ['Hyeon-jun', '현준'], ['Ji-hwan', '지환'], ['Dong-hyeon', '동현'], ['Jae-won', '재원'], ['Tae-yun', '태윤'], ['Seong-min', '성민'], ['Jun-hyeok', '준혁'], ['Min-seok', '민석'], ['Gyu-min', '규민'], ['Tae-hun', '태훈'], ['Su-hwan', '수환'], ['Chan-yeong', '찬영'], ['Ju-won', '주원'], ['Dong-ha', '동하']],
  },
  CN: {
    fam: [['Wang', '王'], ['Li', '李'], ['Zhang', '张'], ['Liu', '刘'], ['Chen', '陈'], ['Yang', '杨'], ['Zhao', '赵'], ['Huang', '黄'], ['Zhou', '周'], ['Wu', '吴'], ['Xu', '徐'], ['Sun', '孙'], ['Hu', '胡'], ['Zhu', '朱'], ['Gao', '高'], ['Lin', '林'], ['He', '何'], ['Guo', '郭'], ['Ma', '马'], ['Luo', '罗'], ['Tang', '唐'], ['Song', '宋']],
    given: [['Hao-Ran', '浩然'], ['Zi-Xuan', '子轩'], ['Yu-Hang', '宇航'], ['Jun-Jie', '俊杰'], ['Hao-Yu', '浩宇'], ['Yi-Fan', '一帆'], ['Tian-Yu', '天宇'], ['Ming-Hao', '明浩'], ['Jia-Hao', '嘉豪'], ['Wen-Bo', '文博'], ['Zhi-Hao', '志豪'], ['Yu-Xuan', '宇轩'], ['Rui', '睿'], ['Kai', '凯'], ['Chen-Xi', '晨曦'], ['Bo-Wen', '博文'], ['Si-Yuan', '思远'], ['Xin-Yu', '鑫宇'], ['Jun-Hao', '俊豪'], ['Zi-Hao', '子豪'], ['Yi-Chen', '奕辰'], ['Peng', '鹏']],
  },
  // 서양 · 기타: [이름들, 성들] — 본명은 "이름 성"
  WEST: {
    en: [['James', 'John', 'Michael', 'David', 'Daniel', 'Matthew', 'Ryan', 'Tyler', 'Kevin', 'Jason', 'Brandon', 'Andrew', 'Ethan', 'Noah', 'Lucas', 'Nathan', 'Jacob', 'Alex', 'Chris', 'Kyle', 'Logan', 'Owen'],
      ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Miller', 'Davis', 'Wilson', 'Anderson', 'Taylor', 'Thomas', 'Moore', 'Martin', 'Walker', 'Hall', 'Young', 'King', 'Wright', 'Scott', 'Baker', 'Carter', 'Mitchell']],
    fr: [['Lucas', 'Hugo', 'Louis', 'Théo', 'Nathan', 'Mathis', 'Enzo', 'Raphaël', 'Arthur', 'Maxime', 'Antoine', 'Julien', 'Clément', 'Quentin'],
      ['Martin', 'Bernard', 'Dubois', 'Thomas', 'Robert', 'Richard', 'Petit', 'Durand', 'Leroy', 'Moreau', 'Simon', 'Laurent', 'Lefebvre', 'Michel']],
    es: [['Pablo', 'Javier', 'Alejandro', 'Daniel', 'Adrián', 'Álvaro', 'Sergio', 'Carlos', 'Diego', 'Marcos', 'Hugo', 'Iván'],
      ['García', 'Martínez', 'López', 'Sánchez', 'Pérez', 'Gómez', 'Fernández', 'Ruiz', 'Díaz', 'Moreno', 'Romero', 'Navarro']],
    de: [['Lukas', 'Leon', 'Jonas', 'Finn', 'Paul', 'Felix', 'Maximilian', 'Niklas', 'Tim', 'Jan', 'Moritz', 'Tobias'],
      ['Müller', 'Schmidt', 'Schneider', 'Fischer', 'Weber', 'Meyer', 'Wagner', 'Becker', 'Hoffmann', 'Schulz', 'Koch', 'Richter']],
    pl: [['Jakub', 'Kacper', 'Szymon', 'Mateusz', 'Filip', 'Bartosz', 'Michał', 'Piotr', 'Kamil', 'Paweł', 'Adam', 'Wiktor'],
      ['Nowak', 'Kowalski', 'Wiśniewski', 'Wójcik', 'Kowalczyk', 'Kamiński', 'Lewandowski', 'Zieliński', 'Szymański', 'Woźniak', 'Dąbrowski', 'Mazur']],
    dk: [['Mads', 'Rasmus', 'Emil', 'Oscar', 'William', 'Mikkel', 'Jonas', 'Magnus', 'Frederik', 'Christian'],
      ['Jensen', 'Nielsen', 'Hansen', 'Pedersen', 'Andersen', 'Christensen', 'Larsen', 'Sørensen', 'Rasmussen', 'Madsen']],
    se: [['Erik', 'Oscar', 'William', 'Elias', 'Viktor', 'Axel', 'Hugo', 'Filip', 'Linus', 'Albin'],
      ['Andersson', 'Johansson', 'Karlsson', 'Nilsson', 'Eriksson', 'Larsson', 'Olsson', 'Persson', 'Svensson', 'Gustafsson']],
    nl: [['Lars', 'Daan', 'Sem', 'Milan', 'Thomas', 'Ruben', 'Jesse', 'Bram', 'Thijs', 'Wout'],
      ['De Jong', 'Jansen', 'Peeters', 'Janssens', 'Maes', 'Visser', 'Smit', 'Bakker', 'Mertens', 'Willems']],
    it: [['Luca', 'Marco', 'Matteo', 'Alessandro', 'Lorenzo', 'Andrea', 'Davide', 'Simone', 'Riccardo', 'Federico'],
      ['Rossi', 'Russo', 'Ferrari', 'Esposito', 'Bianchi', 'Romano', 'Colombo', 'Ricci', 'Marino', 'Greco']],
    pt: [['Gabriel', 'Lucas', 'Matheus', 'Rafael', 'Pedro', 'Felipe', 'Gustavo', 'Bruno', 'Thiago', 'João'],
      ['Silva', 'Santos', 'Oliveira', 'Souza', 'Costa', 'Pereira', 'Almeida', 'Ferreira', 'Rodrigues', 'Carvalho']],
    vn: [['Minh', 'Anh', 'Duc', 'Huy', 'Khoa', 'Long', 'Nam', 'Phuc', 'Quang', 'Tuan', 'Bao', 'Hieu'],
      ['Nguyen', 'Tran', 'Le', 'Pham', 'Hoang', 'Phan', 'Vu', 'Dang', 'Bui', 'Do']],
    jp: [['Haruto', 'Yuto', 'Sota', 'Riku', 'Ren', 'Kaito', 'Daiki', 'Takumi', 'Kenta', 'Shota'],
      ['Sato', 'Suzuki', 'Takahashi', 'Tanaka', 'Watanabe', 'Ito', 'Yamamoto', 'Nakamura', 'Kobayashi', 'Kato']],
    tr: [['Emre', 'Burak', 'Mert', 'Can', 'Kaan', 'Arda', 'Ege', 'Yusuf', 'Berk', 'Efe'],
      ['Yılmaz', 'Kaya', 'Demir', 'Şahin', 'Çelik', 'Yıldız', 'Aydın', 'Öztürk', 'Arslan', 'Doğan']],
    gr: [['Giorgos', 'Nikos', 'Dimitris', 'Kostas', 'Giannis', 'Christos', 'Panagiotis', 'Vasilis'],
      ['Papadopoulos', 'Pappas', 'Georgiou', 'Nikolaou', 'Dimitriou', 'Ioannou', 'Vlachos', 'Konstantinou']],
    cz: [['Jakub', 'Jan', 'Tomáš', 'Matěj', 'Ondřej', 'Lukáš', 'Vojtěch', 'Adam'],
      ['Novák', 'Svoboda', 'Novotný', 'Dvořák', 'Černý', 'Procházka', 'Kučera', 'Veselý']],
  },
  LANG: {
    'United States': 'en', 'Canada': 'en', 'United Kingdom': 'en', 'England': 'en', 'Scotland': 'en', 'Wales': 'en', 'Ireland': 'en', 'Australia': 'en', 'New Zealand': 'en',
    'France': 'fr', 'Spain': 'es', 'Argentina': 'es', 'Mexico': 'es', 'Chile': 'es', 'Peru': 'es', 'Colombia': 'es', 'Germany': 'de', 'Austria': 'de', 'Switzerland': 'de',
    'Poland': 'pl', 'Denmark': 'dk', 'Norway': 'dk', 'Sweden': 'se', 'Finland': 'se', 'Netherlands': 'nl', 'Belgium': 'nl', 'Italy': 'it', 'Portugal': 'pt', 'Brazil': 'pt',
    'Vietnam': 'vn', 'Japan': 'jp', 'Turkey': 'tr', 'Greece': 'gr', 'Cyprus': 'gr', 'Czech Republic': 'cz', 'Czechia': 'cz', 'Slovakia': 'cz',
  },
  // 국적 → { realName, nativeName }
  name(nation, r) {
    if (nation === 'South Korea') { const f = this.pick(r, this.KO.fam), g = this.pick(r, this.KO.given); return { realName: `${f[0]} ${g[0]}`, nativeName: f[1] + g[1] }; }
    if (['China', 'Taiwan', 'Hong Kong', 'Macau'].includes(nation)) { const f = this.pick(r, this.CN.fam), g = this.pick(r, this.CN.given); return { realName: `${f[0]} ${g[0]}`, nativeName: f[1] + g[1] }; }
    const [first, last] = this.WEST[this.LANG[nation] || 'en'];
    if (this.LANG[nation] === 'vn') return { realName: `${this.pick(r, last)} ${this.pick(r, ['Van', 'Duc', 'Minh', 'Quoc', 'Thanh'])} ${this.pick(r, first)}`, nativeName: '' };
    return { realName: `${this.pick(r, first)} ${this.pick(r, last)}`, nativeName: '' };
  },
  // ref 날짜에 age살이 되는 생년월일 (그 해 안에서 날짜는 난수)
  birth(age, ref, r) {
    const [y, m, d] = ref.split('-').map(Number), base = Date.UTC(y - age - 1, m - 1, d) + 86400000;   // ref에 정확히 age살 (다음 생일 전)
    const t = new Date(base + Math.floor(r() * 364) * 86400000);
    return t.toISOString().slice(0, 10);
  },
  // 빈 칸만 채운다. opt: { ref: 기준일, age: 기준일 나이, level: 'first' | 'cl' }. 실명 선수는 Clock.START 기준으로 고정
  fill(p, opt = {}) {
    if (!p) return p;
    const r = this.rng('id:' + p.id);
    if (!p.birthdate) {
      const age = opt.age ?? p.age0 ?? p.age ?? (p.role === 'COACH' ? 27 + Math.floor(r() * 11) : opt.level === 'cl' ? 17 + Math.floor(r() * 4) : 19 + Math.floor(r() * 5));
      p.birthdate = this.birth(age, opt.ref || Clock.START, r); p.synth = true;
    }
    if (!p.realName && !p.nativeName) { Object.assign(p, this.name(p.nation, this.rng('nm:' + p.id + ':' + (p.nation || '')))); p.synthName = true; }
    return p;
  },
};
