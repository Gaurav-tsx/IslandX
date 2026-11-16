import { useEffect, useState } from 'react'
import { errorText, native } from '../native'
import { notice } from '../state'

type Audio = { volume: number; micMuted: boolean | null }
export function AudioControls() {
  const [audio, setAudio] = useState<Audio>()
  const [error, setError] = useState('')
  useEffect(() => { void native<Audio>('read_audio').then(setAudio).catch(reason => setError(errorText(reason))) }, [])
  if (!audio) return <p className="subtle">{error || 'Reading audio devices…'}</p>
  return <>
    <label className="setting">Output volume <span className="row">
      <input type="range" min={0} max={100} value={audio.volume} onChange={event => {
        const volume = Number(event.target.value)
        setAudio({ ...audio, volume })
      }} onPointerUp={() => void native('change_audio', { volume: audio.volume }).catch(reason => notice(errorText(reason)))} onKeyUp={() => void native('change_audio', { volume: audio.volume }).catch(reason => notice(errorText(reason)))} />
      <small>{audio.volume}%</small>
    </span></label>
    {audio.micMuted !== null && <label className="setting">Mute microphone<input type="checkbox" checked={audio.micMuted} onChange={event => {
      const micMuted = event.target.checked
      void native('change_audio', { micMuted }).then(() => setAudio({ ...audio, micMuted })).catch(reason => notice(errorText(reason)))
    }} /></label>}
  </>
}
