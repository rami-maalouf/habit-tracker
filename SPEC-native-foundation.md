# Spec: Native Foundation

Module id: `native-foundation`

Capability map: `CAPABILITY-MAP.md`

Status: Phase 1 approved for Fable 5 handoff

Date: 2026-08-30

## Approved assumptions and decisions

1. This document specifies only the `native-foundation` module approved in `CAPABILITY-MAP.md`.
2. Fable 5 remains the implementation author, integration owner, and commit owner. GPT-5.6 Sol remains the independent verifier. The GPT-5.6 Sol session that finalized this specification performs no implementation work.
3. The product minimum is iOS 18.6 even though Expo SDK 57 supports older iOS versions. The primary visual target is iOS 26.6 at a 402 by 874 point viewport.
4. Android acceptance in this module is limited to platform-neutral architecture, automated component coverage, and a successful Android JavaScript and asset export. Android emulator acceptance belongs to `android-readiness`.
5. The foundation dependencies in this document, including a direct Jest dependency, are approved in principle. Expo Install resolves exact SDK-compatible versions during implementation.
6. The first deterministic visual capture becomes a baseline only after human review. Later pixel differences fail until they are explained and approved; a baseline is never updated merely to make a check pass.
7. Each completed implementation task may be committed and pushed directly to `origin/main` only after its tests, independent verification, and Argent checkpoint pass.
8. Approval of this specification authorizes Phase 2 planning by Fable 5. It does not authorize this GPT-5.6 Sol session to plan or implement the module.

## Objective

Establish the production-quality native foundation on which every Ripples capability will be built. This module owns the Expo Router shell, semantic design system, native component selection policy, accessibility baseline, development client, deterministic validation surface, and the Fable 5, GPT-5.6 Sol, and Argent execution loop.

The direct user is the person tracking habits in Ripples. The immediate consumer is every downstream feature module. Success means later modules can focus on their product behavior without inventing navigation, colors, spacing, materials, accessibility conventions, test infrastructure, or simulator validation from scratch.

### User outcomes

- Every screen feels native to iOS because navigation and controls use native platform primitives where they meet the requirement.
- Light mode, dark mode, Dynamic Type, VoiceOver, Reduced Motion, safe areas, and device size changes work by construction.
- Interactions have one consistent visual and tactile language.
- Android can later use the same tokens and component contracts with Compose-native behavior.
- Each implementation task is independently reviewed and exercised on a real simulator before it is committed.

### In scope

1. Repair or establish a discoverable iOS simulator toolchain for Argent.
2. Replace the disposable starter navigation with a minimal Expo Router stack rooted at `/`.
3. Move route files to `src/app/` and keep all non-route code outside that directory.
4. Establish one semantic theme for color, typography, spacing, radii, materials, motion, and touch targets.
5. Establish the component-selection policy for Expo Router, `@expo/ui`, React Native, platform-specific files, and native modules.
6. Add adaptive glass and material primitives with safe fallbacks.
7. Add a development client suitable for later Apple widget targets without adding WidgetKit targets, widget configuration, or widget code.
8. Add a development-only foundation preview route for deterministic native, accessibility, and visual validation.
9. Add lint, type-check, unit, component, coverage, export, and validation commands.
10. Add the checkpoint protocol used by Fable 5, independent verifiers, delegated agents, and Argent.
11. Prove the shared foundation can bundle for Android without pretending to ship the Android product UI.

### Out of scope

- Board or check-in records
- SQLite schema or migrations
- Board list, board detail, heatmaps, charts, reminders, history, journal, settings, or widgets
- iCloud sync, Shortcuts, Siri, or Android home-screen widgets
- Product analytics or networking
- Store submission, production signing, or release automation

Those capabilities belong to later module ids in `CAPABILITY-MAP.md`.

## Team and execution model

### Primary roles

- Fable 5 is the primary architect, code author, integration owner, and commit owner.
- GPT-5.6 Sol is the independent verifier for every completed task.
- Argent is the required simulator interaction and evidence system after every task.
- The human is the approval authority at the Specify, Plan, Tasks, and Implement gates.

### Delegation

- Fable 5 may delegate bounded work to separate instances of GPT-5.6 Sol, Sonnet, Opus 5, or Haiku 4.5 when the task does not require Fable 5's full reasoning capacity.
- Every delegated task must name its owned files, acceptance criteria, verification command, and dependency on other work.
- Delegated agents must be told that other agents share the repository, must not revert concurrent work, and must integrate with changes already present.
- A delegated agent may not silently broaden scope, add a dependency, change architecture, or commit.
- Fable 5 reviews and integrates all delegated output before requesting verification.

### Independence rule

- The verifier cannot be the author of the task under review.
- If a GPT-5.6 Sol instance authored a bounded subtask, a different GPT-5.6 Sol instance must perform verification.
- Verification begins from the approved spec, task acceptance criteria, and current diff. It does not rely only on the author's summary.
- A failed verification returns the task to Fable 5. No commit or push is allowed until the failure is corrected and reverified.

### Required task checkpoint

Every implementation task ends with a checkpoint containing:

1. task id and approved acceptance criteria
2. author and any delegated agents
3. files changed
4. tests and static checks run with results
5. GPT-5.6 Sol review result and concerns
6. Argent target id, interaction performed, structural result, runtime-log result, and screenshot result when applicable
7. intentional deviations from the reference with human approval
8. commit hash and push result after all gates pass

The active checkpoint is recorded in `checkpoints.md`. Evidence images remain private and ignored by Git.

## Tech stack

### Existing pinned runtime

| Technology | Version | Role |
| --- | --- | --- |
| Expo | `~57.0.18` | Managed app runtime and Continuous Native Generation |
| Expo Router | `~57.0.17` | File-based native navigation and typed routes |
| React | `19.2.3` | Component runtime |
| React Native | `0.86.3` | Cross-platform rendering layer |
| TypeScript | `~6.0.3` | Strict application and test code |
| Reanimated | `4.5.1` | Available for later measured animation needs, not the default control implementation |
| React Native Worklets | `0.10.1` | Native state and worklet support |
| Bun | repository lockfile | Package management and JavaScript command runner |
| Argent | `0.22.1` | Simulator interaction, accessibility inspection, runtime logs, screenshots, and visual diffs |

### Proposed foundation dependencies

All versions must be resolved with Expo Install against SDK 57 rather than entered manually.

| Package | SDK 57 reference version | Purpose |
| --- | --- | --- |
| `@expo/ui` | `~57.0.14` | Universal SwiftUI, Compose, and web-native controls |
| `expo-blur` | `~57.0.2` | Material fallback and adaptive blur |
| `expo-glass-effect` | `~57.0.1` | Native iOS 26 liquid glass |
| `expo-haptics` | `~57.0.2` | Platform haptic feedback policy |
| `expo-image` | `~57.0.3` | Cross-platform image rendering and SF Symbol sources in custom React Native surfaces |
| `expo-dev-client` | `~57.0.16` reference | Development build used by later native extensions |
| `jest-expo` | Expo-resolved SDK 57 version | Expo-aware unit and component test environment |
| `jest` | Expo-resolved compatible version | Direct test runner dependency required by Expo's Jest setup |
| `@testing-library/react-native` | compatible current version | Accessible component behavior tests |
| `@types/jest` | compatible current version | Test type definitions |

No styling framework, general-purpose UI kit, bottom-sheet library, icon font library, or additional animation library is approved by this spec.

### Native component selection policy

Choose the first layer that satisfies the requirement:

1. Expo Router native stack, toolbar, modal, or form sheet for navigation-owned presentation.
2. Universal `@expo/ui` component for supported cross-platform controls such as buttons, switches, sliders, pickers, bottom sheets, text inputs, and bounded lists.
3. Platform-specific `@expo/ui/swift-ui` or `@expo/ui/jetpack-compose` component isolated in `.ios.tsx` and `.android.tsx` files when the universal layer lacks required behavior, including platform-specific menu behavior.
4. React Native layout for bespoke, high-density, or virtualized presentation.
5. A custom Expo native module only after a measured accessibility, performance, or parity gap is documented and approved.

The SDK 57 universal `@expo/ui` `List` provides native list chrome but creates every React row up front. It is not used for large or unbounded data sets. Later board and history modules use a genuinely lazy virtualized React Native list selected in their own approved specs.

## Platform and appearance requirements

### iOS target

- Primary parity runtime: iOS 26.6 on an iPhone 16 Pro class simulator with a 402 by 874 point viewport.
- Supported fallback target: iOS 18.6 or newer.
- `app.json` sets `ios.deploymentTarget` to `18.6`; generated native projects remain uncommitted.
- iOS 26 uses native liquid glass where the screenshots call for glass.
- iOS 18.6 through iOS 25 use adaptive system material or blur with equivalent geometry and contrast.
- `expo-glass-effect` becomes a regular view when native glass is unavailable, so the adaptive material boundary explicitly selects `expo-blur` or an opaque semantic material fallback after runtime capability checks.
- A missing glass or blur capability must never create an invisible control, unreadable content, or missing pressed feedback.

### Android readiness

- Android uses semantic Material colors and Compose controls where available.
- iOS-only imports are isolated in `.ios.tsx` files.
- Platform-neutral modules do not import UIKit, SwiftUI, Android SDK, or Compose APIs.
- The foundation must produce an Android JavaScript and asset export, and its component tests must prove that the validation surface resolves Android-safe modules without importing an iOS-only implementation.
- Android emulator launch, visual parity, and device interaction remain out of scope for this module and belong to `android-readiness`.

### Design system

- One theme entry point lives at `src/theme/index.ts`.
- Semantic platform colors are defined in `src/theme/colors.ts` with web-safe fallbacks.
- Brand accent colors are separate from semantic interface colors.
- Spacing uses a named 4-point grid.
- Typography uses the system font and named styles compatible with Dynamic Type.
- Radii use named tokens and continuous curves for non-capsule shapes.
- Shadows use `boxShadow`, never legacy React Native shadow or elevation properties.
- Motion uses named timing and spring tokens and respects Reduced Motion.
- Repeated visual values cannot be declared inside feature screens.
- Native controls are not wrapped merely to restyle them. Their platform styling is part of the design system.

### Accessibility

- Every interactive target is at least 44 by 44 points.
- Icon-only controls have accessible labels and, when useful, hints.
- Selected, disabled, expanded, and destructive states are exposed semantically.
- Text supports at least 200 percent Dynamic Type without overlap, clipping, or unreachable actions.
- Important data and error text is selectable.
- Color is never the only indicator of state.
- Reduce Motion and Increase Contrast preserve meaning and usability.
- The accessibility tree is treated as test output, not optional metadata.

## Commands

All JavaScript and TypeScript commands use Bun. Package versions are resolved through Expo Install.

### One-time setup after spec and plan approval

```bash
bun install
bunx expo install @expo/ui expo-blur expo-glass-effect expo-haptics expo-image expo-dev-client
bunx expo install jest-expo jest @testing-library/react-native @types/jest --dev
```

`jest` is a direct development dependency. The test configuration uses the `jest-expo` preset, includes Jest types for test files, applies Expo's Bun-compatible transform ignore pattern, and enforces the coverage thresholds in this specification.

### Development, local native build, and bundle validation

```bash
bun run start
bunx expo start --dev-client --clear
bunx expo run:ios --device "iPhone 16 Pro"
bunx expo export --platform ios --output-dir dist-validation/ios
bunx expo export --platform android --output-dir dist-validation/android
```

`expo run:ios` is the local native development build and install check. `expo export` validates production JavaScript and asset bundling for the selected platform; it is not a native binary build.

### Required repository scripts

The module adds these scripts to `package.json`:

```json
{
  "scripts": {
    "lint": "expo lint",
    "typecheck": "tsc --noEmit",
    "test": "jest --runInBand",
    "test:coverage": "jest --runInBand --coverage",
    "validate": "bun run lint && bun run typecheck && bun run test:coverage"
  }
}
```

After those scripts exist, verification uses:

```bash
bun run lint
bun run typecheck
bun run test
bun run test:coverage
bun run validate
bunx expo-doctor
git diff --check
```

### Simulator preflight

Host toolchain diagnostics use shell commands. Simulator discovery and lifecycle operations use Argent MCP tools.

```bash
xcode-select -p
xcodebuild -version
xcrun --find simctl
```

```text
mcp__argent__list_devices({})
mcp__argent__boot_device({ udid: "<ios-simulator-udid>" })
```

Before these calls, the implementing agent reads the relevant Argent setup and interaction skills. It calls `list_devices` first, prefers a running device, and records the selected UDID. The current environment fails `xcrun --find simctl` even though Xcode 26.6 is selected. The first implementation task cannot pass until this preflight succeeds and Argent lists an iOS simulator.

### Argent launch and structure validation

```text
mcp__argent__launch_app({ udid: "<ios-simulator-udid>", bundleId: "com.ramimaalouf.habittracker" })
mcp__argent__open_url({ udid: "<ios-simulator-udid>", url: "habittracker://foundation-preview" })
mcp__argent__describe({ udid: "<ios-simulator-udid>", bundleId: "com.ramimaalouf.habittracker" })
mcp__argent__debugger_connect({ device_id: "<ios-simulator-udid>", port: 8081 })
mcp__argent__debugger_status({ device_id: "<ios-simulator-udid>", port: 8081 })
mcp__argent__debugger_log_registry({ device_id: "<ios-simulator-udid>", port: 8081 })
```

Subsequent debugger calls use the same stable device id from `list_devices` that was passed to `debugger_connect`.

At the end of each Argent session, stop only the services owned by the selected target:

```text
mcp__argent__stop_all_simulator_servers({ devices: ["<ios-simulator-udid>"] })
```

### Argent visual validation

```text
mcp__argent__screenshot({ udid: "<ios-simulator-udid>", scale: 1, includeImageInContext: false })
mcp__argent__screenshot_diff({ udid: "<ios-simulator-udid>", baselinePath: "<approved-full-resolution-png-path>", captureCurrent: true, outputDir: ".artifacts/argent/native-foundation-diff" })
```

The implementing agent records the full-resolution PNG path returned by `screenshot`. The first current image is reviewed by the human before its path is designated as the baseline. Every visual refinement iteration captures a new current image. A diff passes only when it contains no unexpected changed region. An approved baseline is replaced only when the human accepts the visual change.

### Appearance validation

```bash
xcrun simctl ui <ios-simulator-udid> appearance light
xcrun simctl ui <ios-simulator-udid> appearance dark
xcrun simctl ui <ios-simulator-udid> content_size accessibility-extra-extra-large
xcrun simctl ui <ios-simulator-udid> content_size large
```

Argent has no appearance or Dynamic Type setter. These narrowly scoped `simctl ui` commands are allowed only after Argent discovers the target UDID. After each setting change, use `mcp__argent__await_screen_idle`, `mcp__argent__describe`, and `mcp__argent__screenshot` to capture the resulting state. Restore appearance and content size after the checkpoint.

Reduce Motion and Increase Contrast are changed through the iOS Settings app. Launch it with `mcp__argent__launch_app({ udid: "<ios-simulator-udid>", bundleId: "com.apple.Preferences" })`, call `describe` before every interaction, and use only coordinates returned by the current discovery result. Relaunch Ripples and repeat the structural and visual checkpoint after each setting change. If the Settings accessibility tree cannot produce a trustworthy target, pause for human intervention instead of guessing coordinates.

## Project structure

```text
src/
  app/
    _layout.tsx                    root native stack and providers
    index.tsx                      minimal production root route
    +not-found.tsx                 unmatched-route recovery
    (dev)/
      foundation-preview.tsx      development-only validation route
  components/
    foundation/
      adaptive-material.tsx       web-safe opaque fallback
      adaptive-material.ios.tsx   glass and system-material behavior
      adaptive-material.android.tsx
      app-text.tsx                named typography variants
      icon.tsx                    platform icon mapping boundary
  foundation/
    accessibility/                shared labels and accessibility helpers
    validation/                   preview data and validation-screen composition
  theme/
    colors.ts                     semantic colors and brand accent boundary
    spacing.ts                    4-point spacing scale
    typography.ts                 system type ramp
    radius.ts                     continuous radius tokens
    shadows.ts                    box-shadow tokens
    motion.ts                     timing, springs, and reduced-motion policy
    index.ts                      only public theme entry point
  testing/
    render.tsx                    Expo Router and @expo/ui-aware test render helper
tests/
  native-foundation/              unit and component tests for this module
e2e/
  argent/
    native-foundation/            semantic flow definitions and expected states
.artifacts/
  argent/                         private ignored screenshots and diffs
jest.config.js                    jest-expo preset, Bun transforms, coverage policy
checkpoints.md                    current task handoff and verification record
CAPABILITY-MAP.md                 approved module index
SPEC-native-foundation.md         this module specification
```

### Structure rules

- `src/app/` contains only route files and route layouts with default exports.
- Routes compose foundation or feature components. They do not contain reusable components, persistence logic, or platform services.
- The `/` route always exists and never renders a blank screen.
- `/foundation-preview` resolves from `src/app/(dev)/foundation-preview.tsx`. When `__DEV__` is false, its component renders only an Expo Router redirect to `/`; preview content cannot render in a production bundle.
- TypeScript alias `@/*` resolves to `src/*`.
- Expo Router discovers the conventional `src/app/` directory automatically. No custom Router root configuration is added.
- Old starter routes, tab layouts, template screens, template components, and the Space Mono sample font are removed after the new root route works.
- Generated `ios/` and `android/` directories remain ignored and uncommitted.
- `.artifacts/` remains ignored and uncommitted.

### Foundation preview contract

The preview uses deterministic local fixture values, no clock-dependent content, no network requests, and no downstream feature state. It contains these sections in this order:

1. `Typography`: every named type style with wrapping sample text.
2. `Semantic colors`: label, secondary label, background, grouped background, separator, fill, accent, destructive, and their contrast roles.
3. `Geometry`: every spacing and radius token, continuous corners, touch-target markers, and each approved shadow.
4. `Adaptive material`: one fixed-geometry surface that reports `liquid glass`, `blur`, or `opaque fallback` as selectable text. The development-only `material=fallback` search parameter forces the fallback branch so its geometry and contrast can be compared on the primary iOS 26.6 simulator.
5. `Native controls`: a universal `@expo/ui` `Host` containing a button labeled `Primary action`, a switch labeled `Habit enabled`, a slider labeled `Intensity`, a picker labeled `Frequency`, and a text input labeled `Note`.
6. `Interaction states`: enabled and disabled controls plus an `Action count: 0` value that becomes `Action count: 1` after the primary action and exercises the approved haptic path.
7. `Accessibility and motion`: selectable status text for current appearance, font scale, Reduce Motion state, and material fallback. Increase Contrast is validated through system-setting visual checkpoints rather than inferred from an unavailable application-level flag.

The root `/` route uses the native stack and automatic scroll-view inset adjustment. It shows the stack title `Ripples` and the selectable body text `Native foundation ready`, with no feature navigation, persistence, or product behavior.

## Code style

```tsx
import type { TextProps } from 'react-native';
import { Text } from 'react-native';

import { typography } from '@/theme';

type AppTextProps = TextProps & {
  variant?: keyof typeof typography;
};

export function AppText({ variant = 'body', style, ...props }: AppTextProps) {
  return <Text selectable style={[typography[variant], style]} {...props} />;
}
```

### Conventions

- File names use kebab-case.
- Components and types use PascalCase. Functions, hooks, and values use camelCase.
- Comments are lowercase and explain decisions rather than restating code.
- Imports are grouped: platform and library imports, blank line, then `@/` project imports.
- Named exports are preferred outside route files.
- Route files use default exports because Expo Router requires them.
- Strict TypeScript remains enabled. `any`, unchecked casts, and non-null assertions require a documented reason.
- Functions use explicit inputs and return types at module boundaries.
- Expected failures use typed results or explicit UI state. Exceptions are reserved for programmer errors and unrecoverable infrastructure failures.
- Repeated colors, spacing, font sizes, radii, shadows, and durations live in the theme.
- Style overrides merge last. They may change layout but must not silently change a component's identity.
- Tappable custom components include pressed, disabled, loading, and accessible states.
- Platform-specific imports remain in platform-specific files.
- No code uses `npm`, `yarn`, or `npx` commands.

## Testing strategy

### Test-driven loop

For each implementation task, Fable 5 follows red, green, refactor:

1. Add or update the smallest failing test that expresses the approved behavior.
2. Run the targeted test and record the expected failure.
3. Implement the smallest complete change.
4. Run the targeted test until it passes.
5. Run the full static and automated validation suite.
6. Request independent GPT-5.6 Sol review.
7. Run the required Argent checkpoint.
8. Commit and push only after all checks pass.

### Unit tests

Unit tests cover:

- token completeness and invariants
- semantic fallback selection
- platform icon mapping
- reduced-motion selection
- development-route production redirect
- checkpoint completeness rules

Jest is installed directly and configured in `jest.config.js` with the `jest-expo` preset. Expo Router integration tests use `expo-router/testing-library`. Test files remain outside `src/app/`. Native modules receive explicit behavior-focused mocks only where `jest-expo` does not already provide one.

### Component tests

React Native Testing Library covers:

- accessible roles, labels, hints, and states
- minimum touch-target layout contract
- pressed and disabled behavior for authored interactive components
- Dynamic Type-safe composition
- `@expo/ui` Host composition under Jest mocks
- light and dark semantic token selection
- platform-specific component boundary selection

Actual SwiftUI rendering, native control behavior, glass, blur, haptics, and the native accessibility tree are simulator concerns and are verified with Argent rather than inferred from Jest mocks.

Tests query by accessible role and name rather than implementation details. Snapshot-only tests do not satisfy behavior coverage.

### Coverage

- Authored foundation logic must maintain at least 90 percent line, statement, function, and branch coverage.
- `jest.config.js` enforces 90 percent global thresholds for lines, statements, functions, and branches.
- Route declarations, generated files, type-only files, and static token objects may be excluded only through an explicit reviewed `collectCoverageFrom` or coverage-ignore entry.
- Every behavior in the Success Criteria has at least one automated or Argent verification path.

### Build validation

- iOS development build installs and launches on the selected simulator.
- iOS production JavaScript and asset export completes.
- Android production JavaScript and asset export completes without an iOS-only import failure.
- Android-safe module resolution and `@expo/ui` Host composition pass automated tests. An Android native build or emulator run is not required in this module.
- Expo Doctor reports no unresolved dependency or configuration issue.
- TypeScript, lint, tests, and `git diff --check` pass.

### Argent after every task

Argent validation is mandatory for every implementation task and every visible refinement iteration.

| Task type | Required Argent evidence |
| --- | --- |
| Toolchain or configuration | device list, boot result, app launch, root route description, runtime-log summary |
| Navigation | semantic description before and after navigation, back behavior, final screenshot |
| Theme or material | full-resolution light and dark captures plus screenshot diff |
| Interactive component | semantic locator, interaction, resulting accessibility state, haptic path where observable, screenshot when pixels change |
| Tests or non-visual refactor | app reload or relaunch, root-route smoke description, runtime-log summary |

Argent interaction uses semantic labels or frames returned by a discovery tool in the current step. Tap coordinates are never inferred from screenshots or reused after the screen changes. If discovery cannot produce a trustworthy target, the interaction stops and the checkpoint records the blocker.

### Independent GPT-5.6 Sol verification

The verifier must:

1. read the approved spec section and task acceptance criteria
2. inspect the actual diff and surrounding code
3. verify ownership boundaries and dependency choices
4. run or independently confirm targeted tests, full validation, and Expo Doctor where relevant
5. use Argent on the selected simulator
6. inspect the accessibility tree and runtime-log registry
7. inspect full-resolution visual evidence when pixels changed
8. return `pass` or `fail` with concrete evidence and unresolved risks

The verifier may propose fixes but does not modify the task during the verification pass. Fable 5 owns remediation.

## Boundaries

### Always do

- Keep Fable 5 as architect, primary author, integrator, and commit owner.
- Require an independent GPT-5.6 Sol verification pass for every task.
- Use Argent after every task and after every visible refinement iteration.
- Use SDK 57 versioned Expo documentation and installed TypeScript declarations before selecting an API.
- Use Expo Install through Bun for Expo and React Native dependencies.
- Prefer native Expo Router and `@expo/ui` components before custom implementations.
- Preserve the accessibility tree, semantic colors, Reduced Motion, Dynamic Type, and 44-point targets.
- Keep platform-specific imports isolated.
- Run targeted tests, full tests, lint, type-check, Expo Doctor when relevant, runtime-log inspection, and `git diff --check` before committing.
- Use lowercase conventional commits without signatures or co-author lines.
- Push each verified feature or foundation task to `origin/main` before beginning dependent work.
- Keep `checkpoints.md` current and concise.

### Ask first

- Add, remove, or replace a runtime or test dependency not listed in the approved Tech Stack section.
- Change the Expo SDK, React Native, React, TypeScript, or Bun version.
- Change the bundle identifier, app scheme, EAS project linkage, signing, credentials, or store settings.
- Add a custom Expo native module or direct Swift, Objective-C, Kotlin, or Java code.
- Change the approved route root, theme contract, native component selection policy, or minimum iOS version.
- Modify CI, EAS workflows, release profiles, or update channels.
- Replace an approved visual baseline.
- Allow a task author to verify their own task.
- Delegate architecture, integration, or cross-module ownership away from Fable 5.

### Never do

- Write board, check-in, reminder, analytics, journal, settings, widget, sync, or automation behavior in this module.
- Commit private screenshots, Argent images, diffs, secrets, signing assets, exports, or credentials.
- Manually edit or commit generated `ios/` or `android/` directories.
- Use a web-styled control when an approved native control meets the requirement.
- Import `@react-navigation/*` directly.
- Put reusable components, types, or utilities inside `src/app/`.
- Add a second theme, hardcode repeated visual values, or use legacy shadow properties.
- Silence a warning, skip a test, weaken coverage, or update a baseline merely to obtain a passing result.
- Commit or push a task without independent verification and an Argent checkpoint.
- Let a subagent revert or overwrite another agent's work.
- Add a co-author, agent signature, or generated attribution to a commit.

## Success criteria

The `native-foundation` module is complete only when all criteria below are true:

1. `CAPABILITY-MAP.md` identifies `native-foundation`, and this spec remains scoped to that module.
2. `xcrun --find simctl` succeeds, Argent lists the target iOS simulator, and Argent can boot it.
3. An iPhone 16 Pro class simulator runs iOS 26.6 at a 402 by 874 point viewport, or the human approves a precisely documented equivalent.
4. The app installs and launches through the development client with bundle id `com.ramimaalouf.habittracker`.
5. Expo Router loads routes from `src/app/`, `/` always resolves, and unmatched routes provide recovery.
6. The starter tab demo and unused template components are removed without leaving dead imports, routes, assets, or dependencies.
7. The `/` route renders the native stack title `Ripples` and selectable text `Native foundation ready`, uses automatic safe-area inset adjustment, and contains no downstream navigation, persistence, or feature behavior.
8. In development, `/foundation-preview` renders all seven ordered sections and every labeled fixture defined in the Foundation preview contract from deterministic local data.
9. In a production-mode Router test, `/foundation-preview` renders no preview fixture and redirects to `/`.
10. On iOS, the universal `@expo/ui` controls render inside a valid native `Host` and expose the labels and changing values defined by the preview contract. Android-safe Host composition passes automated tests and the Android export resolves without an iOS-only module.
11. On iOS 26.6 with runtime glass support, the material fixture reports and renders `liquid glass`. With `material=fallback`, or when runtime support is absent, it reports and renders `blur` or `opaque fallback` with the same outer bounds, radius, padding, content order, and touch targets.
12. Full-resolution light and dark captures show every required preview section, no clipped or overlapping text, no missing material, and no content under an unsafe inset. Custom normal-sized text/background pairs meet a 4.5:1 contrast ratio and custom large text meets 3:1.
13. At the approved accessibility content-size category representing at least 200 percent text scaling, every section remains reachable by scrolling, every action remains operable, and no text or control overlaps or clips.
14. Argent `describe` exposes the preview title; the five labeled native controls; enabled, disabled, selected, and value states; `Action count: 0`; and `Action count: 1` after activation.
15. With Reduce Motion enabled, all state changes remain immediate and understandable while authored decorative animation is absent. Automated tests also cover the reduced-motion selection policy.
16. `bunx expo run:ios --device "iPhone 16 Pro"`, the iOS JavaScript and asset export, and the Android JavaScript and asset export succeed. No Android native build or emulator run is required in this module.
17. `bun run lint`, `bun run typecheck`, `bun run test`, `bun run test:coverage`, `bun run validate`, `bunx expo-doctor`, and `git diff --check` pass. Coverage is at least 90 percent for lines, statements, functions, and branches under the approved exclusions.
18. The debugger log registry contains no warning, error, or unhandled rejection caused by authored code. Any upstream warning is linked to a source or issue, recorded in `checkpoints.md`, and explicitly approved before completion.
19. The screenshot diff contains no unexplained changed region. Baseline creation or replacement has explicit human approval recorded in `checkpoints.md`.
20. Every implementation task has a Fable 5 checkpoint, independent GPT-5.6 Sol pass, and required Argent evidence.
21. Every completed task is an isolated lowercase conventional commit without signatures or co-author lines and is pushed to `origin/main` only after all gates pass.
22. `git ls-files` contains no private screenshot, `.artifacts/` file, `dist-validation/` file, or generated `ios/` or `android/` project.

## Open questions

None. The human approved the dependency set, direct Jest dependency, route migration, starter removal, iOS targets, development-only preview, Android build-only boundary, Argent MCP workflow, material fallback policy, named execution roles, and verified pushes to `origin/main` on 2026-08-30.

If the local Xcode simulator installation requires a manual component download or reinstall, implementation pauses and requests human intervention. Argent is a completion gate and cannot be bypassed.

Approval of this document authorizes Fable 5 to begin Phase 2 planning for `native-foundation` only. It does not authorize package installation, application code, or work on another module. Phase 2 must produce `tasks/plan.md` and `tasks/todo.md` for separate human review before implementation.
