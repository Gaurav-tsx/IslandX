import { lazy, Suspense, useEffect, useRef } from 'react'
import type { CSSProperties, PointerEvent } from 'react'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { AnimatePresence, LazyMotion, MotionConfig, domAnimation, m, useReducedMotion } from 'framer-motion'
import {
  Activity, Bell, ChevronDown, Clipboard, FolderOpen, Globe2, Grid2X2, Headphones,
  MessageCircle, Music2, Settings2, SlidersHorizontal, Grip, X,
} from 'lucide-react'
import { desktop, errorText, native } from './native'
import { notice, selectTab, setView, useIsland, usePreferences, type Tab } from './state'
import { mergeShelf, saveShelf } from './ui'
import { startUpdates, useUpdate } from './updates'
import { GlassButton, GlassCard, useGlassBackdrop } from './glass'

const panels = {
  music: lazy(() => import('./panels/music')),
  actions: lazy(() => import('./panels/actions')),
  shelf: lazy(() => import('./panels/shelf')),
  web: lazy(() => import('./panels/web')),
  clipboard: lazy(() => import('./panels/clipboard')),
  notifications: lazy(() => import('./panels/notifications')),
  controls: lazy(() => import('./panels/controls')),
  widgets: lazy(() => import('./panels/widgets')),
  audio: lazy(() => import('./panels/audio')),
  messages: lazy(() => import('./panels/messages')),
  settings: lazy(() => import('./panels/settings')),
}
const Stats = lazy(() => import('./panels/stats'))

const tabs = [
  ['music', 'Music', Music2], ['web', 'Browser', Globe2], ['notifications', 'Notifications', Bell],
  ['messages', 'Messages', MessageCircle], ['shelf', 'Shelf', FolderOpen], ['clipboard', 'Clipboard', Clipboard],
  ['widgets', 'Widgets', Grid2X2], ['controls', 'Controls', SlidersHorizontal], ['actions', 'Quick Actions', Grip],
  ['audio', 'Audio', Headphones], ['settings', 'Settings', Settings2],
] as const

const sizes = {
  collapsed: [184, 34],
  compact: [296, 40],
  expanded: [592, 326],
  statsBar: [570, 42],
} as const

const spring = { type: 'spring', stiffness: 300, damping: 30 } as const

export function App() {
  const { view, tab, status } = useIsland()
  const { surface, glassQuality, glassBlur, glassGloss, hover, delay, monitor, captureClipboard } = usePreferences()
  const updatePhase = useUpdate(update => update.phase)
  const activity = updatePhase === 'ready' || updatePhase === 'available'
  const Panel = panels[tab]
  const leave = useRef<number | undefined>(undefined)
  const light = useRef<HTMLSpanElement>(null)
  const lightFrame = useRef<number | undefined>(undefined)
  const reduceMotion = useReducedMotion()
  const open = view === 'expanded'
  const optical = (open || view === 'statsBar') && surface === 'glass' && glassQuality !== 'low'
  const { available, translucent } = useGlassBackdrop(optical && glassBlur > 0)
  const sweep = optical && available && glassGloss > 0 && !reduceMotion
  const [width, height] = sizes[view]

  useEffect(startUpdates, [])
  useEffect(() => () => {
    if (lightFrame.current !== undefined) cancelAnimationFrame(lightFrame.current)
    lightFrame.current = undefined
  }, [view, sweep])

  useEffect(() => {
    if (!desktop) {
      setView('expanded')
      return
    }
    let mounted = true
    void native<string[]>('read_shelf').then(shelf => {
      if (mounted && usePreferences.getState().shelf.length === 0) usePreferences.setState({ shelf })
    }).catch(error => notice(errorText(error)))
    const subscriptions = [
      listen('island-toggle', () => {
        const current = useIsland.getState().view
        setView(current === 'expanded' || current === 'statsBar' ? 'collapsed' : 'expanded')
      }),
      listen('island-settings', () => selectTab('settings')),
      getCurrentWebview().onDragDropEvent(({ payload }) => {
        if (payload.type !== 'drop') return
        const shelf = mergeShelf(usePreferences.getState().shelf, payload.paths)
        saveShelf(shelf)
        selectTab('shelf')
      }),
    ]
    return () => {
      mounted = false
      for (const subscription of subscriptions) void subscription.then(unlisten => unlisten())
    }
  }, [])

  useEffect(() => {
    if (!desktop) return
    const resize = () => void native('island_layout', { width, height, monitor }).catch(error => notice(errorText(error)))
    resize()
    // WebView2 reports a device-pixel-ratio change when a monitor's scale changes.
    const dpi = matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
    dpi.addEventListener('change', resize, { once: true })
    return () => dpi.removeEventListener('change', resize)
  }, [width, height, monitor])

  useEffect(() => {
    if (desktop) void native('clipboard_capture', { enabled: captureClipboard }).catch(error => notice(errorText(error)))
  }, [captureClipboard])

  useEffect(() => {
    if (!open && desktop) void native('set_keyboard', { enabled: false })
  }, [open])

  useEffect(() => {
    if (view === 'collapsed' && activity) setView('compact')
    if (view === 'compact' && !activity) setView('collapsed')
  }, [activity, view])

  useEffect(() => {
    if (!status) return
    const timer = window.setTimeout(() => notice(''), 4500)
    return () => window.clearTimeout(timer)
  }, [status])

  function collapse() {
    window.clearTimeout(leave.current)
    setView(activity ? 'compact' : 'collapsed')
  }

  function moveLight(event: PointerEvent<HTMLElement>) {
    if (!light.current) return
    if (lightFrame.current !== undefined) cancelAnimationFrame(lightFrame.current)
    const panel = event.currentTarget
    const { clientX, clientY } = event
    lightFrame.current = requestAnimationFrame(() => {
      if (light.current) {
        const bounds = panel.getBoundingClientRect()
        light.current.style.transform = `translate3d(${clientX - bounds.left - 8}px, ${clientY - bounds.top}px, 0)`
      }
      lightFrame.current = undefined
    })
  }

  return <MotionConfig reducedMotion="user"><LazyMotion features={domAnimation}>
    <main className="desktop" data-surface={surface} data-preview={!desktop}
      data-quality={glassQuality} data-optics={optical && available} data-translucent={translucent} data-transparency={available}
      style={{ '--glass-blur': `${glassBlur}px`, '--glass-gloss': glassGloss / 100 } as CSSProperties} onKeyDown={event => {
      if (event.key === 'Escape') collapse()
    }}>
      <m.section
        key={view}
        className={`island ${view}`}
        initial={{ opacity: 0, scaleX: 0.94, scaleY: 0.92 }}
        animate={{ opacity: 1, scaleX: 1, scaleY: 1 }}
        transition={spring}
        aria-label="IslandX"
        onPointerMove={sweep ? moveLight : undefined}
        onPointerEnter={() => {
          window.clearTimeout(leave.current)
          if (hover && useIsland.getState().view === 'collapsed') setView('expanded')
        }}
        onPointerLeave={() => {
          if (!hover || useIsland.getState().view !== 'expanded') return
          if (document.activeElement?.matches('input, textarea, select, [role="dialog"] button')) return
          leave.current = window.setTimeout(collapse, delay)
        }}
        onPointerDownCapture={event => {
          window.clearTimeout(leave.current)
          if (desktop && (event.target as HTMLElement).closest('input,textarea,select,form')) {
            void native('set_keyboard', { enabled: true })
          }
        }}
      >
        <span aria-hidden="true" className="glass-shell">
          {optical && available && <><span className="glass-grain" /><span className="glass-gloss" /></>}
          {sweep && <span ref={light} className="glass-sweep" />}
        </span>
        {open ? <>
          <header className="toolbar">
            <span className="brand-mark" title="IslandX"><i /><i /></span>
            <nav aria-label="Panels">
              {tabs.map(([id, label, Icon]) =>
                <GlassButton variant="tab" key={id} aria-current={id === tab ? 'page' : undefined} aria-label={label} title={label} onClick={() => selectTab(id)}>
                  <Icon size={16} strokeWidth={1.75} />
                </GlassButton>,
              )}
            </nav>
            <div className="window-controls">
              <GlassButton variant="icon" title="System stats" aria-label="System stats" onClick={() => setView('statsBar')}><Activity size={16} /></GlassButton>
              <GlassButton variant="icon" title="Collapse" aria-label="Collapse" onClick={collapse}><ChevronDown size={17} /></GlassButton>
            </div>
          </header>
          <AnimatePresence mode="wait" initial={false}>
            <m.div className="panel" key={tab} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}>
              <Suspense fallback={<p className="empty" role="status">Opening panel…</p>}>
                {tab === 'music' ? <Panel /> : <GlassCard className="panel-glass" blur="standard"><Panel /></GlassCard>}
              </Suspense>
            </m.div>
          </AnimatePresence>
          {status && <GlassCard className="toast" role="status">{status}<GlassButton variant="icon" aria-label="Dismiss message" onClick={() => notice('')}><X size={14} /></GlassButton></GlassCard>}
        </> : view === 'statsBar' ? (
          <Suspense fallback={<span className="stats-loading">Reading system stats…</span>}><Stats onClose={collapse} /></Suspense>
        ) : <GlassButton variant="pill" aria-label={activity ? 'Open update settings' : 'Expand IslandX'} onClick={() => activity ? selectTab('settings') : setView('expanded')}>
          <span className="brand-mark"><i /><i /></span>
          {activity ? (updatePhase === 'ready' ? 'Update ready' : 'Update available') : 'IslandX'}
          <span className="pill-dot" />
        </GlassButton>}
      </m.section>
    </main>
  </LazyMotion></MotionConfig>
}
