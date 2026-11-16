(() => {
  if (window.top !== window || location.origin !== 'https://music.youtube.com') return

  const resultRows = 'ytmusic-responsive-list-item-renderer, ytmusic-two-row-item-renderer'
  const resultLinks = '.title-column a[href], .title a[href], a[href]:not(.yt-formatted-string)'
  const playlistKey = 'islandx-playlist'
  const queueKey = 'islandx-queue'
  const identifier = /^[A-Za-z0-9_-]+$/
  const skipButton = '.ytp-ad-skip-button-modern, .ytp-ad-skip-button, .ytp-skip-ad-button'
  let previousResult
  let playlistTimer
  let observedPlayer
  let advanceTimer
  let mutedAd
  let lastWatch

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

  function videoId(player) {
    const id = player?.getVideoData?.()?.video_id
    return id?.length === 11 && identifier.test(id) ? id : null
  }

  function adPlaying(player) {
    return Boolean(player?.matches('.ad-showing, .ad-interrupting'))
  }

  function getQueue() {
    try {
      const entries = JSON.parse(sessionStorage.getItem(queueKey))
      return Array.isArray(entries) ? entries.filter(path => typeof path === 'string' && path.startsWith('/watch?')) : []
    } catch {
      return []
    }
  }

  function setQueue(paths) {
    sessionStorage.setItem(queueKey, JSON.stringify([...new Set(paths)].slice(0, 48)))
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
      const tracks = Array.from(page?.querySelectorAll(resultLinks) ?? [])
        .filter(link => destination(link)?.startsWith('/watch?'))
      const [first] = tracks
      if (!first || !list || !identifier.test(list)) return
      clearInterval(playlistTimer)
      sessionStorage.removeItem(playlistKey)
      const target = new URL(destination(first), location.origin)
      const queue = tracks.map(link => {
        const url = new URL(destination(link), location.origin)
        url.searchParams.set('list', list)
        return url.pathname + url.search
      })
      setQueue(queue)
      if (target.searchParams.get('list') === list) first.click()
      else {
        target.searchParams.set('list', list)
        location.assign(target)
      }
    }, 350)
  }

  function play(path, queue) {
    clearTimeout(advanceTimer)
    setQueue(queue ?? [])
    const match = Array.from(searchPage()?.querySelectorAll(resultLinks) ?? [])
      .find(link => destination(link) === path)
    if (path.startsWith('/playlist?')) sessionStorage.setItem(playlistKey, path)
    else sessionStorage.removeItem(playlistKey)
    startPlaylist()
    const target = new URL(path, location.origin)
    if (target.pathname === '/watch' && !target.searchParams.has('list') && !queue?.length) {
      target.searchParams.set('list', 'RDAMVM' + target.searchParams.get('v'))
      location.assign(target)
    } else if (match) match.click()
    else location.assign(target)
    return true
  }

  function status() {
    const bar = document.querySelector('ytmusic-player-bar')
    const metadata = navigator.mediaSession?.metadata
    const player = document.querySelector('#movie_player')
    const video = player?.querySelector('video')
    const id = videoId(player)
    const playback = player?.getVideoData?.()
    const title = playback?.title || metadata?.title || bar?.querySelector('.title')?.textContent.trim()
    const artist = metadata?.artist || playback?.author || bar?.querySelector('.byline')?.textContent.trim()
    const art = metadata?.artwork?.at(-1)?.src ?? null
    const ad = adPlaying(player)
    const list = playingList(id)
    const song = video && id && title && !ad ? {
      path: '/watch?v=' + id,
      list,
      title: title.slice(0, 220),
      artist: artist?.slice(0, 220) ?? '',
      art,
      playing: !video.paused && !video.ended,
      position: Number.isFinite(video.currentTime) ? video.currentTime : 0,
      duration: Number.isFinite(video.duration) ? video.duration : 0,
    } : null
    return { ready: Boolean(document.querySelector('ytmusic-search-box input')), song, ad }
  }

  function playingList(id) {
    const route = new URL(location.href)
    if (id && route.pathname === '/watch' && route.searchParams.get('v') === id) {
      lastWatch = { id, list: route.searchParams.get('list') }
    }
    return lastWatch?.id === id ? lastWatch.list : null
  }

  function upcomingAfter(id) {
    const queue = getQueue()
    const index = queue.findIndex(path => new URL(path, location.origin).searchParams.get('v') === id)
    return queue.slice(index + 1)
  }

  function advance(player, manual) {
    clearTimeout(advanceTimer)
    const id = videoId(player)
    if (!id || adPlaying(player)) return false

    const stillHere = () => videoId(player) === id && !adPlaying(player) &&
      (manual || player.querySelector('video')?.ended)
    const next = () => {
      if (!stillHere()) return
      const button = document.querySelector('ytmusic-player-bar .next-button')
      if (button && !button.matches(':disabled, [aria-disabled="true"]')) button.click()
      else player.nextVideo?.()
      advanceTimer = setTimeout(() => {
        if (!stillHere()) return
        const remaining = upcomingAfter(id)
        if (remaining.length) {
          setQueue(remaining)
          location.assign(remaining[0])
        }
      }, 2400)
    }
    // Give the site's normal end-of-track transition a chance to change the queue.
    if (manual) next()
    else advanceTimer = setTimeout(next, 1200)
    return true
  }

  function action(request) {
    const player = document.querySelector('#movie_player')
    const video = player?.querySelector('video')
    if (!video) return false
    switch (request.type) {
      case 'toggle':
        clearTimeout(advanceTimer)
        if (video.paused) player.playVideo?.()
        else player.pauseVideo?.()
        return true
      case 'next':
        return advance(player, true)
      case 'previous':
        clearTimeout(advanceTimer)
        player.previousVideo?.()
        return true
      case 'seek':
        clearTimeout(advanceTimer)
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
      case 'play': return play(request.path, request.queue)
      default: return action(request)
    }
  } })

  function handleAd() {
    const video = observedPlayer?.querySelector('video')
    const ad = adPlaying(observedPlayer)
    if (mutedAd && (mutedAd.video !== video || !ad)) {
      mutedAd.video.muted = mutedAd.wasMuted
      mutedAd = undefined
    }
    if (!ad || !video) return
    if (!mutedAd) mutedAd = { video, wasMuted: video.muted }
    video.muted = true
    const button = observedPlayer.querySelector(skipButton)
    if (button?.getClientRects().length && !button.matches(':disabled, [aria-disabled="true"]')) button.click()
  }

  const adObserver = new MutationObserver(handleAd)
  function watchPlayer(event) {
    const player = event.target.closest?.('#movie_player')
    if (!player) return
    if (player !== observedPlayer) {
      observedPlayer = player
      adObserver.disconnect()
      adObserver.observe(player, { attributes: true, attributeFilter: ['class', 'disabled', 'aria-disabled'], childList: true, subtree: true })
    }
    handleAd()
    if (event.type === 'playing' && !adPlaying(player)) {
      const id = videoId(player)
      if (id) {
        playingList(id)
        setQueue(upcomingAfter(id))
      }
    }
  }
  document.addEventListener('play', watchPlayer, true)
  document.addEventListener('playing', watchPlayer, true)
  document.addEventListener('ended', event => {
    const player = event.target.closest?.('#movie_player')
    if (player) advance(player, false)
  }, true)
  startPlaylist()
})()
