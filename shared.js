/**
 * Shared constants and utilities for Pomodoro Focus extension
 * This module is imported by sw.js, content.js, and popup.js
 */

(() => {
  if (typeof globalThis !== "undefined" && globalThis.POMODORO_SHARED) {
    return;
  }
  // Storage keys
  const STORAGE_KEY = "focusState";
  const SETTINGS_KEY = "focusSettings";
  const STATS_KEY = "focusStats";
  const TASK_HISTORY_KEY = "taskHistory";
  const SAVED_ALLOWLIST_KEY = "savedAllowlist";
  const POS_KEY = "focusWidgetPos";
  const WIDGET_STATE_KEY = "focusWidgetState";
  const BLOCKED_KEY = "blockedTargets";

  // DNR and Alarm constants
  const DNR_RULE_ID = 1;
  const ALARM_NAME = "pomodoroTick";

  // Available notification sounds
  const AVAILABLE_SOUNDS = [
    { id: "chime", name: "Chime", file: "sounds/chime.mp3" },
    { id: "bell", name: "Bell", file: "sounds/bell.mp3" },
    { id: "digital", name: "Digital", file: "sounds/digital.mp3" },
    { id: "gentle", name: "Gentle", file: "sounds/gentle.mp3" }
  ];

  // Default templates
  const DEFAULT_TEMPLATES = [
    { id: "standard", name: "Standard", work: 25, shortBreak: 5, longBreak: 15 },
    { id: "deep", name: "Deep Work", work: 50, shortBreak: 10, longBreak: 30 },
    { id: "quick", name: "Quick Tasks", work: 15, shortBreak: 3, longBreak: 10 },
    { id: "custom", name: "Custom", work: null, shortBreak: null, longBreak: null }
  ];

  // Default state for focus session
  const DEFAULT_STATE = {
    active: false,
    mode: "work",
    endAt: null,
    pausedRemainingMs: null,
    allowlist: [],
    workMinutes: 25,
    breakMinutes: 5,
    longBreakMinutes: 15,
    pomodorosUntilLongBreak: 4,
    completedPomodoros: 0,
    totalCompletedToday: 0,
    currentTask: "",
    sessionStartedAt: null
  };

  // Default settings (synced across devices)
  const DEFAULT_SETTINGS = {
    workMinutes: 25,
    breakMinutes: 5,
    longBreakMinutes: 15,
    pomodorosUntilLongBreak: 4,
    autoStartBreaks: false,
    autoStartWork: false,
    soundEnabled: true,
    selectedSound: "chime",
    notificationsEnabled: true,
    strictMode: false,
    theme: "light",
    dailyGoal: 8,
    persistAllowlist: false,
    activeTemplate: "standard",
    customTemplates: []
  };

  // Default stats (local only due to size)
  const DEFAULT_STATS = {
    totalPomodoros: 0,
    totalFocusMinutes: 0,
    dailyStats: {},
    weeklyStreak: 0,
    lastActiveDate: null
  };

  // Default widget state
  const DEFAULT_WIDGET_STATE = {
    minimized: false,
    showSettings: false,
    hidden: false
  };

  // Ring circumference for progress indicator
  const RING_CIRCUMFERENCE = 251.2; // 2 * PI * 40
  const RING_CIRCUMFERENCE_POPUP = 283; // 2 * PI * 45

  // Task history limits
  const MAX_TASK_HISTORY = 100;

  /**
   * Format milliseconds as MM:SS
   * @param {number} ms - Milliseconds to format
   * @returns {string} Formatted time string
   */
  function formatMs(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const m = String(Math.floor(total / 60)).padStart(2, "0");
    const s = String(total % 60).padStart(2, "0");
    return `${m}:${s}`;
  }

  /**
   * Clamp a number between min and max
   * @param {number} n - Number to clamp
   * @param {number} min - Minimum value
   * @param {number} max - Maximum value
   * @returns {number} Clamped number
   */
  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  /**
   * Get today's date key in ISO format (YYYY-MM-DD)
   * @returns {string} Today's date key
   */
  function getDateKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function getTodayKey() {
    return getDateKey(new Date());
  }

  /**
   * Normalize domain input
   * @param {string} input - Domain input
   * @returns {string|null} Normalized domain or null
   */
  function normalizeDomain(input) {
    if (!input) return null;
    let value = String(input).trim().toLowerCase();
    if (!value) return null;

    // Strip leading wildcard if provided (e.g. *.example.com)
    value = value.replace(/^\*\./, "");

    // If it looks like a full URL, parse it to extract a hostname
    if (/^[a-z][a-z0-9+.-]*:\/\//.test(value)) {
      try {
        const url = new URL(value);
        if (url.protocol !== "http:" && url.protocol !== "https:") return null;
        value = url.hostname;
      } catch {
        return null;
      }
    } else {
      // Strip any path/query/hash if user pasted a partial URL
      const pathIndex = value.search(/[/?#]/);
      if (pathIndex !== -1) {
        value = value.slice(0, pathIndex);
      }

      // Strip brackets for IPv6 literals
      if (value.startsWith("[") && value.endsWith("]")) {
        value = value.slice(1, -1);
      }

      // Strip port for host:port inputs (but keep IPv6 literals)
      const parts = value.split(":");
      if (parts.length === 2) {
        value = parts[0];
      }
    }

    // Remove trailing dot if present
    value = value.replace(/\.$/, "");

    return value || null;
  }

  /**
   * Normalize state with defaults
   * @param {object} state - State object
   * @returns {object} Normalized state
   */
  function normalizeState(state) {
    return { ...DEFAULT_STATE, ...(state || {}) };
  }

  /**
   * Normalize settings with defaults
   * @param {object} settings - Settings object
   * @returns {object} Normalized settings
   */
  function normalizeSettings(settings) {
    return { ...DEFAULT_SETTINGS, ...(settings || {}) };
  }

  /**
   * Normalize stats with defaults
   * @param {object} stats - Stats object
   * @returns {object} Normalized stats
   */
  function normalizeStats(stats) {
    return { ...DEFAULT_STATS, ...(stats || {}) };
  }

  // Export for use in other scripts (works with importScripts in service worker)
  if (typeof globalThis !== "undefined") {
    globalThis.POMODORO_SHARED = {
      // Storage keys
      STORAGE_KEY,
      SETTINGS_KEY,
      STATS_KEY,
      TASK_HISTORY_KEY,
      SAVED_ALLOWLIST_KEY,
      POS_KEY,
      WIDGET_STATE_KEY,
      BLOCKED_KEY,
      // Constants
      DNR_RULE_ID,
      ALARM_NAME,
      AVAILABLE_SOUNDS,
      DEFAULT_TEMPLATES,
      DEFAULT_STATE,
      DEFAULT_SETTINGS,
      DEFAULT_STATS,
      DEFAULT_WIDGET_STATE,
      RING_CIRCUMFERENCE,
      RING_CIRCUMFERENCE_POPUP,
      MAX_TASK_HISTORY,
      // Functions
      formatMs,
      clamp,
      getTodayKey,
      getDateKey,
      normalizeDomain,
      normalizeState,
      normalizeSettings,
      normalizeStats
    };
  }
})();
