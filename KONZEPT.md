# Sonnenfinsternis 2026 — App-Konzept

Web-App zur Vorbereitung auf die totale Sonnenfinsternis am **12. August 2026**.

---

## 0. Leitidee

Die App beantwortet in dieser Reihenfolge vier Fragen:

1. **Was passiert überhaupt?** (Neugier)
2. **Was sehe *ich*, von *hier* aus?** (Personalisierung)
3. **Wie sehe ich es wirklich — ohne dass es schiefgeht?** (Horizont, Augenschutz)
4. **Soll ich dafür verreisen?** (die Reise-Entscheidung — als Info, nicht als Rechner)

Leitmetapher: **kein Kalendereintrag, sondern ein Countdown zu einem Ereignis, das dir gehört.**
Aus einer abstrakten Astronomie-Meldung wird „um 20:31 Uhr, über deinem Dach, Richtung Westnordwest".

**Wichtigster Fakt fürs ganze Produkt:** Diese Finsternis ist keine Mittagsfinsternis wie
1999, sondern ein **Horizont-Ereignis am Abend**. In Mitteleuropa nur partiell (~85–92 %),
und die Sonne geht vielerorts *angebissen* unter. Darum ist „freie Sicht nach Westen"
wichtiger als alles andere.

> **Faktenbasis prüfen:** Die Bedeckungswerte einzelner Städte müssen vor dem Bau aus einer
> Primärquelle nachgerechnet werden. Alle Zahlen in diesem Dokument sind Platzhalter zur
> Illustration.

---

## Grundprinzip: Zwei Zustände

Die gesamte App kennt genau zwei Zustände:

- **Zustand A — Ohne Standort:** allgemeiner Verlauf, „die Weltbühne".
- **Zustand B — Mit Standort:** individuelles Briefing, „dein Himmel".

Die Seite ist **statisch** — sie sieht zu jedem Zeitpunkt gleich aus (kein zeitabhängiges
Umbauen der Oberfläche vor/am/nach dem Ereignis). Der einzige Unterschied ist: Standort
bekannt oder nicht.

---

## Zustand A — Ohne Standort („Die Weltbühne")

Ziel: In 10 Sekunden Faszination erzeugen, in 60 Sekunden Standort bekommen.
Kein Permission-Dialog beim ersten Frame.

- **A1 — Einstieg:** Großer, ruhiger Live-Countdown zur Totalität. Ein einordnender Satz:
  „Die erste totale Sonnenfinsternis über Europa seit 1999."
- **A2 — Schattenlauf (Hero):** Globus/Karte mit dem wandernden Mondschatten, scrubbar über
  eine Zeitleiste: Sibirien → Arktis → Grönland → Island → Atlantik → Nordspanien → Balearen.
  Darüber die Partialitätszonen als weiche Ringe („hier 90 %, hier 50 %, hier nichts").
- **A3 — „Wie sieht das aus?":** Himmelseindruck für drei Referenzorte nebeneinander —
  Nordspanien (Totalität), Berlin (~89 %), Rom (~40 %). Gleiche Darstellung, drastisch
  verschiedenes Erlebnis. Stärkstes Argument, den eigenen Standort zu verraten.
- **A4 — Standort-Aufruf:** Nicht „Standort erlauben", sondern **„Was siehst du von dir aus?"**
  Drei gleichwertige Wege: GPS · Ortssuche · Karte antippen. Kein Weg erzwingt ein Konto.
  Wer nichts angibt, kann trotzdem alles erkunden.

---

## Zustand B — Mit Standort („Dein Himmel")

Ein persönliches Briefing — alles in *deiner* Ortszeit, in *deiner* Himmelsrichtung.

- **B1 — Verdikt-Karte (ganz oben, ein Blick):** eine einzige große Aussage:
  > „Bei dir: 87 % Bedeckung — die Sonne geht halb verfinstert unter."
  > Beginn 19:36 · Maximum 20:31 · Sonnenuntergang 20:47 (vor Ende der Finsternis)

  Das „vor Ende der Finsternis" ist die kritische, standortabhängige Information.
- **B2 — Persönliche Zeitleiste:** echte Phasen: 1. Kontakt → Maximum → Sonnenuntergang →
  (ggf. 4. Kontakt, unsichtbar). In der Totalitätszone zusätzlich 2./3. Kontakt, Dauer auf die
  Sekunde, plus die „Perlen": Diamantring, Baily's Beads, Schattenbänder, Korona. Jede Phase
  antippbar → „Was passiert hier, wonach schaue ich, wann darf ich die Brille abnehmen?"
- **B3 — Horizont-Check** ← *Alleinstellungsmerkmal dieser Finsternis.*
  Weil die Sonne so tief steht, ist freie Westsicht entscheidend.
  - Kompass-Ansicht: „Beim Maximum steht die Sonne 8° hoch, Richtung 292° (WNW)."
  - Anschaulicher Anker statt Grad: „8° ≈ eine ausgestreckte Faust über dem Horizont."
  - **3D-Umgebungssimulation:** eine 3D-Ansicht der Umgebung des Standorts mit **Gebäuden und
    Gebirgen** (aus Höhen-/Gebäudedaten). Darüber die Sonnenbahn und die verfinsterte Sonne.
    Ein **Zeitschieber** simuliert den Verlauf: Man zieht durch die Zeit und sieht, wie die
    Sonne sinkt, sich der Bedeckungsgrad ändert — und ob Häuser oder Berge im Westen die Sonne
    verdecken, *bevor* die Finsternis endet. So erkennt man sofort, ob der eigene Standort
    freie Sicht hat.
  - Optional (später): Vorschläge für nahe Beobachtungsplätze mit freier Westsicht.
- **B6 — Checkliste & Countdown:** eine **einfache Checkliste** zur Vorbereitung, u. a.:
  - [ ] Finsternisbrille besorgen (ISO 12312-2) und auf Kratzer prüfen
  - [ ] **Wettervorhersage checken** (in den Tagen davor)
  - [ ] Beobachtungsplatz mit freier Sicht nach Westen suchen
  - [ ] Termin in den Kalender eintragen
  - [ ] Ggf. Anreise/Reise in die Totalitätszone planen

  Dazu Kalender-Export mit den korrekten lokalen Phasenzeiten und ein Countdown.

*(Bewusst nicht enthalten: Live-Wettervorhersage, Reise-Rechner, separater Live-Modus am
Ereignistag.)*

---

## Querschnittsthemen

- **Augenschutz — nicht als Fußnote.** Bei 87 % ist die Sonne noch blendend hell und
  schädigt die Netzhaut schmerzfrei. Prominent und wiederholt: Warnung, Norm ISO 12312-2,
  Bezugsquellen, Kratzer-Check. Regel: Brille nur *innerhalb* der Totalität abnehmen — sonst
  nie. Für Partial-Standorte: **Brille bleibt die ganze Zeit auf.**
- **Ehrlichkeit über 90 %.** „90 % sind fast total" ist falsch — es bleibt taghell. Die App
  erklärt das aktiv (Helligkeitsvergleich), statt Erwartungen aufzublasen.
- **Vertrauen & Privatsphäre.** Standort bleibt lokal, kein Konto nötig, alles auch ohne GPS
  per Ortssuche nutzbar. Teil des Produktversprechens, nicht Compliance-Übung.
- **Mehrsprachigkeit von Anfang an.** Die App wird von Beginn an internationalisiert (i18n)
  aufgebaut: alle Texte aus Sprachdateien, Datums-/Zeit-/Zahlenformate und Himmelsrichtungen
  lokalisiert, Umschaltung im UI, sinnvolle Default-Sprache aus Browser-Einstellung. Startset
  z. B. DE / EN / ES (Spanien liegt in der Totalitätszone) — erweiterbar.
- **Fotografie-Modus (optional):** kurzer, standortabhängiger Spickzettel — warum Handyfotos
  einer 87-%-Sonne enttäuschen und was stattdessen lohnt.

---

## Was die App bewusst *nicht* tut

- Kein Social-Feed, kein Login, keine Gamification.
- Keine Wettervorhersage in der App (nur „Wetter checken" auf der Checkliste).
- Kein Reise-Rechner, kein separater Live-Modus.
- Kein generischer Astronomie-Feature-Zoo. **Ein Ereignis, kompromisslos gut.**

---

## Der eine Screen, der alles trägt

Wenn nur eines gebaut wird: **B1 + B3** — Verdikt-Karte plus Horizont-Check.
„Was sehe ich, wann, in welcher Richtung, und ist etwas im Weg?" Das beantwortet keine
andere Quelle gut für diese sehr flach stehende Finsternis.
