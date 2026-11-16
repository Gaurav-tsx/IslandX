(() => {
  if (window.top !== window || location.origin !== 'https://music.youtube.com') return

  const resultRows = 'ytmusic-responsive-list-item-renderer, ytmusic-two-row-item-renderer'
  const resultLinks = '.title-column a[href], .title a[href], a[href]:not(.yt-formatted-string)'
  const playlistKey = 'islandx-playlist'
  const identifier = /^[A-Za-z0-9_-]+$/
  const skipButton = '.ytp-ad-skip-button-modern, .ytp-ad-skip-button, .ytp-skip-ad-button'
  let previousResult
  let playlistTimer
  let observedPlayer

  function destination(link) {
    const url = new URL(link.href, location.origin)
    if (url.origin !== location.origin) return null
    const video = url.searchParams.get('v')
    const list = url.searchParams.get('list')
    if (url.pathname === '/watch' && video?.length === 11 && identifier.test(video)) {
      const params = new URLSearchParams({ v: video })
      if (list && list.length <= 140 && identifier.test(list)) params.set('list', list)
      return '/watch?' + params
    }
    if (url.pathname === '/playlist' && list && list.length <= 140 && identifier.test(list)) {
      return '/playlist?' + new URLSearchParams({ list })
    }
    return null
  }

  function searchPage() {
    return document.querySelector('ytmusic-search-page')
  }

  function resultText(page) {
    return Array.from(page?.querySelectorAll(resultRows) ?? []).slice(0, 8)
      .map(row => row.textContent.trim().slice(0, 200)).join('\n')
  }

  function results(query) {
    const url = new URL(location.href)
    if (url.pathname !== '/search' || url.searchParams.get('q') !== query) return null
    const page = searchPage()
    if (!page) return null
    if (previousResult && page.data === previousResult.data &&
        resultText(page) === previousResult.text && performance.now() < previousResult.until) return null
    const items = new Map()
    let songs = 0
    let playlists = 0
    for (const row of page.querySelectorAll(resultRows)) {
      for (const link of row.querySelectorAll(resultLinks)) {
        const path = destination(link)
        const title = row.querySelector('.title-column, .title')?.textContent.trim() ||
          link.textContent.trim() || link.getAttribute('title')?.trim()
        if (!path || !title || items.has(path)) continue
        const kind = path.startsWith('/playlist?') ? 'playlist' : 'song'
        if (kind === 'playlist' ? playlists >= 12 : songs >= 16) continue
        const detail = row.querySelector('.secondary-flex-columns, .subtitle')?.textContent.trim() ?? ''
        items.set(path, { path, title: title.slice(0, 220), detail: detail.replace(/\s+/g, ' ').slice(0, 220), kind })
        if (kind === 'playlist') playlists++
        else songs++
        break
      }
    }
    if (items.size || page.querySelector('ytmusic-message-renderer, ytmusic-background-promo-renderer')) {
      return [...items.values()]
    }
    return null
  }

  function search(query) {
    const current = new URL(location.href)
    if (current.pathname === '/search' && current.searchParams.get('q') === query) {
      previousResult = undefined
      return true
    }
    const box = document.querySelector('ytmusic-search-box')
    const input = box?.querySelector('input')
    if (!input || typeof box.navigateToQueryResults !== 'function') return false
    const page = searchPage()
    previousResult = { data: page?.data, text: resultText(page), until: performance.now() + 4500 }
    input.value = query
    box.navigateToQueryResults()
    return true
  }

  function startPlaylist() {
    clearInterval(playlistTimer)
    const path = sessionStorage.getItem(playlistKey)
    if (!path) return
    const expiry = performance.now() + 14000
    playlistTimer = setInterval(() => {
      if (sessionStorage.getItem(playlistKey) !== path || performance.now() > expiry) {
        clearInterval(playlistTimer)
        sessionStorage.removeItem(playlistKey)
        return
      }
      const current = new URL(location.href)
      const list = current.searchParams.get('list')
      if (current.pathname !== '/playlist' || list !== new URL(path, location.origin).searchParams.get('list')) return
      const page = document.querySelector('ytmusic-playlist-shelf-renderer')
      const first = Array.from(page?.querySelectorAll(resultLinks) ?? [])
        .find(link => destination(link)?.startsWith('/watch?'))
      if (!first || !list || !identifier.test(list)) return
      clearInterval(playlistTimer)
      sessionStorage.removeItem(playlistKey)
      const target = new URL(destination(first), location.origin)
      if (target.searchParams.get('list') === list) first.click()
      else {
        target.searchParams.set('list', list)
        location.assign(target)
      }
    }, 350)
  }

  function play(path) {
    const match = Array.from(searchPage()?.querySelectorAll(resultLinks) ?? [])
      .find(link => destination(link) === path)
    if (path.startsWith('/playlist?')) sessionStorage.setItem(playlistKey, path)
    else sessionStorage.removeItem(playlistKey)
    startPlaylist()
    if (match) match.click()
    else location.assign(path)
    return true
  }

  function status() {
    const bar = document.querySelector('ytmusic-player-bar')
    const metadata = navigator.mediaSession?.metadata
    const video = document.querySelector('#movie_player video, video.html5-main-video')
    const title = metadata?.title || bar?.querySelector('.title')?.textContent.trim()
    const artist = metadata?.artist || bar?.querySelector('.byline')?.textContent.trim()
    const art = metadata?.artwork?.at(-1)?.src ?? null
    const ad = Boolean(video?.closest('#movie_player.ad-showing, #movie_player.ad-interrupting'))
    const song = video && title && !ad ? {
      title: title.slice(0, 220),
      artist: artist?.slice(0, 220) ?? '',
      art,
      playing: !video.paused && !video.ended,
      position: Number.isFinite(video.currentTime) ? video.currentTime : 0,
      duration: Number.isFinite(video.duration) ? video.duration : 0,
    } : null
    return { ready: Boolean(document.querySelector('ytmusic-search-box input')), song, ad }
  }

  function action(request) {
    const player = document.querySelector('#movie_player')
    const video = player?.querySelector('video')
    if (!video) return false
    switch (request.type) {
      case 'toggle':
        if (video.paused) player.playVideo?.()
        else player.pauseVideo?.()
        return true
      case 'next':
        player.nextVideo?.()
        return true
      case 'previous':
        player.previousVideo?.()
        return true
      case 'seek':
        if (Number.isFinite(video.duration)) player.seekTo?.(Math.min(request.seconds, video.duration), true)
        return true
      default:
        return false
    }
  }

  Object.defineProperty(window, 'islandXMusic', { value: request => {
    switch (request.type) {
      case 'status': return status()
      case 'search': return search(request.query)
      case 'results': return results(request.query)
      case 'play': return play(request.path)
      default: return action(request)
    }
  } })

  function skipAd() {
    if (!observedPlayer?.matches('.ad-showing, .ad-interrupting')) return
    const button = observedPlayer.querySelector(skipButton)
    if (button?.getClientRects().length && !button.matches(':disabled, [aria-disabled="true"]')) button.click()
  }

  const adObserver = new MutationObserver(skipAd)
  document.addEventListener('play', event => {
    const player = event.target.closest?.('#movie_player')
    if (!player || player === observedPlayer) return
    observedPlayer = player
    adObserver.disconnect()
    adObserver.observe(player, { attributes: true, attributeFilter: ['class', 'disabled', 'aria-disabled'], childList: true, subtree: true })
    skipAd()
  }, true)
  startPlaylist()
})()
