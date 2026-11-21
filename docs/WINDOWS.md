# Windows

Ulanzi Deck Open runs on Windows 10/11 (x64). Windows support lives in
`app/lib/platform/win/` and `app/renderer/platform-win.{js,css}`, plus short
`process.platform === 'win32'` guards in the shared files; the macOS code paths are
unchanged.

## Requirements

* Windows 10 or 11, x64.
* **Node.js 22.13+ for Windows** (not the one inside WSL — WSL cannot see the D200
  over USB, and Electron/node-hid need their Windows binaries).
* The D200 on USB. **Quit Ulanzi Studio first** (tray icon → Exit): the deck's
  control interface is exclusive.

No compiler, Visual Studio or admin rights are needed: node-hid and koffi ship
prebuilt Windows binaries.

## Build and run from source

```powershell
cd app
npm install
npm run start:win        # npm start runs the macOS helper build first
```

```powershell
npm run test:win         # unit tests; macOS/POSIX-only tests are skipped
npm run lint
npm run typecheck
npm run package:win      # dist\win-unpacked\Ulanzi Deck Open.exe
npm run make:win         # dist\Ulanzi-Deck-Open-Setup-<v>.exe + portable ZIP
```

`make:win` is unsigned. If electron-builder fails to unpack `winCodeSign` with
"A required privilege is not held by the client", turn on **Developer Mode**
(Settings → System → For developers) or run the build once from an elevated
terminal; the archive contains macOS symlinks that Windows only creates with that
privilege.

### Unsigned builds and SmartScreen

The installer and the app are not code-signed, so SmartScreen warns on first run:
choose **More info → Run anyway**.

## What works differently on Windows

| Feature | Windows implementation |
| --- | --- |
| Deck (HID) | Same protocol. The app opens collection `MI_00` (usage page 0x0C); the keyboard collection `MI_01` is left alone. |
| Hotkeys, Type text, Media keys | `SendInput` via koffi (`lib/platform/win/input.js`). `cmd` in profiles is sent as **Ctrl**; `win` is the Windows key. |
| Run command | `cmd.exe /d /s /c`. Timeouts kill the whole tree with `taskkill /T /F`. Use `powershell -Command "…"` for PowerShell. |
| Open app | `.exe`/`.lnk` paths, or names `start` can find (`notepad`, `calc`, `wt`). |
| Close app | `taskkill /IM <name>.exe` (forced if the app ignores the request). |
| Play audio | WPF `MediaPlayer` in a hidden PowerShell (wav, mp3, m4a, wma). |
| Profile follows the front app | Foreground window → process `.exe` path. Link a profile from the app picker (Start menu apps). |
| App picker and icons | Start menu shortcuts, resolved to their `.exe`; icons from the shell. |
| GPU in System stats | `typeperf` "GPU Engine" counters (the numbers Task Manager shows). |
| ZIP packages | `tar.exe` (built into Windows 10+) instead of `unzip`. |
| Plugins | Ulanzi plugins from `%APPDATA%\Ulanzi\UlanziDeck\Plugins` and `C:\Program Files (x86)\Ulanzi Studio\Plugins`; Stream Deck plugins from `%APPDATA%\Elgato\StreamDeck\Plugins` and `%APPDATA%\opendeck\plugins`. Stream Deck plugins run their `CodePathWin` `.exe` natively; plugins are told `platform: "windows"`. |
| Import from Ulanzi Studio | Reads `%APPDATA%\Ulanzi\UlanziDeck\ProfilesV2`; Windows hotkeys such as `Win+Shift+S` are converted. |
| Launch at login | Registry Run key with `--hidden` (starts in the system tray). |
| Logs | `%LOCALAPPDATA%\Ulanzi Deck Open\Logs`. Config stays in `%APPDATA%\Ulanzi Deck Open`. |

## Known limitations

* **Key capture** (`hidseize` on macOS) is not available: Windows cannot take a
  keyboard away from the system in user mode. The firmware fallback that types
  `www.ulanzistudio.com` was not seen on firmware 2.0.3.
* **Elevated windows**: Windows blocks synthetic input into apps running as
  administrator unless Ulanzi Deck Open also runs elevated (UIPI).
* Accessibility / Input Monitoring settings are macOS-only and hidden.
* Microsoft Store (UWP) apps are not listed in the app picker; use their
  `shell:AppsFolder\…` link or a URL scheme in an Open URL action instead.
