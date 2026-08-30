# Sanjeevani — Smart Emergency Medical Response

Exhibition website for Sanjeevani, a smart ambulance-dispatch and hospital
pre-alert concept aimed at closing India's "golden hour" gap in emergency
medical response. Part of the Kavach family of safety-tech exhibition
sites — same design system, same offline-first build approach.

**Status: 🟡 Software Demo** — the dispatch flow is a live, working
simulation (real OSRM routing, real driving-time comparison logic). There
is no hardware and no connection to a real 108/112 dispatch system; the
dispatch demo page says so explicitly.

## Pages

| File | What it is |
|---|---|
| `index.html` | Landing page — the golden-hour problem (editable stat panel for your own cited research) and the 3-step "How Sanjeevani Works" overview. |
| `dispatch-demo.html` | Live simulated dispatch: report an emergency → 3 mock ambulances compared by real OSRM driving time → fastest dispatched → routed to the nearest matching mock hospital → hospital pre-alert panel. |
| `documents.html` | Write-up, synopsis, system documentation, logbook, presentation, and demo video — inline PDF/video previews plus direct downloads. |

## Structure

```
sanjeevani-exhibition-site/
├── index.html
├── dispatch-demo.html
├── documents.html
├── css/
│   └── style.css              — single shared stylesheet: Kavach design tokens
│                                 + landing, dispatch, and document components
├── js/
│   └── dispatch-demo.js        — SOS form, dual OSRM routing, pre-alert logic
├── assets/
│   ├── fonts/                  — Rajdhani / IBM Plex Sans / IBM Plex Mono,
│   │                             bundled locally so index.html and
│   │                             documents.html work fully offline
│   └── docs/                   — PDFs + demo video (add your own files here,
│                                 filenames below)
├── netlify.toml
└── README.md
```

## Adding your documents

Drop these exact filenames into `assets/docs/` and the previews/downloads
on `documents.html` will pick them up automatically — no code changes
needed:

- `Sanjeevani_Writeup_national_2026.pdf`
- `Sanjeevani_Synopsis_2026.pdf`
- `Sanjeevani_System_Documentation.pdf`
- `Sanjeevani_Logbook_2026.pdf`
- `Sanjeevani_Presentation_2026.pdf`
- `Sanjeevani_Demo_Video_2026.mp4` (optionally with a
  `Sanjeevani_Demo_Video_2026_poster.jpg` poster frame)

## Filling in the golden-hour stats

The three stat fields on `index.html` (golden-hour reach, average
highway response time, ambulance density) are live, editable text
inputs pre-filled with placeholder figures — update them from your own
research and add a citation in the "Source" field under each one before
presenting.

## Notes on connectivity

- `index.html` and `documents.html` have zero external dependencies —
  they'll render correctly with no internet connection.
- `dispatch-demo.html` needs a live connection: it loads Leaflet from a
  CDN for the map, and calls the public OSRM routing API for real
  driving-time calculations. This is unavoidable for the routing to be
  real rather than faked, and the page badges this clearly as a
  simulated, disconnected-from-real-dispatch concept demo.

## Deploying

Push to a Netlify site with the publish directory set to the repo root
(already configured in `netlify.toml`).
