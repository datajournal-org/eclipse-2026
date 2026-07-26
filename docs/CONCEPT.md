# Solar Eclipse 2026 — App Concept

Web app to prepare for the total solar eclipse on **12 August 2026**.

---

## 0. Guiding idea

The app answers four questions, in this order:

1. **What is actually happening?** (curiosity)
2. **What do _I_ see, from _here_?** (personalisation)
3. **How do I really see it — without it going wrong?** (horizon, eye safety)
4. **Should I travel for it?** (the travel decision — as information, not a calculator)

Guiding metaphor: **not a calendar entry, but a countdown to an event that belongs to you.**
An abstract astronomy notice turns into "at 20:31, over your roof, towards west-northwest".

**The single most important fact for the whole product:** this eclipse is not a midday eclipse
like 1999, but a **horizon event in the evening**. In Central Europe only partial (~85–92%),
and in many places the Sun sets while still _bitten into_. That is why "a clear view to the
west" matters more than anything else.

> **Verify the facts:** the obscuration values for individual cities must be recomputed from a
> primary source before building. All numbers in this document are placeholders for illustration.

---

## Core principle: two states

The entire app has exactly two states:

- **State A — no location:** the general run of the event, "the world stage".
- **State B — with location:** an individual briefing, "your sky".

The page is **static** — it looks the same at any point in time (no time-dependent rebuilding
of the interface before/at/after the event). The only difference is: location known or not.

---

## State A — no location ("The world stage")

Goal: spark fascination in 10 seconds, get a location in 60 seconds.
No permission dialog on the first frame.

- **A1 — Entry:** a large, calm live countdown to totality. One framing sentence:
  "The first total solar eclipse over Europe since 1999."
- **A2 — Shadow run (hero):** globe/map with the moving lunar shadow, scrubbable along a
  timeline: Siberia → Arctic → Greenland → Iceland → Atlantic → northern Spain → Balearics.
  Over it, the partiality zones as soft rings ("90% here, 50% here, nothing here").
- **A3 — "What does it look like?":** a sky impression for three reference locations side by
  side — northern Spain (totality), Berlin (~89%), Rome (~40%). Same rendering, a drastically
  different experience. The strongest argument for revealing one's own location.
- **A4 — Location call:** not "Allow location", but **"What do you see from where you are?"**
  Three equal paths: GPS · place search · tap the map. No path forces an account. Anyone who
  gives nothing can still explore everything.

---

## State B — with location ("Your sky")

A personal briefing — everything in _your_ local time, in _your_ compass direction.

- **B1 — Verdict card (right at the top, one glance):** a single big statement:

   > "For you: 87% obscuration — the Sun sets half eclipsed."
   > Begins 19:36 · maximum 20:31 · sunset 20:47 (before the eclipse ends)

   The "before the eclipse ends" is the critical, location-dependent information.

- **B2 — Personal timeline:** the real phases: 1st contact → maximum → sunset → (possibly 4th
  contact, invisible). In the zone of totality additionally 2nd/3rd contact, duration to the
  second, plus the "pearls": diamond ring, Baily's beads, shadow bands, corona. Each phase
  tappable → "What happens here, what do I look for, when may I take the glasses off?"
- **B3 — Horizon check** ← _the unique feature of this eclipse._
  Because the Sun sits so low, a clear view to the west is decisive.
   - Compass view: "At maximum the Sun is 8° high, towards 292° (WNW)."
   - A tangible anchor instead of degrees: "8° ≈ a clenched fist held out above the horizon."
   - **3D environment simulation:** a 3D view of the location's surroundings with **buildings and
     mountains** (from elevation/building data). Over it, the Sun's path and the eclipsed Sun. A
     **time slider** simulates the run of events: you drag through time and watch the Sun sink,
     the obscuration change — and whether houses or mountains in the west hide the Sun _before_
     the eclipse ends. That way you immediately see whether your location has a clear view.
   - Optional (later): suggestions for nearby observing spots with a clear western view.
- **B6 — Checklist & countdown:** a **simple checklist** for preparation, among others:
   - [ ] Get eclipse glasses (ISO 12312-2) and check them for scratches
   - [ ] **Check the weather forecast** (in the days beforehand)
   - [ ] Find an observing spot with a clear view to the west
   - [ ] Add the date to your calendar
   - [ ] If applicable, plan travel into the zone of totality

   Plus a calendar export with the correct local phase times, and a countdown.

_(Deliberately not included: live weather forecast, travel calculator, a separate live mode on
the event day.)_

---

## Cross-cutting topics

- **Eye safety — not a footnote.** At 87% the Sun is still blindingly bright and damages the
  retina painlessly. Prominent and repeated: warning, the ISO 12312-2 standard, sources,
  scratch check. Rule: only take the glasses off _during_ totality — otherwise never. For
  partial locations: **the glasses stay on the whole time.**
- **Honesty about 90%.** "90% is almost total" is wrong — it stays daylight-bright. The app
  actively explains this (a brightness comparison) instead of inflating expectations.
- **Trust & privacy.** The location stays local, no account needed, everything usable without
  GPS via place search. Part of the product promise, not a compliance exercise.
- **Multilingual from the start.** The app is built internationalised (i18n) from the beginning:
  all text from language files, date/time/number formats and compass directions localised,
  switching in the UI, a sensible default language from the browser setting. Initial set e.g.
  DE / EN / ES (Spain lies in the zone of totality) — extensible.
- **Photography mode (optional):** a short, location-dependent cheat sheet — why phone photos of
  an 87% Sun disappoint and what is worth doing instead.

---

## What the app deliberately does _not_ do

- No social feed, no login, no gamification.
- No weather forecast in the app (only "check the weather" on the checklist).
- No travel calculator, no separate live mode.
- No generic astronomy feature zoo. **One event, uncompromisingly good.**

---

## The one screen that carries everything

If only one thing gets built: **B1 + B3** — the verdict card plus the horizon check.
"What do I see, when, in which direction, and is anything in the way?" No other source answers
that well for this very low-lying eclipse.
