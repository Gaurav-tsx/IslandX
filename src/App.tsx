import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent } from 'react'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { AnimatePresence, LazyMotion, MotionConfig, domAnimation, m, useReducedMotion } from 'framer-motion'
import {
  Activity, Bell, ChevronDown, Clipboard, FolderOpen, Globe2, Grid2X2, Headphones,
  Lock, MessageCircle, Music2, Settings2, SlidersHorizontal, Grip, Unlock, X,
} from 'lucide-react'
import { desktop, errorText, native } from './native'
import { lockCircle, notice, selectTab, setForeground, setView, unlockCircle, useIsland, usePreferences } from './state'
import { mergeShelf, saveShelf } from './ui'
import { startUpdates, useUpdate } from './updates'
import { GlassButton, GlassCard, useTransparency } from './glass'
import { IslandCircle } from './IslandCircle'
import { islandMotion, sizes, useIslandMotion } from './island-motion'

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

// Panels slide in from the side the new tab sits on; only opacity/transform so the glass blur stays crisp.
const panelMotion = {
  enter: (direction: number) => ({ opacity: 0, x: direction * 16 }),
  center: { opacity: 1, x: 0 },
  exit: (direction: number) => ({ opacity: 0, x: direction * -10 }),
}

function isEditable(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest('input, textarea, select, [contenteditable="true"]'))
}

export function App() {
  const { view, tab, status, appActive, circleUnlocked } = useIsland()
  const {
    surface, glassQuality, glassBlur, glassGloss, cornerRadius,
    hover, autoHide, invisibleSlim, locked, monitor, captureClipboard, motion, hideFromCapture,
  } = usePreferences()
  const updatePhase = useUpdate(update => update.phase)
  const activity = updatePhase === 'ready' || updatePhase === 'available'
  const Panel = panels[tab]
  const light = useRef<HTMLSpanElement>(null)
  const lightFrame = useRef<number | undefined>(undefined)
  const rightDrag = useRef<{
    pointerId: number
    originX: number
    startPosition: number
    delta: number
    started: boolean
  } | null>(null)
  const rightDragFrame = useRef<number | undefined>(undefined)
  const hasDraggedRef = useRef(false)
  const [islandDragging, setIslandDragging] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  const nav = useRef<HTMLElement>(null)
  const intent = useRef<number | undefined>(undefined)
  const tabIndex = tabs.findIndex(([id]) => id === tab)
  const previousTab = useRef(tabIndex)
  const direction = tabIndex >= previousTab.current ? 1 : -1
  const reduceMotion = Boolean(useReducedMotion()) || motion === 'off'
  const timing = motion === 'smooth' ? islandMotion.smooth : islandMotion.responsive
  const { frame, complete } = useIslandMotion(view, reduceMotion)
  const visible = frame.view
  const closing = frame.closeTo !== null
  const open = visible === 'expanded'
  const solid = surface === 'black' || surface === 'pure-black' || surface === 'graphite'
  const optical = (open || visible === 'statsBar') && !solid && glassQuality !== 'low'
  const transparency = useTransparency()
  const translucent = optical && transparency
  const sweep = translucent && !closing && glassGloss > 0 && !reduceMotion
  const rest = activity ? 'compact' : 'collapsed'
  const isResting = visible === 'collapsed' || visible === 'compact'
  const isSlim = isResting && !closing && !islandDragging &&
    (locked || (autoHide && !isHovered && !circleUnlocked))
  const [width, height] = sizes[visible]
  const [fromWidth, fromHeight] = sizes[frame.from ?? visible]
  const [toWidth, toHeight] = sizes[frame.closeTo ?? visible]

  useEffect(startUpdates, [])
  useEffect(() => { previousTab.current = tabIndex }, [tabIndex])
  useEffect(() => () => window.clearTimeout(intent.current), [])

  // Measure the active tab so the highlight can glide to it.
  useLayoutEffect(() => {
    const bar = nav.current
    if (!bar) return
    const measure = () => {
      const active = bar.querySelector<HTMLElement>('[aria-current="page"]')
      if (!active) return
      bar.style.setProperty('--pill-x', `${active.offsetLeft}px`)
      bar.style.setProperty('--pill-w', `${active.offsetWidth}px`)
    }
    measure()
    const resize = new ResizeObserver(measure)
    resize.observe(bar)
    return () => resize.disconnect()
  }, [tab, open])

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
      const anchor = locked ? 0.5 : usePreferences.getState().circlePosition
      void native('island_layout', {
        width: (locked && isSlim) ? 280 : width,
        height: isSlim ? 4 : height,
        monitor,
        anchor,
        cornerRadius: cornerRadius / 100,
        hideFromCapture,
      }).catch(error => notice(errorText(error)))
    }
    resize()
    // WebView2 reports a device-pixel-ratio change when a monitor's scale changes.
    const dpi = matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
    dpi.addEventListener('change', resize, { once: true })
    return () => dpi.removeEventListener('change', resize)
  }, [width, height, monitor, isSlim, cornerRadius, locked, hideFromCapture])

  useEffect(() => () => {
    if (rightDragFrame.current !== undefined) cancelAnimationFrame(rightDragFrame.current)
  }, [])

  function moveIsland(delta: number, start: number, save = false) {
    if (!desktop) return
    void native<number>('move_island', {
      monitor: usePreferences.getState().monitor,
      start,
      delta,
    }).then(circlePosition => {
      if (save) usePreferences.setState({ circlePosition })
    }).catch(error => notice(errorText(error)))
  }

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
    setIsHovered(false)
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

  return <MotionConfig reducedMotion={reduceMotion ? 'always' : 'never'}><LazyMotion features={domAnimation}>
    <main className="desktop" data-surface={surface} data-preview={!desktop}
      data-quality={glassQuality} data-optics={translucent && !closing} data-translucent={translucent}
      data-transparency={transparency} data-card-blur={translucent && !closing && glassBlur > 0}
      data-motion={reduceMotion ? 'off' : motion}
      style={{ '--glass-blur': `${glassBlur}px`, '--glass-gloss': glassGloss / 100, '--corner-scale': cornerRadius / 100 } as CSSProperties} onKeyDown={event => {
      if (event.key === 'Escape') collapse()
    }}>
      <div className={`island-frame ${visible}`}
        data-dragging={islandDragging}
        style={!desktop ? { width, height: isSlim ? 4 : height } : undefined}
        onClick={() => {
          if (isSlim) openFromRest()
        }}
        onPointerDown={event => {
          if (locked) return
          if (event.button === 2 && open && !isEditable(event.target)) {
            try {
              event.currentTarget.setPointerCapture(event.pointerId)
            } catch {}
            rightDrag.current = {
              pointerId: event.pointerId,
              originX: event.screenX,
              startPosition: usePreferences.getState().circlePosition,
              delta: 0,
              started: false,
            }
            hasDraggedRef.current = false
          }
        }}
        onPointerMove={event => {
          if (sweep) moveLight(event)
          const gesture = rightDrag.current
          if (!gesture || gesture.pointerId !== event.pointerId) return
          gesture.delta = event.screenX - gesture.originX
          if (!gesture.started) {
            if (Math.abs(gesture.delta) < 4) return
            gesture.started = true
            hasDraggedRef.current = true
            setIslandDragging(true)
          }
          if (rightDragFrame.current === undefined) {
            rightDragFrame.current = requestAnimationFrame(() => {
              rightDragFrame.current = undefined
              moveIsland(gesture.delta, gesture.startPosition)
            })
          }
        }}
        onPointerUp={event => {
          const gesture = rightDrag.current
          if (gesture && gesture.pointerId === event.pointerId) {
            try {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId)
              }
            } catch {}
            rightDrag.current = null
            if (rightDragFrame.current !== undefined) cancelAnimationFrame(rightDragFrame.current)
            rightDragFrame.current = undefined
            setIslandDragging(false)
            if (gesture.started) {
              moveIsland(gesture.delta, gesture.startPosition, true)
            }
          }
        }}
        onPointerCancel={event => {
          const gesture = rightDrag.current
          if (gesture && gesture.pointerId === event.pointerId) {
            try {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId)
              }
            } catch {}
            rightDrag.current = null
            if (rightDragFrame.current !== undefined) cancelAnimationFrame(rightDragFrame.current)
            rightDragFrame.current = undefined
            setIslandDragging(false)
          }
        }}
        onPointerEnter={() => {
          window.clearTimeout(intent.current)
          setIsHovered(true)
          if (locked) {
            intent.current = window.setTimeout(() => {
              openFromRest()
            }, timing.hoverIn)
            return
          }
          const current = useIsland.getState()
          const canHover = current.circleUnlocked || (hover && !current.appActive)
          if (canHover && (current.view === 'collapsed' || current.view === 'compact')) {
            intent.current = window.setTimeout(() => {
              const latest = useIsland.getState()
              const canStillHover = latest.circleUnlocked || (usePreferences.getState().hover && !latest.appActive)
              if (canStillHover && (latest.view === 'collapsed' || latest.view === 'compact')) openFromRest()
            }, timing.hoverIn)
          }
        }}
        onPointerLeave={() => {
          if (rightDrag.current) return
          window.clearTimeout(intent.current)
          if (locked) {
            intent.current = window.setTimeout(() => {
              if (useIsland.getState().view === 'expanded') {
                collapse()
                setIsHovered(false)
              }
            }, timing.hoverOut)
            return
          }
          const current = useIsland.getState()
          if (current.view === 'expanded' && (hover || current.appActive || current.circleUnlocked)) {
            intent.current = window.setTimeout(() => {
              if (useIsland.getState().view === 'expanded' && !rightDrag.current) {
                collapse()
                setIsHovered(false)
              }
            }, timing.hoverOut)
          } else if (current.view === 'collapsed' || current.view === 'compact') {
            intent.current = window.setTimeout(() => {
              setIsHovered(false)
            }, timing.hoverOut)
          }
        }}
        onContextMenu={event => {
          if (isEditable(event.target)) return
          event.preventDefault()
          if (locked) return
          if (hasDraggedRef.current) {
            hasDraggedRef.current = false
            return
          }
          if (!circleUnlocked) return
          window.clearTimeout(intent.current)
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
        className={`island ${visible} ${isSlim ? (locked ? 'slim locked' : invisibleSlim ? 'slim invisible' : 'slim') : ''}`}
        data-dragging={islandDragging}
        initial={frame.from ? { opacity: 0.85, scaleX: Math.max(0.1, fromWidth / width), scaleY: Math.max(0.13, fromHeight / height) } : false}
        animate={{ opacity: closing ? 0.78 : 1, scaleX: toWidth / width, scaleY: toHeight / height }}
        transition={reduceMotion ? { duration: 0 } : closing
          ? { type: 'tween', duration: timing.close, ease: [0.25, 0.84, 0.44, 1] }
          : timing.spring}
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
          transition={{ duration: reduceMotion ? 0 : closing ? 0.09 : timing.panel, ease: 'easeOut' }}>
        {open ? <>
          <header className="toolbar">
            <span className="brand-mark" title={circleUnlocked ? 'Right-click to lock hover' : 'IslandX'}><i /><i /></span>
            <nav aria-label="Panels" ref={nav} onKeyDown={event => {
              if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
              event.preventDefault()
              const step = event.key === 'ArrowRight' ? 1 : tabs.length - 1
              selectTab(tabs[(tabIndex + step) % tabs.length][0])
              requestAnimationFrame(() => nav.current?.querySelector<HTMLElement>('[aria-current="page"]')?.focus())
            }}>
              {tabs.map(([id, label, Icon]) =>
                <GlassButton variant="tab" key={id} aria-current={id === tab ? 'page' : undefined} aria-label={label} title={label} onClick={() => selectTab(id)}>
                  <Icon size={16} strokeWidth={1.75} />
                </GlassButton>,
              )}
            </nav>
            <div className="window-controls">
              <GlassButton
                variant="icon"
                className={locked ? 'locked-active' : ''}
                title={locked ? 'Island locked to center & auto-vanish (click to unlock)' : 'Lock island to center & auto-vanish'}
                aria-label={locked ? 'Unlock island' : 'Lock island'}
                aria-pressed={locked}
                onClick={() => {
                  const next = !locked
                  usePreferences.setState({ locked: next, circlePosition: 0.5 })
                  if (next) collapse()
                }}
              >
                {locked ? <Lock size={15} /> : <Unlock size={15} />}
              </GlassButton>
              <GlassButton variant="icon" title="System stats" aria-label="System stats" onClick={() => setView('statsBar')}><Activity size={16} /></GlassButton>
              <GlassButton variant="icon" title="Collapse" aria-label="Collapse" onClick={collapse}><ChevronDown size={17} /></GlassButton>
            </div>
          </header>
          <AnimatePresence mode="wait" initial={false} custom={direction}>
            <m.div className="panel" key={tab} custom={direction} variants={panelMotion} initial={reduceMotion ? false : 'enter'} animate="center" exit={reduceMotion ? undefined : 'exit'}
              transition={{ duration: reduceMotion ? 0 : timing.panel, ease: [0.22, 1, 0.36, 1] }}>
              <Suspense fallback={<p className="empty" role="status">Opening panel…</p>}>
                {tab === 'music' ? <Panel /> : <GlassCard className="panel-glass" blur="standard"><Panel /></GlassCard>}
              </Suspense>
            </m.div>
          </AnimatePresence>
          <AnimatePresence>
            {status && <m.div key="toast" className="toast-wrap"
              initial={{ opacity: 0, y: 12, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={reduceMotion ? { duration: 0 } : timing.spring}>
              <GlassCard className="toast" role="status"><span>{status}</span><GlassButton variant="icon" aria-label="Dismiss message" onClick={() => notice('')}><X size={14} /></GlassButton></GlassCard>
            </m.div>}
          </AnimatePresence>
        </> : visible === 'statsBar' ? (
          <Suspense fallback={<span className="stats-loading">Reading system stats…</span>}><Stats onClose={collapse} /></Suspense>
        ) : visible === 'circle' ? <IslandCircle onUnlock={() => unlockCircle(activity ? 'settings' : undefined)} activity={activity} />
        : <GlassButton variant="pill" data-activity={activity} aria-label={activity ? 'Open update settings' : 'Expand IslandX'}
            title={circleUnlocked ? 'Right-click to lock hover' : undefined} onClick={openFromRest}>
          <span className="brand-mark"><i /><i /></span>
          {activity ? (updatePhase === 'ready' ? 'Update Ready' : 'Update Available') : 'IslandX'}
          <span className="pill-dot" />
        </GlassButton>}
        </m.div>
      </m.section>
      </div>
    </main>
  </LazyMotion></MotionConfig>
}
