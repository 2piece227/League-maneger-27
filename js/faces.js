// 선수 · 감독 사진 직접 넣기 (베타 건의: 얼굴 없는 유망주 · 내 얼굴): 이미지 주소나 파일. 파일은 160px로 줄여 저장 파일에 둔다.
//   넣은 사진은 불러올 때 선수 사진(p.photo) 자리에 바꿔 끼워 프로필 · 중계 · 뉴스 · 메시지 어디서나 보인다
const Faces = {
  st() { return (App.state.faces ||= {}); },
  apply() {
    if (!App.db || typeof Player === 'undefined' || !Player.all) return;
    const F = this.st();
    Player.all().forEach(({ p }) => { if (!('_ph0' in p)) Object.defineProperty(p, '_ph0', { value: p.photo || null, writable: true, enumerable: false }); p.photo = F[p.id] || p._ph0; });
  },
  set(pid, url) { const F = this.st(); if (url) F[pid] = url; else delete F[pid]; this.apply(); },
  // 파일 → 160px 정사각 JPEG (data URL)
  shrink(file) {
    return new Promise((ok, no) => {
      const rd = new FileReader(); rd.onerror = no;
      rd.onload = () => { const im = new Image(); im.onerror = no; im.onload = () => {
        const S = 160, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d'), m = Math.min(im.width, im.height);
        x.drawImage(im, (im.width - m) / 2, (im.height - m) / 2, m, m, 0, 0, S, S); ok(c.toDataURL('image/jpeg', .82)); }; im.src = rd.result; };
      rd.readAsDataURL(file);
    });
  },
  // 사진 고르기 창. cur: 지금 사진, orig: 원래 사진(있으면 '원래대로')
  pick(title, cur, onSave) {
    let val = cur || '';
    const back = UI.modal({ title, body: `<div class="fc-pick">
        <div class="fc-prev">${val ? `<img src="${UI.esc(val)}" alt="" referrerpolicy="no-referrer">` : '<span>사진 없음</span>'}</div>
        <label class="field"><span>이미지 주소 (https://…)</span><input class="fc-url" type="url" placeholder="https://example.com/photo.png" value="${val.startsWith('data:') ? '' : UI.esc(val)}"></label>
        <label class="btn-ghost fc-file">파일에서 고르기<input type="file" accept="image/*" hidden></label>
        <p class="cr-note">사진은 이 브라우저의 저장 파일에만 남습니다. 정사각형으로 잘려 보입니다.</p></div>`,
      actions: [{ label: '원래대로', onClick: () => { onSave(null); } }, { label: '취소' }, { label: '저장', primary: true, onClick: () => { onSave(val || null); } }] });
    const prev = u => { back.querySelector('.fc-prev').innerHTML = u ? `<img src="${UI.esc(u)}" alt="" referrerpolicy="no-referrer">` : '<span>사진 없음</span>'; };
    back.querySelector('.fc-url').oninput = e => { val = e.target.value.trim(); prev(val); };
    back.querySelector('.fc-file input').onchange = async e => { const f = e.target.files && e.target.files[0]; if (!f) return; try { val = await this.shrink(f); prev(val); } catch (x) { UI.toast('이미지를 읽지 못했습니다'); } };
  },
  // 감독 얼굴: 사진이 있으면 사진, 없으면 만든 아바타
  manager(m, cls = '') { return m && m.photo ? `<img class="fc-man ${cls}" src="${UI.esc(m.photo)}" alt="" referrerpolicy="no-referrer">` : (typeof Avatar !== 'undefined' && m ? Avatar.render(m.avatar) : ''); },
};
document.addEventListener('DOMContentLoaded', () => {
  if (typeof Squad === 'undefined') return;
  const ap = Squad.apply.bind(Squad); Squad.apply = (...a) => { const r = ap(...a); Faces.apply(); return r; };
});
