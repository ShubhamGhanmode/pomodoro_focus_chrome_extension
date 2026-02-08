(() => {
  // Use shared constants from shared.js (loaded via manifest content_scripts)
  const {
    STORAGE_KEY,
    SETTINGS_KEY,
    POS_KEY,
    WIDGET_STATE_KEY,
    AVAILABLE_SOUNDS,
    DEFAULT_STATE,
    DEFAULT_SETTINGS,
    DEFAULT_WIDGET_STATE,
    RING_CIRCUMFERENCE,
    formatMs,
    clamp,
    normalizeState,
    normalizeSettings
  } = globalThis.POMODORO_SHARED;

  const ROOT_ID = "pomodoro-focus-root";

  async function loadPosition() {
    const data = await chrome.storage.local.get(POS_KEY);
    return data[POS_KEY] || { x: 16, y: 16 };
  }

  async function savePosition(pos) {
    await chrome.storage.local.set({ [POS_KEY]: pos });
  }

  async function loadWidgetState() {
    const data = await chrome.storage.local.get(WIDGET_STATE_KEY);
    return { ...DEFAULT_WIDGET_STATE, ...(data[WIDGET_STATE_KEY] || {}) };
  }

  async function saveWidgetState(state) {
    await chrome.storage.local.set({ [WIDGET_STATE_KEY]: state });
  }

  function playNotificationSound(selectedSound = "chime") {
    try {
      const sound = AVAILABLE_SOUNDS.find(s => s.id === selectedSound) || AVAILABLE_SOUNDS[0];
      const audio = new Audio(chrome.runtime.getURL(sound.file));
      audio.volume = 0.5;
      audio.play().catch(() => { });
    } catch {
      // Ignore sound errors
    }
  }

  function injectWidget() {
    if (document.getElementById(ROOT_ID)) return null;

    const host = document.createElement("div");
    host.id = ROOT_ID;
    host.style.all = "initial";
    host.style.position = "fixed";
    host.style.zIndex = "2147483647";
    host.style.left = "16px";
    host.style.top = "16px";
    host.style.pointerEvents = "auto";

    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `
    <style>
      :host {
        all: initial;
      }
      
      *, *::before, *::after {
        box-sizing: border-box;
      }
      
      .wrap {
        --bg-primary: #faf6ef;
        --bg-secondary: #f0e8da;
        --bg-card: #fffcf5;
        --bg-elevated: #ffffff;
        --bg-sunken: #ede4d3;
        --text-primary: #1c1814;
        --text-secondary: #5e5347;
        --text-muted: #93877a;
        --text-inverse: #fffcf5;
        --accent-work: #c44d2b;
        --accent-work-hover: #d45a36;
        --accent-work-light: rgba(196, 77, 43, 0.10);
        --accent-work-glow: rgba(196, 77, 43, 0.25);
        --accent-break: #3d7a5f;
        --accent-break-light: rgba(61, 122, 95, 0.10);
        --accent-break-glow: rgba(61, 122, 95, 0.25);
        --border: rgba(0, 0, 0, 0.08);
        --border-strong: rgba(0, 0, 0, 0.14);
        --shadow: 0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.06);
        --radius: 18px;
        --transition: 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        
        width: 224px;
        border-radius: var(--radius);
        border: 1px solid var(--border);
        box-shadow: var(--shadow);
        background: var(--bg-primary);
        color: var(--text-primary);
        overflow: hidden;
        user-select: none;
        font-family: "Segoe UI Variable", "Segoe UI", system-ui, -apple-system, sans-serif;
        font-size: 14px;
        transition: width var(--transition), border-radius var(--transition), box-shadow var(--transition);
        -webkit-font-smoothing: antialiased;
      }
      
      .wrap.dark {
        --bg-primary: #171311;
        --bg-secondary: #221d19;
        --bg-card: #2a241e;
        --bg-elevated: #332c25;
        --bg-sunken: #131110;
        --text-primary: #f2ead9;
        --text-secondary: #a99d8e;
        --text-muted: #6d6359;
        --text-inverse: #171311;
        --accent-work: #e67350;
        --accent-work-hover: #f08060;
        --accent-work-light: rgba(230, 115, 80, 0.14);
        --accent-work-glow: rgba(230, 115, 80, 0.20);
        --accent-break: #5cba92;
        --accent-break-light: rgba(92, 186, 146, 0.14);
        --accent-break-glow: rgba(92, 186, 146, 0.20);
        --border: rgba(255, 255, 255, 0.07);
        --border-strong: rgba(255, 255, 255, 0.13);
        --shadow: 0 8px 32px rgba(0, 0, 0, 0.4), 0 2px 8px rgba(0, 0, 0, 0.25);
      }
      
      .wrap.minimized {
        width: auto;
        border-radius: 28px;
        box-shadow: var(--shadow), 0 0 0 1px var(--border);
      }
      
      .wrap:hover {
        box-shadow: var(--shadow), 0 0 20px var(--accent-work-glow);
      }
      
      /* Header / Drag Bar */
      .bar {
        padding: 12px 14px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        cursor: grab;
        touch-action: none;
        background: var(--bg-primary);
        border-bottom: 1px solid var(--border);
        gap: 10px;
      }
      
      .bar:active { cursor: grabbing; }
      
      .bar-left {
        display: flex;
        align-items: center;
        gap: 10px;
        min-width: 0;
      }
      
      .bar-title {
        font-size: 13px;
        font-weight: 600;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      
      .bar-actions {
        display: flex;
        gap: 4px;
        flex-shrink: 0;
      }
      
      .icon-btn {
        width: 28px;
        height: 28px;
        border-radius: 8px;
        border: 1px solid var(--border);
        background: var(--bg-card);
        color: var(--text-secondary);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: var(--transition);
        padding: 0;
      }
      
      .icon-btn:hover {
        background: var(--bg-secondary);
        color: var(--text-primary);
      }
      
      .icon-btn:focus {
        outline: 2px solid var(--accent-work);
        outline-offset: 1px;
      }
      
      .icon-btn.active {
        background: var(--accent-work);
        color: white;
        border-color: var(--accent-work);
      }
      
      .icon-btn svg {
        width: 14px;
        height: 14px;
      }
      
      .pill {
        font-size: 10px;
        font-weight: 600;
        padding: 4px 10px;
        border-radius: 999px;
        border: 1px solid var(--border);
        background: var(--accent-work-light);
        color: var(--accent-work);
        text-transform: uppercase;
        letter-spacing: 0.4px;
        white-space: nowrap;
      }
      
      .pill.break {
        background: var(--accent-break-light);
        color: var(--accent-break);
      }
      
      .pill.idle {
        background: var(--bg-card);
        color: var(--text-muted);
      }
      
      /* Minimized View */
      .mini-view {
        display: none;
        align-items: center;
        gap: 10px;
        padding: 10px 14px;
        cursor: grab;
        touch-action: none;
      }
      
      .wrap.minimized .mini-view {
        display: flex;
      }
      
      .wrap.minimized .bar,
      .wrap.minimized .body,
      .wrap.minimized .settings-panel {
        display: none;
      }
      
      .mini-time {
        font-size: 18px;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
      }
      
      .mini-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--accent-work);
        animation: pulse 2s infinite;
      }
      
      .mini-dot.break {
        background: var(--accent-break);
      }
      
      .mini-dot.paused {
        animation: none;
        opacity: 0.5;
      }
      
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
      }
      
      /* Body */
      .body {
        padding: 16px;
      }
      
      /* Timer Display */
      .timer-section {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
      }
      
      .timer-display {
        position: relative;
        width: 130px;
        height: 130px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      
      .timer-time {
        font-size: 32px;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
        letter-spacing: -0.5px;
        z-index: 1;
      }
      
      .timer-ring {
        position: absolute;
        inset: 0;
      }
      
      .timer-ring svg {
        width: 100%;
        height: 100%;
        transform: rotate(-90deg);
      }
      
      .ring-bg {
        fill: none;
        stroke: var(--bg-card);
        stroke-width: 5;
      }
      
      .ring-progress {
        fill: none;
        stroke: var(--accent-work);
        stroke-width: 5;
        stroke-linecap: round;
        stroke-dasharray: 251.2;
        stroke-dashoffset: 0;
        transition: stroke-dashoffset 1s linear, stroke 0.3s;
        filter: drop-shadow(0 0 4px var(--accent-work-glow));
      }
      
      .timer-display.break .ring-progress {
        stroke: var(--accent-break);
      }
      
      /* Task Input */
      .task-input {
        width: 100%;
        padding: 8px 12px;
        border: 1px solid var(--border);
        border-radius: 10px;
        background: var(--bg-card);
        color: var(--text-primary);
        font-size: 12px;
        text-align: center;
        transition: var(--transition);
        font-family: inherit;
      }
      
      .task-input:focus {
        outline: none;
        border-color: var(--accent-work);
        box-shadow: 0 0 0 3px var(--accent-work-light);
      }
      
      .task-input::placeholder {
        color: var(--text-muted);
      }
      
      /* Pomodoro Count */
      .pomo-count {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 11px;
        color: var(--text-muted);
      }
      
      .pomo-dots {
        display: flex;
        gap: 4px;
      }
      
      .pomo-dot {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: var(--bg-card);
        border: 2px solid var(--border);
        transition: var(--transition);
      }
      
      .pomo-dot.filled {
        background: var(--accent-work);
        border-color: var(--accent-work);
      }
      
      /* Controls */
      .controls {
        display: flex;
        gap: 8px;
        margin-top: 4px;
      }
      
      .btn {
        flex: 1;
        padding: 10px 12px;
        border-radius: 10px;
        border: 1px solid var(--border);
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition: var(--transition);
        font-family: inherit;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
      }
      
      .btn:focus {
        outline: 2px solid var(--accent-work);
        outline-offset: 1px;
      }
      
      .btn-primary {
        background: var(--accent-work);
        color: var(--text-inverse);
        border-color: var(--accent-work);
        box-shadow: 0 2px 8px var(--accent-work-glow);
      }
      
      .btn-primary:hover {
        background: var(--accent-work-hover);
        transform: translateY(-1px);
        box-shadow: 0 4px 12px var(--accent-work-glow);
      }
      
      .btn-primary:active {
        transform: translateY(0);
      }
      
      .btn-primary.break {
        background: var(--accent-break);
        border-color: var(--accent-break);
      }
      
      .btn-secondary {
        background: var(--bg-card);
        color: var(--text-secondary);
      }
      
      .btn-secondary:hover {
        background: var(--bg-secondary);
        color: var(--text-primary);
      }

      .btn-secondary:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      
      .btn-icon {
        flex: 0 0 auto;
        width: 36px;
        padding: 0;
      }
      
      .btn svg {
        width: 14px;
        height: 14px;
      }
      
      .hidden {
        display: none !important;
      }
      
      /* Settings Panel */
      .settings-panel {
        padding: 14px;
        border-top: 1px solid var(--border);
        background: var(--bg-secondary);
        max-height: 260px;
        overflow-y: auto;
      }
      
      .settings-panel.hidden {
        display: none;
      }
      
      .settings-title {
        font-size: 11px;
        font-weight: 600;
        color: var(--text-muted);
        text-transform: uppercase;
        letter-spacing: 0.4px;
        margin-bottom: 10px;
      }
      
      .setting-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px 0;
        border-bottom: 1px solid var(--border);
      }
      
      .setting-row:last-child {
        border-bottom: none;
      }
      
      .setting-label {
        font-size: 12px;
        color: var(--text-primary);
      }
      
      .setting-input {
        display: flex;
        align-items: center;
        gap: 4px;
      }
      
      .setting-input input[type="number"] {
        width: 50px;
        padding: 5px 6px;
        border: 1px solid var(--border);
        border-radius: 6px;
        background: var(--bg-card);
        color: var(--text-primary);
        font-size: 12px;
        text-align: center;
        font-family: inherit;
      }
      
      .setting-input input:focus {
        outline: none;
        border-color: var(--accent-work);
      }
      
      .setting-suffix {
        font-size: 11px;
        color: var(--text-muted);
      }
      
      .toggle-label {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px 0;
        border-bottom: 1px solid var(--border);
        cursor: pointer;
      }
      
      .toggle-label:last-child {
        border-bottom: none;
      }
      
      .toggle-label input {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
      }
      
      .toggle-switch {
        position: relative;
        width: 36px;
        height: 20px;
        background: var(--bg-sunken);
        border: 1px solid var(--border-strong);
        border-radius: 10px;
        transition: var(--transition);
      }
      
      .toggle-switch::after {
        content: "";
        position: absolute;
        top: 2px;
        left: 2px;
        width: 14px;
        height: 14px;
        background: var(--text-muted);
        border-radius: 50%;
        transition: var(--transition);
      }
      
      .toggle-label input:checked + .toggle-switch {
        background: var(--accent-work);
        border-color: var(--accent-work);
        box-shadow: 0 0 8px var(--accent-work-glow);
      }

      .toggle-label input:focus + .toggle-switch {
        outline: 2px solid var(--accent-work);
        outline-offset: 2px;
      }
      
      .toggle-label input:checked + .toggle-switch::after {
        left: 18px;
        background: white;
      }
      
      /* Scrollbar */
      .settings-panel::-webkit-scrollbar {
        width: 4px;
      }
      
      .settings-panel::-webkit-scrollbar-track {
        background: transparent;
      }
      
      .settings-panel::-webkit-scrollbar-thumb {
        background: var(--border);
        border-radius: 2px;
      }
      
      /* Accessibility */
      @media (prefers-reduced-motion: reduce) {
        *, *::before, *::after {
          animation-duration: 0.01ms !important;
          transition-duration: 0.01ms !important;
        }
      }
    </style>
    
    <div class="wrap" id="wrap" role="application" aria-label="Pomodoro Focus Timer">
      <!-- Minimized View -->
      <div class="mini-view" id="miniView" role="timer" aria-live="polite">
        <div class="mini-dot" id="miniDot" aria-hidden="true"></div>
        <span class="mini-time" id="miniTime">25:00</span>
        <button class="icon-btn" id="miniExpand" aria-label="Expand timer" title="Expand">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="15 3 21 3 21 9"></polyline>
            <polyline points="9 21 3 21 3 15"></polyline>
            <line x1="21" y1="3" x2="14" y2="10"></line>
            <line x1="3" y1="21" x2="10" y2="14"></line>
          </svg>
        </button>
      </div>
      
      <!-- Header -->
      <div class="bar" id="drag" role="toolbar" aria-label="Timer controls">
        <div class="bar-left">
          <span class="pill" id="modePill" aria-live="polite">Idle</span>
          <span class="bar-title" id="barTitle">Focus Timer</span>
        </div>
        <div class="bar-actions">
          <button class="icon-btn" id="settingsBtn" aria-label="Toggle settings" title="Settings">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>
          </button>
          <button class="icon-btn" id="minimizeBtn" aria-label="Minimize timer" title="Minimize">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="4 14 10 14 10 20"></polyline>
              <polyline points="20 10 14 10 14 4"></polyline>
              <line x1="14" y1="10" x2="21" y2="3"></line>
              <line x1="3" y1="21" x2="10" y2="14"></line>
            </svg>
          </button>
        </div>
      </div>
      
      <!-- Body -->
      <div class="body" id="body">
        <div class="timer-section">
          <div class="timer-display" id="timerDisplay" role="timer" aria-live="polite">
            <span class="timer-time" id="timeText">25:00</span>
            <div class="timer-ring" aria-hidden="true">
              <svg viewBox="0 0 100 100">
                <circle class="ring-bg" cx="50" cy="50" r="40"></circle>
                <circle class="ring-progress" id="ringProgress" cx="50" cy="50" r="40"></circle>
              </svg>
            </div>
          </div>
          
          <input type="text" class="task-input" id="taskInput" placeholder="What are you working on?" maxlength="40" aria-label="Current task" />
          
          <div class="pomo-count" aria-label="Completed pomodoros">
            <span>Completed:</span>
            <div class="pomo-dots" id="pomoDots" role="group"></div>
          </div>
          
          <div class="controls">
            <button class="btn btn-secondary btn-icon hidden" id="skipBtn" aria-label="Skip to next segment" title="Skip">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"></path>
              </svg>
            </button>
            <button class="btn btn-primary" id="mainBtn" aria-label="Start timer">Start</button>
            <button class="btn btn-secondary btn-icon hidden" id="stopBtn" aria-label="Stop session" title="Stop">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="6" width="12" height="12" rx="2"></rect>
              </svg>
            </button>
          </div>
        </div>
      </div>
      
      <!-- Settings Panel -->
      <div class="settings-panel hidden" id="settingsPanel" role="region" aria-label="Timer settings">
        <div class="settings-title">Timer Settings</div>
        
        <div class="setting-row">
          <span class="setting-label">Work</span>
          <div class="setting-input">
            <input type="number" id="setWork" min="1" max="120" value="25" aria-label="Work duration in minutes" />
            <span class="setting-suffix">min</span>
          </div>
        </div>
        
        <div class="setting-row">
          <span class="setting-label">Short Break</span>
          <div class="setting-input">
            <input type="number" id="setBreak" min="1" max="60" value="5" aria-label="Break duration in minutes" />
            <span class="setting-suffix">min</span>
          </div>
        </div>
        
        <div class="setting-row">
          <span class="setting-label">Long Break</span>
          <div class="setting-input">
            <input type="number" id="setLongBreak" min="1" max="60" value="15" aria-label="Long break duration in minutes" />
            <span class="setting-suffix">min</span>
          </div>
        </div>
        
        <div class="settings-title" style="margin-top: 12px;">Preferences</div>
        
        <label class="toggle-label">
          <span class="setting-label">Sound</span>
          <input type="checkbox" id="setSound" checked />
          <span class="toggle-switch"></span>
        </label>
        
        <label class="toggle-label">
          <span class="setting-label">Auto-start Breaks</span>
          <input type="checkbox" id="setAutoBreaks" />
          <span class="toggle-switch"></span>
        </label>
        
        <label class="toggle-label">
          <span class="setting-label">Dark Theme</span>
          <input type="checkbox" id="setDark" />
          <span class="toggle-switch"></span>
        </label>
      </div>
    </div>
  `;

    document.documentElement.appendChild(host);
    return { host, shadow };
  }

  async function setupDrag(host, dragHandle, miniView) {
    const pos = await loadPosition();
    host.style.left = `${pos.x}px`;
    host.style.top = `${pos.y}px`;

    let dragging = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;
    let maxX = 0;
    let maxY = 0;

    const updateBounds = () => {
      const rect = host.getBoundingClientRect();
      maxX = Math.max(0, window.innerWidth - rect.width);
      maxY = Math.max(0, window.innerHeight - rect.height);

      // Ensure widget stays in bounds on resize
      const currentX = parseInt(host.style.left, 10) || 0;
      const currentY = parseInt(host.style.top, 10) || 0;
      host.style.left = `${clamp(currentX, 0, maxX)}px`;
      host.style.top = `${clamp(currentY, 0, maxY)}px`;
    };

    updateBounds();

    const onDown = (e) => {
      dragging = true;
      startX = e.clientX;
      startY = e.clientY;
      startLeft = parseInt(host.style.left, 10) || 0;
      startTop = parseInt(host.style.top, 10) || 0;
      updateBounds();
      e.target.setPointerCapture(e.pointerId);
    };

    const onMove = (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      const x = clamp(startLeft + dx, 0, maxX);
      const y = clamp(startTop + dy, 0, maxY);

      host.style.left = `${x}px`;
      host.style.top = `${y}px`;
    };

    const onUp = async () => {
      if (!dragging) return;
      dragging = false;
      await savePosition({
        x: parseInt(host.style.left, 10) || 0,
        y: parseInt(host.style.top, 10) || 0
      });
    };

    // Double-click to reset position
    const onDblClick = async () => {
      host.style.left = "16px";
      host.style.top = "16px";
      await savePosition({ x: 16, y: 16 });
    };

    for (const handle of [dragHandle, miniView]) {
      handle.addEventListener("pointerdown", onDown);
      handle.addEventListener("pointermove", onMove);
      handle.addEventListener("pointerup", onUp);
      handle.addEventListener("pointercancel", onUp);
      handle.addEventListener("dblclick", onDblClick);
    }

    window.addEventListener("resize", updateBounds);

    return () => {
      window.removeEventListener("resize", updateBounds);
    };
  }

  async function getInitialState() {
    const [localData, syncData] = await Promise.all([
      chrome.storage.local.get(STORAGE_KEY),
      chrome.storage.sync.get(SETTINGS_KEY).catch(() => ({}))
    ]);
    const settingsRaw = syncData[SETTINGS_KEY] ?? localData[SETTINGS_KEY];
    return {
      state: normalizeState(localData[STORAGE_KEY]),
      settings: normalizeSettings(settingsRaw)
    };
  }

  async function sendMessageSafe(message) {
    try {
      return await chrome.runtime.sendMessage(message);
    } catch {
      return null;
    }
  }

  (async () => {
    const injected = injectWidget();
    if (!injected) return;

    const { host, shadow } = injected;
    const wrap = shadow.getElementById("wrap");
    const miniView = shadow.getElementById("miniView");
    const miniDot = shadow.getElementById("miniDot");
    const miniTime = shadow.getElementById("miniTime");
    const miniExpand = shadow.getElementById("miniExpand");
    const dragHandle = shadow.getElementById("drag");
    const modePill = shadow.getElementById("modePill");
    const barTitle = shadow.getElementById("barTitle");
    const timerDisplay = shadow.getElementById("timerDisplay");
    const timeText = shadow.getElementById("timeText");
    const ringProgress = shadow.getElementById("ringProgress");
    const taskInput = shadow.getElementById("taskInput");
    const pomoDots = shadow.getElementById("pomoDots");
    const mainBtn = shadow.getElementById("mainBtn");
    const skipBtn = shadow.getElementById("skipBtn");
    const stopBtn = shadow.getElementById("stopBtn");
    const settingsBtn = shadow.getElementById("settingsBtn");
    const minimizeBtn = shadow.getElementById("minimizeBtn");
    const settingsPanel = shadow.getElementById("settingsPanel");
    const setWork = shadow.getElementById("setWork");
    const setBreak = shadow.getElementById("setBreak");
    const setLongBreak = shadow.getElementById("setLongBreak");
    const setSound = shadow.getElementById("setSound");
    const setAutoBreaks = shadow.getElementById("setAutoBreaks");
    const setDark = shadow.getElementById("setDark");

    const cleanup = await setupDrag(host, dragHandle, miniView);

    let { state: cachedState, settings: cachedSettings } = await getInitialState();
    let widgetState = await loadWidgetState();
    let advanceInFlight = false;

    function applyTheme() {
      const isDark = cachedSettings.theme === "dark" ||
        (cachedSettings.theme === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches);
      wrap.classList.toggle("dark", isDark);
      setDark.checked = isDark;
    }

    function applyMinimized() {
      wrap.classList.toggle("minimized", widgetState.minimized);
    }

    function applyVisibility() {
      host.style.display = widgetState.hidden ? "none" : "block";
    }

    function renderSettings() {
      setWork.value = cachedSettings.workMinutes;
      setBreak.value = cachedSettings.breakMinutes;
      setLongBreak.value = cachedSettings.longBreakMinutes;
      setSound.checked = cachedSettings.soundEnabled;
      setAutoBreaks.checked = cachedSettings.autoStartBreaks;
      settingsPanel.classList.toggle("hidden", !widgetState.showSettings);
      settingsBtn.classList.toggle("active", widgetState.showSettings);
    }

    function render() {
      const state = cachedState;
      const settings = cachedSettings;
      if (!state || !settings) return;

      const active = !!state.active;
      const paused = state.pausedRemainingMs != null;
      const mode = state.mode || "work";
      const displayMode = active ? mode : "work";
      const pomoCount = (active ? state.pomodorosUntilLongBreak : settings.pomodorosUntilLongBreak) || 4;

      let remainingMs = 0;
      let totalMs = state.workMinutes * 60 * 1000;

      if (active) {
        if (paused) {
          remainingMs = state.pausedRemainingMs;
        } else if (state.endAt) {
          remainingMs = Math.max(0, state.endAt - Date.now());
        }

        if (mode === "break") {
          const isLongBreak = state.completedPomodoros > 0 &&
            state.completedPomodoros % pomoCount === 0;
          totalMs = (isLongBreak ? state.longBreakMinutes : state.breakMinutes) * 60 * 1000;
        }
      } else {
        remainingMs = settings.workMinutes * 60 * 1000;
        totalMs = settings.workMinutes * 60 * 1000;
      }

      const timeStr = formatMs(remainingMs);

      // Mini view
      miniTime.textContent = timeStr;
      miniDot.className = `mini-dot ${displayMode === "break" ? "break" : ""} ${paused ? "paused" : ""}`;
      if (!active) miniDot.classList.add("paused");

      // Mode pill
      if (!active) {
        modePill.textContent = "Idle";
        modePill.className = "pill idle";
      } else {
        modePill.textContent = mode === "break" ? "Break" : "Focus";
        modePill.className = `pill ${mode === "break" ? "break" : ""}`;
      }

      // Bar title
      barTitle.textContent = state.currentTask || "Focus Timer";

      // Timer display
      timerDisplay.className = `timer-display ${displayMode === "break" ? "break" : ""}`;
      timeText.textContent = timeStr;

      // Progress ring
      const progress = active ? (1 - remainingMs / totalMs) : 0;
      const offset = RING_CIRCUMFERENCE * (1 - progress);
      ringProgress.style.strokeDashoffset = offset;

      // Task input
      if (document.activeElement !== taskInput && shadow.activeElement !== taskInput) {
        taskInput.value = state.currentTask || "";
      }

      // Pomodoro dots
      const completed = state.completedPomodoros % pomoCount;
      let dotsHtml = "";
      for (let i = 0; i < pomoCount; i++) {
        dotsHtml += `<span class="pomo-dot ${i < completed ? "filled" : ""}" aria-label="${i < completed ? "Completed" : "Not completed"}"></span>`;
      }
      pomoDots.innerHTML = dotsHtml;

      // Buttons
      const stopBlocked = active && settings.strictMode && mode === "work";
      if (!active) {
        mainBtn.textContent = "Start";
        mainBtn.className = "btn btn-primary";
        mainBtn.setAttribute("aria-label", "Start timer");
        skipBtn.classList.add("hidden");
        stopBtn.classList.add("hidden");
        stopBtn.disabled = false;
        stopBtn.title = "Stop";
      } else if (paused) {
        mainBtn.textContent = "Resume";
        mainBtn.className = `btn btn-primary ${mode === "break" ? "break" : ""}`;
        mainBtn.setAttribute("aria-label", "Resume timer");
        skipBtn.classList.remove("hidden");
        stopBtn.classList.remove("hidden");
        stopBtn.disabled = stopBlocked;
        stopBtn.title = stopBlocked ? "Strict mode is enabled during focus" : "Stop";
      } else {
        mainBtn.textContent = "Pause";
        mainBtn.className = `btn btn-primary ${mode === "break" ? "break" : ""}`;
        mainBtn.setAttribute("aria-label", "Pause timer");
        skipBtn.classList.remove("hidden");
        stopBtn.classList.remove("hidden");
        stopBtn.disabled = stopBlocked;
        stopBtn.title = stopBlocked ? "Strict mode is enabled during focus" : "Stop";
      }

      applyTheme();
      applyMinimized();
      applyVisibility();
      renderSettings();
    }

    async function advanceSegmentIfNeeded() {
      if (advanceInFlight) return;
      if (!cachedState?.active) return;
      if (!cachedState.endAt) return;
      if (cachedState.endAt > Date.now()) return;

      advanceInFlight = true;
      const res = await sendMessageSafe({ type: "ADVANCE_SEGMENT" });
      if (res?.ok && res.state) {
        cachedState = normalizeState(res.state);
      }
      advanceInFlight = false;
    }

    async function saveSettingsToBackground() {
      const settings = {
        workMinutes: parseInt(setWork.value) || 25,
        breakMinutes: parseInt(setBreak.value) || 5,
        longBreakMinutes: parseInt(setLongBreak.value) || 15,
        soundEnabled: setSound.checked,
        autoStartBreaks: setAutoBreaks.checked,
        theme: setDark.checked ? "dark" : "light"
      };

      const res = await sendMessageSafe({ type: "SET_SETTINGS", settings });
      if (res?.settings) {
        cachedSettings = normalizeSettings(res.settings);
        render();
      }
    }

    // Event listeners
    mainBtn.addEventListener("click", async () => {
      if (!cachedState?.active) {
        const res = await sendMessageSafe({
          type: "START_SESSION",
          workMinutes: cachedSettings.workMinutes,
          breakMinutes: cachedSettings.breakMinutes,
          longBreakMinutes: cachedSettings.longBreakMinutes,
          task: taskInput.value,
          seedUrl: location.href
        });
        if (res?.state) cachedState = normalizeState(res.state);
      } else if (cachedState.pausedRemainingMs != null) {
        const res = await sendMessageSafe({ type: "RESUME" });
        if (res?.state) cachedState = normalizeState(res.state);
      } else {
        const res = await sendMessageSafe({ type: "PAUSE" });
        if (res?.state) cachedState = normalizeState(res.state);
      }
      render();
    });

    skipBtn.addEventListener("click", async () => {
      const res = await sendMessageSafe({ type: "SKIP_SEGMENT" });
      if (res?.state) cachedState = normalizeState(res.state);
      render();
    });

    stopBtn.addEventListener("click", async () => {
      const res = await sendMessageSafe({ type: "STOP_SESSION" });
      if (res?.state) cachedState = normalizeState(res.state);
      render();
    });

    taskInput.addEventListener("change", async () => {
      await sendMessageSafe({ type: "SET_TASK", task: taskInput.value });
    });

    settingsBtn.addEventListener("click", async () => {
      widgetState.showSettings = !widgetState.showSettings;
      await saveWidgetState(widgetState);
      render();
    });

    minimizeBtn.addEventListener("click", async () => {
      widgetState.minimized = true;
      await saveWidgetState(widgetState);
      render();
    });

    miniExpand.addEventListener("click", async (e) => {
      e.stopPropagation();
      widgetState.minimized = false;
      await saveWidgetState(widgetState);
      render();
    });

    // Settings inputs
    [setWork, setBreak, setLongBreak].forEach(input => {
      input.addEventListener("change", saveSettingsToBackground);
    });

    [setSound, setAutoBreaks, setDark].forEach(input => {
      input.addEventListener("change", saveSettingsToBackground);
    });

    // Storage change listener
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && changes[STORAGE_KEY]) {
        cachedState = normalizeState(changes[STORAGE_KEY].newValue);
        render();
      }

      if (area === "local" && changes[WIDGET_STATE_KEY]) {
        widgetState = { ...DEFAULT_WIDGET_STATE, ...(changes[WIDGET_STATE_KEY].newValue || {}) };
        render();
      }

      if (area === "sync" && changes[SETTINGS_KEY]) {
        cachedSettings = normalizeSettings(changes[SETTINGS_KEY].newValue);
        render();
      }
    });

    // Message listener for sound notifications from service worker
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg?.type === "STATE_UPDATED" && msg.playSound && cachedSettings?.soundEnabled) {
        playNotificationSound(cachedSettings?.selectedSound);
      }
      if (msg?.type === "SETTINGS_UPDATED" && msg.settings) {
        cachedSettings = normalizeSettings(msg.settings);
        applyTheme();
        render();
      }
      if (msg?.state) {
        cachedState = normalizeState(msg.state);
        render();
      }
    });

    // System theme change
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      if (cachedSettings?.theme === "auto") {
        applyTheme();
      }
    });

    // Initial render
    render();

    // Tick interval
    setInterval(async () => {
      await advanceSegmentIfNeeded();
      render();
    }, 1000);

    window.addEventListener("unload", cleanup);
  })().catch(() => {
    // Ignore content script errors to avoid breaking pages.
  });
})();
