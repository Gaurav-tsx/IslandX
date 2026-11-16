import { useEffect, useRef } from 'react'
import { errorText, native } from './native'
import { notice } from './state'

let pendingVolume: number | undefined
let writingVolume = false

async function writeVolume(value: number) {
  pendingVolume = value
  if (writingVolume) return
  writingVolume = true
  try {
    while (pendingVolume !== undefined) {
      const volume = pendingVolume
      pendingVolume = undefined
      await native('change_audio', { volume }).catch(error => notice(errorText(error)))
    }
  } finally {
    writingVolume = false
  }
}

export function VolumeSlider({ value, onVolume }: {
  value?: number
  onVolume: (volume: number) => void
}) {
  const input = useRef<HTMLInputElement>(null)

  function change(volume: number) {
    onVolume(volume)
    void writeVolume(volume)
  }

  const update = useRef(change)
  update.current = change
  useEffect(() => {
    const slider = input.current
    if (!slider) return
    const wheel = (event: WheelEvent) => {
      if (slider.disabled || event.deltaY === 0) return
      event.preventDefault()
      const volume = Math.max(0, Math.min(100, slider.valueAsNumber - Math.sign(event.deltaY) * 2))
      if (volume !== slider.valueAsNumber) {
        slider.valueAsNumber = volume
        update.current(volume)
      }
    }
    slider.addEventListener('wheel', wheel, { passive: false })
    return () => slider.removeEventListener('wheel', wheel)
  }, [])

  return <input ref={input} type="range" min={0} max={100} aria-label="Output volume"
    aria-valuetext={value === undefined ? undefined : `${value}%`}
    disabled={value === undefined} value={value ?? 0}
    onChange={event => change(event.currentTarget.valueAsNumber)} />
}
