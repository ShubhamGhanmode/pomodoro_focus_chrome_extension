// Popup script for Pomodoro Focus extension
// Uses shared.js for constants and utilities

(() => {
    const {
        AVAILABLE_SOUNDS,
        DEFAULT_TEMPLATES,
        DEFAULT_SETTINGS,
        DEFAULT_WIDGET_STATE,
        WIDGET_STATE_KEY,
        formatMs,
        getDateKey,
        getTodayKey,
        normalizeDomain
    } = globalThis.POMODORO_SHARED;

    const RING_CIRCUMFERENCE = 283; // 2 * PI * 45

    let cachedState = null;
    let cachedSettings = null;
    let cachedStats = null;
    let cachedHistory = [];
    let cachedWidgetState = { ...DEFAULT_WIDGET_STATE };
    let tickInterval = null;

    async function ensureStateAndSettings() {
        if (cachedState && cachedSettings) return;
        const res = await loadState();
        if (!res?.ok) {
            const settingsRes = await sendMessage({ type: "GET_SETTINGS" });
            if (settingsRes?.ok) {
                cachedSettings = settingsRes.settings;
            }
        }
        if (!cachedSettings) {
            cachedSettings = { ...DEFAULT_SETTINGS };
        }
    }

    // DOM Elements
    const popup = document.getElementById("popup");
    const widgetToggleBtn = document.getElementById("widgetToggleBtn");
    const settingsToggle = document.getElementById("settingsToggle");
    const syncIndicator = document.getElementById("syncIndicator");
    const timerSection = document.getElementById("timerSection");
    const statsSection = document.getElementById("statsSection");
    const settingsSection = document.getElementById("settingsSection");
    const modeIndicator = document.getElementById("modeIndicator");
    const modeText = document.getElementById("modeText");
    const timerDisplay = document.getElementById("timerDisplay");
    const timerTime = document.getElementById("timerTime");
    const ringProgress = document.getElementById("ringProgress");
    const taskInput = document.getElementById("taskInput");
    const countDots = document.getElementById("countDots");
    const mainBtn = document.getElementById("mainBtn");
    const skipBtn = document.getElementById("skipBtn");
    const stopBtn = document.getElementById("stopBtn");

    // Stats elements
    const todayPomodoros = document.getElementById("todayPomodoros");
    const todayMinutes = document.getElementById("todayMinutes");
    const streakDays = document.getElementById("streakDays");
    const totalPomodoros = document.getElementById("totalPomodoros");
    const goalProgress = document.getElementById("goalProgress");
    const goalFill = document.getElementById("goalFill");
    const chartBars = document.getElementById("chartBars");
    const chartLabels = document.getElementById("chartLabels");

    // History elements
    const historyList = document.getElementById("historyList");
    const exportHistoryBtn = document.getElementById("exportHistoryBtn");
    const clearHistoryBtn = document.getElementById("clearHistoryBtn");

    // Settings elements
    const templateSelect = document.getElementById("templateSelect");
    const workMinutesInput = document.getElementById("workMinutes");
    const breakMinutesInput = document.getElementById("breakMinutes");
    const longBreakMinutesInput = document.getElementById("longBreakMinutes");
    const pomodorosUntilLongBreakInput = document.getElementById("pomodorosUntilLongBreak");
    const dailyGoalInput = document.getElementById("dailyGoal");
    const soundSelect = document.getElementById("soundSelect");
    const previewSoundBtn = document.getElementById("previewSoundBtn");
    const soundEnabledInput = document.getElementById("soundEnabled");
    const notificationsEnabledInput = document.getElementById("notificationsEnabled");
    const autoStartBreaksInput = document.getElementById("autoStartBreaks");
    const autoStartWorkInput = document.getElementById("autoStartWork");
    const persistAllowlistInput = document.getElementById("persistAllowlist");
    const strictModeInput = document.getElementById("strictMode");
    const themeSelect = document.getElementById("themeSelect");
    const allowlistList = document.getElementById("allowlistList");
    const allowlistInput = document.getElementById("allowlistInput");
    const allowlistAddBtn = document.getElementById("allowlistAddBtn");
    const resetStatsBtn = document.getElementById("resetStats");

    function getWeekDays() {
        const days = [];
        const today = new Date();
        for (let i = 6; i >= 0; i--) {
            const d = new Date(today);
            d.setDate(d.getDate() - i);
            days.push({
                key: getDateKey(d),
                label: d.toLocaleDateString("en", { weekday: "short" }).charAt(0),
                isToday: i === 0
            });
        }
        return days;
    }

    function formatDate(isoString) {
        const date = new Date(isoString);
        return date.toLocaleDateString("en", { month: "short", day: "numeric" });
    }

    function formatTime(isoString) {
        const date = new Date(isoString);
        return date.toLocaleTimeString("en", { hour: "numeric", minute: "2-digit" });
    }

    async function sendMessage(msg) {
        try {
            return await chrome.runtime.sendMessage(msg);
        } catch {
            return null;
        }
    }

    async function getActiveTabUrl() {
        try {
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            return tabs?.[0]?.url || null;
        } catch {
            return null;
        }
    }

    async function loadState() {
        const res = await sendMessage({ type: "GET_STATE" });
        if (res?.ok) {
            cachedState = res.state;
            cachedSettings = res.settings;
        }
        return res;
    }

    async function loadStats() {
        const res = await sendMessage({ type: "GET_STATS" });
        if (res?.ok) {
            cachedStats = res.stats;
        }
        return res;
    }

    async function loadTaskHistory() {
        const res = await sendMessage({ type: "GET_TASK_HISTORY" });
        if (res?.ok) {
            cachedHistory = res.history || [];
        }
        return res;
    }

    async function loadSavedAllowlist() {
        const res = await sendMessage({ type: "GET_SAVED_ALLOWLIST" });
        return res?.allowlist || [];
    }

    async function loadWidgetState() {
        const data = await chrome.storage.local.get(WIDGET_STATE_KEY);
        cachedWidgetState = { ...DEFAULT_WIDGET_STATE, ...(data[WIDGET_STATE_KEY] || {}) };
        return cachedWidgetState;
    }

    function renderWidgetToggle() {
        const hidden = Boolean(cachedWidgetState.hidden);
        widgetToggleBtn.classList.toggle("active", hidden);
        widgetToggleBtn.setAttribute("aria-label", hidden ? "Show sticky widget" : "Hide sticky widget");
        widgetToggleBtn.title = hidden ? "Show sticky widget" : "Hide sticky widget";
    }

    async function setWidgetHidden(hidden) {
        cachedWidgetState = { ...cachedWidgetState, hidden: Boolean(hidden) };
        await chrome.storage.local.set({ [WIDGET_STATE_KEY]: cachedWidgetState });
        renderWidgetToggle();
    }

    function applyTheme(theme) {
        if (theme === "auto") {
            const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
            popup.dataset.theme = prefersDark ? "dark" : "light";
        } else {
            popup.dataset.theme = theme;
        }
    }

    function updateDurationInputsState() {
        const isCustom = cachedSettings?.activeTemplate === "custom";
        workMinutesInput.disabled = !isCustom;
        breakMinutesInput.disabled = !isCustom;
        longBreakMinutesInput.disabled = !isCustom;
    }

    function renderTimer() {
        if (!cachedState || !cachedSettings) return;

        const { active, mode, endAt, pausedRemainingMs, completedPomodoros, currentTask } = cachedState;
        const displayMode = active ? mode : "work";
        const workMinutes = active ? cachedState.workMinutes : cachedSettings.workMinutes;
        const breakMinutes = active ? cachedState.breakMinutes : cachedSettings.breakMinutes;
        const longBreakMinutes = active ? cachedState.longBreakMinutes : cachedSettings.longBreakMinutes;
        const pomodorosUntilLongBreak = active
            ? (cachedState.pomodorosUntilLongBreak || cachedSettings.pomodorosUntilLongBreak)
            : cachedSettings.pomodorosUntilLongBreak;
        const { strictMode } = cachedSettings;

        // Mode indicator
        const paused = pausedRemainingMs != null;
        modeIndicator.className = `mode-indicator ${active ? mode : "idle"} ${paused ? "paused" : ""}`;

        // Toggle glow color on timer section
        const timerSec = document.getElementById("timerSection");
        if (timerSec) {
            timerSec.classList.toggle("break-glow", active && mode === "break");
        }

        if (!active) {
            modeText.textContent = "Ready to focus";
        } else if (paused) {
            modeText.textContent = mode === "work" ? "Work (Paused)" : "Break (Paused)";
        } else {
            modeText.textContent = mode === "work" ? "Focus Time" : "Break Time";
        }

        // Timer display
        timerDisplay.className = `timer-display ${displayMode === "break" ? "break" : ""}`;

        let remainingMs = 0;
        let totalMs = workMinutes * 60 * 1000;

        if (active) {
            if (paused) {
                remainingMs = pausedRemainingMs;
            } else if (endAt) {
                remainingMs = Math.max(0, endAt - Date.now());
            }

            if (mode === "break") {
                const isLongBreak = completedPomodoros > 0 && completedPomodoros % pomodorosUntilLongBreak === 0;
                totalMs = (isLongBreak ? longBreakMinutes : breakMinutes) * 60 * 1000;
            }
        } else {
            remainingMs = workMinutes * 60 * 1000;
        }

        timerTime.textContent = formatMs(remainingMs);

        // Progress ring
        const progress = active ? (1 - remainingMs / totalMs) : 0;
        const offset = RING_CIRCUMFERENCE * (1 - progress);
        ringProgress.style.strokeDashoffset = offset;
        ringProgress.style.stroke = displayMode === "break" ? "var(--accent-break)" : "var(--accent-work)";

        // Task input
        taskInput.value = currentTask || "";

        // Pomodoro count dots
        const dotsHtml = [];
        for (let i = 0; i < pomodorosUntilLongBreak; i++) {
            const filled = i < (completedPomodoros % pomodorosUntilLongBreak);
            const isLongBreakDot = i === pomodorosUntilLongBreak - 1 && filled;
            dotsHtml.push(`<span class="count-dot ${filled ? "filled" : ""} ${isLongBreakDot ? "long-break" : ""}"></span>`);
        }
        countDots.innerHTML = dotsHtml.join("");

        // Buttons
        if (!active) {
            mainBtn.textContent = "Start Focus";
            mainBtn.className = "btn btn-primary";
            skipBtn.classList.add("hidden");
            stopBtn.classList.add("hidden");
        } else if (paused) {
            mainBtn.textContent = "Resume";
            mainBtn.className = `btn btn-primary ${mode === "break" ? "break" : ""}`;
            skipBtn.classList.remove("hidden");
            stopBtn.classList.remove("hidden");
            stopBtn.disabled = strictMode && mode === "work";
        } else {
            mainBtn.textContent = "Pause";
            mainBtn.className = `btn btn-primary ${mode === "break" ? "break" : ""}`;
            skipBtn.classList.remove("hidden");
            stopBtn.classList.remove("hidden");
            stopBtn.disabled = strictMode && mode === "work";
        }
    }

    function renderStats() {
        if (!cachedStats || !cachedSettings) return;

        const today = getTodayKey();
        const todayData = cachedStats.dailyStats[today] || { pomodoros: 0, focusMinutes: 0 };

        todayPomodoros.textContent = todayData.pomodoros;
        todayMinutes.textContent = todayData.focusMinutes;
        streakDays.textContent = cachedStats.weeklyStreak;
        totalPomodoros.textContent = cachedStats.totalPomodoros;

        // Goal progress
        const goal = cachedSettings.dailyGoal;
        const progress = Math.min(100, (todayData.pomodoros / goal) * 100);
        goalProgress.textContent = `${todayData.pomodoros}/${goal}`;
        goalFill.style.width = `${progress}%`;

        // Weekly chart
        const weekDays = getWeekDays();
        const maxPomodoros = Math.max(1, ...weekDays.map(d => cachedStats.dailyStats[d.key]?.pomodoros || 0));

        chartBars.innerHTML = weekDays.map(d => {
            const count = cachedStats.dailyStats[d.key]?.pomodoros || 0;
            const height = Math.max(4, (count / maxPomodoros) * 100);
            return `<div class="chart-bar ${d.isToday ? "today" : ""}" style="height: ${height}%" title="${count} pomodoros"></div>`;
        }).join("");

        chartLabels.innerHTML = weekDays.map(d =>
            `<span class="chart-label ${d.isToday ? "today" : ""}">${d.label}</span>`
        ).join("");
    }

    function renderTaskHistory() {
        historyList.textContent = "";

        if (cachedHistory.length === 0) {
            const empty = document.createElement("div");
            empty.className = "history-empty";
            empty.textContent = "No tasks completed yet";
            historyList.appendChild(empty);
            return;
        }

        // Group by date
        const grouped = new Map();
        for (const entry of cachedHistory) {
            const completedAt = new Date(entry.completedAt);
            if (Number.isNaN(completedAt.getTime())) continue;
            const dateKey = getDateKey(completedAt);
            if (!grouped.has(dateKey)) grouped.set(dateKey, []);
            grouped.get(dateKey).push(entry);
        }

        const today = getTodayKey();
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayKey = getDateKey(yesterday);

        for (const [dateKey, entries] of grouped.entries()) {
            let dateLabel = formatDate(entries[0]?.completedAt || "");
            if (dateKey === today) dateLabel = "Today";
            else if (dateKey === yesterdayKey) dateLabel = "Yesterday";

            const dateGroupEl = document.createElement("div");
            dateGroupEl.className = "history-date-group";
            dateGroupEl.textContent = dateLabel;
            historyList.appendChild(dateGroupEl);

            for (const entry of entries) {
                const taskName = entry.task || "(No task name)";
                const time = formatTime(entry.completedAt);

                const itemEl = document.createElement("div");
                itemEl.className = "history-item";

                const taskEl = document.createElement("span");
                taskEl.className = "history-task";
                taskEl.title = taskName;
                taskEl.textContent = taskName;

                const metaEl = document.createElement("span");
                metaEl.className = "history-meta";

                const durationEl = document.createElement("span");
                durationEl.textContent = `${entry.duration}m`;

                const timeEl = document.createElement("span");
                timeEl.textContent = time;

                metaEl.appendChild(durationEl);
                metaEl.appendChild(timeEl);
                itemEl.appendChild(taskEl);
                itemEl.appendChild(metaEl);
                historyList.appendChild(itemEl);
            }
        }
    }

    function renderSettings() {
        if (!cachedSettings) return;

        // Template
        templateSelect.value = cachedSettings.activeTemplate || "standard";

        // Duration inputs
        workMinutesInput.value = cachedSettings.workMinutes;
        breakMinutesInput.value = cachedSettings.breakMinutes;
        longBreakMinutesInput.value = cachedSettings.longBreakMinutes;
        pomodorosUntilLongBreakInput.value = cachedSettings.pomodorosUntilLongBreak;
        dailyGoalInput.value = cachedSettings.dailyGoal;

        // Sound
        soundSelect.value = cachedSettings.selectedSound || "chime";
        soundEnabledInput.checked = cachedSettings.soundEnabled;

        // Other toggles
        notificationsEnabledInput.checked = cachedSettings.notificationsEnabled;
        autoStartBreaksInput.checked = cachedSettings.autoStartBreaks;
        autoStartWorkInput.checked = cachedSettings.autoStartWork;
        persistAllowlistInput.checked = cachedSettings.persistAllowlist;
        strictModeInput.checked = cachedSettings.strictMode;
        themeSelect.value = cachedSettings.theme;

        updateDurationInputsState();
        applyTheme(cachedSettings.theme);
    }

    async function renderAllowlist() {
        const list = await loadSavedAllowlist();
        allowlistList.textContent = "";

        if (list.length === 0) {
            const empty = document.createElement("div");
            empty.className = "allowlist-empty";
            empty.textContent = "No saved domains";
            allowlistList.appendChild(empty);
            return;
        }

        list.forEach((domain) => {
            const item = document.createElement("div");
            item.className = "allowlist-item";

            const domainLabel = document.createElement("span");
            domainLabel.textContent = domain;

            const btn = document.createElement("button");
            btn.type = "button";
            btn.dataset.domain = domain;
            btn.setAttribute("aria-label", `Remove ${domain}`);
            btn.textContent = "×";

            btn.addEventListener("click", async () => {
                const domain = btn.dataset.domain;
                const currentList = await loadSavedAllowlist();
                const newList = currentList.filter(d => d !== domain);
                await sendMessage({ type: "SET_SAVED_ALLOWLIST", allowlist: newList });
                await renderAllowlist();
            });

            item.appendChild(domainLabel);
            item.appendChild(btn);
            allowlistList.appendChild(item);
        });
    }

    async function saveSettings() {
        const settings = {
            workMinutes: parseInt(workMinutesInput.value) || 25,
            breakMinutes: parseInt(breakMinutesInput.value) || 5,
            longBreakMinutes: parseInt(longBreakMinutesInput.value) || 15,
            pomodorosUntilLongBreak: parseInt(pomodorosUntilLongBreakInput.value) || 4,
            dailyGoal: parseInt(dailyGoalInput.value) || 8,
            selectedSound: soundSelect.value,
            soundEnabled: soundEnabledInput.checked,
            notificationsEnabled: notificationsEnabledInput.checked,
            autoStartBreaks: autoStartBreaksInput.checked,
            autoStartWork: autoStartWorkInput.checked,
            persistAllowlist: persistAllowlistInput.checked,
            strictMode: strictModeInput.checked,
            theme: themeSelect.value
        };

        // Show syncing indicator
        syncIndicator.classList.add("syncing");

        const res = await sendMessage({ type: "SET_SETTINGS", settings });
        if (res?.ok) {
            cachedSettings = res.settings;
            applyTheme(cachedSettings.theme);
            renderTimer();
        }

        // Hide syncing indicator after a brief moment
        setTimeout(() => syncIndicator.classList.remove("syncing"), 500);
    }

    function playSound(soundId) {
        const sound = AVAILABLE_SOUNDS.find(s => s.id === soundId);
        if (sound) {
            try {
                const audio = new Audio(chrome.runtime.getURL(sound.file));
                audio.volume = 0.5;
                audio.play().catch(() => { });
            } catch {
                // Ignore sound errors
            }
        }
    }

    // Event Listeners
    widgetToggleBtn.addEventListener("click", async () => {
        await setWidgetHidden(!cachedWidgetState.hidden);
    });

    settingsToggle.addEventListener("click", () => {
        const showSettings = settingsSection.classList.contains("hidden");
        settingsSection.classList.toggle("hidden", !showSettings);
        statsSection.classList.toggle("hidden", showSettings);
        settingsToggle.classList.toggle("active", showSettings);

        if (showSettings) {
            renderSettings();
            renderAllowlist();
        }
    });

    mainBtn.addEventListener("click", async () => {
        await ensureStateAndSettings();
        if (!cachedState?.active) {
            // Start session
            const seedUrl = await getActiveTabUrl();
            const res = await sendMessage({
                type: "START_SESSION",
                workMinutes: cachedSettings.workMinutes,
                breakMinutes: cachedSettings.breakMinutes,
                longBreakMinutes: cachedSettings.longBreakMinutes,
                task: taskInput.value,
                seedUrl
            });
            if (res?.ok) {
                cachedState = res.state;
                renderTimer();
            }
        } else if (cachedState.pausedRemainingMs != null) {
            // Resume
            const res = await sendMessage({ type: "RESUME" });
            if (res?.ok) {
                cachedState = res.state;
                renderTimer();
            }
        } else {
            // Pause
            const res = await sendMessage({ type: "PAUSE" });
            if (res?.ok) {
                cachedState = res.state;
                renderTimer();
            }
        }
    });

    skipBtn.addEventListener("click", async () => {
        const res = await sendMessage({ type: "SKIP_SEGMENT" });
        if (res?.ok) {
            cachedState = res.state;
            renderTimer();
        }
    });

    stopBtn.addEventListener("click", async () => {
        if (cachedSettings?.strictMode && cachedState?.mode === "work") {
            return; // Blocked in strict mode during work
        }

        const res = await sendMessage({ type: "STOP_SESSION" });
        if (res?.ok) {
            cachedState = res.state;
            renderTimer();
            await loadStats();
            await loadTaskHistory();
            renderStats();
            renderTaskHistory();
        }
    });

    taskInput.addEventListener("change", async () => {
        await sendMessage({ type: "SET_TASK", task: taskInput.value });
    });

    // Template selector
    templateSelect.addEventListener("change", async () => {
        const templateId = templateSelect.value;
        const res = await sendMessage({ type: "APPLY_TEMPLATE", templateId });
        if (res?.ok) {
            cachedSettings = res.settings;
            renderSettings();
            renderTimer();
        }
    });

    // Sound preview
    previewSoundBtn.addEventListener("click", () => {
        playSound(soundSelect.value);
    });

    // Sound selector change
    soundSelect.addEventListener("change", saveSettings);

    // Export task history
    exportHistoryBtn.addEventListener("click", async () => {
        const res = await sendMessage({ type: "EXPORT_TASK_HISTORY" });
        if (res?.ok && res.exportData) {
            const blob = new Blob([res.exportData], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `pomodoro-history-${getTodayKey()}.json`;
            a.click();
            URL.revokeObjectURL(url);
        }
    });

    // Clear task history
    clearHistoryBtn.addEventListener("click", async () => {
        if (confirm("Are you sure you want to clear all task history?")) {
            await sendMessage({ type: "CLEAR_TASK_HISTORY" });
            cachedHistory = [];
            renderTaskHistory();
        }
    });

    // Settings input change handlers
    const settingsInputs = [
        workMinutesInput, breakMinutesInput, longBreakMinutesInput,
        pomodorosUntilLongBreakInput, dailyGoalInput,
        soundEnabledInput, notificationsEnabledInput,
        autoStartBreaksInput, autoStartWorkInput,
        persistAllowlistInput, strictModeInput, themeSelect
    ];

    settingsInputs.forEach(input => {
        input.addEventListener("change", saveSettings);
    });

    allowlistAddBtn.addEventListener("click", async () => {
        const domain = normalizeDomain(allowlistInput.value);
        if (!domain) return;

        const currentList = await loadSavedAllowlist();
        if (!currentList.includes(domain)) {
            await sendMessage({ type: "SET_SAVED_ALLOWLIST", allowlist: [...currentList, domain] });
        }

        allowlistInput.value = "";
        await renderAllowlist();
    });

    allowlistInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
            allowlistAddBtn.click();
        }
    });

    resetStatsBtn.addEventListener("click", async () => {
        if (confirm("Are you sure you want to reset all statistics? This cannot be undone.")) {
            await chrome.storage.local.remove("focusStats");
            await loadStats();
            renderStats();
        }
    });

    // Storage change listener
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === "local") {
            if (changes.focusState) {
                cachedState = changes.focusState.newValue;
                renderTimer();
            }

            if (changes.focusStats) {
                cachedStats = changes.focusStats.newValue;
                renderStats();
            }

            if (changes.taskHistory) {
                cachedHistory = changes.taskHistory.newValue || [];
                renderTaskHistory();
            }

            if (changes.focusWidgetState) {
                cachedWidgetState = { ...DEFAULT_WIDGET_STATE, ...(changes.focusWidgetState.newValue || {}) };
                renderWidgetToggle();
            }
        }

        if (area === "sync") {
            if (changes.focusSettings) {
                cachedSettings = changes.focusSettings.newValue;
                applyTheme(cachedSettings.theme);
                renderTimer();
                renderSettings();
            }
        }
    });

    // Theme change listener
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
        if (cachedSettings?.theme === "auto") {
            applyTheme("auto");
        }
    });

    // Initialize
    (async () => {
        await loadState();
        await loadStats();
        await loadTaskHistory();
        await loadWidgetState();

        renderTimer();
        renderStats();
        renderTaskHistory();
        renderWidgetToggle();
        applyTheme(cachedSettings?.theme || "light");

        // Update timer every second
        tickInterval = setInterval(() => {
            if (cachedState?.active && !cachedState.pausedRemainingMs) {
                renderTimer();
            }
        }, 1000);
    })();

    // Cleanup
    window.addEventListener("unload", () => {
        if (tickInterval) clearInterval(tickInterval);
    });
})();
