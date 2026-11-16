!include "FileFunc.nsh"

!macro NSIS_HOOK_POSTUNINSTALL
  ${GetParameters} $0
  ClearErrors
  ${GetOptions} $0 "/UPDATE" $1
  IfErrors 0 islandx_done
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "IslandX"
  Delete "$APPDATA\com.islandx.overlay\staged-update.bin"
  Delete "$APPDATA\com.islandx.overlay\staged-update.json"
  Delete "$APPDATA\com.islandx.overlay\staged-update.tmp"
  ClearErrors
  ${GetOptions} $0 "/ISLANDXDATA" $1
  IfErrors islandx_history
  RMDir /r "$APPDATA\com.islandx.overlay"
  RMDir /r "$LOCALAPPDATA\com.islandx.overlay"
  Goto islandx_done
  islandx_history:
  ClearErrors
  ${GetOptions} $0 "/ISLANDXHISTORY" $1
  IfErrors islandx_done
  Delete "$APPDATA\com.islandx.overlay\clipboard.bin"
  Delete "$APPDATA\com.islandx.overlay\clipboard.tmp"
  Delete "$APPDATA\com.islandx.overlay\shelf.json"
  Delete "$APPDATA\com.islandx.overlay\shelf.tmp"
  islandx_done:
!macroend
