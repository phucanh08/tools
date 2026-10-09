// Loaded inside <iframe sandbox="allow-scripts"> (opaque origin: no access to the
// parent's storage or DOM). Receives HTML from the parent window and renders it.
;(function () {
  window.addEventListener('message', function (event) {
    if (event.source !== window.parent) return
    var data = event.data
    if (!data || data.type !== 'render' || typeof data.html !== 'string') return
    document.open()
    document.write(data.html)
    document.close()
  })
  window.parent.postMessage({ type: 'sandbox-ready' }, '*')
})()
