import { Component, Suspense, useEffect, useRef, useState, type ErrorInfo, type ReactNode, type Ref } from 'react'
import { Spinner } from './components/Messages'
import { interceptLinks, usePath } from './router'
import { CATEGORIES, SITE_NAME, type ToolMeta } from './tools/meta'
import { TOOL_COMPONENTS } from './tools/registry'
import { filterTools, findTool, groupByCategory } from './tools/search'
import { useTheme, type ThemePref } from './theme'

const HOME_TITLE = `${SITE_NAME} · Developer tools that run in your browser`
/** Must match the drawer breakpoint in styles.css. */
const DRAWER_QUERY = '(max-width: 860px)'

export function App() {
  const path = usePath()
  const [menuOpen, setMenuOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [menuPath, setMenuPath] = useState(path)
  const searchRef = useRef<HTMLInputElement>(null)
  const menuButtonRef = useRef<HTMLButtonElement>(null)

  // Close the mobile menu after navigating (state adjustment during render).
  if (menuPath !== path) {
    setMenuPath(path)
    setMenuOpen(false)
  }

  const tool = path === '/' ? undefined : findTool(path)
  const notFound = path !== '/' && !tool

  useEffect(() => interceptLinks(), [])

  useEffect(() => {
    document.title = tool ? `${tool.title} · ${SITE_NAME}` : notFound ? `Not found · ${SITE_NAME}` : HOME_TITLE
  }, [tool, notFound])

  // "/" focuses the tool search (unless typing somewhere).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false)
        if (window.matchMedia(DRAWER_QUERY).matches && document.getElementById('sidebar')?.contains(document.activeElement)) {
          menuButtonRef.current?.focus()
        }
      }
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target as HTMLElement | null
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return
      e.preventDefault()
      // Only the mobile drawer needs opening; on desktop the sidebar is always shown.
      if (window.matchMedia(DRAWER_QUERY).matches) setMenuOpen(true)
      requestAnimationFrame(() => searchRef.current?.focus())
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="app">
      <a className="skip-link" href="#main" data-native="">
        Skip to content
      </a>
      <header className="topbar">
        <button
          type="button"
          className="btn btn-icon menu-button"
          ref={menuButtonRef}
          aria-expanded={menuOpen}
          aria-controls="sidebar"
          onClick={() => setMenuOpen((o) => !o)}
        >
          <span aria-hidden="true">☰</span>
          <span className="visually-hidden">Toggle tool menu</span>
        </button>
        <nav className="breadcrumbs" aria-label="Breadcrumb">
          <a href="/">{SITE_NAME}</a>
          <span className="breadcrumb-divider" aria-hidden="true">/</span>
          <span className="breadcrumb-current" aria-current="page">
            {tool?.title ?? (notFound ? 'Not found' : 'All tools')}
          </span>
        </nav>
        <div className="topbar-spacer" />
        <ThemeToggle />
      </header>
      <div className="layout">
        {menuOpen && (
          <button
            className="menu-backdrop"
            type="button"
            aria-label="Close tool menu"
            onClick={() => {
              setMenuOpen(false)
              menuButtonRef.current?.focus()
            }}
          />
        )}
        <aside id="sidebar" className={`sidebar${menuOpen ? ' open' : ''}`} aria-label="Tools">
          <a href="/" className="brand">
            <img src="/favicon.svg" alt="" width="24" height="24" />
            <span>{SITE_NAME}<span className="workspace-label">Your browser workspace</span></span>
          </a>
          <SearchBox value={query} onChange={setQuery} inputRef={searchRef} label="Filter tools" />
          <a href="/" className="nav-home" aria-current={path === '/' ? 'page' : undefined}>
            <span aria-hidden="true">🧰</span> All tools
          </a>
          <ToolNav query={query} activePath={path} />
          <div className="sidebar-note"><span aria-hidden="true">◉</span> Local by design. Always private.</div>
        </aside>
        <main id="main" className="main" tabIndex={-1}>
          {tool ? <ToolPage key={tool.id} tool={tool} /> : notFound ? <NotFound path={path} /> : <Home />}
        </main>
      </div>
      <footer className="footer">
        <p>Everything runs locally in your browser. Nothing is sent to a server.</p>
      </footer>
    </div>
  )
}

function ThemeToggle() {
  const [pref, setPref] = useTheme()
  const options: { value: ThemePref; label: string; icon: string }[] = [
    { value: 'light', label: 'Light', icon: '☀' },
    { value: 'dark', label: 'Dark', icon: '☾' },
    { value: 'system', label: 'System', icon: '◐' },
  ]
  return (
    <div className="segmented theme-toggle" role="radiogroup" aria-label="Color theme">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={pref === o.value}
          className={pref === o.value ? 'active' : undefined}
          title={`${o.label} theme`}
          aria-label={`${o.label} theme`}
          onClick={() => setPref(o.value)}
        >
          <span aria-hidden="true">{o.icon}</span>
          <span className="theme-label">{o.label}</span>
        </button>
      ))}
    </div>
  )
}

function SearchBox({
  value,
  onChange,
  label,
  inputRef,
  big = false,
}: {
  value: string
  onChange: (v: string) => void
  label: string
  inputRef?: Ref<HTMLInputElement>
  big?: boolean
}) {
  return (
    <div className={`search${big ? ' search-big' : ''}`}>
      <span className="search-icon" aria-hidden="true">⌕</span>
      <input
        ref={inputRef}
        type="search"
        className="input"
        placeholder={big ? 'Find the right tool…' : 'Search tools…'}
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          // First Escape clears the filter only; a second one (empty) bubbles up and closes the drawer.
          if (e.key === 'Escape' && value !== '') {
            e.stopPropagation()
            onChange('')
          }
        }}
      />
      <kbd className="search-shortcut" aria-hidden="true">/</kbd>
    </div>
  )
}

function ToolNav({ query, activePath }: { query: string; activePath: string }) {
  const groups = groupByCategory(filterTools(query))
  if (groups.length === 0) return <p className="muted nav-empty">No tools match “{query}”.</p>
  return (
    <nav>
      {groups.map((g) => (
        <div key={g.category.id} className="nav-group">
          <h2 className="nav-heading">{g.category.title}</h2>
          <ul>
            {g.tools.map((t) => (
              <li key={t.id}>
                <a href={`/${t.id}`} aria-current={activePath === `/${t.id}` ? 'page' : undefined}>
                  <span className="nav-icon" aria-hidden="true">{t.icon}</span>
                  <span className="nav-title">{t.title}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  )
}

function Home() {
  const [query, setQuery] = useState('')
  const groups = groupByCategory(filterTools(query))
  return (
    <div className="home">
      <div className="hero">
        <div className="page-icon" aria-hidden="true">🧰</div>
        <h1 tabIndex={-1}>Developer tools</h1>
        <p className="lead">
          A little workspace for everyday development. Encode, format, convert and create — everything stays in your browser.
        </p>
        <SearchBox value={query} onChange={setQuery} label="Search tools" big />
      </div>
      {groups.length === 0 && <p className="muted">No tools match “{query}”.</p>}
      {groups.map((g) => (
        <section key={g.category.id} className="home-group" aria-labelledby={`cat-${g.category.id}`}>
          <h2 id={`cat-${g.category.id}`}><span aria-hidden="true">{g.category.icon}</span> {g.category.title}<span className="category-count">{g.tools.length}</span></h2>
          <div className="card-grid">
            {g.tools.map((t) => (
              <a key={t.id} href={`/${t.id}`} className="card">
                <span className="card-icon" aria-hidden="true">{t.icon}</span>
                <span className="card-body">
                  <span className="card-title">{t.title}</span>
                  <span className="card-desc">{t.description}</span>
                </span>
              </a>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function ToolPage({ tool }: { tool: ToolMeta }) {
  const Tool = TOOL_COMPONENTS[tool.id]
  const headingRef = useRef<HTMLHeadingElement>(null)
  // Move focus to the page heading after client-side navigation (screen readers).
  useEffect(() => {
    if (document.activeElement && document.activeElement !== document.body) headingRef.current?.focus({ preventScroll: true })
  }, [])
  return (
    <article className="tool-page">
      <header className="tool-header">
        <div className="page-icon" aria-hidden="true">{tool.icon}</div>
        <div className="page-category">{CATEGORIES.find((c) => c.id === tool.category)?.title}</div>
        <h1 ref={headingRef} tabIndex={-1}>
          {tool.title}
        </h1>
        <p className="muted">{tool.description}</p>
      </header>
      <ErrorBoundary>
        <Suspense
          fallback={
            <div className="loading">
              <Spinner label="Loading tool…" />
            </div>
          }
        >
          {Tool ? <Tool /> : <p>This tool is not available.</p>}
        </Suspense>
      </ErrorBoundary>
    </article>
  )
}

function NotFound({ path }: { path: string }) {
  return (
    <div className="not-found">
      <h1 tabIndex={-1}>Page not found</h1>
      <p className="muted">
        There is no tool at <code>{path}</code>.
      </p>
      <p>
        <a href="/" className="btn btn-primary">
          Back to all tools
        </a>
      </p>
    </div>
  )
}

interface BoundaryState {
  error: Error | null
}

class ErrorBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Tool crashed:', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    // A failed dynamic import usually means a new version was deployed.
    const chunkFailed = /dynamically imported module|Importing a module script failed|error loading dynamically/i.test(
      error.message,
    )
    return (
      <div className="msg msg-error" role="alert">
        <p>
          <strong>{chunkFailed ? 'This tool could not be loaded.' : 'Something went wrong in this tool.'}</strong>
        </p>
        <p className="mono small">{error.message}</p>
        <p>
          <button type="button" className="btn" onClick={() => window.location.reload()}>
            Reload page
          </button>{' '}
          {!chunkFailed && (
            <button type="button" className="btn" onClick={() => this.setState({ error: null })}>
              Try again
            </button>
          )}
        </p>
      </div>
    )
  }
}
