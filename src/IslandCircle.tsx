import { useEffect, useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import { GlassButton } from './glass'
import { desktop, errorText, native } from './native'
import { notice, usePreferences } from './state'

type Drag = { pointer: number; origin: number; position: number; delta: number; started: boolean }

export function IslandCircle({ onOpen, activity }: { onOpen: () => void; activity: boolean }) {
  const drag = useRef<Drag | null>(null)
  const frame = useRef<number | undefined>(undefined)
  const [dragging, setDragging] = useState(false)

  useEffect(() => () => {
    if (frame.current !== undefined) cancelAnimationFrame(frame.current)
  }, [])

  function move(gesture: Drag, save = false) {
    if (!desktop) return
    void native<number>('move_circle', {
      monitor: usePreferences.getState().monitor,
      start: gesture.position,
      delta: gesture.delta,
    }).then(circlePosition => {
      if (save) usePreferences.setState({ circlePosition })
    }).catch(error => notice(errorText(error)))
  }

  function begin(event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0 || drag.current) return
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = {
      pointer: event.pointerId,
      origin: event.screenX,
      position: usePreferences.getState().circlePosition,
      delta: 0,
      started: false,
    }
  }

  function update(event: PointerEvent<HTMLButtonElement>) {
    const gesture = drag.current
    if (!gesture || gesture.pointer !== event.pointerId) return
    gesture.delta = event.screenX - gesture.origin
    if (!gesture.started) {
      if (Math.abs(gesture.delta) < 4) return
      gesture.started = true
      setDragging(true)
    }
    if (frame.current === undefined) {
      frame.current = requestAnimationFrame(() => {
        frame.current = undefined
        move(gesture)
      })
    }
  }

  function end(event: PointerEvent<HTMLButtonElement>) {
    const gesture = drag.current
    if (!gesture || gesture.pointer !== event.pointerId) return
    drag.current = null
    if (frame.current !== undefined) cancelAnimationFrame(frame.current)
    frame.current = undefined
    setDragging(false)
    if (gesture.started) move(gesture, true)
  }

  return <GlassButton
    variant="bare"
    className="circle-button"
    data-dragging={dragging}
    data-activity={activity}
    aria-label={activity ? 'IslandX circle, update available' : 'IslandX circle'}
    title="Right-click to open · Drag to move"
    onPointerDown={begin}
    onPointerMove={update}
    onPointerUp={end}
    onPointerCancel={end}
    onLostPointerCapture={end}
    onContextMenu={event => {
      event.preventDefault()
      if (!drag.current) onOpen()
    }}
    onKeyDown={event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        onOpen()
      }
    }}
  >
    <span className="circle-mark" aria-hidden="true"><i /><i /></span>
  </GlassButton>
}
