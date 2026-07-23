# Technische Architektur

Umsetzungsentscheidungen für die Sonnenfinsternis-App (12. August 2026).
Ergänzt [`KONZEPT.md`](./KONZEPT.md) und [`WIREFRAMES.md`](./WIREFRAMES.md).

---

## Grundprinzip

- **Komplett statisch, kein Backend.** Die gesamte Finsternis-Mathematik läuft im Browser.
- **Privatsphäre by design:** Der Standort verlässt das Gerät nie; kein Konto, keine Nutzerdaten.
- **Offline-fähig (PWA):** Ab gesetztem Standort funktioniert alles offline (Konzept D4).
- **Hosting:** statischer Build, ausgeliefert über **bunny.net** (CDN).

---

## Stack (festgelegt)

| Schicht     | Wahl                                                                  |
|-------------|-----------------------------------------------------------------------|
| Framework   | **SvelteKit** (static adapter, prerendered)                           |
| Astronomie  | **`astronomy-engine`** (reines JS, im Browser) — Ergebnisse validiert |
| Karten/3D   | **MapLibre GL JS** (Globus-Projektion für A2, 3D-Szene für B3)        |
| Geocoder    | **VersaTiles Geocoder** (siehe Playground unten)                      |
| Kartendaten | **VersaTiles** Tiles (Satellit, OSM-Vektor, Elevation)                |
| i18n        | von Anfang an, Startset DE / EN / ES; Formate über native `Intl`      |
| Offline     | Service Worker (PWA), Ort-Kacheln beim Setzen cachen                  |
| Hosting/CDN | statisch über **bunny.net**                                           |
| Backend     | **keins**                                                             |

---

## Datenquellen (VersaTiles)

| Zweck      | URL                                               | Typ / Format            | Wichtig                                                           |
|------------|---------------------------------------------------|-------------------------|-------------------------------------------------------------------|
| Satellit   | `tiles.versatiles.org/tiles/satellite/tiles.json` | raster, WebP, z0–19     | Hintergrundtextur                                                 |
| OSM-Vektor | `tiles.versatiles.org/tiles/osm/tiles.json`       | vector (pbf)            | Layer `buildings`, Feld **`height`** (m), `min_height`, `hide_3d` |
| Elevation  | `tiles.versatiles.org/tiles/elevation/tiles.json` | raster, WebP, z0–**12** | **Terrarium-Encoding** → `raster-dem`, `encoding: "terrarium"`    |
| Geocoder   | Playground: `versatiles.org/playground/geocoder/` | —                       | Ortssuche + Reverse (für Karten-Tap)                              |

**Hinweise:**
- Elevation nur bis z12 → grob im Nahbereich, aber ausreichend für **Berge am Horizont**
  (Fernfeld). Das **Nahfeld** übernehmen die OSM-Gebäude.
- Gebäudehöhe kommt direkt aus `height` — kein Schätzen aus Stockwerken nötig.

---

## Komponenten

### 1. Astronomie-Engine
`astronomy-engine` rechnet für beliebige lat/lon: Bedeckungsgrad, Kontaktzeiten (1.–4.),
bei Totalität Dauer, sowie Sonnenhöhe/-azimut über die Zeit.
**Qualitätssicherung:** Ergebnisse für Referenzstädte gegen die publizierten
Espenak-/NASA-Tabellen gegenprüfen (räumt auch die widersprüchlichen Wikipedia-Werte aus).

### 2. Standort
- **GPS:** Browser-`Geolocation`-API.
- **Ortssuche:** VersaTiles-Geocoder.
- **Karten-Tap:** Klick auf Karte → Reverse-Geocoding für den Ortsnamen.
- Gesetzter Ort in `localStorage` **und** URL (`?lat=&lon=`) → teilbar, bleibt lokal.

### 3. Schattenlauf (A2)
MapLibre GL JS mit **Globus-Projektion**. Zwei getrennte Ebenen:
- **Ganzer Verlauf (vorberechnet, statisch):** Zentrallinie und Umbra-/Penumbra-Grenzen als
  zur **Build-Zeit berechnetes GeoJSON**, dargestellt als **gestrichelte Linien** — deuten den
  gesamten Pfad an, ohne den Blick zu dominieren.
- **Aktueller Schatten (live aus dem Schieber):** Zum jeweiligen Schieber-Zeitpunkt wird die
  Position und Form des Kernschattens (Umbra-Ellipse) + Penumbra **in Echtzeit** aus
  `astronomy-engine` gerechnet und als bewegte, durchgezogene Fläche gerendert. Optional live
  dazu die Tag-/Nacht-Grenze (Terminator).

So bleibt der Verlauf jederzeit als gestrichelte Spur sichtbar, während der Schieber den echten
Schatten flüssig darüberführt — kein Interpolieren aus vorgerechneten Stützstellen.

### 4. 3D-Horizont + Zeitschieber (B3) — Kern-Feature
MapLibre-3D-Szene aus **Terrain (Elevation, Fernfeld)** + **`fill-extrusion` Gebäude
(OSM, Nahfeld)**. Zeitschieber = reine UI, teilt die Astronomie-Engine.
Details zur Sonne siehe eigener Abschnitt unten.

### 6. Checkliste (B6)
**Nicht interaktiv** — schlichte Textaufzählung. `.ics`-Kalender-Export clientseitig.

### 7. i18n
Texte aus Sprachdateien, `Intl` für Datum/Zahl/Himmelsrichtung, Umschaltung im Header,
Default aus Browser. Start: DE / EN / ES.

### 8. App-Shell
SvelteKit prerendered → statische Dateien auf bunny.net. Service Worker macht die App nach
dem ersten Besuch (und ab gesetztem Standort) offline nutzbar.

---

## Realistische Darstellung der Sonne (B3) — Kernproblem gelöst

Drei Garantien. „Realistisch" = geometrisch korrekt platziert und visuell plausibel verdeckt.

**1. Richtiger Ort am Himmel.**
`astronomy-engine` → exaktes (Azimut, Höhe). Die Sonne wird als Objekt in dieselbe 3D-Welt
gesetzt, nicht als Overlay: **`CustomLayerInterface`-WebGL-Ebene**, die MapLibres
Projektionsmatrix mitbenutzt. Position = Beobachter + Richtungsvektor (az, alt) in großer
Distanz → teilt den Raum mit Terrain und Gebäuden.

**2. Richtige Kamera (Ego-Perspektive).**
MapLibres Standardkamera blickt herab und ist auf ~85° Pitch begrenzt — untauglich für eine
8°-Sonne. **`map.setFreeCameraOptions()`** setzt die Kamera exakt an die Augenhöhe am
Beobachterort mit frei gewählter, nahezu horizontaler Blickrichtung → umgeht die Pitch-Grenze
und liefert echte First-Person-Sicht.

**3. Plausible Verdeckung (rein visuell, keine textliche Aussage).**
Gebäude (`fill-extrusion`) schreiben in den Tiefenpuffer → die WebGL-Sonne wird per Depth-Test
korrekt hinter Häusern verdeckt; Terrain verdeckt die Sonne best effort. Der Nutzer sieht in
der 3D-Szene selbst, ob etwas im Weg ist. **Bewusst keine berechnete Aussage** wie „Sonne ab
20:40 verdeckt" — eine verlässliche Strahlen-Abtastung von Terrain und Gebäuden ist im Frontend
nicht leistbar (Elevation nur z12, Gebäude nur Nahfeld, teures Tile-Sampling). Die einzige harte
textliche Zeitangabe ist der **Sonnenuntergang** (geometrisch, aus `astronomy-engine` — kein
Gelände nötig).

**Aussehen (Sichel, Größe).**
Bedeckungsgrad/Magnitude aus `astronomy-engine` → Sichel-Geometrie (Sonnen-/Mondscheibe,
Radien ~0,25°, Versatz aus Magnitude) als Shader/Quad. **Ehrlicher Zielkonflikt:** die echte
Sonne ist ~0,5° groß, im ~37°-Sichtfeld ein winziger Punkt → **maßvolle Vergrößerung (2–4×)**
als klar gekennzeichnete Darstellungshilfe, während die **exakten Zahlen numerisch**
eingeblendet bleiben. Atmosphären-Tönung optional über MapLibres `sky`.

**Absicherung:** gerenderte Az/Höhe und Kontaktzeiten gegen `astronomy-engine` und Espenak
gegenprüfen; Zahlen sichtbar im UI → Realismus ist prüfbar, nicht behauptet.

---

## Offene Punkte / Risiken

- **Elevation z12** im Nahbereich grob — prüfen, ob Berge am Horizont visuell überzeugend
  wirken; Nahfeld tragen die Gebäude.
- **`setFreeCameraOptions` + Terrain:** bekannte Kamera-Clipping-Eigenheiten testen.
- **Terrain-Verdeckung der Sonne:** MapLibre-Tiefenpuffer fürs Terrain ist unzuverlässig →
  Sonne hinter Bergen nur best effort, rein visuell, keine textliche Aussage.
- **Live-Schatten (A2):** Umbra-Ellipse zur Schieber-Zeit aus Besselschen Elementen /
  `astronomy-engine` in Echtzeit rechnen — Performance beim Scrubben prüfen.
- **Sonnengröße:** Vergrößerungsfaktor (2–4×) ist eine UX-Entscheidung — mit echten Renders
  kalibrieren.
- **Sichel-Orientierung:** Positionswinkel der Sichel korrekt aus der Geometrie ableiten
  (nicht raten), sonst „falsch herum".
- **Geocoder-Limits/Attribution** von VersaTiles prüfen.
