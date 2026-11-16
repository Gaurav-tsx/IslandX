import { open } from '@tauri-apps/plugin-dialog'
import { Archive, File, FileAudio, FileImage, FileVideo, Plus, X } from 'lucide-react'
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
        {shelf.length > 0 && <button className="control" onClick={() => saveShelf([])}>Clear shelf</button>}
        <button className="control primary" onClick={() => void choose()}><Plus size={15} /> Add files</button>
      </div>
    </PanelHeading>
    {shelf.length === 0 ? <p className="empty">Drop files onto the island for quick access.</p> : <div className="file-list">
      {shelf.map(path => {
        const name = path.split(/[\\/]/).pop() || path
        const Icon = iconFor(name)
        return <div key={path} className="file-card">
          <button className="tile" title={path} onClick={() => void native('open_file', { path }).catch(error => notice(errorText(error)))}>
            <Icon size={31} strokeWidth={1.5} /><span className="tile-text">{name}</span>
          </button>
          <button className="icon-button" aria-label={`Remove ${name} from shelf`} onClick={() => saveShelf(usePreferences.getState().shelf.filter(file => file !== path))}><X size={13} /></button>
        </div>
      })}
    </div>}
  </>
}
