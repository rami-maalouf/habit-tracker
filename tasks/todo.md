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

- [ ] red: token completeness and invariant tests (semantic colors with web-safe fallbacks, brand accent boundary, 4-pt spacing, Dynamic Type ramp, continuous radii, boxShadow only, motion plus reduced-motion policy)
- [ ] implement `src/theme/{colors,spacing,typography,radius,shadows,motion,index}.ts`
- [ ] only `@/theme` is imported by non-theme code; no legacy shadow or elevation props
- [ ] gates: Sol pass, Argent smoke, commit `feat: add semantic theme tokens`, push

## T5 - foundation components

- [ ] red: component tests (roles, labels, 44-pt targets, icon mapping, adaptive-material fallback selection with identical geometry)
- [ ] `app-text.tsx`, `icon.tsx`, `adaptive-material{,.ios,.android}.tsx`, `src/foundation/accessibility/`
- [ ] iOS-only imports only in `.ios.tsx`; missing glass or blur never yields an invisible control
- [ ] gates: Sol pass, Argent smoke, commit `feat: add foundation text, icon, and adaptive material components`, push

## T6 - foundation preview route

- [ ] red: tests for seven ordered sections, labeled fixtures, `Action count` behavior, `material=fallback` param, production redirect to `/`
- [ ] `src/app/(dev)/foundation-preview.tsx` (guard plus composition only); fixtures and sections in `src/foundation/validation/`; haptic policy module
- [ ] `@expo/ui` Host controls: `Primary action`, `Habit enabled`, `Intensity`, `Frequency`, `Note`
- [ ] `e2e/argent/native-foundation/` flow definitions
- [ ] coverage still at or above 90 percent on all four metrics
- [ ] gates: Sol pass, Argent interactive evidence (deep link, activate, `Action count: 1`, screenshot), commit `feat: add development foundation preview route`, push

## T7 - development client build and full device validation

- [ ] `bunx expo run:ios --device "iPhone 16 Pro"` installs and launches dev client (`com.ramimaalouf.habittracker`)
- [ ] Argent describe of root and preview matches the contract (five controls, states, `Action count`)
- [ ] light and dark full-resolution captures of every preview section
- [ ] HUMAN: review first captures and approve as baselines (recorded in `checkpoints.md`)
- [ ] `material=fallback` geometry and contrast comparison on the same simulator
- [ ] Dynamic Type at accessibility-extra-extra-large: all sections reachable, no clipping; restore to large
- [ ] Reduce Motion and Increase Contrast via Settings app (discovery-driven taps only); re-checkpoint; restore settings
- [ ] debugger log registry: no authored warning, error, or unhandled rejection; upstream warnings linked and HUMAN approved
- [ ] screenshot diff: no unexplained changed region
- [ ] gates: Sol pass, commit `chore: record device validation baseline and checkpoint`, push

## T8 - exports, coverage gate, module closure

- [ ] `bunx expo export --platform ios --output-dir dist-validation/ios` succeeds
- [ ] `bunx expo export --platform android --output-dir dist-validation/android` succeeds with no iOS-only module resolution
- [ ] `bun run validate`, `bunx expo-doctor`, `git diff --check` pass
- [ ] `git ls-files` has no private image, `.artifacts/`, `dist-validation/`, `ios/`, or `android/` entry
- [ ] all 22 success criteria confirmed in `checkpoints.md`
- [ ] gates: Sol pass, Argent smoke, commit `chore: close native-foundation module validation`, push

## Standing human gates

- [ ] T1 privileged commands (license accept, first launch)
- [ ] simulator equivalence decision if the iOS 26.6 runtime is absent
- [ ] T7 visual baseline approval
- [ ] approval of this plan and todo before any implementation begins
