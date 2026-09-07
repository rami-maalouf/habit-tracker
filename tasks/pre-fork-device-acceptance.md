# remaining signed acceptance

Source: `eb2189f`. EAS development build:
`6d550951-0fe7-4e16-9aee-9e68024b9ec5`.
Build status and installation artifact must be checked before using it.

The app is `studio.orbitlabs.habittracker`, separate from the old bundle.
CloudKit container: `iCloud.studio.orbitlabs.habittracker`; zone: `habit-tracker`.
Use Development on both targets. Do not mix this acceptance build with a Production
CloudKit build. Do not sign into a different iCloud account in an already-bound store.

## prerequisites

- A connected, unlocked registered physical iPhone with the new signed build.
- A second signed target using the same iCloud test account and environment.
- The development client connected to this source's Metro server.
- Launch once to create/migrate the app-group database before running an intent.
- Record only synthetic acceptance boards; private evidence stays in `.artifacts/`.

## cloudkit convergence

1. Enable iCloud Sync through its consent on both targets. Verify both reach
   Up to Date and the waiting count drains. Retain any failure as an open finding.
2. Create a synthetic board on A. Verify its name and configuration on B. Edit
   its name on B and verify A updates after returning to the foreground.
3. Create check-ins on both targets. Compare logical dates, counts, and history.
4. Archive on A, restore on B, then delete the acceptance board. Verify active and
   archived lists agree and deleted records do not reappear after relaunch.
5. Take both targets offline. Create different boards and check-ins on each.
   Reconnect in both orders across two trials; all independent records must merge.
6. Edit the same record independently offline, reconnect, and verify both converge
   to the greatest mutation stamp. Repeat with an edit/delete conflict. A stale
   returning device must not restore a deleted record.
7. Leave Settings, mutate on Home, background/foreground, and verify sync still runs.
   Disable sync during a fetch, mutate locally, and verify local use remains intact.

## app intents, widget, and icon

1. In Shortcuts, confirm exactly three public Ripples actions. Check In with an
   active board, first with defaults and then explicit supported parameters.
   Verify the reported logical date, count, history, and widget projection.
2. Run Remove Latest Check-In. Cancel once and verify no mutation. Confirm once
   and verify only the selected latest entry disappears. Try an empty date and
   verify an actionable not-found result without a partial write.
3. Run Get Today's Check-Ins with and without a board. Verify board names/counts
   for each board's current logical date and no note text in results.
4. Run the Check In Siri phrase and verify the resulting check-in in the app.
   Verify archived/deleted entities return actionable results.
5. Add the supported Home Screen widget, confirm projection updates, and confirm
   its quick action opens Add Check-In. In-place widget writes remain out of scope.
6. Change Default to Midnight, relaunch, then Paper and relaunch. Confirm both the
   SpringBoard icon and Settings selection persist. Restore Default when finished.

## closure

Record target/build/environment, observed results, independent verification, and
private Argent evidence paths in `checkpoints.md`. Only then close 3.1/3.2/3.8,
verify clean pushed `main`, and create `ripples-v1-fork-point`. Release destination
URLs are the only currently approved deferral; signed acceptance is still pending.
