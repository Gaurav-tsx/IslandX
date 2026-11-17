import { useState } from 'react'
import { Globe2, Plus, X } from 'lucide-react'
import { GlassButton, GlassTile } from '../glass'
import { desktop, errorText, native } from '../native'
import { notice, usePreferences } from '../state'
import { launchSite, PanelHeading, SiteForm } from '../ui'

export default function Browser() {
  const sites = usePreferences(state => state.sites)
  const browserId = usePreferences(state => state.browserId)
  const [adding, setAdding] = useState(false)
  const [choosing, setChoosing] = useState(false)
  const [browsers, setBrowsers] = useState<{ id: string; name: string }[]>([])

  function chooseBrowser() {
    setChoosing(!choosing)
    if (!choosing) void native<typeof browsers>('installed_browsers').then(setBrowsers).catch(error => notice(errorText(error)))
  }

  return <>
    <PanelHeading title="Browser">
      <GlassButton variant="icon" aria-expanded={choosing} aria-label="Choose browser" title="Choose browser"
        disabled={!desktop} onClick={chooseBrowser}><Plus size={18} /></GlassButton>
    </PanelHeading>
    {choosing && <label className="setting browser-picker">Open sites with
      <select value={browserId ?? ''} onChange={event => usePreferences.setState({ browserId: event.target.value || null })}>
        <option value="">IslandX Browser (Default)</option>
        <option value="system">Windows Default Browser</option>
        {browsers.map(browser => <option key={browser.id} value={browser.id}>{browser.name}</option>)}
        {browserId && browserId !== 'system' && !browsers.some(browser => browser.id === browserId) &&
          <option value={browserId} disabled>Selected Browser Unavailable</option>}
      </select>
    </label>}
    <div className="tile-grid">
      {sites.map(site => <div key={site.url} className="tile-wrap">
        <GlassTile onClick={() => launchSite(site.url, true, browserId)}>
          <Globe2 size={19} /><span className="tile-text">{site.name}<small>{new URL(site.url).hostname}</small></span>
        </GlassTile>
        <GlassButton variant="icon" className="remove" aria-label={`Remove ${site.name}`} onClick={() => usePreferences.setState(state => ({ sites: state.sites.filter(entry => entry.url !== site.url) }))}><X size={13} /></GlassButton>
      </div>)}
      <GlassTile className="dashed" disabled={sites.length >= 24} onClick={() => setAdding(true)}><Plus size={16} /> Add a Site</GlassTile>
    </div>
    {adding && <SiteForm onSave={site => {
      usePreferences.setState(state => ({ sites: [...state.sites.filter(entry => entry.url !== site.url), site] }))
      setAdding(false)
    }} onClose={() => setAdding(false)} />}
  </>
}
