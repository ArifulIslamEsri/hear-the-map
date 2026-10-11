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

## Why this exists

Maps are one of the most visual things on the web. Esri's accessibility guidance for the SDK covers
color contrast, focus management and reduced motion, but a person who can't see the map still can't
explore the *shape of the land*. Sonification, mapping data to sound, is an established technique for
accessible charts. I couldn't find it applied to terrain and live feature data in the SDK's samples, so I
built it.

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

- **Square-root pitch scale.** Most people live below 500 m, so lowlands get more pitch range than peaks.
  A 200 m river terrace is still audible next to a 50 m floodplain.
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
