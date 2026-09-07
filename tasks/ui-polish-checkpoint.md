# UI polish checkpoint - 2026-09-07

The user's request in this session explicitly authorizes the UI amendments recorded in `SPEC-ripples-product.md`: translucent Home/detail headers, larger plus and icon controls, doubled Home history with even spacing and a subtle border, an expanded native icon sheet, removal of example prompts, and richer habit analytics. Widget history remains seven days. No further approval is required for these requested changes.

## Delivered

- `d95f53b`: native translucent Home/detail headers, icon controls, fourteen actual history days, adjacent today spacing, and habit-colored card borders.
- `5347144`: immediate real metrics, weekly completion, monthly active days and scaled charts, factual analytics summaries, and icon-only detail actions with accessible labels.
- `6f41870`: native icon sheet, 64 valid SF Symbols, eight categories, keyword search, Android/web fallback artwork, and saved/draft icon behavior.
- `565245f`: reproduced and fixed long-title Undo clipping, including bottom safe-area spacing.

## Validation

- Full `bun run validate`: 36 suites and 490 tests passed, including coverage gates. Core coverage remains 100% on all four metrics. Log: `.artifacts/ui-polish-validation.log`.
- After the final Undo layout fix: lint, typecheck, and the 14 Home/detail/error-flow tests passed.
- Native QA used a separate iPhone 17 Pro Max on iOS 27, `705C1405-E555-4C11-840D-A874D16FA712`, with the existing development build and Metro on 8081.
- Initial QA verified detail scrolling, fourteen Home bars and larger plus, unclipped detail footer, zero-history metrics, and no example prompts. It did not adequately verify header transparency; the user's follow-up identified the remaining opaque cutoff, corrected below.
- Verified searching `pool`, selecting Swimming, saving, and reopening with the chosen icon; sheet expands when searching with the keyboard. Automated tests also cover category filtering, no results, dismissal, and cancelled edits.
- Verified one remaining check-in produces a one-day streak, one active day, 100% observed consistency over one tracked day, and upcoming weekday states. Scrolled the analytics sheet through comparison, consistency, and streak charts.
- Reproduced Undo clipping with a long habit title. After the fix the complete 44-point Undo target stays visible, the title wraps, and tapping Undo removes the new check-in.

## Shared workspace

The concurrent reminder, platform, assets, and pre-fork work was preserved. Commits were restricted to this session's files; the form's reminder changes were committed by their owning session before the icon commit. The other session's simulator and shared Metro were left running.

This companion checkpoint avoids editing `checkpoints.md` while the other session is actively staging its own checkpoint there. Android rendering is covered by component tests; this session's interactive QA was iOS-only.

## Header correction - 2026-09-07

- Reproduced the hard header cutoff with twelve disposable QA boards on the isolated simulator. Changing the blur option alone did not fix it.
- Removed the fixed header material on iOS 26+ while preserving the older iOS fallback. Home and detail now request native `soft` scroll-edge effects after their scroll views finish native layout.
- Preserved each screen's root native view with `collapsable={false}`. Native hierarchy inspection showed React Native had flattened the background into an empty first sibling, so the native navigation library's first-descendant search could not reach the scroll view.
- Readiness resets when the scroll view unmounts, allowing the effect to attach again after replacement or recovery.
- Verified Home after a fresh app launch with cards visible and softly blurred behind the status bar and navigation controls. Verified detail with larger Dynamic Type, scrolling the metrics behind the same header. Restored the simulator's text size afterward.
- Lint, typecheck, and all 40 tests across the three Home/detail feature suites passed. No native rebuild or new dependency was needed.
- Local visual evidence: `.artifacts/header-home-scroll.png` and `.artifacts/header-detail-large-text.png`. QA boards belong only to the isolated simulator; the original simulator and Metro were preserved.
