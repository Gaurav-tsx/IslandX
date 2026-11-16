import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Tab = 'music' | 'web' | 'notifications' | 'messages' | 'shelf' | 'clipboard' | 'widgets' | 'controls' | 'actions' | 'audio' | 'settings'
export type View = 'collapsed' | 'compact' | 'expanded' | 'statsBar' | 'circle'
export type Site = { name: string; url: string }
export type GlassQuality = 'high' | 'balanced' | 'low'
export type SurfaceTheme = 'glass' | 'black' | 'pure-black' | 'graphite' | 'acrylic' | 'rose' | 'lavender' | 'peach' | 'sakura' | 'candy'

export const defaultSites: Site[] = [
  { name: 'YouTube', url: 'https://www.youtube.com' },
  { name: 'Spotify', url: 'https://open.spotify.com' },
  { name: 'Wikipedia', url: 'https://en.wikipedia.org' },
]

type Preferences = {
  browserId: string | null
  surface: SurfaceTheme
  glassQuality: GlassQuality
  glassBlur: number
  glassGloss: number
  cornerRadius: number
  hover: boolean
  autoHide: boolean
  invisibleSlim: boolean
  circlePosition: number
  monitor: number
  autoUpdate: boolean
  nextLaunchUpdate: string | null
  captureClipboard: boolean
  sites: Site[]
  actions: (Site | null)[]
  shelf: string[]
  note: string
}

export const usePreferences = create<Preferences>()(persist<Preferences, [], [], Omit<Preferences, 'shelf'>>(() => ({
  browserId: null,
  surface: 'glass',
  glassQuality: 'balanced',
  glassBlur: 24,
  glassGloss: 65,
  cornerRadius: 100,
  hover: true,
  autoHide: false,
  invisibleSlim: false,
  circlePosition: 0.9,
  monitor: -1,
  autoUpdate: true,
  nextLaunchUpdate: null,
  captureClipboard: false,
  sites: defaultSites,
  actions: [null, null, null, null, null, null],
  shelf: [],
  note: '',
}), {
  name: 'islandx-preferences',
  version: 4,
  migrate: persisted => {
    const preferences = persisted as Partial<Preferences>
    return {
      cornerRadius: 100,
      autoHide: false,
      invisibleSlim: false,
      ...preferences,
    } as Omit<Preferences, 'shelf'>
  },
  partialize: ({ shelf: _shelf, ...preferences }) => preferences,
}))

type Island = { tab: Tab; view: View; status: string; appActive: boolean; circleUnlocked: boolean }
export const useIsland = create<Island>(() => ({
  tab: 'music', view: 'collapsed', status: '', appActive: false, circleUnlocked: false,
}))
export const selectTab = (tab: Tab) => useIsland.setState({ tab, view: 'expanded' })
export const setView = (view: View) => useIsland.setState(state => ({
  view: state.appActive && !state.circleUnlocked && (view === 'collapsed' || view === 'compact') ? 'circle' : view,
}))
export const setForeground = (appActive: boolean) => useIsland.setState(state => ({
  appActive,
  view: appActive && !state.circleUnlocked ? 'circle' : state.view === 'circle' ? 'collapsed' : state.view,
}))
export const unlockCircle = (tab?: Tab) => useIsland.setState(state => ({
  circleUnlocked: true, view: 'expanded', tab: tab ?? state.tab,
}))
export const lockCircle = (rest: 'collapsed' | 'compact') => useIsland.setState(state => ({
  circleUnlocked: false, view: state.appActive ? 'circle' : rest,
}))
export const notice = (status: string) => useIsland.setState({ status })
