import { lazy, Suspense, useEffect, useLayoutEffect, useRef } from 'react'
import type { CSSProperties, PointerEvent } from 'react'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { AnimatePresence, LazyMotion, MotionConfig, domAnimation, m, useReducedMotion } from 'framer-motion'
import {
  Activity, Bell, ChevronDown, Clipboard, FolderOpen, Globe2, Grid2X2, Headphones,
  MessageCircle, Music2, Settings2, SlidersHorizontal, Grip, X,
} from 'lucide-react'
import { desktop, errorText, native } from './native'
import { lockCircle, notice, selectTab, setForeground, setView, unlockCircle, useIsland, usePreferences } from './state'
import { mergeShelf, saveShelf } from './ui'
import { startUpdates, useUpdate } from './updates'
import { GlassButton, GlassCard, useTransparency } from './glass'
import { IslandCircle } from './IslandCircle'
import { sizes, useIslandMotion } from './island-motion'

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

const spring = { type: 'spring', stiffness: 500, damping: 36, mass: 0.75 } as const
const retract = { type: 'tween', duration: 0.16, ease: [0.25, 0.84, 0.44, 1] } as const

export function App() {
  const { view, tab, status, appActive, circleUnlocked } = useIsland()
  const { surface, glassQuality, glassBlur, glassGloss, hover, monitor, captureClipboard } = usePreferences()
  const updatePhase = useUpdate(update => update.phase)
  const activity = updatePhase === 'ready' || updatePhase === 'available'
  const Panel = panels[tab]
  const light = useRef<HTMLSpanElement>(null)
  const lightFrame = useRef<number | undefined>(undefined)
  const reduceMotion = useReducedMotion()
  const { frame, complete } = useIslandMotion(view, Boolean(reduceMotion))
  const visible = frame.view
  const closing = frame.closeTo !== null
  const open = visible === 'expanded'
  const optical = (open || visible === 'statsBar') && surface === 'glass' && glassQuality !== 'low'
  const transparency = useTransparency()
  const translucent = optical && transparency
  const sweep = translucent && !closing && glassGloss > 0 && !reduceMotion
  const rest = activity ? 'compact' : 'collapsed'
  const [width, height] = sizes[visible]
  const [fromWidth, fromHeight] = sizes[frame.from ?? visible]
  const [toWidth, toHeight] = sizes[frame.closeTo ?? visible]

  useEffect(startUpdates, [])
  useEffect(() => () => {
    if (lightFrame.current !== undefined) cancelAnimationFrame(lightFrame.current)
    lightFrame.current = undefined
  }, [visible, sweep])

  useEffect(() => {
    if (!desktop) {
      setView('expanded')
      return
    }
    let mounted = true
    let foregroundChanged = false
    const foreground = listen<boolean>('island-foreground', ({ payload }) => {
      foregroundChanged = true
      setForeground(payload)
    })
    void foreground.then(() => native<boolean>('foreground_app')).then(active => {
      if (mounted && !foregroundChanged) setForeground(active)
    }).catch(() => {})
    void native<string[]>('read_shelf').then(shelf => {
      if (mounted && usePreferences.getState().shelf.length === 0) usePreferences.setState({ shelf })
    }).catch(error => notice(errorText(error)))
    const subscriptions = [
      foreground,
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
      for (const subscription of subscriptions) void subscription.then(unlisten => unlisten()).catch(() => {})
    }
  }, [])

  useLayoutEffect(() => {
    if (!desktop) return
    const resize = () => {
      const anchor = visible === 'circle' || appActive
        ? usePreferences.getState().circlePosition : null
      void native('island_layout', { width, height, monitor, anchor }).catch(error => notice(errorText(error)))
    }
    resize()
    // WebView2 reports a device-pixel-ratio change when a monitor's scale changes.
    const dpi = matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
    dpi.addEventListener('change', resize, { once: true })
    return () => dpi.removeEventListener('change', resize)
  }, [width, height, monitor, visible, appActive])

  useEffect(() => {
    if (desktop) void native('clipboard_capture', { enabled: captureClipboard }).catch(error => notice(errorText(error)))
  }, [captureClipboard])

  useEffect(() => {
    if (view !== 'expanded' && desktop) void native('set_keyboard', { enabled: false })
  }, [view])

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
    setView(rest)
  }

  function openFromRest() {
    if (activity) selectTab('settings')
    else setView('expanded')
  }

  function moveLight(event: PointerEvent<HTMLElement>) {
    if (!light.current) return
    if (lightFrame.current !== undefined) cancelAnimationFrame(lightFrame.current)
    const panel = event.currentTarget
    const { clientX, clientY } = event
    lightFrame.current = requestAnimationFrame(() => {
      if (light.current) {
        const bounds = panel.getBoundingClientRect()
        light.current.style.transform = `translate3d(${clientX - bounds.left}px, ${clientY - bounds.top}px, 0)`
      }
      lightFrame.current = undefined
    })
  }

  return <MotionConfig reducedMotion="user"><LazyMotion features={domAnimation}>
    <main className="desktop" data-surface={surface} data-preview={!desktop}
      data-quality={glassQuality} data-optics={translucent && !closing} data-translucent={translucent}
      data-transparency={transparency} data-card-blur={translucent && !closing && glassBlur > 0}
      style={{ '--glass-blur': `${glassBlur}px`, '--glass-gloss': glassGloss / 100 } as CSSProperties} onKeyDown={event => {
      if (event.key === 'Escape') collapse()
    }}>
      <div className={`island-frame ${visible}`}
        style={!desktop ? { width, height } : undefined}
        onPointerMove={sweep ? moveLight : undefined}
        onPointerEnter={() => {
          const current = useIsland.getState()
          const canHover = current.circleUnlocked || (hover && !current.appActive)
          if (canHover && (current.view === 'collapsed' || current.view === 'compact')) openFromRest()
        }}
        onPointerLeave={() => {
          const current = useIsland.getState()
          if (current.view === 'expanded' && (hover || current.appActive || current.circleUnlocked)) collapse()
        }}
        onContextMenu={event => {
          if (!circleUnlocked || (event.target as Element).closest('input, textarea, select, [contenteditable]')) return
          event.preventDefault()
          lockCircle(rest)
        }}
        onPointerDownCapture={event => {
          if (desktop && (event.target as HTMLElement).closest('input,textarea,select,form')) {
            void native('set_keyboard', { enabled: true })
          }
        }}
      >
      <m.section
        key={visible}
        className={`island ${visible}`}
        initial={frame.from ? { opacity: 0.85, scaleX: Math.max(0.1, fromWidth / width), scaleY: Math.max(0.13, fromHeight / height) } : false}
        animate={{ opacity: closing ? 0.78 : 1, scaleX: toWidth / width, scaleY: toHeight / height }}
        transition={closing ? retract : spring}
        onAnimationComplete={complete}
        aria-label="IslandX"
      >
        {visible !== 'circle' && <span aria-hidden="true" className="glass-shell">
          {translucent && <><span className="glass-grain" /><span className="glass-gloss" /></>}
          {sweep && <span ref={light} className="glass-sweep" />}
        </span>}
        <m.div className="island-content" inert={closing}
          initial={frame.from ? { opacity: 0, y: -7 } : false}
          animate={{ opacity: closing ? 0 : 1, y: closing ? -5 : 0 }}
          transition={{ duration: closing ? 0.09 : 0.16, ease: 'easeOut' }}>
        {open ? <>
          <header className="toolbar">
            <span className="brand-mark" title={circleUnlocked ? 'Right-click to lock hover' : 'IslandX'}><i /><i /></span>
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
        </> : visible === 'statsBar' ? (
          <Suspense fallback={<span className="stats-loading">Reading system stats…</span>}><Stats onClose={collapse} /></Suspense>
        ) : visible === 'circle' ? <IslandCircle onUnlock={() => unlockCircle(activity ? 'settings' : undefined)} activity={activity} />
        : <GlassButton variant="pill" aria-label={activity ? 'Open update settings' : 'Expand IslandX'}
            title={circleUnlocked ? 'Right-click to lock hover' : undefined} onClick={openFromRest}>
          <span className="brand-mark"><i /><i /></span>
          {activity ? (updatePhase === 'ready' ? 'Update ready' : 'Update available') : 'IslandX'}
          <span className="pill-dot" />
        </GlassButton>}
        </m.div>
      </m.section>
      </div>
    </main>
  </LazyMotion></MotionConfig>
}
