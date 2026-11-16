import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Tab = 'music' | 'web' | 'notifications' | 'messages' | 'shelf' | 'clipboard' | 'widgets' | 'controls' | 'actions' | 'audio' | 'settings'
export type View = 'collapsed' | 'compact' | 'expanded' | 'statsBar' | 'circle'
export type Site = { name: string; url: string }
export type GlassQuality = 'high' | 'balanced' | 'low'

export const defaultSites: Site[] = [
  { name: 'YT Music', url: 'https://music.youtube.com' },
  { name: 'YouTube', url: 'https://www.youtube.com' },
  { name: 'Spotify', url: 'https://open.spotify.com' },
  { name: 'Wikipedia', url: 'https://en.wikipedia.org' },
]

type Preferences = {
  surface: 'glass' | 'black'
  glassQuality: GlassQuality
  glassBlur: number
  glassGloss: number
  hover: boolean
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
  surface: 'glass',
  glassQuality: 'balanced',
  glassBlur: 24,
  glassGloss: 65,
  hover: true,
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
  version: 2,
  migrate: persisted => {
    const { accent: _accent, delay: _delay, ...preferences } = persisted as Omit<Preferences, 'shelf'> & { accent?: string; delay?: number }
    return preferences
  },
  partialize: ({ shelf: _shelf, ...preferences }) => preferences,
}))

type Island = { tab: Tab; view: View; status: string; appActive: boolean }
export const useIsland = create<Island>(() => ({ tab: 'music', view: 'collapsed', status: '', appActive: false }))
export const selectTab = (tab: Tab) => useIsland.setState({ tab, view: 'expanded' })
export const setView = (view: View) => useIsland.setState(state => ({
  view: state.appActive && (view === 'collapsed' || view === 'compact') ? 'circle' : view,
}))
export const setForeground = (appActive: boolean) => useIsland.setState(state => ({
  appActive,
  view: appActive ? 'circle' : state.appActive ? 'collapsed' : state.view,
}))
export const notice = (status: string) => useIsland.setState({ status })
