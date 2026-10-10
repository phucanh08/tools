import { Component, Suspense, useEffect, useRef, useState, type ErrorInfo, type ReactNode, type Ref } from 'react'
import {
  ChevronDown,
  House,
  LayoutGrid,
  Menu as MenuIcon,
  Monitor,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  ShieldCheck,
  Sun,
  X,
  type LucideIcon,
} from 'lucide-react'
import { GitHubIcon, ToolIcon } from './components/Icons'
import { Spinner } from './components/Messages'
import { readClosedGroups, readCollapsed, writeClosedGroups, writeCollapsed } from './prefs'
import { interceptLinks, usePath } from './router'
import { CATEGORY_ICONS } from './tools/icons'
import { CATEGORIES, SITE_NAME, type CategoryId, type ToolMeta } from './tools/meta'
import { TOOL_COMPONENTS } from './tools/registry'
import { filterTools, findTool, groupByCategory } from './tools/search'
import { useTheme, type ThemePref } from './theme'

const HOME_TITLE = `${SITE_NAME} · Developer tools that run in your browser`
const REPO_URL = 'https://github.com/phucanh08/tools'
/** Must match the drawer breakpoint in styles.css. */
const DRAWER_QUERY = '(max-width: 860px)'
const isDrawer = () => window.matchMedia(DRAWER_QUERY).matches

export function App() {
  const path = usePath()
  const [menuOpen, setMenuOpen] = useState(false)
  const [drawer, setDrawer] = useState(isDrawer)
  const [focusRequest, requestFocus] = useState<{ target: 'search' | 'close' | 'menu' } | null>(null)
  const [collapsed, setCollapsedState] = useState(readCollapsed)
  const [query, setQuery] = useState('')
  const [menuPath, setMenuPath] = useState(path)
  const searchRef = useRef<HTMLInputElement>(null)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const drawerCloseRef = useRef<HTMLButtonElement>(null)

  // Close the mobile menu after navigating (state adjustment during render).
  if (menuPath !== path) {
    setMenuPath(path)
    setMenuOpen(false)
  }

  const tool = path === '/' ? undefined : findTool(path)
  const notFound = path !== '/' && !tool
  const category = tool ? CATEGORIES.find((c) => c.id === tool.category) : undefined

  const setCollapsed = (c: boolean) => {
    setCollapsedState(c)
    writeCollapsed(c)
  }

  const openDrawer = () => {
    setMenuOpen(true)
    // Move focus into the drawer so keyboard users land in the menu, not behind the backdrop.
    requestFocus({ target: 'close' })
  }
  const closeDrawer = () => {
    setMenuOpen(false)
    requestFocus({ target: 'menu' })
  }

  /** Focuses the tool search, opening the drawer (mobile) or expanding the sider (desktop) first. */
  const focusSearch = () => {
    if (isDrawer()) setMenuOpen(true)
    else if (collapsed) setCollapsed(false)
    requestFocus({ target: 'search' })
  }
  const focusSearchRef = useRef(focusSearch)
  useEffect(() => {
    focusSearchRef.current = focusSearch
  })

  useEffect(() => interceptLinks(), [])

  // Focus only after React commits the expanded/visible drawer and removes inert.
  // Scheduling directly from the keyboard event can run before that commit.
  useEffect(() => {
    if (!focusRequest) return
    const targets = { search: searchRef, close: drawerCloseRef, menu: menuButtonRef }
    targets[focusRequest.target].current?.focus()
  }, [focusRequest])

  useEffect(() => {
    const media = window.matchMedia(DRAWER_QUERY)
    const update = () => {
      setDrawer(media.matches)
      setMenuOpen(false)
    }
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    if (!drawer || !menuOpen) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const trapFocus = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const items = [...document.querySelectorAll<HTMLElement>('#sidebar a, #sidebar button, #sidebar input')]
        .filter((el) => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden')
      const first = items[0]
      const last = items.at(-1)
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last?.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first?.focus()
      }
    }
    document.addEventListener('keydown', trapFocus)
    return () => {
      document.body.style.overflow = previous
      document.removeEventListener('keydown', trapFocus)
    }
  }, [drawer, menuOpen])

  useEffect(() => {
    document.title = tool ? `${tool.title} · ${SITE_NAME}` : notFound ? `Not found · ${SITE_NAME}` : HOME_TITLE
  }, [tool, notFound])

  // "/" focuses the tool search (unless typing somewhere); Escape closes the drawer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false)
        if (isDrawer() && document.getElementById('sidebar')?.contains(document.activeElement)) {
          requestFocus({ target: 'menu' })
        }
      }
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target as HTMLElement | null
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return
      e.preventDefault()
      focusSearchRef.current()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className={`app${collapsed ? ' sider-collapsed' : ''}`}>
      <a className="skip-link" href="#main" data-native="">
        Skip to content
      </a>
      {menuOpen && <button className="menu-backdrop" type="button" aria-label="Close tool menu" tabIndex={-1} onClick={closeDrawer} />}
      <aside id="sidebar" className={`sider${menuOpen ? ' open' : ''}`} aria-label="Sidebar">
        <div className="sider-inner">
          <div className="sider-brand">
            <a href="/" className="brand" title={collapsed ? SITE_NAME : undefined}>
              <img src="/favicon.svg" alt="" width="28" height="28" />
              <span className="brand-name">{SITE_NAME}</span>
            </a>
            <button type="button" className="icon-btn sider-close" ref={drawerCloseRef} aria-label="Close tool menu" onClick={closeDrawer}>
              <X size={18} aria-hidden="true" />
            </button>
          </div>
          <div className="sider-search">
            <SearchBox value={query} onChange={setQuery} inputRef={searchRef} label="Filter tools" />
            <button type="button" className="menu-item search-trigger" onClick={focusSearch}>
              <span className="menu-icon">
                <Search size={16} strokeWidth={1.75} aria-hidden="true" />
              </span>
              <span className="menu-label">Search tools</span>
            </button>
          </div>
          <ToolMenu query={query} activePath={path} collapsed={collapsed && !drawer} onExpand={() => setCollapsed(false)} />
          <div className="sider-footer" title="Everything runs locally in your browser.">
            <ShieldCheck size={14} strokeWidth={1.75} aria-hidden="true" />
            <span className="menu-label">Local by design. Always private.</span>
          </div>
        </div>
      </aside>
      <div className="layout" inert={drawer && menuOpen}>
        <header className="header">
          <button
            type="button"
            className="icon-btn menu-button"
            ref={menuButtonRef}
            aria-expanded={menuOpen}
            aria-controls="sidebar"
            onClick={() => (menuOpen ? closeDrawer() : openDrawer())}
          >
            <MenuIcon size={18} aria-hidden="true" />
            <span className="visually-hidden">Toggle tool menu</span>
          </button>
          <button
            type="button"
            className="icon-btn collapse-button"
            aria-expanded={!collapsed}
            aria-controls="sidebar"
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? <PanelLeftOpen size={18} strokeWidth={1.75} aria-hidden="true" /> : <PanelLeftClose size={18} strokeWidth={1.75} aria-hidden="true" />}
            <span className="visually-hidden">{collapsed ? 'Expand sidebar' : 'Collapse sidebar'}</span>
          </button>
          <nav className="breadcrumb" aria-label="Breadcrumb">
            <ol>
              <li className="breadcrumb-home">
                <a href="/">
                  <House size={14} strokeWidth={1.75} aria-hidden="true" />
                  <span>{SITE_NAME}</span>
                </a>
              </li>
              {category && <li className="breadcrumb-category">{category.title}</li>}
              <li>
                <span className="breadcrumb-current" aria-current="page">
                  {tool?.title ?? (notFound ? 'Not found' : 'All tools')}
                </span>
              </li>
            </ol>
          </nav>
          <div className="header-spacer" />
          <a className="icon-btn" href={REPO_URL} target="_blank" rel="noopener noreferrer" title="Source on GitHub">
            <GitHubIcon size={17} />
            <span className="visually-hidden">Source on GitHub (opens in a new tab)</span>
          </a>
          <ThemeToggle />
        </header>
        <main id="main" className="content" tabIndex={-1}>
          {tool ? <ToolPage key={tool.id} tool={tool} /> : notFound ? <NotFound path={path} /> : <Home />}
        </main>
        <footer className="footer">
          <p>Everything runs locally in your browser. Nothing is sent to a server.</p>
        </footer>
      </div>
    </div>
  )
}

function ThemeToggle() {
  const [pref, setPref] = useTheme()
  const options: { value: ThemePref; label: string; Icon: LucideIcon }[] = [
    { value: 'light', label: 'Light', Icon: Sun },
    { value: 'dark', label: 'Dark', Icon: Moon },
    { value: 'system', label: 'System', Icon: Monitor },
  ]
  return (
    <div className="segmented theme-toggle" role="radiogroup" aria-label="Color theme">
      {options.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={pref === value}
          className={pref === value ? 'active' : undefined}
          title={`${label} theme`}
          aria-label={`${label} theme`}
          tabIndex={pref === value ? 0 : -1}
          onClick={() => setPref(value)}
          onKeyDown={(e) => {
            if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) return
            e.preventDefault()
            const index = options.findIndex((option) => option.value === pref)
            const next = e.key === 'Home' ? 0 : e.key === 'End' ? options.length - 1 :
              (index + (e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length
            const option = options[next]
            if (!option) return
            setPref(option.value)
            e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('button')[next]?.focus()
          }}
        >
          <Icon size={15} strokeWidth={1.75} aria-hidden="true" />
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
      <Search className="search-icon" size={big ? 18 : 15} strokeWidth={1.75} aria-hidden="true" />
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

/** Keeps a collapsed-sider flyout inside the viewport (it is position: fixed next to its group). */
function placeFlyout(li: HTMLElement) {
  const list = li.querySelector<HTMLElement>('.submenu-list')
  if (!list) return
  const top = li.getBoundingClientRect().top
  const maxTop = window.innerHeight - list.offsetHeight - 8
  list.style.top = `${Math.max(8, Math.min(top, maxTop))}px`
}

function ToolMenu({
  query,
  activePath,
  collapsed,
  onExpand,
}: {
  query: string
  activePath: string
  collapsed: boolean
  onExpand: () => void
}) {
  const [closed, setClosed] = useState<CategoryId[]>(() => readClosedGroups().filter((id) => id !== findTool(activePath)?.category))
  const [dismissed, setDismissed] = useState<CategoryId | null>(null)
  const [flyout, setFlyout] = useState<CategoryId | null>(null)
  const [openedFor, setOpenedFor] = useState(activePath)
  const groups = groupByCategory(filterTools(query))
  const activeCategory = findTool(activePath)?.category

  const updateClosed = (next: CategoryId[]) => {
    setClosed(next)
    writeClosedGroups(next)
  }

  // Navigating to a tool reveals its group (state adjustment during render).
  if (openedFor !== activePath) {
    setOpenedFor(activePath)
    if (activeCategory && closed.includes(activeCategory)) updateClosed(closed.filter((c) => c !== activeCategory))
  }

  return (
    <nav className="menu" aria-label="Tools">
      <ul className="menu-root">
        <li>
          <a href="/" className="menu-item" aria-current={activePath === '/' ? 'page' : undefined}>
            <span className="menu-icon">
              <LayoutGrid size={16} strokeWidth={1.75} aria-hidden="true" />
            </span>
            <span className="menu-label">All tools</span>
          </a>
        </li>
        {groups.map((g) => {
          const id = g.category.id
          const open = query.trim() !== '' || !closed.includes(id)
          const Icon = CATEGORY_ICONS[id]
          const listId = `menu-${id}`
          return (
            <li
              key={id}
              className={`submenu${open ? ' open' : ''}${id === activeCategory ? ' active' : ''}${collapsed && flyout === id && dismissed !== id ? ' flyout-open' : ''}`}
              onMouseEnter={(e) => {
                if (!collapsed) return
                setDismissed(null)
                setFlyout(id)
                placeFlyout(e.currentTarget)
              }}
              onMouseLeave={(e) => {
                if (!e.currentTarget.contains(document.activeElement)) setFlyout(null)
              }}
              onFocus={(e) => {
                if (!collapsed) return
                setFlyout(id)
                placeFlyout(e.currentTarget)
              }}
              onBlur={(e) => {
                if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
                if (dismissed === id) setDismissed(null)
                if (!e.currentTarget.matches(':hover')) setFlyout(null)
              }}
              onKeyDown={(e) => {
                if (collapsed && e.key === 'Escape' && dismissed !== id) {
                  e.stopPropagation()
                  setDismissed(id)
                  e.currentTarget.querySelector<HTMLElement>('.submenu-title')?.focus()
                }
              }}
            >
              <button
                type="button"
                className="menu-item submenu-title"
                aria-expanded={collapsed ? flyout === id && dismissed !== id : open}
                aria-controls={listId}
                onClick={() => {
                  if (collapsed) {
                    // Icons-only sider: expand it and show this group.
                    onExpand()
                    if (closed.includes(id)) updateClosed(closed.filter((c) => c !== id))
                    return
                  }
                  updateClosed(open ? [...closed, id] : closed.filter((c) => c !== id))
                }}
              >
                <span className="menu-icon">
                  <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
                </span>
                <span className="menu-label">{g.category.title}</span>
                <span className="menu-count" aria-hidden="true">
                  {g.tools.length}
                </span>
                <ChevronDown className="submenu-arrow" size={14} strokeWidth={2} aria-hidden="true" />
              </button>
              <ul id={listId} className="submenu-list">
                <li className="flyout-title" aria-hidden="true">
                  {g.category.title}
                </li>
                {g.tools.map((t) => (
                  <li key={t.id}>
                    <a href={`/${t.id}`} className="menu-item" aria-current={activePath === `/${t.id}` ? 'page' : undefined}>
                      <span className="menu-icon">
                        <ToolIcon id={t.id} category={t.category} />
                      </span>
                      <span className="menu-label">{t.title}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </li>
          )
        })}
      </ul>
      {groups.length === 0 && <p className="menu-empty">No tools match “{query}”.</p>}
    </nav>
  )
}

function Home() {
  const [query, setQuery] = useState('')
  const headingRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (document.activeElement && document.activeElement !== document.body) headingRef.current?.focus({ preventScroll: true })
  }, [])
  const groups = groupByCategory(filterTools(query))
  return (
    <div className="home">
      <div className="hero">
        <h1 ref={headingRef} tabIndex={-1}>Developer tools</h1>
        <p className="lead">
          A little workspace for everyday development. Encode, format, convert and create — everything stays in your browser.
        </p>
        <SearchBox value={query} onChange={setQuery} label="Search tools" big />
      </div>
      {groups.length === 0 && <p className="muted">No tools match “{query}”.</p>}
      {groups.map((g) => {
        const Icon = CATEGORY_ICONS[g.category.id]
        return (
          <section key={g.category.id} className="home-group" aria-labelledby={`cat-${g.category.id}`}>
            <h2 id={`cat-${g.category.id}`}>
              <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
              {g.category.title}
              <span className="category-count">{g.tools.length}</span>
            </h2>
            <div className="card-grid">
              {g.tools.map((t) => (
                <a key={t.id} href={`/${t.id}`} className="card">
                  <span className="icon-tile" aria-hidden="true">
                    <ToolIcon id={t.id} category={t.category} size={18} />
                  </span>
                  <span className="card-body">
                    <span className="card-title">{t.title}</span>
                    <span className="card-desc">{t.description}</span>
                  </span>
                </a>
              ))}
            </div>
          </section>
        )
      })}
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
        <span className="icon-tile icon-tile-lg" aria-hidden="true">
          <ToolIcon id={tool.id} category={tool.category} size={22} />
        </span>
        <div className="tool-heading">
          <div className="page-category">{CATEGORIES.find((c) => c.id === tool.category)?.title}</div>
          <h1 ref={headingRef} tabIndex={-1}>
            {tool.title}
          </h1>
          <p className="muted">{tool.description}</p>
        </div>
      </header>
      <div className="tool-card">
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
      </div>
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
