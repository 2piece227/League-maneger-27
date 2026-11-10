const App = {
  db: null,
  current: null,
  state: {
    settings: Settings.load(),
    manager: null,
    leagueId: 'LCK',
    teamId: null,
  },

  show(id) {
    const next = document.getElementById('screen-' + id);
    if (this.current === next) return;
    if (this.current) {
      const leaving = Screens[this.current.id.replace('screen-', '')];
      if (leaving && leaving.leave) leaving.leave();
      this.current.classList.remove('active');
    }
    next.classList.add('active');
    this.current = next;
    const s = Screens[id];
    if (s && s.enter) s.enter();
  },
};

document.addEventListener('DOMContentLoaded', async () => {
  App.db = await Data.loadDatabase();
  Object.values(Screens).forEach(s => s.init && s.init());

  // data-nav="화면id" 버튼은 해당 화면으로 이동
  document.addEventListener('click', e => {
    const nav = e.target.closest('[data-nav]');
    if (nav) App.show(nav.dataset.nav);
  });

  App.show(App.state.settings.skipIntro ? 'title' : 'intro');
});
