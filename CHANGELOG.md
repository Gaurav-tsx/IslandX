# Changelog

## v0.3.7

- Organized Settings into Appearance, Behavior, Updates, and About.
- Added Smooth, Responsive, and Off animation presets and a screen capture visibility setting.
- Matched the visible corner radius to the Win32 window outline and reduced redundant native window updates.
- Fixed center-lock auto-vanish when another app has focus and kept the toolbar highlight aligned after resizing.

## v0.3.6

- Added a toolbar Lock button and "Lock to center & auto-vanish" mode: centers the island and makes it completely vanish from the desktop when idle.
- Moving the cursor to the very top center edge directly opens the full island panel; moving away re-vanishes it immediately (bypassing the small pill).
- Right-click dragging and circle mode toggling are locked out while in locked mode.
- Separated YouTube Music volume completely from Windows master PC volume: adjusting or scrolling over the music player's volume slider controls only the music player stream, preserving PC master volume independently.

## v0.3.5

- Added Slim strip (auto-hide) mode: collapses the resting island into a 4px sensor line at the top screen edge so it never covers browser tabs, window headers, or maximized applications.
- Cursor movement to the top center edge instantly and fluidly springs the island back into view.
- Added an optional "Invisible trigger strip" setting in Settings for users who prefer a completely seamless, invisible top trigger zone until hovered.
- Added Corner radius slider (0% square to 100% round) in Settings that dynamically shapes the island, glass shell, and native Win32 window clipping region.
- Added 8 new surface themes: Pure Black (OLED), Graphite, Acrylic, Rosé, Lavender, Peach, Sakura, and Candy Glass alongside Liquid Glass and Black.

## v0.3.4

- Removed the Windows window title bar and caption frame flicker during deactivation and sizing transitions.
- Made all UI text non-copyable and non-selectable across the overlay while preserving text selection inside search inputs and notes.
- Added right-click hold-to-drag on the open island to directly reposition it along the top edge of the screen without collapsing it into a pill.

## v0.3.3

- Added direction-aware sliding transitions between tabs, an animated gliding indicator highlight, and keyboard arrow navigation across panels.
- Refined UI styling with a consistent lowercase voice for chrome, staggered entrance choreography for panel contents, and tactile button press feedback.
- Replaced native system stat meters with animated level-aware metric bars and added custom dynamic fill tracks to volume, blur, and gloss sliders.
- Added brief hover intent delays on opening and closing to prevent accidental flickering from pointer fly-bys.

## v0.3.2

- Added local listening history for songs and playlists. Music stays on the current or last IslandX track when Windows apps play other media.
- Kept music moving at the end of a track by using the player queue and falling back to the next available result.
- Muted detected in-stream ads in the Music player while waiting for the track or for a Skip control.
- Made the expanded overlay toolbar opaque so window captions and desktop elements no longer show through it.

## v0.3.1

- YouTube Music results now appear beside the search box, with song and playlist choices visible as soon as search finishes.
- Includes the background YouTube Music player and local ad filtering, the Browser tab’s installed-browser picker, the built-in browser title-bar fix, and live Windows volume controls.

## v0.3.0

- Added in-panel YouTube Music search and playback for songs and public playlists. Music runs in a hidden WebView2 player with local filtering for known ad and tracking requests.
- Added a browser picker to the Browser tab. Choose a registered installed browser, the Windows default browser, or IslandX Browser.
- Adjusted the built-in browser window so closing it clears its chrome and returns control to the overlay.
- Output volume now updates while dragging, scrolling, or using the keyboard in Music, Audio, and Controls.

## v0.2.2

- Smoothed the overlay and circle outlines and removed the rectangular Windows backdrop that could show behind rounded corners. Glass uses translucent surfaces and adjustable blur inside the cards.
- Right-click the circle to open IslandX and enable hover. Leaving the panel returns it to a pill. Right-click the pill or panel to lock circle mode again.

## v0.2.1

- Rounded the native outline and removed the square backdrop rim.
- Added immediate hover transitions with animated opening and closing.
- Added a compact circle while another app is focused. Right-click to open IslandX or drag horizontally along the top edge.

## v0.2.0

- Restyled the overlay, Music, system stats, and every panel with liquid glass and an orange accent.
- Added Windows Acrylic, glass quality presets, adjustable card blur, and adjustable gloss. Windows transparency preferences override effects.
- Paused Acrylic, backdrop filters, and cursor lighting when the island is collapsed.

## v0.1.1

- Update checks and downloads try alternate server addresses when a GitHub CDN connection stalls.

## v0.1.0

- Windows x64 preview with a DPI-aware notch overlay, system tray, and Ctrl + Shift + Space shortcut.
- Music controls, system stats, Windows capture shortcuts, a local file shelf, and a WebView2 browser.
- Opt-in encrypted text clipboard history, audio controls, notes, focus timer, and startup settings.
- NSIS installer and signed update feed with automatic or manual checks.
