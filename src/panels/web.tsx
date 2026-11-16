import { useState } from 'react'
import { Globe2, Plus, X } from 'lucide-react'
import { GlassButton, GlassTile } from '../glass'
import { usePreferences } from '../state'
import { launchSite, PanelHeading, SiteForm } from '../ui'

export default function Browser() {
  const sites = usePreferences(state => state.sites)
  const [adding, setAdding] = useState(false)

  return <>
    <PanelHeading title="Browser" />
    <div className="tile-grid">
      {sites.map(site => <div key={site.url} className="tile-wrap">
        <GlassTile onClick={() => launchSite(site.url, true)}>
          <Globe2 size={19} /><span className="tile-text">{site.name}<small>{new URL(site.url).hostname}</small></span>
        </GlassTile>
        <GlassButton variant="icon" className="remove" aria-label={`Remove ${site.name}`} onClick={() => usePreferences.setState(state => ({ sites: state.sites.filter(entry => entry.url !== site.url) }))}><X size={13} /></GlassButton>
      </div>)}
      <GlassTile className="dashed" disabled={sites.length >= 24} onClick={() => setAdding(true)}><Plus size={16} /> Add a site</GlassTile>
    </div>
    {adding && <SiteForm onSave={site => {
      usePreferences.setState(state => ({ sites: [...state.sites.filter(entry => entry.url !== site.url), site] }))
      setAdding(false)
    }} onClose={() => setAdding(false)} />}
  </>
}
