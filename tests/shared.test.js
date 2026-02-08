const assert = require("assert");
const path = require("path");

require(path.join(__dirname, "..", "shared.js"));

const shared = globalThis.POMODORO_SHARED;

assert.ok(shared, "POMODORO_SHARED should be initialized");
assert.strictEqual(
  shared.DEFAULT_WIDGET_STATE.hidden,
  false,
  "widget state should default to visible"
);
assert.strictEqual(
  shared.DEFAULT_STATE.pomodorosUntilLongBreak,
  4,
  "state should include pomodoro cycle length"
);

assert.strictEqual(
  shared.getDateKey(new Date(2026, 1, 8, 15, 30, 0)),
  "2026-02-08",
  "getDateKey should use local date parts"
);

assert.strictEqual(
  shared.getTodayKey(),
  shared.getDateKey(new Date()),
  "getTodayKey should match local date key"
);

assert.strictEqual(shared.formatMs(0), "00:00", "formatMs should format zero");
assert.strictEqual(shared.formatMs(61000), "01:01", "formatMs should format minutes/seconds");

assert.strictEqual(shared.clamp(5, 1, 10), 5, "clamp should keep in-range value");
assert.strictEqual(shared.clamp(-1, 1, 10), 1, "clamp should enforce min");
assert.strictEqual(shared.clamp(99, 1, 10), 10, "clamp should enforce max");

assert.strictEqual(
  shared.normalizeDomain("https://Example.COM:8080/path?q=1"),
  "example.com",
  "normalizeDomain should normalize full URLs"
);
assert.strictEqual(
  shared.normalizeDomain("*.github.com"),
  "github.com",
  "normalizeDomain should strip wildcard prefixes"
);
assert.strictEqual(
  shared.normalizeDomain("sub.example.com/docs"),
  "sub.example.com",
  "normalizeDomain should strip path fragments"
);
assert.strictEqual(shared.normalizeDomain(""), null, "normalizeDomain should reject empty input");

console.log("shared.test.js: all checks passed");
