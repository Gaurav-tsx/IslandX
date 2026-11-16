import { useEffect, useState } from 'react'
import { errorText, native } from '../native'
import { notice } from '../state'
import { VolumeSlider } from '../volume'

type Audio = { volume: number; micMuted: boolean | null }
export function AudioControls() {
  const [audio, setAudio] = useState<Audio>()
  const [error, setError] = useState('')
  useEffect(() => { void native<Audio>('read_audio').then(setAudio).catch(reason => setError(errorText(reason))) }, [])
  if (!audio) return <p className="subtle">{error || 'reading audio devices…'}</p>
  return <>
    <label className="setting">Output volume <span className="row">
      <VolumeSlider value={audio.volume} onVolume={volume => setAudio(current => current && { ...current, volume })} />
      <small>{audio.volume}%</small>
    </span></label>
    {audio.micMuted !== null && <label className="setting">Mute microphone<input type="checkbox" checked={audio.micMuted} onChange={event => {
      const micMuted = event.target.checked
      void native('change_audio', { micMuted }).then(() => setAudio(current => current && { ...current, micMuted })).catch(reason => notice(errorText(reason)))
    }} /></label>}
  </>
}
