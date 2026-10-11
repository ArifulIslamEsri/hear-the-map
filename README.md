# Hear the Map

Explore terrain and earthquakes by sound. Built with the
[ArcGIS Maps SDK for JavaScript](https://developers.arcgis.com/javascript/latest/) 5.1.

Live demo: https://hear-the-map.vercel.app (use headphones)

## What it is

I wanted to see whether someone who can't see the screen could still explore a map, not just read a
sentence about it. So this app turns the map into sound:

- Pitch follows the elevation under your pointer. Low notes are lowlands, high notes are mountains.
- Water (sea level or below) is a soft wash of noise instead of a note.
- Left and right in your headphones match west and east on the screen.
- Click the map (or press Q) and recent earthquakes ping back like sonar. Closer ones come back first,
  stronger ones are louder, and shallow ones sound brighter.
- Press Space and the whole view plays as a melody from west to east, so you can hear the terrain profile.

Everything is also announced in an ARIA live region for screen readers, and V turns on speech.

It's also meant as a pattern other developers can reuse. The sound part is plain JavaScript on top of
standard SDK APIs (`ElevationLayer`, `ElevationSampler`, `FeatureLayerView.queryFeatures`,
`reactiveUtils`), so you could swap the earthquakes for flood gauges or bus stops, and the elevation for
any raster.

## Why I built it

About 43.3 million people are blind and 295 million have moderate or severe vision impairment
([The Lancet Global Health, 2021](https://pmc.ncbi.nlm.nih.gov/articles/PMC7820390/)). For them a web map
is usually just an image with a short description. A description like "Map of California" tells you there
is a map, but it won't tell you that Death Valley, below sea level, is only about 136 km (85 miles) from
Mount Whitney, the highest point in the lower 48. Sound lets you find things like that yourself.

It also matters for the agencies that publish maps. The DOJ's ADA Title II rule requires state and local
government web content to meet WCAG 2.1 AA. After the interim final rule of April 20, 2026, the deadlines
are April 26, 2027 for larger entities and April 26, 2028 for smaller ones
([summary](https://accessibility.arizona.edu/news/doj-issues-interim-final-rule-title-ii-digital-accessibility-compliance-dates)).
A lot of those maps are made with ArcGIS.

## Related work

Sound maps aren't a new idea. Projects I looked at:

- [iSonic](https://www.cs.umd.edu/projects/hcil/audiomap) (University of Maryland, mid-2000s): a research
  prototype that sonified choropleth maps for blind users.
- [Bearman & Fisher, 2012](https://research-portal.uea.ac.uk/en/publications/using-sound-to-represent-spatial-data-in-arcgis/):
  an ArcMap extension that played raster values as piano notes.
- [Audiom](https://www.ktdrr.org/products/ktcasebook/audiom-worlds-most-inclusive-map-viewer.html) by XR
  Navigation: an accessible map viewer.
  [ArcNews (Summer 2026)](https://www.esri.com/about/newsroom/arcnews/pressing-the-up-arrow-big-step-forward-in-accessibility)
  shows it connected to ArcGIS feature layers and Experience Builder.
- ["hear the map"](https://community.esri.com/t5/education-blog/hear-the-map/ba-p/1061130) on the Esri
  Community Education blog (Tom Baker): speaks a biome's name when you click it.
- [AltGeoViz](https://arxiv.org/abs/2406.13853) (University of Washington, 2024): spoken summaries of a
  Mapbox map view.
- Esri's [accessibility guidance for the SDK](https://www.esri.com/arcgis-blog/products/js-api-arcgis/developers/build-accessible-web-apps-with-arcgis-maps-sdk-for-javascript-and-calcite-design-system):
  contrast, focus and reduced motion.

What I couldn't find (as of October 2026) was an Esri sample or open-source project that turns continuous
terrain and live feature layers into sound directly in the JavaScript SDK, in a way you can drop into your
own app. That's what this tries to be.

## Keyboard

| Key | Action |
|---|---|
| Arrow keys, `+` `-` | Pan and zoom. The crosshair in the center is your listening point. |
| `Space` / `P` | Profile sweep across the view |
| `Q` | Earthquake sonar around the listening point |
| `S` | Say where I am and the elevation |
| `L` | Snap pitches to a musical (pentatonic) scale |
| `V` | Read announcements aloud |
| `M` | Mute |
| `A` | About |
| `H` / `?` | Help |

## How it works

- Hover uses an `ElevationSampler`. When the view stops moving
  (`reactiveUtils.when(() => view.stationary)`), the app creates a sampler for the visible extent with
  `createElevationSampler()`. After that every pointer move is a synchronous `elevationAt(x, y)` call, so
  there are no network requests while you hover. While a new sampler is loading it falls back to
  `queryElevation()`, one request at a time.
- The sweep turns 64 screen points into one `Multipoint`, so a single query (or sampler read) returns all
  the heights.
- The sonar uses `FeatureLayerView.queryFeatures()` with `distance` and `units`, which runs on the
  features already loaded in the browser. The radius is a quarter of the view width and the ring is a
  geodesic `Circle`.
- `src/sonify.js` has the data-to-sound math (pitch, pan, volume, delay) with no DOM or SDK code, so it's
  easy to test (see `tests/`).
- The audio is plain Web Audio: a triangle + sine oscillator that glides between pitches, looped brown
  noise through a low-pass filter for water, short pings through a `StereoPannerNode`, and a compressor so
  overlapping pings don't clip.

A few choices I made:

- Pitch uses a square-root scale, so small height changes in lowlands (floodplains, coasts) are easier to
  hear than changes between high peaks.
- Sea level switches from a note to noise, which makes coastlines obvious.
- Musical scale (L) snaps pitches to a pentatonic scale, which is easier to listen to for a long time.

## Data

- Elevation: [World Elevation 3D / Terrain3D](https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer) (Esri)
- Basemap: World Hillshade and World Boundaries and Places (Esri)
- Earthquakes: [USGS Seismic Data](https://services9.arcgis.com/RHVPKKiFTONKtxq3/arcgis/rest/services/USGS_Seismic_Data_v1/FeatureServer/0) from Esri Living Atlas, updated from the USGS

No API key needed. If you want Esri basemap styles, copy `.env.example` to `.env` and set `VITE_ARCGIS_API_KEY`.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # unit tests for the sound math
npm run build    # production build in dist/
```

It's deployed on Vercel from `main`. GitHub Actions runs the tests and a build on every push.

## Ideas for later

- SceneView: sonify a 3D flight path and line of sight
- Let the user pick any numeric field to sonify (population, temperature, flood depth)
- Spoken bookmarks and a "follow the river" mode using hydrology services
- Haptic feedback on phones with the Vibration API

---

Ariful Islam, Developer Products at Esri. MIT License.
