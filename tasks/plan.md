# Plan: Native Foundation (Phase 2)

Module id: `native-foundation`

Spec: `SPEC-native-foundation.md` (approved 2026-08-30)

Status: Draft for human review. Implementation is not authorized until this plan and `tasks/todo.md` are approved.

Author: Fable 5

## 1. Inputs and current state

Observed in the repository on 2026-08-30:

- Expo SDK 57 starter is intact. Routes live in `app/` with a tab demo (`(tabs)/(home)`, `(tabs)/(two)`, `modal.tsx`, `+html.tsx`, `+not-found.tsx`).
- Starter code exists in `components/` (Themed, EditScreenInfo, ExternalLink, StyledText, color-scheme hooks) and `constants/Colors.ts`.
- `assets/fonts/SpaceMono-Regular.ttf` is present.
- `package.json` has no test, lint, typecheck, or validate scripts. None of the approved foundation dependencies are installed.
- `tsconfig.json` is strict and maps `@/*` to `./*` (repository root, not `src/*`).
- `app.json` already sets scheme `habittracker`, bundle id `com.ramimaalouf.habittracker`, and `userInterfaceStyle: automatic`. It does not set `ios.deploymentTarget`.
- `.gitignore` ignores `/ios`, `/android`, and `design/ripples-screenshots/`. It does not ignore `.artifacts/` or `dist-validation/`.
- There is no `src/`, `tests/`, `e2e/`, `jest.config.js`, or `checkpoints.md`.

## 2. Toolchain diagnosis (spec preflight blocker)

The spec records that `xcrun --find simctl` fails. Diagnostics run today confirm the failure and identify the cause:

- `xcode-select -p` returns `/Applications/Xcode.app/Contents/Developer`. `xcodebuild -version` returns Xcode 26.6 (17F113).
- `xcrun --find simctl` fails because `xcodebuild -find simctl` fails first.
- `xcodebuild -find simctl` prints: "You have not agreed to the Xcode license agreements. Please run 'sudo xcodebuild -license'".
- The `simctl` shim at `Developer/usr/bin/simctl` expects CoreSimulator `1051.55`. The installed CoreSimulator framework reports `1168`. The mismatch makes the shim run `xcodebuild -runFirstLaunch` on every call, which also hits the license gate.
- Simulator assets exist: runtime volumes `iOS_23F77` and `iOS_24A5380g` under `/Library/Developer/CoreSimulator/Volumes`, and 33 devices under `~/Library/Developer/CoreSimulator/Devices`.

Conclusion: the toolchain is installed but license-gated. Repair needs two privileged commands that only the human can run:

```bash
sudo xcodebuild -license accept
sudo xcodebuild -runFirstLaunch
```

Per the spec, implementation pauses at task T1 until the human runs these and the preflight passes. No download or reinstall is expected.

## 3. Approach

The module is built as eight gated tasks. Each task follows the spec's loop: red test, green implementation, full validation, independent GPT-5.6 Sol review, Argent checkpoint, then one lowercase conventional commit pushed to `origin/main`.

Ordering rationale:

- T1 (toolchain) is first because Argent evidence gates every commit. Nothing can be committed before Argent can list and boot a simulator.
- T2 (dependencies, test harness, repo hygiene) is second because every later task needs Jest, scripts, and ignore rules.
- T3 (route migration) precedes the theme so all later work lands in the final `src/` structure.
- T4 (theme) precedes components; T5 (components) precedes the preview; T6 (preview) precedes device validation.
- T7 (native build and full Argent validation matrix) exercises everything on the simulator and creates the human-approved visual baseline.
- T8 (exports, coverage gate, checkpoint protocol closure) proves Android bundling and closes the success criteria.

### Architecture decisions within the approved spec

- One theme entry point at `src/theme/index.ts`. Feature code imports only from `@/theme`. Token files export plain typed objects so unit tests can assert completeness and invariants without rendering.
- `adaptive-material` is the only platform-forked component. The `.ios.tsx` file performs the runtime capability check (`expo-glass-effect` availability) and selects liquid glass, `expo-blur`, or the opaque fallback. The neutral file and `.android.tsx` never import iOS-only modules. The selection function is exported separately so Jest can test the fallback policy on all platforms.
- The preview route file at `src/app/(dev)/foundation-preview.tsx` contains only the `__DEV__` guard (production renders `<Redirect href="/" />`) and composition of `src/foundation/validation/` content. All fixture data and section components live outside `src/app/`.
- Haptics run behind one policy function in the foundation layer so the interaction-state fixture and later modules share one approved path.
- The tsconfig alias changes from `@/*: ./*` to `@/*: ./src/*` in T3, in the same commit that moves the routes, so the alias never points at two roots.

### Delegation plan

- Fable 5 authors T1, T3, T6, T7, and all integration.
- Bounded token-file and test-file authoring inside T4 and T5 may be delegated (Sonnet or Haiku 4.5) with named file ownership and acceptance criteria. Delegates cannot add dependencies, change structure, or commit.
- A GPT-5.6 Sol instance that authors any bounded subtask is excluded from verifying that task.

## 4. Task breakdown

### T1 - simulator toolchain repair and Argent preflight

- Owner: Fable 5. Human action required (privileged commands above).
- Files: `checkpoints.md` (created), no application code.
- Steps: human runs the two sudo commands; then verify `xcode-select -p`, `xcodebuild -version`, `xcrun --find simctl`; then Argent `list-devices`, select or create an iPhone 16 Pro class simulator on iOS 26.6 (402 by 874 points), `boot-device`, record the UDID in `checkpoints.md`. If no iOS 26.6 runtime exists, pause and ask the human to approve a documented equivalent (spec success criterion 3).
- Acceptance: preflight commands succeed; Argent lists and boots the target; UDID recorded.
- Argent evidence: device list, boot result.
- Commit: `chore: establish simulator toolchain and argent preflight` (includes `checkpoints.md`).

### T2 - dependencies, test harness, and repository hygiene

- Owner: Fable 5.
- Files: `package.json`, `bun.lock`, `jest.config.js`, `tsconfig.json` (types for jest only if needed), `.gitignore`, `src/testing/render.tsx`, `tests/native-foundation/harness.test.tsx`.
- Steps: run the two approved `bunx expo install` commands from the spec; add the five approved scripts; create `jest.config.js` with the `jest-expo` preset, Expo's Bun-compatible `transformIgnorePatterns`, 90 percent global coverage thresholds, and reviewed `collectCoverageFrom` exclusions (route files, type-only files, static token objects stay covered by unit tests, so exclusions start minimal); add `.artifacts/` and `dist-validation/` to `.gitignore`; add the router-aware render helper and one first test proving the harness runs.
- Acceptance: `bun run lint`, `bun run typecheck`, `bun run test`, `bunx expo-doctor` pass; dependency versions were resolved by Expo Install, not entered manually.
- Argent evidence: app relaunch on the booted simulator, root-route smoke description, runtime-log summary (tests or non-visual type).
- Commit: `chore: add foundation dependencies and jest harness`.

### T3 - route migration to src/app and starter removal

- Owner: Fable 5.
- Files: `src/app/_layout.tsx`, `src/app/index.tsx`, `src/app/+not-found.tsx`; delete `app/` (all starter routes including `+html.tsx` and `modal.tsx`), `components/`, `constants/`, `assets/fonts/SpaceMono-Regular.ttf`; `tsconfig.json` (`@/*` -> `./src/*`); `app.json` (`ios.deploymentTarget: "18.6"`); remove now-unused starter dependencies only if they are not in the approved runtime table (verify with `bunx expo-doctor` and grep before removal); tests in `tests/native-foundation/`.
- Steps: red test with `expo-router/testing-library` asserting `/` renders stack title `Ripples` and selectable text `Native foundation ready`, and that unmatched routes reach `+not-found` with a working link to `/`; then implement the minimal native stack with automatic scroll-view inset adjustment; then delete the starter.
- Acceptance: spec success criteria 5, 6, 7 automated parts pass; no dead imports, routes, assets, or dependencies remain; `git diff --check` clean.
- Argent evidence: navigation type - semantic description before and after navigating to an unknown route and back, final screenshot.
- Commit: `feat: replace starter with minimal expo router stack in src/app`.

### T4 - semantic theme tokens

- Owner: Fable 5. Token file drafting may be delegated per section 3.
- Files: `src/theme/colors.ts`, `spacing.ts`, `typography.ts`, `radius.ts`, `shadows.ts`, `motion.ts`, `index.ts`; `tests/native-foundation/theme.test.ts`.
- Steps: red tests for token completeness and invariants (every semantic color role present with web-safe fallback; brand accent separated from semantic colors; 4-point spacing grid; Dynamic Type-compatible named text styles on the system font; continuous-curve radii; `boxShadow` strings only; motion tokens plus reduced-motion selection policy). Then implement tokens.
- Acceptance: theme unit tests pass; no legacy shadow or elevation properties anywhere; only `src/theme/index.ts` is imported by non-theme code.
- Argent evidence: tests type - relaunch, root-route smoke description, runtime-log summary.
- Commit: `feat: add semantic theme tokens`.

### T5 - foundation components

- Owner: Fable 5. Test authoring may be delegated per section 3.
- Files: `src/components/foundation/app-text.tsx`, `icon.tsx`, `adaptive-material.tsx`, `adaptive-material.ios.tsx`, `adaptive-material.android.tsx`; `src/foundation/accessibility/`; `tests/native-foundation/components.test.tsx`.
- Steps: red component tests for accessible roles and labels, selectable text, 44-point touch-target contract, platform icon mapping, and adaptive-material fallback selection (glass unavailable -> blur -> opaque, same geometry). Then implement. iOS-only imports stay in `.ios.tsx`.
- Acceptance: component tests pass by role and name queries; platform-neutral files import no UIKit, SwiftUI, Android SDK, or Compose APIs; a missing glass or blur capability yields a visible opaque control.
- Argent evidence: tests type - relaunch, root-route smoke description, runtime-log summary (components are not yet on a screen).
- Commit: `feat: add foundation text, icon, and adaptive material components`.

### T6 - foundation preview route

- Owner: Fable 5.
- Files: `src/app/(dev)/foundation-preview.tsx`, `src/foundation/validation/` (fixtures and seven section components), haptic policy module, `tests/native-foundation/foundation-preview.test.tsx`, `e2e/argent/native-foundation/` flow definitions.
- Steps: red tests for the seven ordered sections, all labeled fixtures from the preview contract, the `Action count` behavior, the `material=fallback` search parameter, and the production-mode redirect to `/`. Then implement with `@expo/ui` `Host` controls (`Primary action` button, `Habit enabled` switch, `Intensity` slider, `Frequency` picker, `Note` text input). Deterministic local fixtures only - no clock, no network, no feature state.
- Acceptance: spec success criteria 8, 9 and the automated parts of 10, 14, 15 pass; coverage thresholds still met.
- Argent evidence: interactive component type - semantic locator on the preview via `open-url` deep link `habittracker://foundation-preview`, activate `Primary action`, confirm `Action count: 0` -> `Action count: 1` in the accessibility tree, screenshot.
- Commit: `feat: add development foundation preview route`.

### T7 - development client build and full device validation

- Owner: Fable 5.
- Files: `checkpoints.md`, `.artifacts/argent/` outputs (ignored), no product code unless validation forces fixes (each fix is a visible refinement iteration with its own Argent evidence).
- Steps: `bunx expo run:ios --device "iPhone 16 Pro"`; launch through the dev client with bundle id `com.ramimaalouf.habittracker`; run the full matrix from the spec: describe root and preview; light and dark full-resolution captures; `material=fallback` comparison on the same simulator; Dynamic Type at accessibility-extra-extra-large and back; Reduce Motion and Increase Contrast via the Settings app with discovery-driven taps; debugger log registry review; restore appearance and content size afterward.
- Human gate: the first full-resolution light and dark captures are presented for review. Only after approval do their paths become baselines. Later diffs must have no unexplained changed region.
- Acceptance: spec success criteria 3, 4, 11, 12, 13, 14, 15, 18, 19 on-device parts pass.
- Argent evidence: theme and material type - light and dark captures plus screenshot diff, plus interactive evidence for the controls.
- Commit: `chore: record device validation baseline and checkpoint` (baseline paths and approvals in `checkpoints.md`; images stay ignored).

### T8 - exports, coverage gate, and module closure

- Owner: Fable 5.
- Files: `checkpoints.md`; no product code unless an export failure forces a fix.
- Steps: `bunx expo export --platform ios --output-dir dist-validation/ios`; `bunx expo export --platform android --output-dir dist-validation/android`; confirm the Android export resolves no iOS-only module; `bun run validate`; `bunx expo-doctor`; `git diff --check`; confirm `git ls-files` contains no private image, `.artifacts/`, `dist-validation/`, `ios/`, or `android/` entry; close every success criterion in `checkpoints.md`.
- Acceptance: spec success criteria 16, 17, 20, 21, 22 pass; all 22 criteria confirmed true.
- Argent evidence: tests type - relaunch, root-route smoke description, runtime-log summary.
- Commit: `chore: close native-foundation module validation`.

## 5. Verification protocol (applies to every task)

1. Targeted test red, then green.
2. `bun run validate` (after T2), `bunx expo-doctor` when dependencies or config changed, `git diff --check`.
3. Independent GPT-5.6 Sol verification from spec, acceptance criteria, and diff. Author and verifier are never the same instance.
4. Argent checkpoint per the task's evidence row. Discovery before every tap. No coordinates from screenshots.
5. Checkpoint recorded in `checkpoints.md` with the eight required fields.
6. Lowercase conventional commit, no signatures or co-authors, push to `origin/main`.
7. Argent session end: `stop-all-simulator-servers` scoped to the session's device.

## 6. Risks and open items

1. Human action required before T1 can pass: `sudo xcodebuild -license accept` and `sudo xcodebuild -runFirstLaunch`. Fable 5 cannot run privileged commands.
2. iOS 26.6 runtime availability is unconfirmed until `simctl` works. If the exact runtime is missing, the human must approve a documented equivalent or a runtime download (spec pause rule).
3. CoreSimulator 1168 is newer than the version Xcode 26.6 expects (1051.55). If `runFirstLaunch` does not reconcile the mismatch, T1 pauses for human intervention rather than modifying system frameworks.
4. `@expo/ui` controls under Jest depend on mocks; behavior claims for native controls rest on Argent evidence in T7, as the spec requires.
5. Starter dependency removal in T3 (for example `expo-web-browser`, `expo-symbols`, `expo-font`) touches the dependency list. Removal of unused starter packages is treated as part of approved starter cleanup; anything ambiguous is asked first per Boundaries.

## 7. Requested approvals

Approving this plan and `tasks/todo.md` authorizes implementation of T1 through T8 exactly as scoped, with the standing human gates: the T1 privileged commands, the simulator-equivalence decision if iOS 26.6 is absent, and the T7 baseline approval.
