import { useEffect } from 'react'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { desktop, errorText, native } from './native'

type Track = { path: string; title: string; artist: string; art: string | null; duration: number }
type Song = Track & { list: string | null; playing: boolean; position: number }
export type MusicItem = { path: string; title: string; detail: string; kind: 'song' | 'playlist' }
type Player = { ready: boolean; song: Song | null; ad: boolean }
const inactive: Player = { ready: false, song: null, ad: false }
export type PlaybackAction = 'toggle' | 'next' | 'previous' | 'seek'

const request = <T>(type: string, params?: Record<string, unknown>) =>
  native<T>('music_request', { request: { type, ...params } })

export const useMusicHistory = create(persist<{ songs: Track[]; playlists: MusicItem[] }>(
  () => ({ songs: [], playlists: [] }),
  { name: 'islandx-music-history' },
))

const usePlayback = create<Player>(() => inactive)
let showingMusic = false
let sessionStarted = false
let tracking = false
let lastTrack: string | undefined
let pendingPlaylist: MusicItem | undefined

function prepend<T extends { path: string }>(entries: T[], item: T) {
  return [item, ...entries.filter(entry => entry.path !== item.path)].slice(0, 30)
}

function remember(song: Song) {
  if (!song.playing || song.position < 0.5) return
  if (song.path !== lastTrack) {
    lastTrack = song.path
    const { path, title, artist, art, duration } = song
    useMusicHistory.setState(state => ({ songs: prepend(state.songs, { path, title, artist, art, duration }) }))
  }
  if (pendingPlaylist?.path === `/playlist?list=${song.list}`) {
    const playlist = pendingPlaylist
    pendingPlaylist = undefined
    useMusicHistory.setState(state => ({ playlists: prepend(state.playlists, playlist) }))
  }
}

function trackPlayback() {
  if (!desktop || tracking) return
  tracking = true
  async function refresh() {
    if (!showingMusic && !sessionStarted) {
      tracking = false
      return
    }
    try {
      const result = await request<Player | null>('status')
      usePlayback.setState(result ?? inactive)
      if (result?.song) remember(result.song)
    } catch {
      usePlayback.setState(inactive)
    }
    window.setTimeout(refresh, showingMusic ? 1000 : 2000)
  }
  void refresh()
}

export function useYouTubePlayer() {
  const player = usePlayback()
  useEffect(() => {
    showingMusic = true
    trackPlayback()
    return () => { showingMusic = false }
  }, [])
  return player
}

export async function youtubeAction(action: PlaybackAction, seconds?: number) {
  const ok = await request<boolean>(action, action === 'seek' ? { seconds } : undefined)
  if (!ok) throw new Error('YouTube Music is still loading this track.')
}

export const useMusicSearch = create<{
  query: string
  results: MusicItem[]
  pending: boolean
  error: string
  selected: string | null
}>(() => ({ query: '', results: [], pending: false, error: '', selected: null }))

let searchSequence = 0
let playSequence = 0
const delay = () => new Promise(resolve => window.setTimeout(resolve, 400))

export async function searchMusic(query: string) {
  const sequence = ++searchSequence
  useMusicSearch.setState({ query, results: [], pending: true, error: '' })
  const current = () => sequence === searchSequence
  try {
    const deadline = performance.now() + 18000
    let started = false
    while (current() && performance.now() < deadline) {
      if (!started) {
        started = await request<boolean | null>('search', { query }) === true
      } else {
        const results = await request<MusicItem[] | null>('results', { query })
        if (results) {
          if (current()) useMusicSearch.setState({ results, pending: false })
          return
        }
      }
      await delay()
    }
    if (current()) throw new Error(started ? 'No results appeared. Try another search.' : 'YouTube Music could not load. Try again in a moment.')
  } catch (error) {
    if (current()) useMusicSearch.setState({ pending: false, error: errorText(error) })
  }
}

export async function playMusic(item: MusicItem, queue: string[] = []) {
  const { path } = item
  const sequence = ++playSequence
  try {
    if (!await request<boolean>('play', { path, queue })) throw new Error('YouTube Music could not open that result.')
    if (sequence !== playSequence) return
    pendingPlaylist = item.kind === 'playlist' ? item : undefined
    sessionStarted = true
    trackPlayback()
    useMusicSearch.setState({ selected: path, error: '' })
  } catch (error) {
    if (sequence === playSequence) useMusicSearch.setState({ error: errorText(error) })
  }
}
