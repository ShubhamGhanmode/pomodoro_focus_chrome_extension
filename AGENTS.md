# Project Overview

This repository contains a Manifest V3 Chrome extension that provides a draggable Pomodoro timer overlay with statistics tracking, customizable settings, and blocks navigation to non-allowlisted sites during an active focus session.

## Architecture

- `manifest.json` wires the MV3 service worker, content script, popup, permissions, keyboard commands, and assets.
- `shared.js` contains shared constants, default states, templates, sounds, and utility functions used across all scripts.
- `sw.js` stores session state in `chrome.storage.local`, settings in `chrome.storage.sync`, manages the declarativeNetRequest redirect rule, handles alarms for badge updates, sends desktop notifications, tracks statistics and task history, enforces strict-mode stop protections, and records blocked targets per tab via `chrome.webNavigation` in `chrome.storage.session`.
- `content.js` injects a draggable, minimizable overlay into each page with settings panel, reads session state from storage, and runs a local tick to keep the timer accurate without waking the service worker every second.
- `popup.html`, `popup.css`, `popup.js` provide the extension popup with timer controls, statistics dashboard, task history, settings management, allowlist editor, and sticky-widget visibility toggle.
- `warning.html`, `warning.css`, `warning.js` render the blocked-site warning with improved UX and allow adding the blocked domain to the allowlist.
- `sounds/` contains notification sounds: chime.mp3, bell.mp3, digital.mp3, gentle.mp3

## State Keys

### chrome.storage.sync (Settings - synced across devices)
- `focusSettings` - User preferences
  - `workMinutes`, `breakMinutes`, `longBreakMinutes`, `pomodorosUntilLongBreak`, `autoStartBreaks`, `autoStartWork`, `soundEnabled`, `selectedSound`, `notificationsEnabled`, `strictMode`, `theme`, `dailyGoal`, `persistAllowlist`, `activeTemplate`, `customTemplates`

### chrome.storage.local (State and data - device-specific)
- `focusState` - Current session state
  - `active`, `mode`, `endAt`, `pausedRemainingMs`, `allowlist`, `workMinutes`, `breakMinutes`, `longBreakMinutes`, `pomodorosUntilLongBreak`, `completedPomodoros`, `totalCompletedToday`, `currentTask`, `sessionStartedAt`
- `focusStats` - Productivity statistics
  - `totalPomodoros`, `totalFocusMinutes`, `dailyStats`, `weeklyStreak`, `lastActiveDate`
- `taskHistory` - Array of completed tasks with timestamps, duration, and mode
- `focusWidgetPos` - Widget position `{ x, y }`
- `focusWidgetState` - Widget UI state `{ minimized, showSettings, hidden }`
- `savedAllowlist` - Persistent allowlist domains array

### chrome.storage.session
- `blockedTargets` - URLs blocked per tab, keyed by `tabId`

## Templates

Default pomodoro templates:
- **Standard**: 25min work / 5min break / 15min long break
- **Deep Work**: 50min work / 10min break / 30min long break
- **Quick Tasks**: 15min work / 3min break / 10min long break
- **Custom**: User-defined durations

## Keyboard Commands

- `Ctrl+Shift+Y` - Toggle timer (start/pause/resume)
- `Ctrl+Shift+U` - Stop current session

## Development

- Load the extension from `d:\Projects\promodoro_chrome` in `chrome://extensions` with Developer Mode enabled.
- There is no build step.
- Lightweight validation test: `node tests/shared.test.js`
- Add custom sounds by placing MP3 files in the `sounds/` directory and updating `AVAILABLE_SOUNDS` in `shared.js`.

## Notes

- Allowlist inputs are normalized to hostnames (URLs/ports trimmed) to keep DNR rules valid.
- The content script loads settings from sync storage on startup so the widget reflects saved preferences.
- Popup start attempts to seed the active tab's URL when available.
- `shared.js` runs inside an IIFE to avoid global const collisions across extension contexts.
- `content.js` and `popup.js` are wrapped in IIFEs to prevent redeclaration errors if scripts are injected more than once.
- Day-based stats keys use local calendar dates (`YYYY-MM-DD`) instead of UTC boundaries.
- Segment advancement is serialized in the service worker to avoid double transitions from concurrent alarms/messages.
