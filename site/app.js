(function () {
  const ua = navigator.userAgent;
  const guides = {
    android: document.getElementById('guide-android'),
    ios: document.getElementById('guide-ios')
  };
  const sw = document.getElementById('switch');
  const tabs = Array.prototype.slice.call(sw.querySelectorAll('[role=tab]'));
  let initial = 'android';

  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) initial = 'ios';

  function show(os, focus) {
    Object.keys(guides).forEach(function (key) { guides[key].hidden = key !== os; });
    tabs.forEach(function (t) {
      const on = t.dataset.os === os;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      if (on && focus) t.focus();
    });
  }

  tabs.forEach(function (t, i) {
    t.addEventListener('click', function () { show(t.dataset.os); });
    t.addEventListener('keydown', function (e) {
      const next = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
      if (next === undefined) return;
      e.preventDefault();
      show(tabs[(next + tabs.length) % tabs.length].dataset.os, true);
    });
  });

  sw.hidden = false;
  show(initial);

  const video = document.querySelector('.hero video');
  if (video && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    video.removeAttribute('autoplay');
    video.pause();
  }

  fetch('https://api.github.com/repos/hrudek/timeclaim/releases/latest')
    .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
    .then(function (rel) {
      const apk = (rel.assets || []).filter(function (a) { return /\.apk$/i.test(a.name); })[0];
      if (!apk) return;
      document.getElementById('apk-link').href = apk.browser_download_url;
      document.getElementById('apk-version').textContent = 'Version ' + String(rel.tag_name).replace(/^v/, '');
      document.getElementById('apk-size').textContent = Math.round(apk.size / 1048576);
    })
    .catch(function () {
      document.getElementById('apk-size').parentNode.textContent = 'Tippe auf den Button.';
    });
})();
