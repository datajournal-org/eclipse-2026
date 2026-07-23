# Prototypen A2 & B3

Technische Durchstiche für die beiden anspruchsvollsten Screens der Eclipse-App.

## Starten

ES-Module + Import-Maps brauchen einen HTTP-Server (kein `file://`):

```bash
cd prototype
npm install          # nur für die Node-Validierung nötig
npx serve .          # oder: python3 -m http.server 8000
```

Dann `http://localhost:8000/` öffnen.

## Inhalt

| Datei | Screen | Zeigt |
|---|---|---|
| `index.html` | Einstieg | Links zu A2/B3 |
| `a2.html` | **A2 Schattenlauf** | MapLibre-Globus, ganzer Pfad **gestrichelt** (vorberechnet), **Live-Kernschatten** in Echtzeit aus dem Schieber |
| `b3.html` | **B3 3D-Horizont** | Ego-Blick nach Westen, VersaTiles Terrain + Gebäude, **Sonne als Custom-WebGL-Layer** mit geometrisch orientierter Sichel; Ort via `?lat=&lon=` |
| `eclipse.mjs` | geteilt | Finsternis-Mathematik (läuft in Node **und** Browser) |
| `validate.mjs` | — | prüft die Mathematik gegen bekannte Werte: `node validate.mjs` |

## Validierung (Node)

```bash
node validate.mjs
```

Belegt u. a.:
- Schattenzentrum stimmt **auf 0,0 km** mit `SearchGlobalSolarEclipse` überein
  (Schlüssel: Sonne **mit Aberration**).
- Pfad läuft Arktis → Island (17:46 UTC) → Nordspanien (18:30 UTC).
- Bedeckung Berlin **84,8 %**, München **88,7 %**, Oviedo total — deckt sich mit den
  bekannten Zahlen (und erklärt „München > Berlin": südlicher, näher am Pfad).
- Die Sichel-Geometrie in B3 (eigene Disk-Overlap-Formel) trifft astronomy-engines
  Bedeckungswert auf ~1 %.

## Gelöste Render-Fallstricke (per Playwright-Screenshots diagnostiziert)

- **`@versatiles/style` braucht im Browser `baseUrl`.** Ohne Option löst `colorful()` Kachel-,
  Sprite- und Glyph-URLs gegen `location.origin` auf (für Self-Hosting) → 404 auf fremdem
  Server, weißer Boden. Fix: `colorful({ baseUrl: 'https://tiles.versatiles.org' })`.
- **Custom-WebGL-Sonne wurde von der Far-Plane geclippt.** Bei 30 km Distanz lag `ndcz > 1` →
  komplett unsichtbar. Fix: im Vertex-Shader `clip.z = min(clip.z, clip.w*0.9999)` — Sonne
  bleibt innerhalb der Far-Plane, wird aber weiterhin per Tiefentest von Gebäuden verdeckt.
- **Diagnose-Harness:** `node diag.mjs <url> <out.png> [sliderFrac]` rendert B3 headless
  (Playwright/Chromium mit WebGL), sammelt Konsolen-/HTTP-Fehler, introspektiert den
  Map-Zustand und macht einen Screenshot.

## Bekannte Grenzen (Prototyp)

- **Visuell noch nicht abgenommen:** Die WebGL-Darstellung (B3-Sonne, Depth-Occlusion durch
  Gebäude, Terrain hinter der Sonne) muss im Browser geprüft werden — Node deckt nur die
  Mathematik ab.
- **Kamera B3:** Ego-Blick an Augenhöhe via `calculateCameraOptionsFromTo` (v5 hat kein
  `FreeCameraOptions`). Pitch bleibt auf 85° begrenzt → Sonne im oberen Bildbereich.
- **Sonnengröße:** feste 46 px (vergrößert, Legibilitäts-Entscheidung) — nicht winkelgetreu.
- **A2 Penumbra/Partialitätsringe** (90/50/0 %) noch nicht dargestellt; nur Kernschatten +
  Zentralpfad. Ringe = Build-Zeit-Isolinien aus `localCircumstances`, als nächster Schritt.
- **Terrain-Verdeckung der Sonne:** per Horizont-Abtastung entlang des Azimuts (Fade unter dem
  Gelände-Horizont). Gebäude verdecken die Sonne per Tiefenpuffer. Keine berechnete *Textaussage*.
- **B3-Diagnose:** die Debug-Zeile unten zeigt Bodenhöhe, Gelände-Horizont und ob die
  OSM-Kacheln geladen sind; Style-/Kachel-Fehler erscheinen rot.
