; App disguise (src/app_disguise.rs) renames the Start menu/desktop
; shortcuts, which the stock uninstaller only knows as "${PRODUCTNAME}.lnk",
; and registers a toast identity. Clean both up on a real uninstall (not on
; the uninstall pass an update runs).

!macro DeleteDisguisedShortcuts
  StrCpy $1 0
  ${Do}
    EnumRegValue $2 HKCU "Software\${BUNDLEID}\Disguise" $1
    ${If} $2 == ""
      ${Break}
    ${EndIf}
    ReadRegStr $3 HKCU "Software\${BUNDLEID}\Disguise" $2
    Delete $3
    IntOp $1 $1 + 1
  ${Loop}
  DeleteRegKey HKCU "Software\${BUNDLEID}\Disguise"
  DeleteRegKey /ifempty HKCU "Software\${BUNDLEID}"
  DeleteRegKey HKCU "Software\Classes\AppUserModelId\${BUNDLEID}"
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ${If} $UpdateMode <> 1
    !insertmacro DeleteDisguisedShortcuts
  ${EndIf}
!macroend
