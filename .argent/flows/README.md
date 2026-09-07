# pre-fork acceptance flows

- `prefork-native-icons.yaml`: full replay passed 33 executable steps. Native
  selection traits and screenshots separately confirmed Paper after relaunch;
  the flow's visible-option assertions do not prove the selected value themselves.
- `prefork-reference-seed.yaml`: recorded one-time acceptance on an empty development
  database. Do not reset an existing store to replay it. Fixture unit tests verify
  idempotency and the nonempty/release guards.
- `prefork-native-data.yaml`: recorded manual walkthrough passed. Full replay is
  unproven because the runner cannot reliably target the native consent button.
  The bounded replay stopped after 25 passing steps, 1 failed, and 15 skipped.

These are source flows, not private evidence. Screenshots and session output stay
ignored under `.artifacts/pre-fork/native-acceptance/`. The flows assume the approved
new bundle, demo data, and simulator account state described in `checkpoints.md`.
