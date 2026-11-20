(function () {
  const ua = navigator.userAgent;
  const guides = {
    android: document.getElementById('guide-android'),
    ios: document.getElementById('guide-ios')
  };
  const sw = document.getElementById('switch');
  const other = document.getElementById('other');
  const buttons = sw.querySelectorAll('button');
  let detected = null;

  if (/Android/i.test(ua)) detected = 'android';
  else if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) detected = 'ios';

  function show(os) {
    Object.keys(guides).forEach(function (key) { guides[key].hidden = key !== os; });
    buttons.forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.os === os)); });
  }

  buttons.forEach(function (b) {
    b.addEventListener('click', function () { show(b.dataset.os); });
  });

  if (detected) {
    show(detected);
    other.hidden = false;
    other.addEventListener('click', function () {
      other.hidden = true;
      sw.hidden = false;
    });
  } else {
    sw.hidden = false;
    show('android');
  }

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
