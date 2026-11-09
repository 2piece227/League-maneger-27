// 감독 프로필 생성: 아바타 + 기본 정보
Screens.profile = {
  avatar: null,

  labels: {
    nation: { KR: '대한민국', CN: '중국', EU: '유럽', NA: '북미', ETC: '기타' },
    bg: { 'ex-pro': '전직 프로게이머', analyst: '분석관 출신', coach: '코치 출신', none: '신인 감독' },
  },

  init() {
    this.el = $('#screen-profile');
    this.avatar = Avatar.defaults();
    this.renderOptions();

    $('#avatar-random').onclick = () => { this.avatar = Avatar.random(); this.renderOptions(); this.update(); };
    ['#pf-name', '#pf-nation', '#pf-age', '#pf-bg'].forEach(s => $(s).addEventListener('input', () => this.update()));
    $('#pf-next').onclick = () => this.submit();
  },

  enter() {
    this.update();
  },

  renderOptions() {
    const html = Avatar.groups.map(([key, label, type]) => {
      const opts = Avatar.options[key];
      const btns = opts.map((o, i) => type === 'color'
        ? `<button class="swatch ${this.avatar[key] === i ? 'on' : ''}" style="background:${o}" data-k="${key}" data-v="${i}" aria-label="${label} ${i + 1}"></button>`
        : `<button class="opt-btn ${this.avatar[key] === o.id ? 'on' : ''}" data-k="${key}" data-v="${o.id}">${o.label}</button>`).join('');
      return `<div class="opt-group"><div class="opt-label">${label}</div><div class="opt-row">${btns}</div></div>`;
    }).join('');
    const box = $('#avatar-options');
    box.innerHTML = html;
    $$('button', box).forEach(b => b.onclick = () => {
      const k = b.dataset.k;
      this.avatar[k] = typeof Avatar.options[k][0] === 'string' ? +b.dataset.v : b.dataset.v;
      this.renderOptions();
      this.update();
    });
  },

  read() {
    return {
      name: $('#pf-name').value.trim(),
      nation: $('#pf-nation').value,
      age: +$('#pf-age').value,
      background: $('#pf-bg').value,
      avatar: { ...this.avatar },
    };
  },

  update() {
    const m = this.read();
    $('#avatar-preview').innerHTML = Avatar.render(this.avatar);
    $('#nc-name').textContent = m.name || '이름 없음';
    $('#nc-meta').textContent = `${this.labels.nation[m.nation]} · ${m.age}세 · ${this.labels.bg[m.background]}`;
    $('#pf-hint').textContent = '';
  },

  submit() {
    const m = this.read();
    if (!m.name) { $('#pf-hint').textContent = '감독 이름을 입력해 주세요.'; $('#pf-name').focus(); return; }
    if (!(m.age >= 25 && m.age <= 70)) { $('#pf-hint').textContent = '나이는 25~70세 사이로 정해 주세요.'; return; }
    App.state.manager = m;
    App.show('team');
  },
};
