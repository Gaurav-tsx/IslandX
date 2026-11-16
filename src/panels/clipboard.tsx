import { useEffect, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import { Copy, Pin } from 'lucide-react'
import { desktop, errorText, native } from '../native'
import { notice, usePreferences } from '../state'
import { PanelHeading } from '../ui'

type Entry = { id: number; text: string; pinned: boolean }

export default function Clipboard() {
  const enabled = usePreferences(state => state.captureClipboard)
  const [items, setItems] = useState<Entry[]>([])
  const [query, setQuery] = useState('')
  useEffect(() => {
    if (!desktop) return
    let active = true
    const refresh = () => void native<Entry[]>('clipboard_history').then(history => { if (active) setItems(history) }).catch(error => notice(errorText(error)))
    const listener = listen('island-clipboard', refresh)
    refresh()
    return () => { active = false; void listener.then(unlisten => unlisten()) }
  }, [])

  return <>
    <PanelHeading title="Clipboard">
      <div className="row">
        <label className="row">Capture<input type="checkbox" checked={enabled} onChange={event => usePreferences.setState({ captureClipboard: event.target.checked })} /></label>
        {items.length > 0 && <button className="control" onClick={() => void native('clipboard_clear').catch(error => notice(errorText(error)))}>Clear unpinned</button>}
      </div>
    </PanelHeading>
    {items.length > 0 && <input aria-label="Search clipboard" placeholder="Search clipboard" value={query} onChange={event => setQuery(event.target.value)} />}
    {items.length === 0 && <p className="empty">{enabled ? 'Copied text will appear here.' : 'Turn on capture to keep a local, encrypted text history.'}</p>}
    {items.filter(item => item.text.toLowerCase().includes(query.toLowerCase())).sort((a, b) => Number(b.pinned) - Number(a.pinned)).map(item =>
      <div key={item.id} className="list-item">
        <button className="row" title="Copy to clipboard" onClick={() => void native('clipboard_copy', { id: item.id }).then(() => notice('Copied to clipboard')).catch(error => notice(errorText(error)))}>
          <Copy size={13} className="shrink-0" /><span className="tile-text">{item.text}</span>
        </button>
        <button className="icon-button" aria-label={item.pinned ? 'Unpin' : 'Pin'} aria-pressed={item.pinned} onClick={() => void native('clipboard_pin', { id: item.id }).catch(error => notice(errorText(error)))}><Pin size={14} fill={item.pinned ? 'currentColor' : 'none'} /></button>
      </div>,
    )}
  </>
}
