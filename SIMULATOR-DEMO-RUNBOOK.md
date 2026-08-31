# EAS Simulator teaser runbook

status: dry run passed on 2026-08-31

go/no-go: **go for a live beat 3 inside an edited take.** The agent-driven flow was
stable. Record the build and simulator startup separately, omit board setup in the edit,
then capture the agent actions and final screenshot live.

## verified inputs

- expo account: `ramimaalouf`
- project: `@ramimaalouf/habit-tracker`
- app bundle id: `com.ramimaalouf.habittracker`
- source commit: `574fdb9b60cc27c38ac3e90e2136f3afb6e872ab`
- simulator build id: `85ca95a6-9dbf-45f5-b100-4c2e84a3a4b8`
- build fingerprint: `064e346793b7f79ec468ca0db5c49ff4bc5026c1`
- build artifact: `https://expo.dev/artifacts/eas/n__mBxFYiIqwBy887kzK15LadQU0l38am7Opl30XpEI.tar.gz`
- dry-run session id: `01a057e8-4556-73f6-aadf-576260928151`
- dry-run viewport: 402 by 874
- final evidence: `.artifacts/eas-simulator/demo-shot.png`

The build is reusable until the product source or native configuration changes. If the
source changes, compare the build fingerprint before filming. Do not use an older device
`.ipa`: it cannot run on the simulator and may contain stale product code.

## preflight

Run these from the habit tracker root. They are read-only and do not start billing.

```bash
npx --yes eas-cli@latest whoami
npx --yes eas-cli@latest simulator:availability --json
npx --yes eas-cli@latest simulator:list --status in-progress --platform ios --limit 20 --json
npx --yes eas-cli@latest build:view 85ca95a6-9dbf-45f5-b100-4c2e84a3a4b8 --json
```

Expected results:

- `whoami` returns `ramimaalouf`.
- simulator availability returns `"available": true`.
- there are no active iOS sessions before the take.
- the build is `FINISHED`, `isForIosSimulator` is `true`, and the fingerprint matches
  the verified input above.

Use `npx --yes eas-cli@latest` for these commands. Concurrent `bunx` invocations hit a
package-linking race during the dry run.

## start the filmed session

Start the session only after the simulator build exists. The tested command installs and
launches the build as part of startup, so there is no separate upload during billing.

```bash
printf '# managed by eas-cli\n' > .env.eas-simulator
npx --yes eas-cli@latest simulator:start \
  --platform ios \
  --type agent-device \
  --build-id 85ca95a6-9dbf-45f5-b100-4c2e84a3a4b8 \
  --name "Waitlist teaser dry run" \
  --max-duration-minutes 20 \
  --max-idle-time-minutes 5 \
  --non-interactive
```

For the final take, change only the session name to `Waitlist teaser take`.

The command prints:

- a simulator session page on expo.dev
- a `webPreviewUrl`
- confirmation that the `agent-device` session is ready

Do not open the preview URL on the simulator. Paste it into the desktop browser being
captured for the video. It shows the 402 by 874 iOS device and reflects agent actions in
real time. The dry-run URL stopped with the dry-run session and cannot be reused.

## open the app

Even when `--build-id` installs and launches the app, `agent-device` needs its own active
app session before `snapshot` works.

```bash
npx --yes eas-cli@latest simulator:exec \
  npx agent-device@latest open com.ramimaalouf.habittracker --platform ios
```

The expected output is `Opened: com.ramimaalouf.habittracker`.

## off-camera board setup

A fresh simulator install has an empty Ripples database. Set up one board in the same
session, then remove these commands from the edit.

```bash
npx --yes eas-cli@latest simulator:exec npx agent-device@latest snapshot -i
npx --yes eas-cli@latest simulator:exec npx agent-device@latest press @e8

npx --yes eas-cli@latest simulator:exec npx agent-device@latest snapshot -i
npx --yes eas-cli@latest simulator:exec npx agent-device@latest fill @e10 "Morning walk"

npx --yes eas-cli@latest simulator:exec npx agent-device@latest snapshot -i
npx --yes eas-cli@latest simulator:exec npx agent-device@latest press @e50
```

Those refs were the dry-run refs. Refs are frame-scoped, so use the current values from
each `snapshot -i` if they differ. The targets are, in order:

1. `Create Board`
2. the editable board-name field
3. `Save board`

The save returns to a visually clean home screen with one green `Morning walk` card.

## filmed agent flow

This is the short beat to keep in the edit. It creates three visible check-ins, opens the
board detail, and captures the proof.

```bash
npx --yes eas-cli@latest simulator:exec npx agent-device@latest snapshot -i
npx --yes eas-cli@latest simulator:exec npx agent-device@latest press @e10

npx --yes eas-cli@latest simulator:exec npx agent-device@latest snapshot -i
npx --yes eas-cli@latest simulator:exec npx agent-device@latest press @e10

npx --yes eas-cli@latest simulator:exec npx agent-device@latest snapshot -i
npx --yes eas-cli@latest simulator:exec npx agent-device@latest press @e10

npx --yes eas-cli@latest simulator:exec npx agent-device@latest snapshot -i
npx --yes eas-cli@latest simulator:exec npx agent-device@latest press @e9

sleep 1
npx --yes eas-cli@latest simulator:exec \
  npx agent-device@latest screenshot ./demo-shot.png
```

On the dry run, `@e10` was `Check in to Morning walk` and `@e9` was the `Morning walk`
board button. Read the current snapshot before every press. Any fill or press expires the
previous ref frame.

The final screen is good on camera because it is clearly different from the board list:

- native pushed navigation with a visible back control
- a full-year GitHub-style heatmap
- today's cell in green with `3 check-ins` in the accessibility snapshot
- a distinct metrics education surface
- native `Analytics`, `Check-Ins`, `Journal`, and add controls

## stop immediately

```bash
npx --yes eas-cli@latest simulator:stop --non-interactive
printf '# managed by eas-cli\n' > .env.eas-simulator
npx --yes eas-cli@latest simulator:list --status in-progress --platform ios --limit 20 --json
```

The last command must return an empty `sessions` array. This ends billing and prevents a
later command from targeting a stale session id.

## dry-run friction

- The fresh simulator build took about 8 minutes 49 seconds. Build before starting the
  simulator session.
- Existing EAS builds were device `.ipa` files and were not reusable.
- Calling `snapshot -i` before `agent-device open` returned `SESSION_NOT_FOUND`. Opening
  the bundle id fixed it immediately.
- Reusing a ref after `fill` returned an expired-ref error. A fresh snapshot before each
  action is required.
- The first screenshot immediately after navigation caught a partial status-bar frame.
  A short pause and a second screenshot were complete. Keep the `sleep 1` before the
  receipt capture.
- No streaming stall or interaction freeze occurred.
- Do not use `agent-device record` for this take. The current iOS recording path has a
  known reliability issue. Capture the browser preview with the desktop recorder and use
  `agent-device screenshot` only for the receipt.

## edit recommendation

Do not present this as one uninterrupted command sequence. Use one real session and cut
out boot time plus board setup:

1. show the real `simulator:start` command and its `webPreviewUrl`
2. cut to the browser preview after the board is ready
3. show the agent snapshots and presses in quick cuts
4. show `demo-shot.png` landing in the terminal
5. stop the same session on camera

Beat 3 does not need a prerecorded substitute. It is reliable enough to perform live in
the active session, with the final video assembled as an edited product capture.
