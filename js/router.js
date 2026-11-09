// 게임 화면 안의 해시 라우팅 (#portal-overview 등) + 뒤로/앞으로 기록
const Router = {
  stack: [],
  pos: -1,
  handlers: [],

  init() {
    window.addEventListener('hashchange', () => this.onChange());
  },

  onRoute(fn) {
    this.handlers.push(fn);
  },

  go(route) {
    if (location.hash === '#' + route) this.onChange();
    else location.hash = route;
  },

  back() { if (this.canBack()) history.back(); },
  forward() { if (this.canForward()) history.forward(); },
  canBack() { return this.pos > 0; },
  canForward() { return this.pos < this.stack.length - 1; },

  current() {
    return location.hash.replace(/^#/, '');
  },

  onChange() {
    const route = this.current();
    if (!route) return;
    // 브라우저 뒤로/앞으로와 우리 기록을 맞춘다
    if (this.stack[this.pos] === route) {
      // 같은 화면 재요청
    } else if (this.stack[this.pos - 1] === route) {
      this.pos--;
    } else if (this.stack[this.pos + 1] === route) {
      this.pos++;
    } else {
      this.stack = this.stack.slice(0, this.pos + 1);
      this.stack.push(route);
      this.pos = this.stack.length - 1;
    }
    this.handlers.forEach(fn => fn(route));
  },
};
