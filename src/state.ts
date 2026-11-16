import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Tab = 'music' | 'web' | 'notifications' | 'messages' | 'shelf' | 'clipboard' | 'widgets' | 'controls' | 'actions' | 'audio' | 'settings'
export type View = 'collapsed' | 'compact' | 'expanded' | 'statsBar'
export type Site = { name: string; url: string }

export const defaultSites: Site[] = [
  { name: 'YT Music', url: 'https://music.youtube.com' },
  { name: 'YouTube', url: 'https://www.youtube.com' },
  { name: 'Spotify', url: 'https://open.spotify.com' },
  { name: 'Wikipedia', url: 'https://en.wikipedia.org' },
]

type Preferences = {
  accent: 'mint' | 'blue' | 'rose'
  surface: 'glass' | 'black'
  hover: boolean
  delay: number
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
  accent: 'mint',
  surface: 'glass',
  hover: true,
  delay: 900,
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
  partialize: ({ shelf: _shelf, ...preferences }) => preferences,
}))

type Island = { tab: Tab; view: View; status: string }
export const useIsland = create<Island>(() => ({ tab: 'music', view: 'collapsed', status: '' }))
export const selectTab = (tab: Tab) => useIsland.setState({ tab, view: 'expanded' })
export const setView = (view: View) => useIsland.setState({ view })
export const notice = (status: string) => useIsland.setState({ status })
