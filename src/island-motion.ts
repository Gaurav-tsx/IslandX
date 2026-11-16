import { useLayoutEffect, useState } from 'react'
import type { View } from './state'

export const islandMotion = {
  smooth: {
    spring: { type: 'spring', stiffness: 500, damping: 36, mass: 0.75 },
    hoverIn: 60, hoverOut: 100, close: 0.16, panel: 0.18,
  },
  responsive: {
    spring: { type: 'spring', stiffness: 680, damping: 40, mass: 0.65 },
    hoverIn: 25, hoverOut: 0, close: 0.12, panel: 0.13,
  },
} as const

export const sizes = {
  collapsed: [184, 34],
  compact: [296, 40],
  expanded: [592, 326],
  statsBar: [570, 42],
  circle: [36, 36],
} as const

type Frame = { view: View; from: View | null; closeTo: View | null }

export function useIslandMotion(view: View, reduced: boolean) {
  const [frame, setFrame] = useState<Frame>(() => ({ view, from: null, closeTo: null }))

  useLayoutEffect(() => {
    setFrame(previous => {
      if (previous.view === view) {
        return previous.closeTo || (reduced && previous.from)
          ? { view, from: null, closeTo: null }
          : previous
      }
      const [width, height] = sizes[view]
      const [currentWidth, currentHeight] = sizes[previous.view]
      // Keep the native window large enough to paint the entire closing animation.
      if (!reduced && width <= currentWidth && height <= currentHeight) {
        return { ...previous, closeTo: view }
      }
      return { view, from: reduced ? null : previous.view, closeTo: null }
    })
  }, [view, reduced])

  function complete() {
    setFrame(current => {
      if (current.closeTo && current.closeTo === view) {
        return { view: current.closeTo, from: null, closeTo: null }
      }
      if (current.view === view && current.from) return { ...current, from: null }
      return current
    })
  }

  return { frame, complete }
}
