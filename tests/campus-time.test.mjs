import test from "node:test";
import assert from "node:assert/strict";
import { atCampus, campusClock, campusDateKey, CAMPUS_TIME_ZONE } from "../js/campus-time.js";
import { pickupSlotsForStore } from "../js/format.js";

test("Asia/Bangkok 17:15 maps to 10:15Z", () => {
  assert.equal(CAMPUS_TIME_ZONE, "Asia/Bangkok");
  const value = atCampus("2026-09-11", "17:15");
  assert.equal(value.toISOString(), "2026-09-11T10:15:00.000Z");
  assert.equal(campusClock(value), "17:15");
});

test("same UTC pickup is produced regardless of process timezone assumptions", () => {
  const a = atCampus("2026-08-27", "08:35").toISOString();
  const b = atCampus("2026-08-27", "08:35").toISOString();
  assert.equal(a, b);
  assert.equal(a, "2026-08-27T01:35:00.000Z");
  assert.equal(campusDateKey(new Date(a)), "2026-08-27");
});

test("overnight slots keep internal dates while labels stay time-only", () => {
  const store = {
    status: "open",
    service_periods: ["breakfast", "lunch", "afternoon_tea"],
  };
  const late = new Date("2026-08-27T15:00:00.000Z"); // 22:00 Bangkok
  const slots = pickupSlotsForStore(store, late);
  assert.ok(slots.every((slot) => /^\d{2}:\d{2}–\d{2}:\d{2}$/.test(slot.label)));
  assert.ok(slots.every((slot) => !/今天|明天|today|tomorrow|\d{4}/i.test(slot.label)));
  const breakfast = slots.find((slot) => slot.label === "08:35–08:45");
  assert.equal(new Date(breakfast.value).toISOString(), "2026-08-28T01:35:00.000Z");
});
