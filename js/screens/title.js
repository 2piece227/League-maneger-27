// 메인 타이틀: 트로피 + 역대 우승팀 스트립 + 메뉴
Screens.title = {
  played: false,

  init() {
    this.el = $('#screen-title');
    this.renderWinners();
    $$('.main-menu button', this.el).forEach(b => {
      b.addEventListener('click', () => this.actions[b.dataset.action].call(this));
    });
  },

  enter() {
    // 첫 진입만 천천히 밝아지는 연출, 이후에는 바로 표시
    this.el.classList.add('play');
    if (this.played) this.el.classList.add('instant');
    this.played = true;
    this.startCeremony();
  },

  leave() {
    clearInterval(this.cerTimer);
  },

  // 트로피 뒤 우승 세레머니 사진. year가 없으면 팀명만 표시한다.
  CEREMONY: [
    ['2016-skt', 2016, 'SK Telecom T1'],
    ['2017-ssg', 2017, 'Samsung Galaxy'],
    ['2018-ig', 2018, 'Invictus Gaming'],
    ['2019-fpx', 2019, 'FunPlus Phoenix'],
    ['2020-dwg', 2020, 'DAMWON Gaming'],
    ['2021-edg', 2021, 'EDward Gaming'],
    ['2022-drx', 2022, 'DRX'],
    ['t1', null, 'T1'],
  ],

  startCeremony() {
    const box = $('#ceremony');
    const cap = $('#ceremony-cap');
    if (!box.children.length) {
      box.innerHTML = this.CEREMONY.map(([f]) => `<div class="cer-slide" style="background-image:url('assets/ceremony/${f}.webp')"></div>`).join('');
    }
    const slides = [...box.children];
    const show = i => {
      slides.forEach((s, j) => s.classList.toggle('on', j === i));
      const [, year, team] = this.CEREMONY[i];
      cap.classList.add('hide');
      setTimeout(() => {
        cap.innerHTML = `${year ? `<b>${year}</b>` : ''}${UI.esc(team)} · WORLD CHAMPION`;
        cap.classList.remove('hide');
      }, 900);
    };
    clearInterval(this.cerTimer);
    this.cerIndex = this.cerIndex ?? Math.floor(Math.random() * slides.length);
    show(this.cerIndex);
    this.cerTimer = setInterval(() => {
      this.cerIndex = (this.cerIndex + 1) % slides.length;
      show(this.cerIndex);
    }, 7000);
  },

  renderWinners() {
    const worlds = App.db.history.worlds;
    const logo = w => w.logo ? `<img class="win-logo" src="${w.logo}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : '';
    const cards = worlds.map(w => w.photo ? `
      <div class="win-card photo" style="--c:${w.color}">
        <img class="win-photo" src="${w.photo}" alt="${UI.esc(w.team)} ${w.year}" referrerpolicy="no-referrer" onerror="this.closest('.win-card').classList.remove('photo');this.remove()">
        ${logo(w)}
        <div class="win-head"><div class="win-year">${w.year}</div><div class="win-team">${UI.esc(w.team)}</div></div>
        <div class="win-meta">WORLD CHAMPION · ${w.region}</div>
      </div>` : `
      <div class="win-card" style="--c:${w.color}">
        ${logo(w)}
        <div class="win-year">${w.year}</div>
        <div>
          <div class="win-team">${UI.esc(w.team)}</div>
          <div class="win-meta">WORLD CHAMPION · ${w.region}</div>
        </div>
      </div>`).join('');
    $('.winners-strip', this.el).classList.toggle('has-photos', worlds.some(w => w.photo));
    // 끊김 없는 루프를 위해 두 번 반복
    $('#winners-track').innerHTML = cards + cards;
  },

  actions: {
    new() {
      App.show('profile');
    },

    load() {
      const slots = SaveSystem.list().map((s, i) => `
        <div class="save-slot"><span>슬롯 ${i + 1}</span><span>${s ? UI.esc(s.label) : '비어 있음'}</span></div>`).join('');
      UI.modal({
        title: '불러오기',
        body: slots + '<p style="color:var(--muted);font-size:12px;margin:8px 0 0">저장 기능은 아직 구현되지 않았습니다.</p>',
      });
    },

    settings() {
      const s = App.state.settings;
      UI.modal({
        title: '설정',
        body: `
          <div class="set-row"><div>인트로 건너뛰기<small>다음 실행부터 고지 화면 생략</small></div>
            <input type="checkbox" id="set-skip" ${s.skipIntro ? 'checked' : ''}></div>
          <div class="set-row"><div>기본 시뮬레이션 속도</div>
            <select id="set-speed">
              <option value="slow">느리게</option><option value="normal">보통</option><option value="fast">빠르게</option>
            </select></div>
          <div class="set-row"><div>효과음 볼륨</div>
            <input type="range" id="set-vol" min="0" max="100" value="${s.volume}"></div>`,
        actions: [
          { label: '취소' },
          {
            label: '저장', primary: true,
            onClick: m => {
              s.skipIntro = $('#set-skip', m).checked;
              s.simSpeed = $('#set-speed', m).value;
              s.volume = +$('#set-vol', m).value;
              Settings.save(s);
            },
          },
        ],
      });
      $('#set-speed').value = s.simSpeed;
    },

    quit() {
      UI.modal({
        title: '게임 종료',
        body: '게임을 종료하시겠습니까?',
        actions: [
          { label: '취소' },
          {
            label: '종료', primary: true,
            onClick: () => {
              Game.quit();
              // 브라우저가 창 닫기를 막으면 안내만 띄운다
              setTimeout(() => UI.modal({ title: '게임 종료', body: '브라우저 탭을 닫아 종료해 주세요.' }), 150);
            },
          },
        ],
      });
    },
  },
};
