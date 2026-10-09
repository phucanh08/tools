import { useEffect, useRef } from 'react'

/** Renders untrusted HTML with scripts disabled (sandbox="" = opaque origin, no scripts, no forms, no popups). */
export function InertFrame({ html, title }: { html: string; title: string }) {
  return <iframe className="preview-frame" sandbox="" srcDoc={html} title={title} referrerPolicy="no-referrer" />
}

/**
 * Renders untrusted HTML WITH scripts via /sandbox.html in an
 * allow-scripts-only sandbox (opaque origin: no access to this page, its
 * storage or cookies). Never add allow-same-origin here. One render per
 * frame: the parent remounts this component (key) for every update.
 */
export function ScriptFrame({ html, title }: { html: string; title: string }) {
  const ref = useRef<HTMLIFrameElement>(null)
  useEffect(() => {
    let sent = false
    const onMessage = (e: MessageEvent) => {
      const win = ref.current?.contentWindow
      if (!win || e.source !== win || sent) return
      const data: unknown = e.data
      if (typeof data === 'object' && data !== null && (data as { type?: unknown }).type === 'sandbox-ready') {
        sent = true
        // Opaque-origin frame: "*" is the only possible target origin; the
        // message goes only to this frame's window.
        win.postMessage({ type: 'render', html }, '*')
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [html])
  return <iframe ref={ref} className="preview-frame" src="/sandbox.html" sandbox="allow-scripts" title={title} referrerPolicy="no-referrer" />
}
