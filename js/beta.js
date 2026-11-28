// 베타 경로(/beta-…/)에서만: 브라우저 저장소를 실제 사이트와 분리한다. 같은 도메인이라 그냥 두면 베타가 실제 세이브를 읽고 고쳐 버린다.
//   localStorage · sessionStorage 키 앞에 'beta:'를 붙이고, IndexedDB 이름 뒤에 '-beta'를 붙인다. 화면 구석에 BETA 표시
//   실제 사이트 경로에서는 아무 일도 하지 않는다. 다른 모든 스크립트보다 먼저 읽어야 한다.
(() => {
  if (!/\/beta-[a-z0-9]+\//.test(location.pathname)) return;
  window.LM_BETA = true;
  const P = 'beta:', S = Storage.prototype, g = S.getItem, s = S.setItem, r = S.removeItem, k = S.key, len = Object.getOwnPropertyDescriptor(S, 'length').get;
  const mine = st => { const out = [], n = len.call(st); for (let i = 0; i < n; i++) { const x = k.call(st, i); if (x && x.startsWith(P)) out.push(x.slice(P.length)); } return out; };
  S.getItem = function (x) { return g.call(this, P + x); };
  S.setItem = function (x, v) { return s.call(this, P + x, v); };
  S.removeItem = function (x) { return r.call(this, P + x); };
  S.key = function (i) { return mine(this)[i] ?? null; };
  S.clear = function () { mine(this).forEach(x => r.call(this, P + x)); };
  Object.defineProperty(S, 'length', { configurable: true, get() { return mine(this).length; } });
  if (typeof IDBFactory !== 'undefined') {
    const o = IDBFactory.prototype.open, d = IDBFactory.prototype.deleteDatabase;
    IDBFactory.prototype.open = function (name, ...a) { return o.call(this, name + '-beta', ...a); };
    IDBFactory.prototype.deleteDatabase = function (name, ...a) { return d.call(this, name + '-beta', ...a); };
  }
  document.title = '[BETA] ' + document.title;
  addEventListener('DOMContentLoaded', () => {
    const b = document.createElement('div');
    b.textContent = 'BETA';
    b.title = '베타 테스트 빌드 · 세이브는 실제 사이트와 따로 저장됩니다';
    b.style.cssText = 'position:fixed;left:6px;bottom:30px;z-index:99999;padding:2px 8px;border-radius:6px;background:#e2575c;color:#fff;font:700 11px/1.6 sans-serif;letter-spacing:.08em;pointer-events:auto;opacity:.85';
    document.body.appendChild(b);
  });
})();
