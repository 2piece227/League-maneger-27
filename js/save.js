// 저장: 브라우저 localStorage에 슬롯 3개 + 자동 저장 1개. 설정은 따로 저장.
const Store = {
  // 세이브 슬롯은 압축해서 둔다 (localStorage는 사이트당 약 5MB: 슬롯 3개 + 자동 저장이 시즌이 길어지면 넘칠 수 있었다)
  LZ: 'LZ1:',
  get(k) { try { let s = localStorage.getItem(k); if (s && s.startsWith(this.LZ)) s = LZString.decompressFromUTF16(s.slice(this.LZ.length)); return JSON.parse(s); } catch { return null; } },
  set(k, v) { try { let s = JSON.stringify(v); if (k.startsWith('lm27.save.') && typeof LZString !== 'undefined') s = this.LZ + LZString.compressToUTF16(s); localStorage.setItem(k, s); return true; } catch (e) { console.warn('[save] 저장 실패', e); if (typeof UI !== 'undefined' && UI.toast) UI.toast('저장 공간이 부족해 저장하지 못했습니다. 안 쓰는 슬롯을 지워 주세요.', 5000); return false; } },
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
    engineV2: false,      // 개발자 테스트: 신버전 경기 엔진 (js/engine2.js)
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
  // 주소의 화면(#match-draft 등)을 지우고 새로 읽는다: 이전 커리어의 화면 주소가 새 커리어에 남지 않게
  restart(p) { try { sessionStorage.setItem(this.PENDING, JSON.stringify(p)); } catch (e) { console.warn(e); } try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {} location.reload(); },
  // ── 갑작스런 새로고침 대비 ──
  // 게임 화면에 있는 동안 이 탭에 표시(sessionStorage)를 남기고, 화면이 가려지거나 페이지가 내려갈 때 · 날짜가 넘어갈 때(20초에 한 번까지) 진행을 RESUME 키에 저장한다.
  // 같은 탭이 다시 열리면(당겨서 새로고침 · 메모리 부족으로 브라우저가 다시 읽음) 그 진행으로 바로 들어간다. 메인 화면으로 직접 나가면 표시를 지운다
  RESUME: 'lm27.resume', TAB: 'lm27.tab',
  keep(force) {
    if (!App.careerActive || !this.canSave() || !document.querySelector('#screen-game.active')) return;
    const now = Date.now(); if (!force && now - (this._kept || 0) < 20000) return; this._kept = now;
    if (!Store.set(this.RESUME, this.snapshot())) { Store.del(this.RESUME); }
    try { sessionStorage.setItem(this.TAB, '1'); } catch (e) {}
  },
  // 새로 읽은 페이지에서: 미뤄 둔 커리어로 바로 들어간다
  resume() {
    let p = null; try { p = JSON.parse(sessionStorage.getItem(this.PENDING)); sessionStorage.removeItem(this.PENDING); } catch {}
    if (!p) { let tab = null; try { tab = sessionStorage.getItem(this.TAB); } catch (e) {} const r = tab && Store.get(this.RESUME); if (r && r.state) { p = { state: r.state }; setTimeout(() => UI.toast('페이지가 새로 열려서, 직전 진행 상태에서 이어 갑니다', 4000), 800); } }
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

// 화면이 가려질 때(앱 전환 · 새로고침 직전 · 탭 닫기) 바로 저장, 날짜가 넘어갈 때는 20초에 한 번까지
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') SaveSystem.keep(true); });
window.addEventListener('pagehide', () => SaveSystem.keep(true));
document.addEventListener('DOMContentLoaded', () => { if (typeof Engine !== 'undefined') Engine.on(() => SaveSystem.keep(false)); });   // save.js가 engine.js보다 먼저 읽힌다
