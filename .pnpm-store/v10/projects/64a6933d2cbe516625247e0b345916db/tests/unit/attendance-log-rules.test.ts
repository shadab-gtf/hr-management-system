import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_ATT_LOG_SETTINGS, fixFlags, travelFailure } from "../../src/modules/attendance-log/attendance-log.rules.js";

test("accuracy of 1 m is treated as a mock-location signal", () => {
  const flags = fixFlags(
    {
      accuracyM: 1,
      offline: false,
      clientSignals: {
        perfectAccuracy: false,
        identicalFixes: false,
        missingMotionData: false,
        impossibleJump: false,
        timestampDrift: false,
        strong: false,
        fixCount: 0,
      },
    },
    DEFAULT_ATT_LOG_SETTINGS,
  );

  assert.ok(flags.includes("mock_suspected"));
});

test("previous GPS logs at the equator remain eligible for travel checks", () => {
  const failure = travelFailure(
    {
      latitude: 0,
      longitude: 0,
      accuracyM: 10,
      positionTimestamp: new Date("2024-01-01T00:00:00Z"),
    },
    {
      latitude: 0,
      longitude: 30,
      accuracyM: 10,
      positionTimestamp: new Date("2024-01-01T00:01:00Z"),
    },
    { ...DEFAULT_ATT_LOG_SETTINGS, maxTravelKmh: 250 },
  );

  assert.ok(failure);
  assert.equal(failure?.code, "IMPOSSIBLE_TRAVEL");
});
