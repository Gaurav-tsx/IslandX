import type { FormEvent, ReactNode } from 'react'
import { ExternalLink, X } from 'lucide-react'
import { desktop, errorText, native } from './native'
import { notice, usePreferences, type Site } from './state'

export function PanelHeading({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="panel-heading"><h1>{title}</h1>{children}</div>
}

export function WindowsLink({ page, children }: { page: string; children: ReactNode }) {
  return <button className="control" onClick={() => void native('open_windows_settings', { page }).catch(error => notice(errorText(error)))}>
    {children}<ExternalLink size={13} />
  </button>
}

export function launchSite(url: string, embedded: boolean) {
  void native('open_site', { url, embedded }).catch(error => notice(errorText(error)))
}

export function readSite(event: FormEvent<HTMLFormElement>): Site {
  const data = new FormData(event.currentTarget)
  const input = String(data.get('url')).trim()
  const url = new URL(input.includes('://') ? input : `https://${input}`)
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Enter an HTTPS URL without embedded credentials.')
  return { name: String(data.get('name')).trim() || url.hostname, url: url.href }
}

export function SiteForm({ onSave, onClose }: { onSave: (site: Site) => void; onClose: () => void }) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try { onSave(readSite(event)) } catch (error) { notice(errorText(error)) }
  }
  return <form className="site-form" onSubmit={submit}>
    <input autoFocus name="name" placeholder="Label" aria-label="Label" maxLength={32} />
    <input name="url" placeholder="https://example.com" aria-label="URL" maxLength={2048} required />
    <button className="control primary" type="submit">Save</button>
    <button className="icon-button" type="button" aria-label="Cancel" onClick={onClose}><X size={16} /></button>
  </form>
}

export function mergeShelf(current: string[], paths: string[]) {
  return [...new Set([...paths, ...current])].slice(0, 40)
}

export function saveShelf(paths: string[]) {
  usePreferences.setState({ shelf: paths })
  if (desktop) void native('save_shelf', { paths }).catch(error => notice(errorText(error)))
}
