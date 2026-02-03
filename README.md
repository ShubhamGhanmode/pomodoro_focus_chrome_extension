# 🍅 Pomodoro Focus Extension

A powerful Manifest V3 Chrome extension featuring a draggable Pomodoro timer overlay with website blocking, statistics tracking, and customizable settings.

![Version](https://img.shields.io/badge/version-2.1.0-green)
![Manifest](https://img.shields.io/badge/manifest-v3-blue)

## ✨ Features

### Timer & Productivity
- **Draggable Timer Widget** - Always-visible overlay on every page
- **Minimizable View** - Collapse to compact mode showing just the timer
- **Work/Break Cycling** - Automatic transitions between focus and rest periods
- **Long Breaks** - Extended breaks after completing multiple pomodoros
- **Task Labels** - Name what you're working on for each session
- **Skip Segment** - Jump to next work/break period when needed

### Focus & Blocking
- **Allowlist Blocking** - Block all sites except those you allow during focus
- **Automatic Site Detection** - Current site auto-added when starting
- **Persistent Allowlist** - Optionally remember allowed sites between sessions
- **Beautiful Warning Page** - Clear UI when a blocked site is accessed

### Statistics & Tracking
- **Daily Progress** - Track pomodoros and focus minutes per day
- **Weekly Chart** - Visual overview of your week's productivity
- **Streak Counter** - See your consecutive active days
- **Daily Goals** - Set and track pomodoro targets
- **30-Day History** - Statistics retained for a full month
- **Task History** - View completed tasks with timestamps and export to JSON

### Customization
- **Pomodoro Templates** - Quick presets: Standard (25/5/15), Deep Work (50/10/30), Quick Tasks (15/3/10)
- **Adjustable Durations** - Custom work, short break, and long break times
- **Auto-Start Options** - Automatically begin breaks or work sessions
- **Custom Sound Selection** - Choose from Chime, Bell, Digital, or Gentle notification sounds
- **Desktop Notifications** - System notifications for segment changes
- **Dark/Light Theme** - Match your preference or system setting
- **Strict Mode** - Prevent stopping during work (optional)
- **Sync Across Devices** - Settings sync automatically via Chrome account

### Keyboard Shortcuts
| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+Y` | Toggle timer (Start/Pause/Resume) |
| `Ctrl+Shift+U` | Stop current session |

## 📦 Installation

1. Open `chrome://extensions` in Chrome
2. Enable **Developer Mode** (toggle in top-right)
3. Click **Load unpacked**
4. Select the `promodoro_chrome` folder

## 🚀 Usage

### Starting a Session
1. Click **Start** on the floating widget
2. Optionally enter what you're working on
3. The current site is automatically added to your allowlist

### Managing Focus
- **Pause/Resume** - Click the main button during a session
- **Skip** - Jump to next segment with the skip button
- **Stop** - End the session entirely

### Accessing Settings
- Click the **⚙️ gear icon** on the widget header
- Or click the extension icon for the full popup with stats

### Widget Controls
- **Drag** - Click and drag the header to reposition
- **Double-click** - Reset position to top-left corner
- **Minimize** - Click the minimize icon for compact view

## 📊 Statistics

Access your productivity stats by clicking the extension icon:

- **Today's Pomodoros** - Sessions completed today
- **Focus Minutes** - Total time focused today
- **Day Streak** - Consecutive active days
- **Weekly Chart** - Visual bar chart of the past 7 days
- **Goal Progress** - Track against your daily target

## ⚙️ Settings

### Timer Durations
| Setting | Default | Range |
|---------|---------|-------|
| Work | 25 min | 1-120 min |
| Short Break | 5 min | 1-60 min |
| Long Break | 15 min | 1-60 min |
| Long Break After | 4 pomodoros | 2-10 |

### Preferences
| Setting | Description |
|---------|-------------|
| Auto-start Breaks | Begin breaks automatically after work |
| Auto-start Work | Begin work automatically after breaks |
| Sound Notifications | Play audio when segments complete |
| Desktop Notifications | Show system notifications |
| Remember Allowlist | Keep allowed sites between sessions |
| Strict Mode | Prevent stopping during work periods |
| Daily Goal | Target number of pomodoros per day |
| Theme | Light, Dark, or System |

## 🔧 Customizing the Sound

Replace `sounds/chime.mp3` with your preferred notification sound. The file should be:
- MP3 format
- Short duration (1-3 seconds recommended)
- Moderate volume

## 📁 Project Structure

```
promodoro_chrome/
├── manifest.json      # Extension configuration
├── sw.js              # Service worker (background)
├── content.js         # Injected widget script
├── popup.html         # Extension popup UI
├── popup.css          # Popup styles
├── popup.js           # Popup logic
├── warning.html       # Blocked site page
├── warning.css        # Warning page styles
├── warning.js         # Warning page logic
├── sounds/
│   └── chime.mp3      # Notification sound
└── icons/
    ├── 16.png
    ├── 48.png
    └── 128.png
```

## 🔑 Permissions

| Permission | Purpose |
|------------|---------|
| `storage` | Save settings, state, and statistics |
| `declarativeNetRequest` | Block non-allowlisted sites |
| `webNavigation` | Track blocked navigation attempts |
| `notifications` | Desktop alerts for segment changes |
| `alarms` | Badge updates and segment timing |

## 🛠️ Development

No build step required. Edit files directly and reload the extension:

1. Make changes to source files
2. Go to `chrome://extensions`
3. Click the refresh icon on the extension card

## 📝 State Storage

### chrome.storage.local
- `focusState` - Current session state
- `focusStats` - Productivity statistics
- `focusWidgetPos` - Widget position
- `focusWidgetState` - Widget UI state (minimized, etc.)
- `savedAllowlist` - Persistent allowlist domains

### chrome.storage.sync
- `focusSettings` - User preferences

### chrome.storage.session
- `blockedTargets` - URLs blocked per tab (temporary)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

MIT License - Feel free to use and modify as needed.

---

**Stay focused! 🍅**
