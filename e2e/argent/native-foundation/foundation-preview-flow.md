# Argent flow: foundation preview validation

Semantic flow definition for the `native-foundation` module. Steps use semantic targets discovered at run time; coordinates are never stored.

Target: the approved simulator recorded in `checkpoints.md` (iPhone 17 Pro, iOS 27.0). App: `com.ramimaalouf.habittracker` development client with Metro running.

## Flow: preview structural and interaction checkpoint

1. `launch-app` (or `restart-app`) with the bundle id. Expect the root route: header `Ripples`, selectable text `Native foundation ready`.
2. `open-url habittracker://foundation-preview`. Expect header `Foundation preview` and the `Typography` section header.
3. Scroll until `Primary action` is visible (settle swipes plus `await-ui-element`).
4. `describe`. Expected semantic states:
   - `Material: liquid glass` (or `Material: blur` when forced or unsupported)
   - button `Primary action` (enabled)
   - switch `Habit enabled` with value on
   - slider group `Intensity` reporting a percentage value
   - picker button `Frequency` reporting `Daily`
   - text field `Note`
   - button `Disabled action` and switch `Disabled switch` (value off)
   - static text `Action count: 0`
   - status texts: `Appearance:`, `Font scale:`, `Reduce motion:`, `Material mode:`
5. Tap `Primary action` using coordinates from the current `describe` result only.
6. `await-ui-element` text: `Action count: 1`.
7. `debugger-log-registry`: no authored warning, error, or unhandled rejection.
8. Capture a screenshot when pixels changed (`scale: 1`, `includeImageInContext: false` for baselines).

## Flow: forced fallback comparison

1. `open-url habittracker://foundation-preview?material=fallback`.
2. Expect `Material: blur` with the same surface bounds, radius, padding, and content order as the primary flow, and `Material mode: fallback forced` in the accessibility section.

## Flow: unmatched route recovery

1. `open-url habittracker://this-route-does-not-exist`.
2. Expect `Not found` title, `This screen does not exist.`, and link `Go to the home screen`.
3. Tap the link (discovered coordinates). Expect the root route with no stale back entry.
