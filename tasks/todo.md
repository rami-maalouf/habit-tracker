# Todo: Native Foundation

Module id: `native-foundation`. Plan: `tasks/plan.md`. Spec: `SPEC-native-foundation.md`.

Status legend: `[ ]` not started, `[~]` in progress, `[x]` done (all gates passed, committed, pushed).

Every task ends with: full validation suite, independent GPT-5.6 Sol pass, Argent checkpoint, `checkpoints.md` entry, lowercase conventional commit, push to `origin/main`.

## T1 - simulator toolchain repair and Argent preflight

- [x] HUMAN: accepted the Xcode license (plus `xcrun --kill-cache` cleared the stale cache)
- [x] verify `xcode-select -p`, `xcodebuild -version`, `xcrun --find simctl` all succeed
- [x] HUMAN approved documented equivalent: iPhone 17 Pro on iOS 27.0 (no iOS 26.6 runtime installed); viewport verified 402 x 874 pt
- [x] Argent `list-devices` lists the target; boot succeeded; UDID `93EEF062-B4DC-4989-AF77-CF47EE2A9816` recorded in `checkpoints.md`
- [x] create `checkpoints.md` with the T1 checkpoint
- [x] gates: Sol pass (after one remediation), Argent evidence (device list, boot), commit `chore: establish simulator toolchain and argent preflight`, push

## T2 - dependencies, test harness, repository hygiene

- [x] `bunx expo install @expo/ui expo-blur expo-glass-effect expo-haptics expo-image expo-dev-client`
- [x] `bunx expo install jest-expo jest @testing-library/react-native @types/jest --dev` (RNTL pinned to v13 line, human approved)
- [x] add scripts: `lint`, `typecheck`, `test`, `test:coverage`, `validate`
- [x] `jest.config.js`: jest-expo preset, Bun transform ignore pattern, 90 percent global thresholds, minimal reviewed exclusions
- [x] `.gitignore`: add `.artifacts/` and `dist-validation/`
- [x] `src/testing/render.tsx` helper plus first harness test (plus matcher type shim)
- [x] `bun run validate`, `bunx expo-doctor` 21/21, `git diff --check` pass; dev client built and installed (moved up from T7)
- [x] gates: Sol pass (after remediation), Argent smoke (launch, describe, clean log registry), commit `chore: add foundation dependencies and jest harness`, push

## T3 - route migration to src/app and starter removal

- [x] red: router tests for `/` (title `Ripples`, selectable `Native foundation ready`) and `+not-found` recovery (behavioral press asserts return to `/`)
- [x] `src/app/_layout.tsx` native stack, `src/app/index.tsx`, `src/app/+not-found.tsx`
- [x] tsconfig alias `@/*` -> `./src/*`; jest moduleNameMapper; `app.json` `ios.deploymentTarget: "18.6"`
- [x] deleted `app/`, `components/`, `constants/`, Space Mono font; removed expo-font, expo-web-browser, expo-symbols, expo-status-bar (packages and plugin entries)
- [x] no dead imports, routes, assets; `git diff --check` clean; validate 4/4 at 100 percent coverage
- [x] gates: Sol pass (after behavioral-test remediation), Argent navigation evidence (deep link, recovery tap, clean logs), commit `feat: replace starter with minimal expo router stack in src/app`, push

## T4 - semantic theme tokens

- [x] red: token completeness and invariant tests (semantic colors with web-safe fallbacks, brand accent boundary, 4-pt spacing, Dynamic Type ramp, continuous radii, boxShadow only, motion plus reduced-motion policy, 4.5:1 contrast pairs)
- [x] implement `src/theme/{colors,spacing,typography,radius,shadows,motion,index}.ts`
- [x] only `@/theme` is imported by non-theme code (eslint no-restricted-imports guard); no legacy shadow props
- [x] gates: Sol pass (after cosmetic remediation), Argent smoke, commit `feat: add semantic theme tokens`, push

## T5 - foundation components

- [x] red: component tests (roles, labels, 44-pt targets, icon mapping, adaptive-material fallback selection with identical geometry, glass-probe failure, scheme normalization)
- [x] `app-text.tsx`, `icon.tsx`, `material-geometry.ts`, `adaptive-material{,-opaque,.ios,.android}.tsx`, `src/foundation/accessibility/`
- [x] iOS-only imports only in `.ios.tsx`; missing or throwing glass capability degrades to blur, never an invisible control
- [x] gates: Sol pass (after role-query remediation), Argent smoke, commit `feat: add foundation text, icon, and adaptive material components`, push

## T6 - foundation preview route

- [x] red: tests for seven ordered sections, labeled fixtures, `Action count` behavior, `material=fallback` param, production redirect to `/`
- [x] `src/app/(dev)/foundation-preview.tsx` (guard plus composition only); fixtures and sections in `src/foundation/validation/`; haptic policy module; reduced-motion hook
- [x] `@expo/ui` Host controls: `Primary action`, `Habit enabled`, `Intensity`, `Frequency`, `Note` (plus disabled states and action counter)
- [x] `e2e/argent/native-foundation/foundation-preview-flow.md` flow definitions
- [x] coverage 97.1/93.1/93.0/100 - all four at or above 90
- [x] gates: Sol pass (after three remediation rounds), Argent interactive evidence (deep link, describe, activate, `Action count: 1`, clean logs), commit `feat: add development foundation preview route`, push

## T7 - development client build and full device validation

- [x] dev client built and installed in T2 (`bunx expo run:ios --device <approved UDID>`); rebuild with final config re-verified in T8
- [x] Argent describe of root and preview matches the contract (five controls, states, `Action count` 0 -> 1, at default and AXXL scales)
- [x] light and dark full-resolution captures (top and bottom regions) plus fallback, AXXL, and contrast/motion captures
- [x] HUMAN approved all seven captures as baselines (recorded in `checkpoints.md`)
- [x] `material=fallback` comparison: blur branch, identical geometry, `Material mode: fallback forced`
- [x] Dynamic Type at accessibility-extra-extra-large (font scale 3.143): all sections reachable, operable, no clipping after the line-height fix; restored to large
- [x] Reduce Motion and Increase Contrast via Settings app (discovery-driven taps); re-checkpointed in-app; both restored and re-verified
- [x] debugger log registry: 0 entries at every checkpoint
- [x] screenshot diff: 0.46 percent, two explained regions, none unexplained
- [x] two visible refinement iterations (dark-mode text color; dynamic type line heights) each with tests and re-captured evidence
- [x] gates: Sol pass, commit, push

## T8 - exports, coverage gate, module closure

- [x] `bunx expo export --platform ios --output-dir dist-validation/ios` succeeds
- [x] `bunx expo export --platform android --output-dir dist-validation/android` succeeds with no iOS-only module resolution
- [x] final `bunx expo run:ios` with `ios.deploymentTarget` 18.6 builds and installs; Argent smoke clean
- [x] `bun run validate` (39/39, coverage 97.19/93.54/93.18/100), `bunx expo-doctor` 21/21, `git diff --check` pass
- [x] `git ls-files` has no private image, `.artifacts/`, `dist-validation/`, `ios/`, or `android/` entry
- [x] all 22 success criteria confirmed in `checkpoints.md`
- [x] gates: Sol pass, Argent smoke, closure commit, push

## Standing human gates

- [x] T1 privileged step (Xcode license) completed by the human
- [x] simulator equivalence approved: iPhone 17 Pro, iOS 27.0
- [x] T7 visual baselines approved (all seven captures)
- [x] plan execution approved ("Let's run it", plus the goal directive to complete the specification)
