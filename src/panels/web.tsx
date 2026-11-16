import { useState } from 'react'
import { Globe2, Plus, X } from 'lucide-react'
import { usePreferences } from '../state'
import { launchSite, PanelHeading, SiteForm } from '../ui'

export default function Browser() {
  const sites = usePreferences(state => state.sites)
  const [adding, setAdding] = useState(false)

  return <>
    <PanelHeading title="Browser" />
    <div className="tile-grid">
      {sites.map(site => <div key={site.url} className="tile-wrap">
        <button className="tile" onClick={() => launchSite(site.url, true)}>
          <Globe2 size={19} /><span className="tile-text">{site.name}<small>{new URL(site.url).hostname}</small></span>
        </button>
        <button className="icon-button remove" aria-label={`Remove ${site.name}`} onClick={() => usePreferences.setState(state => ({ sites: state.sites.filter(entry => entry.url !== site.url) }))}><X size={13} /></button>
      </div>)}
      <button className="tile dashed" disabled={sites.length >= 24} onClick={() => setAdding(true)}><Plus size={16} /> Add a site</button>
    </div>
    {adding && <SiteForm onSave={site => {
      usePreferences.setState(state => ({ sites: [...state.sites.filter(entry => entry.url !== site.url), site] }))
      setAdding(false)
    }} onClose={() => setAdding(false)} />}
  </>
}
