import { invoke, isTauri } from '@tauri-apps/api/core'

export const desktop = isTauri()

export function native<T = void>(command: string, args?: Record<string, unknown>) {
  if (!desktop) return Promise.reject(new Error('This control requires the Windows desktop app.'))
  return invoke<T>(command, args)
}

export function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}
