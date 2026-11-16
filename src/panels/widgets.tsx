import { useEffect, useState } from 'react'
import { GlassButton } from '../glass'
import { usePreferences } from '../state'
import { PanelHeading } from '../ui'

const minutes = 25
export default function Widgets() {
  const note = usePreferences(state => state.note)
  const [end, setEnd] = useState<number | null>(null)
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!end || now >= end) return
    const tick = window.setTimeout(() => setNow(Date.now()), 1000)
    return () => window.clearTimeout(tick)
  }, [end, now])
  const remaining = end ? Math.max(0, Math.ceil((end - now) / 1000)) : minutes * 60

  return <>
    <PanelHeading title="Widgets"><small>{new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</small></PanelHeading>
    <div className="widget-grid">
      <div><label htmlFor="note">Notes</label><textarea id="note" value={note} maxLength={4000} onChange={event => usePreferences.setState({ note: event.target.value })} /></div>
      <div><p>Focus timer</p><p className="clock">{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}</p>
        <GlassButton onClick={() => {
          const time = Date.now()
          setNow(time)
          setEnd(end && remaining > 0 ? null : time + minutes * 60_000)
        }}>{end && remaining > 0 ? 'Reset' : 'Start 25 min'}</GlassButton>
      </div>
    </div>
  </>
}
