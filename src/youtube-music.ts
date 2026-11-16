import { useEffect, useState } from 'react'
import { create } from 'zustand'
import { desktop, errorText, native } from './native'

export type Song = { title: string; artist: string; art: string | null; playing: boolean; position: number; duration: number }
type Result = { path: string; title: string; detail: string; kind: 'song' | 'playlist' }
type Player = { ready: boolean; song: Song | null; ad: boolean }
const inactive: Player = { ready: false, song: null, ad: false }
export type PlaybackAction = 'toggle' | 'next' | 'previous' | 'seek'

const request = <T>(type: string, params?: Record<string, unknown>) =>
  native<T>('music_request', { request: { type, ...params } })

export function useYouTubePlayer() {
  const [player, setPlayer] = useState(inactive)

  useEffect(() => {
    if (!desktop) return
    let mounted = true
    let timer: number
    async function refresh() {
      try {
        const result = await request<Player | null>('status')
        if (mounted && result) setPlayer(result)
      } catch {
        if (mounted) setPlayer(inactive)
      }
      if (mounted) timer = window.setTimeout(refresh, 1000)
    }
    void refresh()
    return () => { mounted = false; window.clearTimeout(timer) }
  }, [])
  return player
}

export async function youtubeAction(action: PlaybackAction, seconds?: number) {
  const ok = await request<boolean>(action, action === 'seek' ? { seconds } : undefined)
  if (!ok) throw new Error('YouTube Music is still loading this track.')
}

export const useMusicSearch = create<{
  query: string
  results: Result[]
  pending: boolean
  error: string
  selected: string | null
}>(() => ({ query: '', results: [], pending: false, error: '', selected: null }))

let searchSequence = 0
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
        const results = await request<Result[] | null>('results', { query })
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

export async function playMusic(path: string) {
  try {
    if (!await request<boolean>('play', { path })) throw new Error('YouTube Music could not open that result.')
    useMusicSearch.setState({ selected: path, error: '' })
  } catch (error) {
    useMusicSearch.setState({ error: errorText(error) })
  }
}
