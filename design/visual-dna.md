# visual dna - habit tracker design language

this is a brief for a design expert. it defines the visual and interaction dna of a
habit tracker app. treat everything in "non-negotiables" as fixed; everything in
"open to your judgment" is where your expertise should push back and improve.

## the product in one paragraph

a habit tracker for people who quit habit trackers. it holds 1-3 habits maximum, ever.
logging is one tap and zero app opens: the home screen widget is the primary surface,
the app itself is settings and a light review space. the design must encode two product
principles at every level: **forgiving** (a missed day must never look or feel like
failure) and **glanceable** (state readable at arm's length in under one second).

## direction

**calm native.** the app should feel like apple made it. reference points: things 3,
apple fitness, apple reminders. it should be indistinguishable from a first-party app
at a glance, with one confident accent color as its only signature.

personality, in priority order:

1. **invisible by default** - the resting state has almost no copy, no ornament, pure state.
2. **calm and steady** - motion is gentle and brief. no confetti, no badges, no streak fireworks.
3. **warm at earned moments only** - exactly two moments get warmth: completing a habit
   (a small, satisfying settle + haptic) and returning after missed days (one kind line,
   e.g. "back at it"). nowhere else.

## non-negotiables

### native components first

- build from real native controls, not custom lookalikes: swiftui-backed components
  (via @expo/ui), system lists/grouped cards, native context menus, sheets, and toggles.
- icons are sf symbols only (expo-symbols). no custom icon set.
- respect platform conventions before inventing anything. if ios has a pattern for it,
  use the pattern.

### color

- system semantic colors for all surfaces and text: systemBackground,
  secondarySystemGroupedBackground, label, secondaryLabel, separator. this gives us
  correct light and dark mode for free.
- **one tint color** carries the entire identity. proposal: a deep teal
  (light mode ~#0A7B83, dark mode ~#4CC9D4 - tune these). it marks: completed state,
  the primary action, and nothing else.
- completion is expressed with the tint, never green-vs-red. **red does not exist in
  this app.** a missed day is a hollow shape or a neutral gray, not a warning.
- max one additional hue if the user has multiple habits and wants to tell them apart -
  but propose whether we even need that, or whether symbol + name is enough.

### typography

- sf pro, system text styles only (largeTitle, title2, headline, body, footnote) so
  dynamic type works everywhere.
- numerals (day counts, weekly tallies) may use sf pro rounded for warmth. this is the
  only typographic flourish allowed.
- no custom fonts. no thin weights below regular for anything meaningful.

### shape and layout

- grouped inset cards with continuous (squircle) corners, system margins.
- the core visual unit is the **week row**: seven dots, filled = done, hollow = open,
  faded dot = future. this unit must read identically in the app, the widget, and at
  0.5x scale. design it first; everything else derives from it.
- generous whitespace. if a screen feels sparse, it is correct.

### the forgiveness rule (applies to every design decision)

- no streak counters that reset to zero. progress is shown as "this week: 5 of 7"
  or "never miss twice", not an unbroken chain.
- a missed day is visually quiet: hollow, neutral, small. it must be less visually
  prominent than a completed day, never more.
- no notifications-as-nags in the visual language: reminder surfaces should read as
  an invitation ("evening walk?") not an alert.

### the widget is the product

- design the small and medium ios widgets **before** the app screens.
- small widget: one habit - symbol, name, week row, and today's state. the whole widget
  is a one-tap complete target.
- medium widget: up to 3 habits stacked, each row tappable.
- must be legible on any wallpaper, in light and dark, and in the lock screen
  accessory style (monochrome).

### motion and haptics

- system springs and transitions only, durations under 350ms.
- completing a habit: the dot fills with a soft spring settle + a light success haptic.
  this is the single most important interaction in the app - it should feel like
  closing a good notebook, not winning a slot machine.
- nothing loops, pulses, or animates while idle.

### accessibility

- full dynamic type support, contrast AA minimum on all text including on-tint,
  reduce-motion honored (fills become fades), voiceover labels on every state
  ("read 10 pages, completed today, 5 of 7 this week").

## screens to design

1. **today** (home): the 1-3 habit cards with week rows, tap to complete. this screen
   should need zero explanation.
2. **habit detail**: a calendar-ish month view of filled/hollow days, weekly totals,
   edit access. keep it read-mostly.
3. **new habit / edit**: name, sf symbol picker, schedule (daily or x-per-week),
   reminder time. one screen, native form components.
4. **small + medium widgets** and lock screen accessory.
5. **empty state** (first launch, zero habits): one line of copy, one action.
   warm, not salesy.
6. **the missed-days return state**: what the today screen looks like after 3 days away.
   this is the make-or-break screen for the forgiveness principle - design it explicitly.

## open to your judgment

- exact tint hue (teal is a proposal, not a decision)
- whether habit rows need per-habit color or symbol-only differentiation
- the month view's visual treatment on the detail screen
- how "never miss twice" is surfaced, if at all, without becoming a guilt mechanic
- dark mode nuances beyond the semantic-color defaults

## anti-goals (reject work that includes these)

- gamification: streaks-as-fire, badges, levels, confetti
- red, warning states, or any shame-coded visual
- dashboards, dense charts, statistics beyond the week and month views
- custom-drawn ui that imitates native controls
- more than one accent color doing identity work
- decorative illustration or mascots

## deliverables

- tint color final values (light + dark)
- the week-row component spec (sizes, spacing, dot states) at app, widget, and
  accessory scale
- figma (or equivalent) frames for the 6 screens above, light and dark
- motion spec for the complete interaction (curve, duration, haptic)
