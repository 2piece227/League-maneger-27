// 저장: 브라우저 localStorage에 슬롯 3개 + 자동 저장 1개. 설정은 따로 저장.
const Store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { console.warn('[save] 저장 실패', e); return false; } },
  del(k) { try { localStorage.removeItem(k); } catch {} },
  ageOn(birth, date) {
    const b = new Date(birth), d = new Date(date);
    return d.getFullYear() - b.getFullYear() - (d < new Date(d.getFullYear(), b.getMonth(), b.getDate()) ? 1 : 0);
  },
  addDays(ymd, n) {
    const [y, m, d] = ymd.split('-').map(Number);
    const t = new Date(y, m - 1, d + n);
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  },
};

const Settings = {
  KEY: 'lm27.settings',
  defaults: {
    skipIntro: false,
    simSpeed: 'normal',
    volume: 70,
    autosave: true,       // 하루가 지날 때마다 자동 저장
  },
  load() { return { ...this.defaults, ...(Store.get(this.KEY) || {}) }; },
  save(settings) { Store.set(this.KEY, settings); },
};

const SaveSystem = {
  SLOTS: ['1', '2', '3'],
  VERSION: 1,
  key(slot) { return 'lm27.save.' + slot; },

  // 저장에 넣을 상태 (설정은 제외)
  snapshot() {
    const { settings, ...state } = App.state;
    const team = App.db.teams.find(t => t.id === state.teamId);
    const m = state.manager || {};
    return {
      version: this.VERSION,
      savedAt: new Date().toISOString(),
      date: Clock.today(),
      label: `${m.displayName || m.name || '감독'} · ${team ? team.name : '팀 없음'}`,
      team: team ? { id: team.id, short: team.short, logo: team.logo, league: team.league } : null,
      state: JSON.parse(JSON.stringify(state)),
    };
  },

  list() { return this.SLOTS.map(s => Store.get(this.key(s))); },
  auto() { return Store.get(this.key('auto')); },
  canSave() { return !!(App.state.manager && App.state.teamId); },

  save(slot) {
    if (!this.canSave()) return false;
    return Store.set(this.key(slot), this.snapshot());
  },
  remove(slot) { Store.del(this.key(slot)); },

  // 커리어를 바꿀 때(불러오기 · 새 커리어)는 페이지를 새로 읽어 메모리의 선수 데이터까지 원본으로 되돌린 뒤 그 상태로 들어간다
  PENDING: 'lm27.pending',
  restart(p) { try { sessionStorage.setItem(this.PENDING, JSON.stringify(p)); } catch (e) { console.warn(e); } location.reload(); },
  // 새로 읽은 페이지에서: 미뤄 둔 커리어로 바로 들어간다
  resume() {
    let p = null; try { p = JSON.parse(sessionStorage.getItem(this.PENDING)); sessionStorage.removeItem(this.PENDING); } catch {}
    if (!p || !p.state) return false;
    App.state = { ...p.state, settings: App.state.settings };
    App.careerActive = true;
    App.show('game');
    return true;
  },
  load(slot) {
    const s = Store.get(this.key(slot));
    if (!s) return false;
    if (App.careerActive) { this.restart({ state: s.state }); return true; }
    const settings = App.state.settings;
    App.state = { ...s.state, settings };      // 합치지 않고 통째로 바꾼다 (이전 커리어 값이 남지 않게)
    App.careerActive = true;
    SoloQ.cache = null;
    // 이미 게임 화면이면 App.show가 아무것도 하지 않으므로 직접 다시 진입
    if (App.current && App.current.id === 'screen-game') Screens.game.enter();
    else App.show('game');
    return true;
  },

  // 날짜가 하루 넘어갈 때 호출
  autosave() {
    if (!App.state.settings.autosave || !this.canSave()) return false;
    return this.save('auto');
  },

  when(iso) {
    const d = new Date(iso);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  },
};
