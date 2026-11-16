import { useEffect, useState } from 'react'
import { disable, enable, isEnabled } from '@tauri-apps/plugin-autostart'
import { ArrowDownToLine, RotateCcw } from 'lucide-react'
import { GlassButton, GlassCard } from '../glass'
import { desktop, errorText, native } from '../native'
import { notice, setView, usePreferences } from '../state'
import { checkUpdate, downloadUpdate, restartForUpdate, useUpdate } from '../updates'
import { PanelHeading } from '../ui'

type Monitor = { index: number; name: string }

function Updates() {
  const update = useUpdate()
  const automatic = usePreferences(prefs => prefs.autoUpdate)
  const scheduled = usePreferences(prefs => prefs.nextLaunchUpdate)
  const active = update.phase === 'checking' || update.phase === 'downloading' || update.phase === 'installing'
  return <GlassCard as="section" className="settings-section" blur="high">
    <h2>Updates {update.current && <small>· v{update.current}</small>}</h2>
    <label className="setting">Check and download automatically<input type="checkbox" checked={automatic} disabled={update.phase === 'disabled'} onChange={event => usePreferences.setState({ autoUpdate: event.target.checked })} /></label>
    {update.phase === 'disabled' && <p className="subtle">Automatic updates are available in signed release builds.</p>}
    {update.phase === 'current' && <p className="subtle">You’re on the latest version.</p>}
    {update.next && <p>IslandX {update.next}</p>}
    {update.notes && <p className="subtle update-notes">{update.notes}</p>}
    {update.phase === 'downloading' && <><p>Downloading signed update…</p><progress max={1} value={update.progress} /></>}
    {update.phase === 'ready' && <p className="subtle">{scheduled === update.next ? 'Scheduled to install the next time IslandX opens.' : 'The verified installer is ready.'}</p>}
    {update.error && <p className="danger" role="alert">{update.error}</p>}
    <div className="row">
      {!['disabled', 'ready', 'installing', 'downloading'].includes(update.phase) && <GlassButton disabled={active} onClick={() => void checkUpdate()}>{update.phase === 'checking' ? 'Checking…' : 'Check for updates'}</GlassButton>}
      {update.phase === 'available' && <GlassButton variant="primary" onClick={() => void downloadUpdate()}><ArrowDownToLine size={14} /> Download</GlassButton>}
      {update.phase === 'ready' && <>
        <GlassButton variant="primary" onClick={() => void restartForUpdate()}><RotateCcw size={14} /> Update and restart</GlassButton>
        <GlassButton onClick={() => {
          const version = scheduled ? null : update.next ?? null
          usePreferences.setState({ nextLaunchUpdate: version })
          if (version) setView('compact')
        }}>{scheduled ? 'Cancel scheduled restart' : 'Install on next launch'}</GlassButton>
      </>}
      {update.phase === 'installing' && <p>Launching the installer…</p>}
    </div>
  </GlassCard>
}

export default function Settings() {
  const prefs = usePreferences()
  const adjustable = prefs.surface === 'glass' && prefs.glassQuality !== 'low'
  const [displays, setDisplays] = useState<Monitor[]>([])
  const [autostart, setAutostart] = useState(false)
  const [uninstall, setUninstall] = useState(false)
  const [removeData, setRemoveData] = useState(false)
  const [removeHistory, setRemoveHistory] = useState(false)

  useEffect(() => {
    if (!desktop) return
    void native<Monitor[]>('monitors').then(setDisplays).catch(() => {})
    void isEnabled().then(setAutostart).catch(() => {})
  }, [])

  function toggleStartup() {
    void (autostart ? disable() : enable()).then(() => setAutostart(!autostart)).catch(error => notice(errorText(error)))
  }

  return <>
    <PanelHeading title="Settings"><small>Ctrl + Shift + Space</small></PanelHeading>
    <div className="settings-list">
      <label className="setting">Surface<select value={prefs.surface} onChange={event => usePreferences.setState({ surface: event.target.value as typeof prefs.surface })}>
        <option value="glass">Liquid glass</option><option value="black">Black</option>
      </select></label>
      <label className="setting">Glass quality<select value={prefs.glassQuality} disabled={prefs.surface === 'black'} aria-describedby="glass-quality-hint"
        onChange={event => usePreferences.setState({ glassQuality: event.target.value as typeof prefs.glassQuality })}>
        <option value="high">High</option><option value="balanced">Balanced</option><option value="low">Low</option>
      </select></label>
      <small className="settings-hint" id="glass-quality-hint">High adds blur to nested cards. Low uses a solid surface.</small>
      <label className="setting">Blur strength<span className="settings-glass-control">
        <input type="range" min={0} max={24} step={1} value={prefs.glassBlur} disabled={!adjustable} aria-describedby="glass-blur-hint"
          aria-valuetext={prefs.glassBlur === 0 ? 'Off' : `${prefs.glassBlur} pixels`}
          onChange={event => usePreferences.setState({ glassBlur: event.target.valueAsNumber })} />
        <output aria-hidden="true">{prefs.glassBlur ? `${prefs.glassBlur} px` : 'Off'}</output>
      </span></label>
      <small className="settings-hint" id="glass-blur-hint">Adjusts card blur. At zero, Windows Acrylic also turns off.</small>
      <label className="setting">Gloss intensity<span className="settings-glass-control">
        <input type="range" min={0} max={100} step={5} value={prefs.glassGloss} disabled={!adjustable}
          aria-valuetext={`${prefs.glassGloss}%`} onChange={event => usePreferences.setState({ glassGloss: event.target.valueAsNumber })} />
        <output aria-hidden="true">{prefs.glassGloss}%</output>
      </span></label>
      <small className="glass-reduced-hint">The system’s transparency preference is active.</small>
      <label className="setting">Display<select value={prefs.monitor} onChange={event => usePreferences.setState({ monitor: Number(event.target.value) })}>
        <option value={-1}>Primary display</option>{displays.map(display => <option value={display.index} key={display.index}>{display.name}</option>)}
      </select></label>
      <label className="setting">Expand on hover<input type="checkbox" checked={prefs.hover} onChange={event => usePreferences.setState({ hover: event.target.checked })} /></label>
      {prefs.hover && <label className="setting">Auto-collapse delay<select value={prefs.delay} onChange={event => usePreferences.setState({ delay: Number(event.target.value) })}>
        <option value={400}>0.4 seconds</option><option value={900}>0.9 seconds</option><option value={2000}>2 seconds</option>
      </select></label>}
      <label className="setting">Start with Windows<input type="checkbox" checked={autostart} disabled={!desktop} onChange={toggleStartup} /></label>
      <label className="setting">Keep encrypted text clipboard history<input type="checkbox" checked={prefs.captureClipboard} onChange={event => usePreferences.setState({ captureClipboard: event.target.checked })} /></label>
    </div>
    <Updates />
    <GlassCard as="section" className="settings-section" blur="high"><h2>About IslandX</h2>
      <p className="subtle">Windows desktop overlay · No telemetry</p>
      {!uninstall ? <GlassButton className="danger" disabled={!desktop} onClick={() => setUninstall(true)}>Uninstall IslandX</GlassButton> : <div role="dialog" aria-label="Confirm uninstall">
        <label className="setting">Remove all settings and data<input type="checkbox" checked={removeData} onChange={event => setRemoveData(event.target.checked)} /></label>
        <label className="setting">Remove clipboard and shelf history<input type="checkbox" checked={removeHistory || removeData} disabled={removeData} onChange={event => setRemoveHistory(event.target.checked)} /></label>
        <div className="row">
          <GlassButton onClick={() => setUninstall(false)}>Cancel</GlassButton>
          <GlassButton className="danger" onClick={() => void native('uninstall', { removeData, removeHistory }).catch(error => notice(errorText(error)))}>Open uninstaller</GlassButton>
        </div>
      </div>}
    </GlassCard>
  </>
}
