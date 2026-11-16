import { useEffect, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import { AudioLines, Pause, Play, SkipBack, SkipForward, Volume2 } from 'lucide-react'
import { desktop, errorText, native } from '../native'
import { GlassButton, GlassCard } from '../glass'
import { notice } from '../state'
import { VolumeSlider } from '../volume'
import { useYouTubePlayer, youtubeAction, type PlaybackAction, type Song } from '../youtube-music'
import { MusicSearch } from './music-search'

const timestamp = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`

function applyAlbumColor(image: HTMLImageElement) {
  const surface = image.closest<HTMLElement>('.music')
  surface?.style.removeProperty('--album-color')
  if (!image.src.startsWith('data:')) return
  const canvas = document.createElement('canvas')
  canvas.width = 10
  canvas.height = 10
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return
  ctx.drawImage(image, 0, 0, 10, 10)
  const { data } = ctx.getImageData(0, 0, 10, 10)
  const sum = [0, 0, 0]
  let weight = 0
  for (let pixel = 0; pixel < data.length; pixel += 4) {
    const color = Array.from(data.subarray(pixel, pixel + 3))
    const saturation = (Math.max(...color) - Math.min(...color)) / 255
    const amount = saturation * data[pixel + 3] / 255
    for (let channel = 0; channel < 3; channel++) sum[channel] += color[channel] * amount
    weight += amount
  }
  if (weight > 0.5) surface?.style.setProperty('--album-color', `rgb(${sum.map(channel => Math.round(channel / weight)).join(' ')} / .14)`)
}

export default function Music() {
  const player = useYouTubePlayer()
  const [windowsSong, setWindowsSong] = useState<Song | null>(null)
  const song = player.ad ? null : player.song ?? windowsSong
  const [position, setPosition] = useState(0)
  const [volume, setVolume] = useState<number>()
  const [message, setMessage] = useState(desktop ? '' : 'YouTube Music is available in the Windows app.')
  useEffect(() => {
    if (!desktop) return
    let active = true
    void native<{ volume: number }>('read_audio').then(audio => { if (active) setVolume(audio.volume) }).catch(() => {})
    const subscription = listen<Song | null>('island-media', ({ payload }) => {
      setWindowsSong(payload)
    })
    void subscription.then(() => {
      if (active) return native('start_media')
    }).catch(error => setMessage(errorText(error)))
    return () => {
      active = false
      void subscription.then(remove => { remove(); return native('stop_media') })
    }
  }, [])

  useEffect(() => {
    setPosition(song?.position ?? 0)
    if (!song?.playing || !song.duration) return
    const started = performance.now()
    const timer = window.setInterval(() => setPosition(Math.min(song.duration, song.position + (performance.now() - started) / 1000)), 500)
    return () => window.clearInterval(timer)
  }, [song])

  function act(action: PlaybackAction, seconds?: number) {
    const result = player.song ? youtubeAction(action, seconds) : native('media_action', { action, seconds })
    void result.catch(error => notice(errorText(error)))
  }

  return <GlassCard className="music" blur="standard">
    <div className="music-main">
      <div className="album">{song?.art ? <img src={song.art} alt="" onLoad={event => applyAlbumColor(event.currentTarget)} /> : <AudioLines size={46} strokeWidth={1.4} />}</div>
      <div className="track">
        <span className="track-label">NOW PLAYING</span>
        <h1 title={song?.title}>{song?.title || 'YouTube Music'}</h1>
        <p title={song?.artist}>{song ? song.artist || (player.song ? 'YouTube Music' : 'Windows media session')
          : player.ad ? 'Waiting for the track…' : message || (player.ready ? 'Search for a song or playlist.' : 'Loading YouTube Music…')}</p>
      </div>
      <div className="media-controls">
        <GlassButton variant="icon" disabled={!song} aria-label="Previous track" onClick={() => act('previous')}><SkipBack size={17} fill="currentColor" /></GlassButton>
        <GlassButton variant="primary" className="icon-button play" disabled={!song} aria-label={song?.playing ? 'Pause' : 'Play'} onClick={() => act('toggle')}>
          {song?.playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
        </GlassButton>
        <GlassButton variant="icon" disabled={!song} aria-label="Next track" onClick={() => act('next')}><SkipForward size={17} fill="currentColor" /></GlassButton>
      </div>
    </div>
    <input className="timeline" type="range" min={0} max={song?.duration || 1} value={position} disabled={!song?.duration} aria-label="Playback position" onChange={event => {
      const seconds = Number(event.target.value)
      setPosition(seconds)
      act('seek', seconds)
    }} />
    <div className="music-footer">
      <label className="row"><Volume2 size={14} /><VolumeSlider value={volume} onVolume={setVolume} /></label>
      <span>{timestamp(position)} / {timestamp(song?.duration ?? 0)}</span>
    </div>
    <MusicSearch />
  </GlassCard>
}
