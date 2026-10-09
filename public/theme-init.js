// Apply the saved theme before first paint to avoid a flash of the wrong theme.
;(function () {
  try {
    var t = localStorage.getItem('theme')
    if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t
  } catch (e) {
    /* storage unavailable */
  }
})()
