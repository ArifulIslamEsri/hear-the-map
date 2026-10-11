# Hear the Map

**Explore terrain and earthquakes by sound.** An accessibility experiment built with the
[ArcGIS Maps SDK for JavaScript](https://developers.arcgis.com/javascript/latest/) 5.1.

**▶ Live demo: [hear-the-map.vercel.app](https://hear-the-map.vercel.app)** (headphones recommended)

Put on headphones and move across the map:

| You hear | It means |
|---|---|
| **Pitch** rising and falling | Elevation under the pointer. Low notes are lowlands, high notes are mountains. |
| **A soft wash of waves** | Water: at or below sea level, or no land data |
| **Left / right** in your headphones | Where the point is across the view (west is left, east is right) |
| **Sonar pings** after a click | Earthquakes from the past 30 days. Closer ones echo back first, stronger ones are louder, shallower ones are brighter, and each one comes from its compass direction. |
| **A melody sweeping across** (Space) | The terrain profile of the whole view, west to east, with the highest point accented |

Everything also goes to an ARIA live region, so screen-reader users get the same information as words.
Turn on **Read aloud** (V) to hear it with speech synthesis.

## What this sample is

Hear the Map turns a web map into something you can **explore with your ears**. Elevation becomes pitch,
water becomes a texture, position becomes left and right, and live earthquakes answer back like sonar.
A person who can't see the screen can still find the valley, follow a ridge, notice where land meets the
sea, and learn where recent earthquakes cluster, all on their own and at their own pace.

It is also a **reusable pattern for developers**. The sonification logic is plain JavaScript on top of
standard ArcGIS Maps SDK for JavaScript APIs (`ElevationLayer`, `ElevationSampler`,
`FeatureLayerView.queryFeatures`, `reactiveUtils`), so the same approach can be added to an existing web
map: swap the earthquake layer for flood gauges, wildfire perimeters or bus stops, and the elevation for
any raster.

## Why it matters

- **Maps are one of the least accessible things on the web.** About 43.3 million people worldwide are
  blind and 295 million have moderate or severe vision impairment
  ([The Lancet Global Health, 2021](https://pmc.ncbi.nlm.nih.gov/articles/PMC7820390/)). For them, a web
  map is usually a blank rectangle with a one-line description.
- **A description is not exploration.** A text alternative like "Map of California" says a map exists. It
  doesn't let someone discover that Death Valley, below sea level, is only about 136 km (85 miles) from
  Mount Whitney, the highest peak in the contiguous United States. Sound lets the user ask their own
  questions of the data.
- **Accessibility rules now reach public-sector web maps.** The U.S. Department of Justice rule under
  ADA Title II requires state and local government web content to meet WCAG 2.1 Level AA. After an
  interim final rule on April 20, 2026, the compliance dates are April 26, 2027 for larger public entities
  and April 26, 2028 for smaller ones
  ([University of Arizona summary](https://accessibility.arizona.edu/news/doj-issues-interim-final-rule-title-ii-digital-accessibility-compliance-dates)).
  Many of those agencies publish their maps with ArcGIS, so developers need practical patterns, not just
  guidelines.
- **Sound helps sighted users too.** You can hear a terrain profile while your eyes are on something else,
  and teachers can use it to make elevation and seismic risk tangible in a classroom.

## What's new here

Map sonification is not a new idea, and this project builds on earlier work:

| Earlier work | What it does | How Hear the Map differs |
|---|---|---|
| [iSonic](https://www.cs.umd.edu/projects/hcil/audiomap) (University of Maryland, mid-2000s) | Research prototype that sonifies statistical (choropleth) maps for blind users | Runs in the browser on live web services and adds terrain and point data |
| [Bearman & Fisher, *Using sound to represent spatial data in ArcGIS*](https://research-portal.uea.ac.uk/en/publications/using-sound-to-represent-spatial-data-in-arcgis/) (2012) | ArcGIS Desktop (ArcMap) extension that plays raster values as piano notes | Web-based, built on the current JavaScript SDK, no desktop install |
| [Audiom](https://www.ktdrr.org/products/ktcasebook/audiom-worlds-most-inclusive-map-viewer.html) by XR Navigation, featured in [ArcNews, Summer 2026](https://www.esri.com/about/newsroom/arcnews/pressing-the-up-arrow-big-step-forward-in-accessibility) | Accessible audio and visual map viewer; the ArcNews story shows it connected to ArcGIS feature layers and Experience Builder | Open source, and runs inside your own SDK app instead of a separate viewer |
| ["hear the map" on the Esri Community Education blog](https://community.esri.com/t5/education-blog/hear-the-map/ba-p/1061130) (Tom Baker, Esri Edu) | Speaks the name of a biome when you click it | Turns continuous data, such as elevation, into sound instead of reading out labels |
| [AltGeoViz](https://arxiv.org/abs/2406.13853) (University of Washington, 2024) | Generates spoken text summaries of the current map view | Uses sound, not only speech, and is built on ArcGIS instead of Mapbox |
| [Esri's accessibility guidance for the SDK](https://www.esri.com/arcgis-blog/products/js-api-arcgis/developers/build-accessible-web-apps-with-arcgis-maps-sdk-for-javascript-and-calcite-design-system) | Color contrast, focus management, reduced motion | Adds a non-visual way to explore the data itself |

**The gap this fills:** as far as I could find (October 2026), there is no Esri sample, tutorial or
open-source project that sonifies **continuous terrain** and **live feature layers** directly with the
ArcGIS Maps SDK for JavaScript, in a form developers can copy into their own apps. Hear the Map is that
missing pattern, and it is designed to be fast enough for real use: after the view settles, hovering makes
**zero network requests**.

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
| `H` / `?` | Help |

## How it works (SDK details)

- **Zero-request hover with `ElevationSampler`.** When the view stops moving
  (`reactiveUtils.when(() => view.stationary)`), the app calls
  `ElevationLayer.createElevationSampler()` for the visible extent. Every pointer move after that is a
  synchronous `sampler.elevationAt(x, y)` read from memory, so the pitch follows the pointer at frame rate
  with **no network requests**. While a new sampler loads, it falls back to `queryElevation()` with only
  one request in flight, where the latest point wins.
- **Profile sweep with one call.** 64 screen points across the view become a single `Multipoint`, and one
  `queryElevation()` call (or a sampler read) returns all 64 heights.
- **Client-side spatial query for the sonar.** `FeatureLayerView.queryFeatures()` with `distance` and
  `units` finds nearby earthquakes from features already on the client, without a server round trip. The
  sonar radius scales with the view width, and the ring is a geodesic `Circle`.
- **Pure, tested mapping layer.** `src/sonify.js` turns data into sound parameters (pitch, pan, gain,
  delay) with no DOM or SDK dependency, and it is covered by unit tests in `tests/`.
- **Web Audio graph.** A triangle and sine "theremin" glides between pitches with `setTargetAtTime`.
  Water is looped brown noise through a slowly modulated low-pass filter. Pings are short enveloped
  oscillators through `StereoPannerNode`, and a compressor keeps overlapping echoes from clipping.

### Design choices

- **Square-root pitch scale.** Small height differences matter most in lowlands (floodplains, coasts,
  river terraces), so lowlands get more pitch range than peaks. A 200 m river terrace is still audible
  next to a 50 m floodplain.
- **Sea level is a texture, not a note.** Switching from pitch to noise makes coastlines unmistakable.
- **Musical mode.** Snapping to a pentatonic scale makes long listening pleasant and makes "same note"
  mean "same height band".

## Data

- Elevation: [World Elevation 3D / Terrain3D](https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer) (Esri)
- Basemap: World Hillshade and World Boundaries and Places (Esri)
- Earthquakes: [USGS Seismic Data](https://services9.arcgis.com/RHVPKKiFTONKtxq3/arcgis/rest/services/USGS_Seismic_Data_v1/FeatureServer/0), Esri Living Atlas, updated live from the USGS

No API key is required. To use Esri basemap styles, copy `.env.example` to `.env` and set `VITE_ARCGIS_API_KEY`.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # unit tests for the sonification math
npm run build    # production build in dist/
```

Deployed on **Vercel**: every push to `main` builds with `npm run build` and publishes `dist/`.
GitHub Actions runs the unit tests and a production build on every push (`.github/workflows/ci.yml`).

## Ideas for next

- SceneView: sonify a 3D flight path and line of sight
- Sonify any numeric field, such as population density, temperature or flood depth, with a field picker
- Spoken bookmarks and "follow the river" mode using hydrology services
- Haptic feedback on mobile with the Vibration API

---

Built by **Ariful Islam**, Support Analyst II, Developer Products at Esri. MIT License.
