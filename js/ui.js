// 화면 모듈 등록소 (js/screens/*.js가 여기에 붙는다)
const Screens = {};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const UI = {
  // actions: [{ label, primary, onClick }] — onClick이 false를 반환하면 모달을 닫지 않는다.
  modal({ title, body, actions = [{ label: '닫기' }] }) {
    const back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <div class="modal-head">${title}</div>
        <div class="modal-body">${body}</div>
        <div class="modal-foot"></div>
      </div>`;
    const close = () => { back.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = e => { if (e.key === 'Escape') close(); };
    const foot = $('.modal-foot', back);
    actions.forEach(a => {
      const b = document.createElement('button');
      b.className = a.primary ? 'btn-primary' : 'btn-ghost';
      b.textContent = a.label;
      b.onclick = () => { if (a.onClick && a.onClick(back) === false) return; close(); };
      foot.appendChild(b);
    });
    back.addEventListener('click', e => { if (e.target === back) close(); });
    document.addEventListener('keydown', onKey);
    $('#modal-root').appendChild(back);
    return back;
  },

  // 이미지가 없거나 로딩에 실패하면 fallback HTML로 바꾼다
  img(url, cls, fallback) {
    if (!url) return fallback;
    const js = UI.esc(fallback.replace(/\\/g, '\\\\').replace(/'/g, "\\'"));
    return `<img class="${cls}" src="${UI.esc(url)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.outerHTML='${js}'">`;
  },

  stars(n, max = 5) {
    return `<span class="stars">${'★'.repeat(n)}<i>${'★'.repeat(max - n)}</i></span>`;
  },

  // 화면 아래 잠깐 뜨는 알림
  toast(text, ms = 2200) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = text;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('on'));
    setTimeout(() => { el.classList.remove('on'); setTimeout(() => el.remove(), 300); }, ms);
  },

  esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  },
};
