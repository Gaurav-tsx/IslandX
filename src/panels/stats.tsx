import { useEffect, useState } from 'react'
import { ArrowDown, ChevronUp } from 'lucide-react'
import { desktop, native } from '../native'
import { GlassButton, GlassCard } from '../glass'

type Sample = { cpu: number; ram: number; received: number }

export default function Stats({ onClose }: { onClose: () => void }) {
  const [sample, setSample] = useState<Sample>()
  const [time, setTime] = useState(new Date())
  useEffect(() => {
    let active = true
    let timer: number
    async function tick() {
      setTime(new Date())
      if (desktop) {
        const reading = await native<Sample>('sample_stats').catch(() => undefined)
        if (active) setSample(reading)
      }
      if (active) timer = window.setTimeout(tick, 1000)
    }
    void tick()
    return () => {
      active = false
      window.clearTimeout(timer)
      if (desktop) void native('pause_stats')
    }
  }, [])

  function metric(name: string, value?: number) {
    return <span className="row">{name} {value === undefined ? <small>n/a</small> : <><meter min={0} max={100} low={65} high={85} optimum={0} value={value} aria-label={name} />{Math.round(value)}%</>}</span>
  }

  const network = sample && sample.received >= 1000 ? `${(sample.received / 1000).toFixed(1)} Mb/s` : `${sample?.received ?? '—'} kb/s`
  return <GlassCard className="stats" blur="standard">
    {metric('CPU', sample?.cpu)}{metric('GPU')}{metric('RAM', sample?.ram)}
    <span className="row" title="Receive rate"><ArrowDown size={13} />{network}</span>
    <time>{time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
    <GlassButton variant="icon" onClick={onClose} aria-label="Close system stats"><ChevronUp size={16} /></GlassButton>
  </GlassCard>
}
