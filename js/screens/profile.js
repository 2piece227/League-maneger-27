// 감독 생성: 기본 정보 · 경력 · 외형
Screens.profile = {
  SECS: ['basic', 'career', 'look'],
  sec: 'basic',

  init() {
    this.el = $('#screen-profile');
    this.reset();

    $('#pf-nation').innerHTML = Manager.NATIONS.map(([n]) => `<option value="${n}">${G.nationName(n)}</option>`).join('');
    $('#pf-years').innerHTML = Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}">${i + 1}년</option>`).join('');
    $('#pf-peak').innerHTML = Object.entries(Manager.PRO_PEAK).map(([k, [l]]) => `<option value="${k}">${l}</option>`).join('');
    $('#pf-coach').innerHTML = Array.from({ length: 16 }, (_, i) => `<option value="${i}">${i ? i + '년' : '없음'}</option>`).join('');
    $('#pf-former').innerHTML = ['LCK', 'LPL', 'LEC', 'LCS'].map(l => `<optgroup label="${l}">${App.db.teams.filter(t => t.league === l).map(t => `<option value="${t.id}">${UI.esc(t.name)}</option>`).join('')}</optgroup>`).join('') + '<option value="">기타·해체된 팀</option>';

    $('#pf-tabs').onclick = e => { const b = e.target.closest('button'); if (b) this.go(b.dataset.sec); };
    $('#pf-prev').onclick = () => this.go(this.SECS[Math.max(0, this.SECS.indexOf(this.sec) - 1)]);
    $('#pf-next').onclick = () => {
      const i = this.SECS.indexOf(this.sec);
      if (i < this.SECS.length - 1) this.go(this.SECS[i + 1]); else this.submit();
    };
    $('#avatar-random').onclick = () => { this.m.avatar = Avatar.random(); this.renderLook(); this.update(); };

    const bind = (sel, fn) => $(sel).addEventListener('input', () => { fn($(sel).value); this.update(); });
    bind('#pf-name', v => this.m.name = v.trim());
    bind('#pf-nick', v => this.m.nick = v.trim());
    bind('#pf-birth', v => this.m.birthdate = v);
    bind('#pf-birthplace', v => this.m.birthplace = v.trim());
    bind('#pf-display', v => this.m.display = v);
    bind('#pf-nation', v => {
      this.m.nation = v;
      const native = (Manager.NATIONS.find(x => x[0] === v) || [])[1];
      if (native && !this.m.languages.includes(native)) this.m.languages.unshift(native);
      this.renderLangs();
    });
    bind('#pf-role', v => this.m.background.role = v);
    bind('#pf-years', v => this.m.background.years = +v);
    bind('#pf-peak', v => this.m.background.peak = v);
    bind('#pf-former', v => this.m.background.formerTeam = v || null);
    bind('#pf-coach', v => this.m.coachYears = +v);

    this.renderBg();
    this.renderLook();
    this.renderLangs();
  },

  reset() {
    this.m = {
      name: '', nick: '', display: 'name', birthdate: '1992-06-15', nation: 'South Korea', birthplace: '',
      languages: ['ko', 'en'],
      background: { type: 'coach', role: 'MID', years: 4, peak: 'first', formerTeam: null },
      coachYears: 5,
      avatar: Avatar.defaults(),
    };
  },

  enter() {
    this.go(this.sec);
    this.update();
  },

  go(sec) {
    this.sec = sec;
    $$('#pf-tabs button').forEach(b => b.classList.toggle('on', b.dataset.sec === sec));
    $$('.pf-sec', this.el).forEach(s => s.classList.toggle('on', s.dataset.sec === sec));
    const last = sec === this.SECS[this.SECS.length - 1];
    $('#pf-next').textContent = last ? '다음: 리그·팀 선택 →' : '다음 →';
    $('#pf-prev').style.visibility = sec === this.SECS[0] ? 'hidden' : '';
  },

  renderLangs() {
    $('#pf-langs').innerHTML = Object.entries(Manager.LANGS).map(([k, l]) =>
      `<button class="opt-btn ${this.m.languages.includes(k) ? 'on' : ''}" data-l="${k}">${l}</button>`).join('');
    $$('#pf-langs button').forEach(b => b.onclick = () => {
      const k = b.dataset.l, L = this.m.languages;
      if (L.includes(k)) { if (L.length > 1) L.splice(L.indexOf(k), 1); } else L.push(k);
      this.renderLangs(); this.update();
    });
  },

  renderBg() {
    $('#pf-bg').innerHTML = Object.entries(Manager.BACKGROUNDS).map(([k, b]) => `
      <button class="bg-card ${this.m.background.type === k ? 'on' : ''}" data-bg="${k}">
        <b>${b.label}</b><span>${b.desc}</span><small>시작 평판 ${Manager.repLabel(b.rep)}</small>
      </button>`).join('');
    $$('#pf-bg .bg-card').forEach(c => c.onclick = () => {
      this.m.background.type = c.dataset.bg;
      if (c.dataset.bg === 'amateur') this.m.coachYears = 0;
      $('#pf-coach').value = this.m.coachYears;
      this.renderBg(); this.update();
    });
    $('#pf-pro').style.display = this.m.background.type === 'ex-pro' ? '' : 'none';
  },

  renderLook() {
    const html = Avatar.groups.map(([key, label, type]) => {
      const opts = Avatar.options[key];
      const btns = opts.map((o, i) => type === 'color'
        ? `<button class="swatch ${this.m.avatar[key] === i ? 'on' : ''}" style="background:${o}" data-k="${key}" data-v="${i}" aria-label="${label} ${i + 1}"></button>`
        : `<button class="opt-btn ${this.m.avatar[key] === o.id ? 'on' : ''}" data-k="${key}" data-v="${o.id}">${o.label}</button>`).join('');
      return `<div class="opt-group"><div class="opt-label">${label}</div><div class="opt-row">${btns}</div></div>`;
    }).join('');
    const box = $('#avatar-options');
    box.innerHTML = html;
    $$('button', box).forEach(b => b.onclick = () => {
      const k = b.dataset.k;
      this.m.avatar[k] = typeof Avatar.options[k][0] === 'string' ? +b.dataset.v : b.dataset.v;
      this.renderLook();
      this.update();
    });
  },

  displayName(m) {
    if (m.display === 'nick' && m.nick) return m.nick;
    if (m.display === 'both' && m.nick) return `${m.name} '${m.nick}'`;
    return m.name;
  },

  update() {
    const m = this.m;
    $('#pf-pro').style.display = m.background.type === 'ex-pro' ? '' : 'none';
    $('#avatar-preview').innerHTML = Avatar.render(m.avatar);
    $('#nc-name').textContent = this.displayName(m) || '이름 없음';
    const age = Store.ageOn(m.birthdate, Clock.today());
    $('#nc-meta').innerHTML = `${G.flag(m.nation)} ${G.nationName(m.nation)} · ${age}세 · ${Manager.BACKGROUNDS[m.background.type].label}`;
    const rep = Manager.startRep(m);
    $('#pf-summary').innerHTML = `
      <div class="pfs-row"><span>시작 평판</span><b>${Manager.repLabel(rep)}</b>${UI.stars(Manager.repStars(rep))}</div>
      <div class="pfs-row"><span>지도자 경력</span><b>${m.coachYears ? m.coachYears + '년' : '없음'}</b></div>
      <div class="pfs-row"><span>사용 언어</span><b>${Manager.langs(m).join(', ')}</b></div>`;
    $('#pf-hint').textContent = '';
  },

  submit() {
    const m = this.m;
    if (!m.name) { this.go('basic'); $('#pf-hint').textContent = '감독 이름을 입력해 주세요.'; $('#pf-name').focus(); return; }
    const age = Store.ageOn(m.birthdate, Clock.today());
    if (!(age >= 25 && age <= 70)) { this.go('basic'); $('#pf-hint').textContent = '나이는 25~70세 사이로 정해 주세요.'; return; }
    App.state.manager = JSON.parse(JSON.stringify({
      ...m, age, displayName: this.displayName(m), reputation: Manager.startRep(m), createdAt: Clock.today(),
    }));
    App.show('team');
  },
};
