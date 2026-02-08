// Import shared constants and utilities
importScripts("shared.js");

const {
  STORAGE_KEY,
  SETTINGS_KEY,
  STATS_KEY,
  TASK_HISTORY_KEY,
  SAVED_ALLOWLIST_KEY,
  BLOCKED_KEY,
  DNR_RULE_ID,
  ALARM_NAME,
  AVAILABLE_SOUNDS,
  DEFAULT_TEMPLATES,
  DEFAULT_STATE,
  DEFAULT_SETTINGS,
  DEFAULT_STATS,
  MAX_TASK_HISTORY,
  getDateKey,
  getTodayKey,
  normalizeDomain
} = globalThis.POMODORO_SHARED;

// Helper functions for allowlist
function shouldAddWww(domain) {
  if (!domain.includes(".")) return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(domain)) return false;
  if (domain.includes(":")) return false;
  return true;
}

function expandAllowlist(list) {
  const out = new Set();
  for (const entry of list || []) {
    const domain = normalizeDomain(entry);
    if (!domain) continue;
    out.add(domain);
    if (shouldAddWww(domain)) {
      if (domain.startsWith("www.")) {
        out.add(domain.slice(4));
      } else {
        out.add(`www.${domain}`);
      }
    }
  }
  return Array.from(out);
}

function normalizeAllowlist(list) {
  const out = new Set();
  for (const entry of list || []) {
    const domain = normalizeDomain(entry);
    if (domain) out.add(domain);
  }
  return Array.from(out);
}

function normalizeState(state) {
  const merged = { ...DEFAULT_STATE, ...(state || {}) };
  merged.allowlist = normalizeAllowlist(merged.allowlist);
  return merged;
}

function normalizeSettings(settings) {
  return { ...DEFAULT_SETTINGS, ...(settings || {}) };
}

function normalizeStats(stats) {
  return { ...DEFAULT_STATS, ...(stats || {}) };
}

function isStrictModeStopBlocked(state, settings) {
  return Boolean(state?.active && settings?.strictMode && state?.mode === "work");
}

// State management (local storage)
async function getState() {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  return normalizeState(data[STORAGE_KEY]);
}

async function setState(state) {
  const normalized = normalizeState(state);
  await chrome.storage.local.set({ [STORAGE_KEY]: normalized });
  return normalized;
}

// Settings management (sync storage for cross-device sync)
async function getSettings() {
  const data = await chrome.storage.sync.get(SETTINGS_KEY);
  return normalizeSettings(data[SETTINGS_KEY]);
}

async function setSettings(settings) {
  const normalized = normalizeSettings(settings);
  await chrome.storage.sync.set({ [SETTINGS_KEY]: normalized });
  return normalized;
}

// Stats management (local storage due to size)
async function getStats() {
  const data = await chrome.storage.local.get(STATS_KEY);
  return normalizeStats(data[STATS_KEY]);
}

async function setStats(stats) {
  const normalized = normalizeStats(stats);
  await chrome.storage.local.set({ [STATS_KEY]: normalized });
  return normalized;
}

// Task history management
async function getTaskHistory() {
  const data = await chrome.storage.local.get(TASK_HISTORY_KEY);
  return data[TASK_HISTORY_KEY] || [];
}

async function addTaskHistoryEntry(entry) {
  const history = await getTaskHistory();
  history.unshift(entry); // Add to beginning
  // Keep only last MAX_TASK_HISTORY entries
  const trimmed = history.slice(0, MAX_TASK_HISTORY);
  await chrome.storage.local.set({ [TASK_HISTORY_KEY]: trimmed });
  return trimmed;
}

async function clearTaskHistory() {
  await chrome.storage.local.remove(TASK_HISTORY_KEY);
}

// Saved allowlist management
async function getSavedAllowlist() {
  const data = await chrome.storage.local.get(SAVED_ALLOWLIST_KEY);
  const raw = data[SAVED_ALLOWLIST_KEY] || [];
  const normalized = normalizeAllowlist(raw);
  if (raw.length !== normalized.length || raw.some((value, index) => value !== normalized[index])) {
    await chrome.storage.local.set({ [SAVED_ALLOWLIST_KEY]: normalized });
  }
  return normalized;
}

async function setSavedAllowlist(list) {
  await chrome.storage.local.set({ [SAVED_ALLOWLIST_KEY]: normalizeAllowlist(list) });
}

function getDomainFromUrl(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function isDomainAllowed(domain, allowlist) {
  const normalized = normalizeDomain(domain);
  if (!normalized) return false;
  for (const allowed of allowlist || []) {
    if (normalized === allowed) return true;
    if (normalized.endsWith(`.${allowed}`)) return true;
  }
  return false;
}

function getSessionStorageArea() {
  return chrome.storage.session || chrome.storage.local;
}

async function getBlockedTargets() {
  const area = getSessionStorageArea();
  const data = await area.get(BLOCKED_KEY);
  return data[BLOCKED_KEY] || {};
}

async function setBlockedTarget(tabId, url) {
  if (typeof tabId !== "number") return;
  const area = getSessionStorageArea();
  const map = await getBlockedTargets();
  map[String(tabId)] = url;
  await area.set({ [BLOCKED_KEY]: map });
}

async function clearBlockedTarget(tabId) {
  if (typeof tabId !== "number") return;
  const area = getSessionStorageArea();
  const map = await getBlockedTargets();
  delete map[String(tabId)];
  await area.set({ [BLOCKED_KEY]: map });
}

async function recordCompletedPomodoro(minutes, taskName) {
  const stats = await getStats();
  const today = getTodayKey();

  stats.totalPomodoros++;
  stats.totalFocusMinutes += minutes;

  if (!stats.dailyStats[today]) {
    stats.dailyStats[today] = { pomodoros: 0, focusMinutes: 0 };
  }
  stats.dailyStats[today].pomodoros++;
  stats.dailyStats[today].focusMinutes += minutes;

  // Update streak
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = getDateKey(yesterday);

  if (stats.lastActiveDate === yesterdayKey || stats.lastActiveDate === today) {
    if (stats.lastActiveDate !== today) {
      stats.weeklyStreak++;
    }
  } else if (stats.lastActiveDate !== today) {
    stats.weeklyStreak = 1;
  }
  stats.lastActiveDate = today;

  // Clean old stats (keep 30 days)
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const cutoffKey = getDateKey(cutoff);
  for (const key of Object.keys(stats.dailyStats)) {
    if (key < cutoffKey) delete stats.dailyStats[key];
  }

  await setStats(stats);

  // Add to task history
  if (taskName) {
    await addTaskHistoryEntry({
      task: taskName,
      completedAt: new Date().toISOString(),
      duration: minutes,
      mode: "work"
    });
  }

  return stats;
}

async function updateBadge(state) {
  if (!state.active) {
    await chrome.action.setBadgeText({ text: "" });
    return;
  }

  let remainingMs = 0;
  if (state.pausedRemainingMs != null) {
    remainingMs = state.pausedRemainingMs;
  } else if (state.endAt) {
    remainingMs = Math.max(0, state.endAt - Date.now());
  }

  const minutes = Math.ceil(remainingMs / 60000);
  const text = minutes > 99 ? "99+" : String(minutes);

  const color = state.mode === "work" ? "#c25a3a" : "#3b6d5c";

  await chrome.action.setBadgeText({ text });
  await chrome.action.setBadgeBackgroundColor({ color });
}

async function showNotification(title, message) {
  const settings = await getSettings();
  if (!settings.notificationsEnabled) return;

  try {
    await chrome.notifications.create({
      type: "basic",
      iconUrl: "icons/128.png",
      title,
      message,
      priority: 2
    });
  } catch (e) {
    console.error("Notification error:", e);
  }
}

async function rebuildDnrRule(stateOverride) {
  const state = stateOverride || (await getState());

  if (!state.active) {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [DNR_RULE_ID]
    });
    return;
  }

  const excludedDomains = expandAllowlist(state.allowlist);

  const rules = [
    {
      id: DNR_RULE_ID,
      priority: 1,
      action: {
        type: "redirect",
        redirect: {
          extensionPath: "/warning.html"
        }
      },
      condition: {
        resourceTypes: ["main_frame"],
        excludedRequestDomains: excludedDomains,
        urlFilter: "|http"
      }
    }
  ];

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [DNR_RULE_ID],
    addRules: rules
  });
}

async function startAlarm() {
  await chrome.alarms.clear(ALARM_NAME);
  await chrome.alarms.create(ALARM_NAME, { periodInMinutes: 0.25 }); // Every 15 seconds
}

async function stopAlarm() {
  await chrome.alarms.clear(ALARM_NAME);
}

async function stopSession(state, settings, senderTabId = null) {
  if (!state.active) {
    return state;
  }

  // Save allowlist if enabled
  if (settings.persistAllowlist && state.allowlist.length > 0) {
    const saved = await getSavedAllowlist();
    const merged = normalizeAllowlist([...saved, ...state.allowlist]);
    await setSavedAllowlist(merged);
  }

  state.active = false;
  state.endAt = null;
  state.pausedRemainingMs = null;
  state.allowlist = [];
  state.completedPomodoros = 0;
  state.currentTask = "";

  const next = await setState(state);
  await rebuildDnrRule(next);
  await updateBadge(next);
  await stopAlarm();

  if (typeof senderTabId === "number") {
    await clearBlockedTarget(senderTabId);
  }

  return next;
}

async function getPreferredSoundTabId(sourceTabId = null) {
  if (typeof sourceTabId === "number") {
    return sourceTabId;
  }

  try {
    const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    const activeTabId = tabs?.[0]?.id;
    return typeof activeTabId === "number" ? activeTabId : null;
  } catch {
    return null;
  }
}

async function broadcastStateUpdate(nextState, playSoundTabId = null) {
  try {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (typeof tab.id !== "number") continue;
      try {
        await chrome.tabs.sendMessage(tab.id, {
          type: "STATE_UPDATED",
          state: nextState,
          playSound: playSoundTabId != null && tab.id === playSoundTabId
        });
      } catch {
        // Tab might not have content script
      }
    }
  } catch {
    // Ignore broadcast errors
  }
}

let segmentAdvanceInFlight = null;

async function advanceSegmentIfDue(sourceTabId = null) {
  if (segmentAdvanceInFlight) {
    return segmentAdvanceInFlight;
  }

  segmentAdvanceInFlight = (async () => {
    const state = await getState();
    await updateBadge(state);

    if (!(state.active && state.endAt && state.endAt <= Date.now() && state.pausedRemainingMs == null)) {
      return state;
    }

    return handleSegmentEnd(state, sourceTabId);
  })().finally(() => {
    segmentAdvanceInFlight = null;
  });

  return segmentAdvanceInFlight;
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM_NAME) return;
  await advanceSegmentIfDue();
});

async function handleSegmentEnd(state, sourceTabId = null) {
  const settings = await getSettings();
  const wasWork = state.mode === "work";

  if (wasWork) {
    // Record completed pomodoro with task name
    await recordCompletedPomodoro(state.workMinutes, state.currentTask);
    state.completedPomodoros++;
    state.totalCompletedToday++;

    // Determine break type
    const pomoCycleLength = state.pomodorosUntilLongBreak || settings.pomodorosUntilLongBreak;
    const isLongBreak = state.completedPomodoros % pomoCycleLength === 0;
    const breakMinutes = isLongBreak ? state.longBreakMinutes : state.breakMinutes;

    state.mode = "break";
    state.endAt = Date.now() + breakMinutes * 60 * 1000;

    const breakType = isLongBreak ? "Long break" : "Break";
    await showNotification("🎉 Pomodoro Complete!", `${breakType} time! You've completed ${state.completedPomodoros} pomodoro${state.completedPomodoros > 1 ? 's' : ''}.`);

    if (!settings.autoStartBreaks) {
      state.pausedRemainingMs = breakMinutes * 60 * 1000;
      state.endAt = null;
    }
  } else {
    // Break ended
    state.mode = "work";
    state.endAt = Date.now() + state.workMinutes * 60 * 1000;

    await showNotification("⏰ Break Over!", "Time to focus! Let's start another pomodoro.");

    if (!settings.autoStartWork) {
      state.pausedRemainingMs = state.workMinutes * 60 * 1000;
      state.endAt = null;
    }
  }

  const next = await setState(state);
  await updateBadge(next);

  const playSoundTabId = await getPreferredSoundTabId(sourceTabId);
  await broadcastStateUpdate(next, playSoundTabId);
  return next;
}

chrome.runtime.onInstalled.addListener(async () => {
  await rebuildDnrRule();
  const state = await getState();
  await updateBadge(state);
  if (state.active) await startAlarm();
});

chrome.runtime.onStartup.addListener(async () => {
  await rebuildDnrRule();
  const state = await getState();
  await updateBadge(state);
  if (state.active) await startAlarm();
});

chrome.webNavigation.onBeforeNavigate.addListener(
  async (details) => {
    if (details.frameId !== 0) return;
    const state = await getState();
    if (!state.active) return;

    const domain = getDomainFromUrl(details.url);
    if (!domain) return;

    if (isDomainAllowed(domain, expandAllowlist(state.allowlist))) return;

    await setBlockedTarget(details.tabId, details.url);
  },
  { url: [{ schemes: ["http", "https"] }] }
);

// Handle keyboard commands
chrome.commands.onCommand.addListener(async (command) => {
  const state = await getState();
  const settings = await getSettings();

  if (command === "toggle-timer") {
    if (!state.active) {
      // Start session
      const now = Date.now();
      state.active = true;
      state.mode = "work";
      state.workMinutes = settings.workMinutes;
      state.breakMinutes = settings.breakMinutes;
      state.longBreakMinutes = settings.longBreakMinutes;
      state.pomodorosUntilLongBreak = settings.pomodorosUntilLongBreak;
      state.endAt = now + settings.workMinutes * 60 * 1000;
      state.pausedRemainingMs = null;
      state.completedPomodoros = 0;
      state.sessionStartedAt = now;

      const next = await setState(state);
      await rebuildDnrRule(next);
      await updateBadge(next);
      await startAlarm();
    } else if (state.pausedRemainingMs != null) {
      // Resume
      state.endAt = Date.now() + state.pausedRemainingMs;
      state.pausedRemainingMs = null;
      const next = await setState(state);
      await updateBadge(next);
    } else {
      // Pause
      state.pausedRemainingMs = Math.max(0, state.endAt - Date.now());
      state.endAt = null;
      const next = await setState(state);
      await updateBadge(next);
    }
  } else if (command === "stop-session") {
    if (state.active) {
      if (isStrictModeStopBlocked(state, settings)) {
        return;
      }
      await stopSession(state, settings);
    }
  }
});

// Clean up blocked targets when tab closes
chrome.tabs.onRemoved.addListener(async (tabId) => {
  await clearBlockedTarget(tabId);
});

// Listen for sync storage changes and broadcast to tabs
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area === "sync" && changes[SETTINGS_KEY]) {
    // Settings changed from another device, broadcast to all tabs
    const newSettings = normalizeSettings(changes[SETTINGS_KEY].newValue);
    try {
      const tabs = await chrome.tabs.query({});
      for (const tab of tabs) {
        try {
          await chrome.tabs.sendMessage(tab.id, { type: "SETTINGS_UPDATED", settings: newSettings });
        } catch {
          // Tab might not have content script
        }
      }
    } catch {
      // Ignore broadcast errors
    }
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const respond = async () => {
    const state = await getState();
    const settings = await getSettings();

    if (msg?.type === "GET_STATE") {
      return { ok: true, state, settings };
    }

    if (msg?.type === "GET_SETTINGS") {
      return { ok: true, settings };
    }

    if (msg?.type === "SET_SETTINGS") {
      const next = await setSettings({ ...settings, ...msg.settings });
      return { ok: true, settings: next };
    }

    if (msg?.type === "GET_STATS") {
      const stats = await getStats();
      return { ok: true, stats };
    }

    if (msg?.type === "GET_TASK_HISTORY") {
      const history = await getTaskHistory();
      return { ok: true, history };
    }

    if (msg?.type === "CLEAR_TASK_HISTORY") {
      await clearTaskHistory();
      return { ok: true };
    }

    if (msg?.type === "EXPORT_TASK_HISTORY") {
      const history = await getTaskHistory();
      return { ok: true, history, exportData: JSON.stringify(history, null, 2) };
    }

    if (msg?.type === "GET_TEMPLATES") {
      return { ok: true, templates: DEFAULT_TEMPLATES, customTemplates: settings.customTemplates || [] };
    }

    if (msg?.type === "APPLY_TEMPLATE") {
      const templateId = msg.templateId;
      const template = DEFAULT_TEMPLATES.find(t => t.id === templateId) ||
        (settings.customTemplates || []).find(t => t.id === templateId);

      if (template && template.work !== null) {
        const newSettings = {
          ...settings,
          activeTemplate: templateId,
          workMinutes: template.work,
          breakMinutes: template.shortBreak,
          longBreakMinutes: template.longBreak
        };
        const next = await setSettings(newSettings);
        return { ok: true, settings: next };
      } else if (templateId === "custom") {
        const next = await setSettings({ ...settings, activeTemplate: "custom" });
        return { ok: true, settings: next };
      }
      return { ok: false, error: "Template not found" };
    }

    if (msg?.type === "GET_AVAILABLE_SOUNDS") {
      return { ok: true, sounds: AVAILABLE_SOUNDS };
    }

    if (msg?.type === "GET_BLOCKED_TARGET") {
      const tabId = sender.tab?.id;
      if (typeof tabId !== "number") return { ok: false, target: null };
      const map = await getBlockedTargets();
      return { ok: true, target: map[String(tabId)] || null };
    }

    if (msg?.type === "GET_SAVED_ALLOWLIST") {
      const list = await getSavedAllowlist();
      return { ok: true, allowlist: list };
    }

    if (msg?.type === "SET_SAVED_ALLOWLIST") {
      await setSavedAllowlist(msg.allowlist || []);
      return { ok: true };
    }

    if (msg?.type === "START_SESSION") {
      const now = Date.now();
      const parsedWork = Number(msg.workMinutes);
      const parsedBreak = Number(msg.breakMinutes);
      const parsedLongBreak = Number(msg.longBreakMinutes);
      const workMinutes = Number.isFinite(parsedWork) ? parsedWork : settings.workMinutes;
      const breakMinutes = Number.isFinite(parsedBreak) ? parsedBreak : settings.breakMinutes;
      const longBreakMinutes = Number.isFinite(parsedLongBreak) ? parsedLongBreak : settings.longBreakMinutes;

      state.active = true;
      state.mode = "work";
      state.workMinutes = workMinutes;
      state.breakMinutes = breakMinutes;
      state.longBreakMinutes = longBreakMinutes;
      state.pomodorosUntilLongBreak = settings.pomodorosUntilLongBreak;
      state.endAt = now + workMinutes * 60 * 1000;
      state.pausedRemainingMs = null;
      state.completedPomodoros = 0;
      state.totalCompletedToday = 0;
      state.currentTask = msg.task || "";
      state.sessionStartedAt = now;

      // Load saved allowlist if enabled
      if (settings.persistAllowlist) {
        const saved = await getSavedAllowlist();
        state.allowlist = normalizeAllowlist([...saved]);
      }

      if (msg.seedUrl) {
        const seed = getDomainFromUrl(msg.seedUrl);
        if (seed) {
          state.allowlist = normalizeAllowlist([
            ...state.allowlist,
            ...expandAllowlist([seed])
          ]);
        }
      }

      const next = await setState(state);
      await rebuildDnrRule(next);
      await updateBadge(next);
      await startAlarm();
      return { ok: true, state: next };
    }

    if (msg?.type === "STOP_SESSION") {
      if (isStrictModeStopBlocked(state, settings)) {
        return {
          ok: false,
          error: "Strict mode prevents stopping during an active work segment.",
          state
        };
      }
      const next = await stopSession(state, settings, sender.tab?.id);
      return { ok: true, state: next };
    }

    if (msg?.type === "PAUSE") {
      if (state.active && state.endAt) {
        state.pausedRemainingMs = Math.max(0, state.endAt - Date.now());
        state.endAt = null;
      }
      const next = await setState(state);
      await updateBadge(next);
      return { ok: true, state: next };
    }

    if (msg?.type === "RESUME") {
      if (state.active && state.pausedRemainingMs != null) {
        state.endAt = Date.now() + state.pausedRemainingMs;
        state.pausedRemainingMs = null;
      }
      const next = await setState(state);
      await updateBadge(next);
      return { ok: true, state: next };
    }

    if (msg?.type === "ADVANCE_SEGMENT") {
      const next = await advanceSegmentIfDue(sender.tab?.id);
      return { ok: true, state: next };
    }

    if (msg?.type === "SKIP_SEGMENT") {
      if (state.active) {
        const wasWork = state.mode === "work";
        const pomoCycleLength = state.pomodorosUntilLongBreak || settings.pomodorosUntilLongBreak;
        const isLongBreak = wasWork && (state.completedPomodoros + 1) % pomoCycleLength === 0;

        if (wasWork) {
          state.completedPomodoros++;
          const breakMinutes = isLongBreak ? state.longBreakMinutes : state.breakMinutes;
          state.mode = "break";
          state.endAt = Date.now() + breakMinutes * 60 * 1000;
          state.pausedRemainingMs = null;
        } else {
          state.mode = "work";
          state.endAt = Date.now() + state.workMinutes * 60 * 1000;
          state.pausedRemainingMs = null;
        }

        const next = await setState(state);
        await updateBadge(next);
        return { ok: true, state: next };
      }
      return { ok: true, state };
    }

    if (msg?.type === "SET_TASK") {
      state.currentTask = msg.task || "";
      const next = await setState(state);
      return { ok: true, state: next };
    }

    if (msg?.type === "ADD_ALLOW") {
      const domain = msg.domain || getDomainFromUrl(msg.url);
      if (domain) {
        state.allowlist = normalizeAllowlist([
          ...state.allowlist,
          ...expandAllowlist([domain])
        ]);
        const next = await setState(state);
        await rebuildDnrRule(next);
        if (sender.tab?.id != null) await clearBlockedTarget(sender.tab.id);
        return { ok: true, state: next };
      }
      return { ok: false, error: "No domain" };
    }

    if (msg?.type === "REMOVE_ALLOW") {
      const domain = normalizeDomain(msg.domain);
      if (domain) {
        state.allowlist = state.allowlist.filter(d => d !== domain && !d.endsWith(`.${domain}`) && domain !== `www.${d}` && d !== `www.${domain}`);
        const next = await setState(state);
        await rebuildDnrRule(next);
        return { ok: true, state: next };
      }
      return { ok: false, error: "No domain" };
    }

    if (msg?.type === "CLEAR_BLOCKED") {
      if (sender.tab?.id != null) await clearBlockedTarget(sender.tab.id);
      return { ok: true };
    }

    if (msg?.type === "PLAY_SOUND") {
      // Sound is played by content script, this is just for coordination
      return { ok: true };
    }

    return { ok: false, error: "Unknown message" };
  };

  respond()
    .then((result) => sendResponse(result))
    .catch((err) => sendResponse({ ok: false, error: err?.message || String(err) }));

  return true;
});
