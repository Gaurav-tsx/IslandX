import { useState } from 'react'
import { Camera, Circle, Link2, Plus, Scissors, X } from 'lucide-react'
import { errorText, native } from '../native'
import { notice, usePreferences, type Site } from '../state'
import { launchSite, PanelHeading, SiteForm } from '../ui'

export default function Actions() {
  const actions = usePreferences(state => state.actions)
  const [slot, setSlot] = useState<number | null>(null)

  function save(index: number, site: Site | null) {
    usePreferences.setState(prefs => ({ actions: prefs.actions.map((action, i) => i === index ? site : action) }))
    setSlot(null)
  }

  async function capture(kind: string) {
    try { notice(await native<string>('capture', { kind })) } catch (error) { notice(errorText(error)) }
  }

  return <>
    <PanelHeading title="Quick Actions" />
    <div className="tile-grid">
      <button className="tile" onClick={() => void capture('screenshot')}><Camera size={17} /> Screenshot</button>
      <button className="tile" onClick={() => void capture('snip')}><Scissors size={17} /> Snip</button>
      <button className="tile record" onClick={() => void capture('record')}><Circle size={13} fill="#ff8496" style={{ color: '#ff8496' }} /> Record</button>
    </div>
    <p className="brief">Website shortcuts</p>
    <div className="tile-grid">{actions.map((action, index) => action ? <div className="tile-wrap" key={index}>
      <button className="tile" onClick={() => launchSite(action.url, false)}><Link2 size={16} /><span className="tile-text">{action.name}</span></button>
      <button className="icon-button remove" aria-label={`Remove ${action.name}`} onClick={() => save(index, null)}><X size={13} /></button>
    </div> : <button key={index} className="tile dashed" onClick={() => setSlot(index)}><Plus size={16} /> Add shortcut</button>)}</div>
    {slot !== null && <SiteForm onSave={site => save(slot, site)} onClose={() => setSlot(null)} />}
  </>
}
