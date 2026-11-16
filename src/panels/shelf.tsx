import { open } from '@tauri-apps/plugin-dialog'
import { Archive, File, FileAudio, FileImage, FileVideo, Plus, X } from 'lucide-react'
import { GlassButton, GlassTile } from '../glass'
import { desktop, errorText, native } from '../native'
import { notice, usePreferences } from '../state'
import { mergeShelf, PanelHeading, saveShelf } from '../ui'

function iconFor(file: string) {
  if (/\.(png|jpg|jpeg|webp|gif|svg)$/i.test(file)) return FileImage
  if (/\.(mp4|webm|mov|mkv)$/i.test(file)) return FileVideo
  if (/\.(mp3|wav|ogg|flac)$/i.test(file)) return FileAudio
  if (/\.(zip|rar|7z|tar)$/i.test(file)) return Archive
  return File
}

export default function Shelf() {
  const shelf = usePreferences(state => state.shelf)

  async function choose() {
    try {
      if (!desktop) throw new Error('File selection requires the Windows desktop app.')
      const files = await open({ multiple: true, directory: false })
      if (files) saveShelf(mergeShelf(usePreferences.getState().shelf, files))
    } catch (error) { notice(errorText(error)) }
  }

  return <>
    <PanelHeading title={`Shelf · ${shelf.length} ${shelf.length === 1 ? 'file' : 'files'}`}>
      <div className="row">
        {shelf.length > 0 && <GlassButton onClick={() => saveShelf([])}>Clear shelf</GlassButton>}
        <GlassButton variant="primary" onClick={() => void choose()}><Plus size={15} /> Add files</GlassButton>
      </div>
    </PanelHeading>
    {shelf.length === 0 ? <p className="empty">drop files onto the island for quick access.</p> : <div className="file-list">
      {shelf.map(path => {
        const name = path.split(/[\\/]/).pop() || path
        const Icon = iconFor(name)
        return <div key={path} className="file-card">
          <GlassTile title={path} onClick={() => void native('open_file', { path }).catch(error => notice(errorText(error)))}>
            <Icon size={31} strokeWidth={1.5} /><span className="tile-text">{name}</span>
          </GlassTile>
          <GlassButton variant="icon" aria-label={`Remove ${name} from shelf`} onClick={() => saveShelf(usePreferences.getState().shelf.filter(file => file !== path))}><X size={13} /></GlassButton>
        </div>
      })}
    </div>}
  </>
}
