// 단축키 (FM 방식). PC 전용 · 글 입력 중에는 꺼진다 (Esc 제외). ? 키로 도움말, 도움말 창에서 켜고 끈다.
const Hotkeys = {
  KEY: 'lm27.hotkeys', SLOT: 'lm27.lastSlot',
  on() { try { return localStorage.getItem(this.KEY) !== 'off'; } catch (e) { return true; } },
  set(v) { try { localStorage.setItem(this.KEY, v ? 'on' : 'off'); } catch (e) {} },
  slot() { try { return localStorage.getItem(this.SLOT) || '1'; } catch (e) { return '1'; } },

  HELP: [
    ['전체', [['Space', '계속 (하루 진행)'], ['Backspace · Alt+←', '뒤로'], ['Alt+→', '앞으로'], ['Ctrl+S', '빠른 저장 (마지막에 쓴 슬롯)'], ['Ctrl+L', '불러오기'],
      ['Alt+1~7', '메뉴: 포털 · 로스터 · 영입 · 경기 · 훈련 · 구단 · 커리어'], ['[ · ]', '하위 탭 이전 · 다음'], ['/', '선수 · 팀 검색'], ['M', '메시지'], ['?', '이 도움말'], ['Esc', '창 · 메뉴 닫기']]],
    ['밴픽', [['글자 입력', '챔피언 검색'], ['Enter', '밴 · 픽 확정'], ['0~5', '포지션 필터 (0 전체 · 1 탑 … 5 서폿)'], ['T', '타이머 바꾸기']]],
    ['경기 중계', [['Space', '일시정지 · 재생'], ['+ · −', '배속 올리기 · 내리기'], ['S', '결과로 (건너뛰기)']]],
    ['라커룸 · 창', [['1~4', '선택지 고르기'], ['Enter', '기본 버튼']]],
  ],

  init() {
    document.addEventListener('keydown', e => this.key(e));
    // 저장할 때 그 슬롯을 기억 (Ctrl+S 빠른 저장용)
    const save = SaveSystem.save.bind(SaveSystem);
    SaveSystem.save = slot => { const ok = save(slot); if (ok && slot !== 'auto') try { localStorage.setItem(this.SLOT, slot); } catch (e) {} return ok; };
  },
  vis(el) { return !!el && !el.disabled && el.offsetParent !== null; },
  click(sel, root = document) { const b = typeof sel === 'string' ? $(sel, root) : sel; if (this.vis(b)) { b.click(); return true; } return false; },
  typing(t) { return t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)); },
  inGame() { return !!document.querySelector('#screen-game.active'); },

  key(e) {
    if (e.key === '?' && !this.typing(e.target)) { e.preventDefault(); return this.help(); }
    if (!this.on() || e.isComposing) return;
    const k = e.key, r = this.inGame() ? Router.current() : '', modal = $$('.modal-back').pop();
    if (this.typing(e.target)) {
      if (k === 'Enter' && e.target.classList.contains('dr-q') && this.click('.dr-lockin')) e.preventDefault();
      return;
    }
    // 창이 떠 있으면: Enter = 기본 버튼, 1~4 = 선택지
    if (modal) {
      if (k === 'Enter') { const b = $('.modal-foot .btn-primary', modal) || $('.modal-foot button', modal); if (this.click(b)) e.preventDefault(); }
      return;
    }
    if (!this.inGame()) return;
    const go = (fn) => { e.preventDefault(); fn(); };
    if (e.ctrlKey || e.metaKey) {
      if (k === 's' || k === 'S') return go(() => this.quickSave());
      if (k === 'l' || k === 'L') return go(() => Screens.title.actions.load.call(Screens.title));
      return;
    }
    if (e.altKey) {
      if (k === 'ArrowLeft') return go(() => this.click('#nav-back'));
      if (k === 'ArrowRight') return go(() => this.click('#nav-fwd'));
      if (/^[1-7]$/.test(k)) return go(() => { const m = NAV[+k - 1]; if (m) Router.go(m.id + '-' + m.tabs.find(t => t[2] !== 'hidden')[0]); });
      return;
    }
    // 화면별
    if (r === 'match-draft') {
      if (k === 'Enter') return go(() => this.click('.dr-lockin'));
      if (/^[0-5]$/.test(k)) { const b = $$('.dr-rf button')[+k]; if (b) return go(() => b.click()); }
      if (k === 't' || k === 'T') { if (this.click('.dr-timer-t')) return e.preventDefault(); }
      if (k.length === 1 && /\S/.test(k) && !/[\[\]\/m]/i.test(k)) { const q = $('.dr-q'); if (this.vis(q)) { q.focus(); return; } }   // 바로 검색창으로 (글자는 그대로 입력된다)
    }
    if (r === 'match-live') {
      if (k === ' ') return go(() => this.click('.lv-pause') || this.click('.lv-res-btn .btn-primary'));
      if (k === '+' || k === '=' || k === '-') return go(() => { const bs = $$('.lv-speed button'), i = bs.findIndex(b => b.classList.contains('on')), j = Math.max(0, Math.min(bs.length - 1, i + (k === '-' ? -1 : 1))); if (bs[j]) bs[j].click(); });
      if (k === 's' || k === 'S') return go(() => this.click('.lv-skip'));
      if (k === 'Enter') return go(() => this.click('.lv-res-btn .btn-primary'));
    }
    if (r === 'match-locker') {
      if (/^[1-4]$/.test(k)) { const b = $$('.lk-opts button')[+k - 1]; if (b) return go(() => b.click()); }
      if (k === 'Enter') return go(() => this.click('.lk-opts .btn-primary'));
    }
    // 전체
    if (k === ' ') return go(() => this.click('.btn-continue'));
    if (k === 'Backspace') return go(() => this.click('#nav-back'));
    if (k === '[' || k === ']') return go(() => this.tab(k === ']' ? 1 : -1));
    if (k === '/') return go(() => this.search());
    if (k === 'm' || k === 'M') return go(() => Router.go('portal-messages'));
    if (k === 'Escape') $('#screen-game').classList.remove('menu-open');
  },

  tab(d) {
    const r = Router.current(), m = NAV.find(x => r.startsWith(x.id + '-')); if (!m) return;
    const tabs = m.tabs.filter(t => t[2] !== 'hidden').map(t => m.id + '-' + t[0]), i = tabs.indexOf(r);
    Router.go(tabs[(i + d + tabs.length) % tabs.length] || tabs[0]);
  },
  quickSave() {
    const s = this.slot();
    if (SaveSystem.save(s)) UI.toast(`슬롯 ${s}에 저장했습니다 (Ctrl+S)`, 2200); else UI.toast('지금은 저장할 수 없습니다 (경기 중 등)', 2600);
  },

  // / : 선수 · 팀 검색 → Enter 또는 클릭으로 이동
  search() {
    UI.modal({ title: '선수 · 팀 검색', body: `<input class="ch-search hk-q" type="search" placeholder="이름 · 팀 약칭 (예: Faker, T1)" autocomplete="off"><div class="hk-res"></div>` });
    const back = $$('.modal-back').pop(), q = $('.hk-q', back), res = $('.hk-res', back);
    const norm = s => String(s || '').toLowerCase().replace(/\s/g, '');
    const draw = () => {
      const v = norm(q.value); if (!v) { res.innerHTML = '<p class="cr-dim">두 글자 이상 입력하세요</p>'; return; }
      const teams = App.db.teams.filter(t => norm(t.name).includes(v) || norm(t.short).includes(v)).slice(0, 4);
      const pls = Player.all().filter(({ p }) => p.role !== 'COACH' && (norm(p.name).includes(v) || norm(p.realName).includes(v))).sort((a, b) => (norm(a.p.name) === v ? -1 : 0) - (norm(b.p.name) === v ? -1 : 0) || (b.p.ovr || 0) - (a.p.ovr || 0)).slice(0, 8);
      res.innerHTML = [...teams.map(t => `<button class="hk-row" data-tid="${t.id}">${G.team(t, 'xs')}<b>${UI.esc(t.name)}</b><small>${t.league}</small></button>`),
        ...pls.map(({ p, t }) => `<button class="hk-row" data-pid="${p.id}">${G.pos(p.role)}<b>${UI.esc(p.name)}</b><small>${UI.esc(t.short || '')} · OVR ${p.ovr || '-'}</small></button>`)].join('') || '<p class="cr-dim">결과 없음</p>';
    };
    const open = b => { if (!b) return; $('.modal-foot button', back).click(); if (b.dataset.pid) Player.open(b.dataset.pid); else { const id = b.dataset.tid; if (id === App.state.teamId) Router.go('roster-first-team'); else { Match.oppId = id; Router.go('match-opponent'); } } };
    q.oninput = draw; q.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); open($('.hk-row', res)); } };
    res.onclick = e => open(e.target.closest('.hk-row'));
    draw(); setTimeout(() => q.focus(), 30);
  },

  help() {
    UI.modal({ title: '단축키', body: `<label class="hk-toggle"><input type="checkbox" class="hk-on" ${this.on() ? 'checked' : ''}> 단축키 사용 <small>(PC · 글 입력 중에는 꺼짐)</small></label>
      ${this.HELP.map(([h, l]) => `<h4 class="hk-h">${h}</h4><table class="hk-t">${l.map(([a, b]) => `<tr><td><kbd>${a}</kbd></td><td>${b}</td></tr>`).join('')}</table>`).join('')}` });
    const back = $$('.modal-back').pop(); $('.hk-on', back).onchange = e => this.set(e.target.checked);
  },
};
document.addEventListener('DOMContentLoaded', () => Hotkeys.init());
