// 인트로: 비영리·비보증·중단 가능 고지 → 메인 타이틀
Screens.intro = {
  AUTO_MS: 14000,
  timer: null,

  init() {
    this.el = $('#screen-intro');
    this.el.addEventListener('click', () => this.finish());
    this.onKey = () => this.finish();
  },

  enter() {
    this.done = false;
    this.el.classList.remove('play');
    void this.el.offsetWidth;
    this.el.classList.add('play');
    // 고지문이 다 뜨기 전 실수로 넘어가지 않도록 키 입력은 잠깐 뒤부터 받는다
    setTimeout(() => document.addEventListener('keydown', this.onKey), 600);
    this.timer = setTimeout(() => this.finish(), this.AUTO_MS);
  },

  leave() {
    clearTimeout(this.timer);
    document.removeEventListener('keydown', this.onKey);
  },

  finish() {
    if (this.done) return;
    this.done = true;
    App.show('title');
  },
};
