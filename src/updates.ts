import { getVersion } from '@tauri-apps/api/app'
import { Channel } from '@tauri-apps/api/core'
import { create } from 'zustand'
import { desktop, errorText, native } from './native'
import { usePreferences } from './state'

type Phase = 'idle' | 'checking' | 'current' | 'available' | 'downloading' | 'ready' | 'installing' | 'error' | 'disabled'
type UpdateState = { current: string; phase: Phase; next?: string; notes?: string; progress?: number; error?: string }
type Release = { version: string; notes: string | null }

export const useUpdate = create<UpdateState>(() => ({ current: '', phase: 'idle' }))
let enabled = false

export async function checkUpdate(download = false) {
  const { phase } = useUpdate.getState()
  if (!enabled || ['checking', 'downloading', 'ready', 'installing'].includes(phase)) return
  useUpdate.setState({ phase: 'checking', next: undefined, notes: undefined, error: undefined })
  try {
    const candidate = await native<Release | null>('update_check')
    if (!candidate) {
      useUpdate.setState({ phase: 'current' })
      return
    }
    useUpdate.setState({ phase: 'available', next: candidate.version, notes: candidate.notes ?? undefined })
    if (download) await downloadUpdate()
  } catch (error) {
    useUpdate.setState({ phase: 'error', error: errorText(error) })
  }
}

export async function downloadUpdate() {
  if (useUpdate.getState().phase !== 'available') return
  useUpdate.setState({ phase: 'downloading', progress: undefined, error: undefined })
  try {
    const progress = new Channel<{ received: number; total: number | null }>()
    progress.onmessage = ({ received, total }) => {
      if (total) useUpdate.setState({ progress: Math.min(1, received / total) })
    }
    const ready = await native<Release>('update_download', { progress })
    useUpdate.setState({ phase: 'ready', progress: 1, next: ready.version, notes: ready.notes ?? undefined })
  } catch (error) {
    useUpdate.setState({ phase: 'available', error: errorText(error) })
  }
}

export async function restartForUpdate() {
  const { phase, next } = useUpdate.getState()
  if (!next || phase !== 'ready') return
  useUpdate.setState({ phase: 'installing', error: undefined })
  usePreferences.setState({ nextLaunchUpdate: null })
  try {
    await native('update_install', { version: next })
  } catch (error) {
    const ready = await native<Release | null>('update_ready').catch(() => null)
    useUpdate.setState({ phase: ready ? 'ready' : 'error', error: errorText(error) })
  }
}

export function startUpdates() {
  let active = true
  if (!desktop) {
    useUpdate.setState({ phase: 'disabled' })
    return
  }
  const maybeCheck = () => {
    if (active && usePreferences.getState().autoUpdate) void checkUpdate(true)
  }
  void Promise.all([getVersion(), native<boolean>('updates_configured')]).then(async ([current, available]) => {
    if (!active) return
    enabled = available
    useUpdate.setState({ current, phase: enabled ? 'checking' : 'disabled' })
    if (!enabled) return
    const ready = await native<Release | null>('update_ready')
    if (!active) return
    if (ready) {
      useUpdate.setState({ phase: 'ready', next: ready.version, notes: ready.notes ?? undefined })
      if (usePreferences.getState().nextLaunchUpdate === ready.version) await restartForUpdate()
    } else {
      usePreferences.setState({ nextLaunchUpdate: null })
      useUpdate.setState({ phase: 'idle' })
      maybeCheck()
    }
  }).catch(error => useUpdate.setState({ phase: 'error', error: errorText(error) }))
  const interval = window.setInterval(maybeCheck, 12 * 60 * 60 * 1000)
  const unsubscribe = usePreferences.subscribe((next, old) => {
    if (!old.autoUpdate && next.autoUpdate) maybeCheck()
  })
  return () => { active = false; window.clearInterval(interval); unsubscribe() }
}
