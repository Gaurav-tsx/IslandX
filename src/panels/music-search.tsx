import { useState } from 'react'
import { ListMusic, Music2, Search } from 'lucide-react'
import { GlassButton } from '../glass'
import { desktop } from '../native'
import { playMusic, searchMusic, useMusicSearch } from '../youtube-music'

export function MusicSearch() {
  const { query, results, pending, error, selected } = useMusicSearch()
  const [input, setInput] = useState(query)
  const [kind, setKind] = useState<'song' | 'playlist'>('song')
  const tracks = results.filter(result => result.kind === kind)

  return <div className="music-search">
    <form className="music-search-form" role="search" aria-label="YouTube Music" onSubmit={event => {
      event.preventDefault()
      const term = input.trim()
      if (term) void searchMusic(term)
    }}>
      <input type="search" aria-label="Search YouTube Music" placeholder="Search YouTube Music"
        value={input} onChange={event => setInput(event.target.value)} maxLength={120} disabled={!desktop} required />
      <GlassButton variant="icon" type="submit" aria-label="Search" disabled={!desktop || !input.trim()}><Search size={17} /></GlassButton>
    </form>
    {pending && <p className="subtle music-search-message" role="status">Searching…</p>}
    {error && <p className="subtle music-search-message" role="status">{error}</p>}
    {!pending && query && !error && !results.length && <p className="subtle music-search-message">No songs or playlists found.</p>}
    {!!results.length && <>
      <div className="music-results-tabs" aria-label="Result type" role="group">
        <GlassButton aria-pressed={kind === 'song'} onClick={() => setKind('song')}>Songs</GlassButton>
        <GlassButton aria-pressed={kind === 'playlist'} onClick={() => setKind('playlist')}>Playlists</GlassButton>
      </div>
      <div className="music-results" aria-label={kind === 'song' ? 'Songs' : 'Playlists'} tabIndex={0}>
        {!tracks.length && <p className="subtle music-search-message">{kind === 'song' ? 'No songs found.' : 'No playlists found.'}</p>}
        {tracks.map(track => <GlassButton variant="bare" className="music-result" key={track.path}
          aria-label={`Play ${track.title}`} aria-current={selected === track.path ? 'true' : undefined}
          onClick={() => void playMusic(track.path)}>
          {track.kind === 'playlist' ? <ListMusic size={17} /> : <Music2 size={17} />}
          <span className="tile-text">{track.title}{track.detail && <small>{track.detail}</small>}</span>
        </GlassButton>)}
      </div>
    </>}
  </div>
}
