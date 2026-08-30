# Checkpoints: native-foundation

Active module: `native-foundation`. Spec: `SPEC-native-foundation.md`. Plan: `tasks/plan.md`.

Evidence images live under `.artifacts/` or system temp paths and stay out of Git.

## Approvals log

- 2026-08-30: human approved the spec (recorded in spec).
- 2026-08-30: human ran the privileged Xcode license/first-launch step and said "Let's run it", approving plan execution.
- 2026-08-30: human approved the simulator equivalent for success criterion 3: iPhone 17 Pro on iOS 27.0 replaces iPhone 16 Pro on iOS 26.6. No iOS 26.6 runtime or iPhone 16 Pro device exists on this machine (installed runtimes: iOS 26.5, iOS 27.0).

## T1 - simulator toolchain repair and argent preflight

1. Task id: T1. Acceptance: preflight commands succeed; Argent lists and boots the target; UDID recorded; equivalent approved if iOS 26.6 absent.
2. Author: Fable 5. Delegated agents: none.
3. Files changed: `checkpoints.md` (new), `tasks/plan.md` (new), `tasks/todo.md` (new, T1 items updated).
4. Tests and static checks: none applicable (no application code). Toolchain evidence:
   - `xcode-select -p` -> `/Applications/Xcode.app/Contents/Developer`
   - `xcodebuild -version` -> Xcode 26.6 (17F113)
   - root cause of the recorded preflight failure: stale xcrun cache plus an unaccepted license; human accepted the license, Fable 5 ran `xcrun --kill-cache`
   - `xcodebuild -license check` exit 0; `xcodebuild -checkFirstLaunchStatus` exit 0
   - `xcrun --find simctl` -> `/Applications/Xcode.app/Contents/Developer/usr/bin/simctl`, exit 0
5. GPT-5.6 Sol review: fail on first pass (field 6 lacked structural and runtime-log entries; booted-state check blocked by verifier sandbox). Remediated, then pass on re-review (codex sessions 01a05130 and follow-up, 2026-08-30). Unresolved risks: none.
6. Argent evidence:
   - `list-devices` returned 30 iOS simulators plus 2 Android AVDs
   - selected target: iPhone 17 Pro, iOS 27.0, UDID `93EEF062-B4DC-4989-AF77-CF47EE2A9816`
   - `boot-device` -> `booted: true`
   - full-resolution screenshot 1206x2622 px at 3x scale = 402x874 pt, matching the spec viewport exactly
   - interaction performed: device boot and baseline screenshot only
   - structural result: not applicable - the app is not installed in T1; first launch and describe happen in T2
   - runtime-log result: not applicable - no app process ran in T1; the debugger log registry gate starts in T2
   - `xcrun simctl list devices booted` confirms the target is Booted (metadata check outside the verifier sandbox)
7. Deviations: simulator target replaced per Approvals log (human approved 2026-08-30).
8. Commit and push: recorded after gates pass.
