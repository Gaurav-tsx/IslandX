import { useState } from 'react'
import { History, ListMusic, Music2, Search } from 'lucide-react'
import { GlassButton } from '../glass'
import { desktop } from '../native'
import { playMusic, searchMusic, useMusicHistory, useMusicSearch, type MusicItem } from '../youtube-music'

export function MusicSearch() {
  const { query, results, pending, error, selected } = useMusicSearch()
  const [input, setInput] = useState(query)
  const [kind, setKind] = useState<'song' | 'playlist'>('song')
  const [historyOpen, setHistoryOpen] = useState(false)
  const { songs, playlists } = useMusicHistory()
  const tracks = results.filter(result => result.kind === kind)

  function itemButton(track: MusicItem, queue?: string[]) {
    return <GlassButton variant="bare" className="music-result" key={track.path}
      aria-label={`Play ${track.title}`} aria-current={selected === track.path ? 'true' : undefined}
      onClick={() => void playMusic(track, queue)}>
      {track.kind === 'playlist' ? <ListMusic size={17} /> : <Music2 size={17} />}
      <span className="tile-text">{track.title}{track.detail && <small>{track.detail}</small>}</span>
    </GlassButton>
  }

  return <div className="music-search">
    <form className="music-search-form" role="search" aria-label="YouTube Music" onSubmit={event => {
      event.preventDefault()
      const term = input.trim()
      if (term) {
        setHistoryOpen(false)
        void searchMusic(term)
      }
    }}>
      <input type="search" aria-label="Search YouTube Music" placeholder="Search YouTube Music"
        value={input} onChange={event => setInput(event.target.value)} maxLength={120} disabled={!desktop} required />
      <GlassButton variant="icon" type="submit" aria-label="Search" disabled={!desktop || !input.trim()}><Search size={17} /></GlassButton>
      <GlassButton variant="icon" aria-label="Music history" title="Music history" aria-expanded={historyOpen}
        aria-controls="music-history" onClick={() => setHistoryOpen(open => !open)}><History size={17} /></GlassButton>
    </form>
    {pending && <p className="subtle music-search-message" role="status">Searching…</p>}
    {error && <p className="subtle music-search-message" role="status">{error}</p>}
    {!pending && query && !error && !results.length && <p className="subtle music-search-message">No songs or playlists found.</p>}
    {historyOpen ? <section id="music-history" className="music-history" aria-label="Music history" tabIndex={0}>
      <div>
        <h2>Recent songs</h2>
        {songs.length ? songs.map(song => itemButton({ ...song, detail: song.artist, kind: 'song' }))
          : <p className="subtle music-search-message">No songs played yet.</p>}
      </div>
      <div>
        <h2>Recent playlists</h2>
        {playlists.length ? playlists.map(playlist => itemButton(playlist))
          : <p className="subtle music-search-message">No playlists played yet.</p>}
      </div>
    </section> : !!results.length && <>
      <div className="music-results-tabs" aria-label="Result type" role="group">
        <GlassButton aria-pressed={kind === 'song'} onClick={() => setKind('song')}>Songs</GlassButton>
        <GlassButton aria-pressed={kind === 'playlist'} onClick={() => setKind('playlist')}>Playlists</GlassButton>
      </div>
      <div className="music-results" aria-label={kind === 'song' ? 'Songs' : 'Playlists'} tabIndex={0}>
        {!tracks.length && <p className="subtle music-search-message">{kind === 'song' ? 'No songs found.' : 'No playlists found.'}</p>}
        {tracks.map((track, index) => itemButton(track, track.kind === 'song' ? tracks.slice(index + 1).map(item => item.path) : undefined))}
      </div>
    </>}
  </div>
}
