# Screen flow & wireframes

Mobile-first (portrait). All numbers are placeholders.

> **This is the design intent, not a description of the build.** Three blocks below were never built —
> **A3** (three reference locations), **B2** (phase timeline) and the header's **ℹ About**. B2 in particular
> was _decided against_ rather than deferred: the phase information lives in B3's scrubber ticks and
> totality band (TESTING.md §7). Each is marked inline. Going the other way, `TimeZoneNote` ships between
> A2 and the B block and appears in no wireframe.
>
> **Rendered wireframes:** [`wireframes.html`](./wireframes.html) in this directory is the source of truth.
> It was also published as an artifact
> (<https://claude.ai/code/artifact/7457c9a1-a56a-4eb1-9785-4aac6fc856e1>), which may not be reachable
> outside the account that created it.
> This document describes the flow and the content per screen; the HTML shows the layout.

---

## Flow overview

```mermaid
flowchart TD
    A["State A: NO location<br/>(world stage · static)"]
    A --> A1["A1 · Countdown"]
    A --> A2["A2 · Shadow run"]
    A --> A3["A3 · 3 reference locations<br/>(not built)"]
    A --> A4["A4 · “Where are you?”"]

    A4 --> SET{"Set location<br/>GPS · place search · map"}
    SET --> B["State B: WITH location<br/>(“Your sky”)"]

    B --> B1["B1 · Verdict card"]
    B --> B3["B3 · 3D horizon<br/>+ time slider"]
    B --> B2["B2 · Timeline (phases)<br/>(not built)"]
    B --> B6["B6 · Checklist + countdown"]
    B --> CH["Change / clear location"]
    CH -.-> A

    X["Cross-cutting (everywhere):<br/>⚠ Eye safety · 🌐 Language<br/>(ℹ About not built)"]
```

States A and B are **the same screen** — B only replaces the "Where are you?" block with the
personal briefing. No page change, no time-dependent rebuilding.

---

## State A — no location ("The world stage")

One scrollable screen. Order and content of the blocks:

- **Header (everywhere):** ☀︎ Eclipse 2026 · 🌐 Language. _(ℹ About is not built; the `nav.about`
  string exists in all three catalogues but nothing renders it.)_
- **A1 — Countdown:** a large live countdown "20 d : 04 : 12 to the total eclipse", below it the
  framing sentence "The first total solar eclipse over Europe since 1999."
- **A2 — Shadow run:** globe with the entire shadow path as a **dashed trace** (Siberia →
  Iceland → Spain); the **current shadow** moves live over a scrubbable timeline (17:30 – 18:30
  UTC) on top, with partiality rings (90 / 50 / 0%).
- **A3 — What does it look like?** _(not built)_ — three reference locations side by side with the same
  rendering but a drastically different experience — northern Spain (100%, total) · Berlin
  (89%) · Rome (40%).
- **A4 — Location call:** heading "What do you see from where you are?" (not "Allow location"),
  three equal buttons: 📍 Use location · 🔍 Search place · 🗺 Tap on map.
- **Eye-safety footer:** ⚠ "Never look at the Sun without tested eclipse glasses."

---

## State B — with location ("Your sky")

Head: **📍 the set location** (e.g. "Berlin, Germany") with "change". Planned order:
**B1 → B3 → B2 → B6** — "Can I even see it?" (B3) deliberately comes before "When exactly?" (B2).
_Built order is **B1 → B3 → B6**_, with a `SectionDivider` opening the block; B2 was folded into B3.

### B1 — Verdict card

A single big statement, one glance: eclipsed solar disc + **"87% obscuration"**, the sentence
"The Sun sets half eclipsed." Below it the key figures — begins 19:36 · maximum 20:31 ·
**sunset 20:47 (⚠ before the eclipse ends)**. Eye-safety verdict: "Partial — keep the glasses
on **the whole time**, never take them off."

### B2 — Personal timeline (phases) _(not built — folded into B3)_

A horizontal timeline with the real local phases (1st contact → maximum → sunset), each phase
tappable with "what do I look for, when may the glasses come off?":

- **19:36 · 1st contact** — the Moon touches the Sun.
- **20:31 · maximum (87%)** — greatest obscuration, crescent-shaped.
- **20:47 · sunset** — the Sun disappears, still eclipsed.
- In the zone of totality additionally: 2nd/3rd contact, duration to the second, diamond ring ·
  Baily's beads · corona · shadow bands.

### B3 — 3D horizon + time slider _(core feature)_

Header line: "At maximum: Sun **8° high, towards 292° WNW** (≈ a fist above the horizon)."
Below it a **3D view of the surroundings** of the location with **mountains and buildings**, over
it the Sun's path and the eclipsed Sun at its real size. A **time slider** (19:36 – 20:47) runs
through the sequence; live alongside: ☀ altitude · ◐ obscuration · time. The surroundings give the
lay of the land; the Sun is drawn on top and stays visible until it sets (terrain occlusion is
intentionally not modelled — the observer's height is unknown). As a hard time, **sunset** is
given.

### B6 — Checklist & countdown

Countdown (same as A1) plus a simple checklist:

- [ ] Get eclipse glasses (ISO 12312-2) + check them for scratches
- [ ] **Check the weather forecast** _(only as an item — no forecast in the app)_
- [ ] Find a spot with a clear western view
- [ ] Add the date to your calendar
- [ ] If applicable, plan travel into the zone of totality

Plus "📅 Export to calendar" with the correct local phase times.

---

## Cross-cutting elements (present everywhere)

- **🌐 Language:** i18n from the start. Switching in the header (initial set DE / EN / ES),
  default from the browser setting; time/number formats and compass directions localised.
- **⚠ Eye safety:** in A as a footer, in B in the verdict and in the phases.
   - Partial location → "Keep the glasses on the whole time."
   - Totality location → "Only take them off _during_ totality."
- **ℹ About** _(not built)_**:** legal notice, data sources, note "the location stays local, no account
  needed".

---

## Order on a single page (scroll order)

**State A (planned):** Header → A1 countdown → A2 shadow run → A3 three locations → A4 location call →
eye safety.
**State A (built):** Header → A1 countdown → A2 shadow run → TimeZoneNote → A4 location call → eye safety.

**State B (planned):** Header → 📍 location → B1 verdict → B3 3D horizon → B2 timeline → B6 checklist.
**State B (built):** Header → A1 countdown → A2 shadow run → TimeZoneNote → divider → 📍 location →
B1 verdict → B3 3D horizon → divider → B6 checklist. As planned, the A blocks stay and only the A4
location call is replaced — B is appended below it.

## Segment grammar

Every section on the page is at most four slots, in this order (shared classes in `base.css`):

1. **Header** — `.block-head`: one `h2`, optionally one right-aligned meta (`.eyebrow` date on A2, the
   `.place` name + change button on B1). Nothing else at heading weight.
2. **Intro** — `.sub`: optional, **one line**, muted. If it needs a second sentence, the graphic is not
   carrying its weight — fix the graphic, not the text.
3. **Content** — the stage / list / graphic. All controls (time sliders, readouts, buttons) live inside
   this slot, styled as part of the content.
4. **Footer** — `.seg-foot`: optional, one caption line for context that must not interrupt reading
   (e.g. A2's time-zone note).

Nothing floats between sections — the page is sections and `SectionDivider`s only, enforced by
`tests/segments.spec.ts`. Card borders are reserved for **actions** (the location CTA, the donate box);
content sections separate by whitespace alone.

**Sanctioned exceptions:** the countdown is the page's hero and carries no header — a "Countdown"
heading over giant digits would be noise. The donate card is likewise headerless: it is a personal note,
not a titled section. And the verdict's eye-safety line keeps its left accent bar — the one piece of
advice on this page that protects eyesight is allowed to interrupt the calm. All three are named in
`tests/segments.spec.ts`; a new headerless section or a new border fails there until it is sanctioned
here.
