# PlantAI — Master Context File
> **For Claude Code Sessions** | Paste this entire file at the start of every new session.

---

## 1. Project Overview

**PlantAI (branded as Farm.ai)** is a precision agriculture intelligence platform built for the **Nittany AI Challenge 2025** at Penn State University. It lets users locate their property on a map, draw their farm boundary, and instantly receive a rich intelligence report: soil composition, climate profile, real NDVI vegetation health, crop recommendations, and a 3D farm visualization — all grounded in real geospatial data.

**Built by:** Divyam Arora — sophomore at Penn State, Research Coordinator at NAISS (Nittany AI Student Society)

**GitHub:** New clean repository will be created after all local sessions are complete. Do not push until instructed.

**The One-Line Problem Statement:**
> "Small-scale farmers make $5,000–$15,000 planting decisions completely blind, without knowing their soil pH, hardiness zone, or crop compatibility."

**The Demo Persona:**
> Maria — first-time farmer, 8 acres in Centre County PA, $15k budget, never farmed before. The entire demo follows her journey from address entry to grant application.

**Demo test address:** `1000 Agricultural Sciences Dr, State College, PA`

---

## 2. Repository Structure

```
compiled-plantai/
├── plantai/                         # Next.js 16 frontend
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx             # Landing page
│   │   │   ├── map/page.tsx         # Map + polygon drawing
│   │   │   ├── analysis/[id]/       # 7-tab dashboard
│   │   │   └── farm/[id]/           # 3D visualization
│   │   ├── components/
│   │   │   ├── map/MapCanvas.tsx
│   │   │   ├── analysis/AgentSwarm.tsx
│   │   │   ├── analysis/DailyFarmPlan.tsx
│   │   │   ├── chat/AgronomistChat.tsx
│   │   │   └── farm/FarmScene.tsx
│   │   └── lib/
│   │       ├── store.ts             # Zustand state
│   │       ├── apiClient.ts         # Backend API calls + data mapping
│   │       ├── analysis/cropScorer.ts   # 20+ crop scoring logic (built, not wired)
│   │       └── data/crops.json          # 20+ crop database
│   └── .env.local                   # DO NOT COMMIT
├── plantai-backend/
│   ├── main.py                      # FastAPI — all endpoints
│   ├── services.py                  # Data fetch helpers
│   ├── requirements.txt
│   └── .env                         # DO NOT COMMIT
└── README.md
```

---

## 3. Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16, TypeScript, Tailwind CSS |
| Maps | MapLibre GL JS |
| 3D | React Three Fiber, Three.js |
| Animations | Framer Motion |
| State | Zustand |
| Backend | FastAPI (Python 3.11) |
| Backend Deploy | **Render.com** (free tier, 750 hrs/mo) |
| AI Generation | NVIDIA Build — `meta/llama-3.3-70b-instruct` (free endpoint) |
| AI Embeddings | NVIDIA NemoRetriever — `nvidia/llama-3_2-nemoretriever-300m-embed-v1` (free) |
| Frontend Deploy | Cloudflare Pages (free, 500 builds/mo) |
| Database | Cloudflare D1 — SQLite (free, 5M row reads/day) |
| Storage | Cloudflare R2 (free, 10GB, zero egress) |
| Vector DB | Cloudflare Vectorize (free, 30M dims/mo) |

> **Note on backend deploy:** Render.com is used instead of Railway. Railway suspended their free tier. Render gives 750 free hours/month, deploys from GitHub automatically, supports FastAPI natively. It spins down after 15 min of inactivity — use UptimeRobot (free) to ping `/health` every 5 minutes before demo day.

---

## 4. API Keys

### `plantai-backend/.env`
```
NVIDIA_API_KEY=configured
NASS_KEY=configured
NASA_EARTHDATA_USERNAME=nittanyaichallenge
NASA_EARTHDATA_PASSWORD=configured
CF_ACCOUNT_ID=configured
CF_D1_DB_ID=configured
CF_API_TOKEN=configured
```

### `plantai/.env.local`
```
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_MAPTILER_KEY=configured
```

### After deployment, update `plantai/.env.local`:
```
NEXT_PUBLIC_API_URL=https://your-app.onrender.com
```

---

## 5. Data Sources

| # | Source | What It Provides | Key Required |
|---|--------|-----------------|--------------|
| 1 | USDA SSURGO (SDA) | Real soil type, pH, drainage, organic matter | No |
| 2 | Open-Meteo | 30-year climate history, 16-day forecast | No |
| 3 | NWS Weather.gov | Active weather alerts | No |
| 4 | Open Elevation | Terrain height profile | No |
| 5 | Nominatim (OSM) | Address geocoding | No |
| 6 | NASA MODIS (Earthdata) | Real NDVI vegetation health | Username + Password |
| 7 | USDA NASS Quick Stats | County-level crop benchmarks | Yes |
| 8 | NVIDIA Qwen3.5-122B | AI agent swarm + chat | Yes |

---

## 6. Current State

### ✅ Built and Working
- Landing page with Ken Burns animation + Nominatim geocoding
- MapLibre map with polygon drawing tool
- Click popup on map (soil + NDVI + elevation)
- Analysis dashboard with 7 tabs (Overview, Soil, Climate, Crops, Economics, Agent Swarm, Today's Plan)
- Agent Swarm UI (3-agent sequential pipeline)
- AI Agronomist chat interface
- 3D farm visualization with weather system
- Loading overlay with animated steps
- Citation pills + Sources footer

### ❌ Broken / Mocked — Must Fix
1. `main.py` has hardcoded Gemini API key — needs full rewrite to NVIDIA
2. `/api/point-info` returns hardcoded soil — needs real USDA SDA call
3. `/api/analyze` uses `mock_soil_data` — needs real USDA SDA call
4. NDVI is hardcoded `0.74` — needs real NASA MODIS data
5. `generate_crop_matrix()` in `services.py` — hardcoded 5 crops, ignores `cropScorer.ts` and `crops.json`
6. No persistent storage — analysis disappears on refresh
7. Agent Swarm uses Gemini — needs NVIDIA Qwen3.5

### ⚠️ Not Built Yet
- RAG pipeline (NemoRetriever + Cloudflare Vectorize)
- Persistent storage (Cloudflare D1 via REST API)
- AI-generated dashboard (tabs determined by AI analysis)
- Real NASS crop benchmarks wired in
- Deployment (Render.com + Cloudflare Pages)

---

## 7. Cloudflare D1 Connection (from Render backend)

D1 is accessed via Cloudflare REST API — no native driver needed. Add this to `main.py`:

```python
CF_ACCOUNT_ID = os.environ.get("CF_ACCOUNT_ID")
CF_D1_DB_ID   = os.environ.get("CF_D1_DB_ID")
CF_API_TOKEN  = os.environ.get("CF_API_TOKEN")

async def d1_query(sql: str, params: list = []):
    url = f"https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}/d1/database/{CF_D1_DB_ID}/query"
    async with httpx.AsyncClient() as client:
        r = await client.post(
            url,
            headers={"Authorization": f"Bearer {CF_API_TOKEN}"},
            json={"sql": sql, "params": params}
        )
        return r.json()["result"][0]["results"]
```

### D1 Schema

```sql
CREATE TABLE IF NOT EXISTS properties (
    id TEXT PRIMARY KEY,
    created_at TEXT DEFAULT (datetime('now')),
    address TEXT,
    lat REAL,
    lng REAL,
    acreage REAL,
    polygon_geojson TEXT
);

CREATE TABLE IF NOT EXISTS analyses (
    id TEXT PRIMARY KEY,
    property_id TEXT REFERENCES properties(id),
    created_at TEXT DEFAULT (datetime('now')),
    soil_data TEXT,
    climate_data TEXT,
    ndvi_value REAL,
    crop_matrix TEXT,
    economics TEXT,
    dashboard_config TEXT
);
```

---

## 8. Implementation Plan

---

### SESSION 1 — Rewrite the Backend

**Goal:** Replace `main.py` and fix `services.py`. No Gemini. No mocks.

**Tasks:**

1. Rewrite `main.py` from scratch:
   - Remove all google-genai imports
   - Add `call_nvidia()` async via httpx → `https://integrate.api.nvidia.com/v1/chat/completions`, model `meta/llama-3.3-70b-instruct`
   - Add `fetch_usda_soil()` — real USDA SDA spatial WFS query by lat/lng
   - Add `fetch_nasa_ndvi()` — NASA MODIS ORNL endpoint with Earthdata auth (see snippet below)
   - Add `_soil_fallback()` — deterministic coordinate-based fallback
   - Add `compute_ndvi_estimate()` — seasonal formula fallback if NASA fails
   - Add `/health` endpoint returning `{"status": "ok"}` (needed for UptimeRobot)
   - Fix `/api/point-info` — real USDA + real NASA NDVI in parallel
   - Fix `/api/analyze` — real USDA + real NDVI + Open-Meteo in parallel
   - Fix `/api/agent/remediation`, `/api/agent/procurement`, `/api/agent/finance` — all use `call_nvidia()`
   - Fix `/api/chat` — use `call_nvidia()`
   - Add `d1_query()` function for Cloudflare D1 via REST

2. Fix `services.py`:
   - Replace `generate_crop_matrix()` — currently returns 5 hardcoded crops
   - Read `plantai/src/lib/data/crops.json` to get the full crop list
   - Pass soil_data + climate_data to NVIDIA, ask it to score top 10 crops from that list, return structured JSON

3. Update `requirements.txt` — remove `google-genai`, keep: `fastapi uvicorn httpx python-dotenv shapely pydantic`

**NASA MODIS NDVI snippet:**
```python
async def fetch_nasa_ndvi(lat: float, lng: float) -> float:
    url = (
        f"https://modis.ornl.gov/rst/api/v1/MOD13Q1/subset"
        f"?latitude={lat}&longitude={lng}"
        f"&band=250m_16_days_NDVI"
        f"&startDate=A2024001&endDate=A2024365"
        f"&kmAboveBelow=0&kmLeftRight=0"
    )
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.get(
            url, auth=(NASA_EARTHDATA_USERNAME, NASA_EARTHDATA_PASSWORD)
        )
        response.raise_for_status()
        data = response.json()
        subsets = data.get("subset", [])
        if subsets:
            raw_value = subsets[-1].get("data", [None])[0]
            if raw_value and raw_value != -3000:
                return round(raw_value * 0.0001, 3)
    return compute_ndvi_estimate(lat, lng)
```

**After writing files, verify:** `python -c "import main; print('OK')"`

**Commit:** `git add . && git commit -m "Session 1: Rewrite backend — NVIDIA, real USDA, real NASA NDVI"`

---

### SESSION 2 — Wire Frontend to Real Data

**Goal:** Make the analysis dashboard reflect real backend data.

**Tasks:**

1. Fix `plantai/src/lib/apiClient.ts` — update `mapSoilData()` to use the new real fields the backend returns: `sand`, `silt`, `clay`, `awc`, `mu_name`, `taxonomy`:
```typescript
function mapSoilData(raw: BackendSoilData): SoilData {
    return {
        name:          raw.mu_name,
        ph:            Math.round(((raw.ph_range[0] + raw.ph_range[1]) / 2) * 10) / 10,
        organicMatter: raw.organic_matter_pct,
        drainage:      raw.drainage,
        sand:          raw.sand || 40,
        silt:          raw.silt || 35,
        clay:          raw.clay || 25,
        awc:           raw.awc || 0.18,
        description:   raw.taxonomy,
    };
}
```

2. Wire `cropScorer.ts` — it exists but is never called. In `map/page.tsx` inside `handlePolygonComplete()`, after `mapBackendToAnalysis()`:
```typescript
import { scoreCrops } from '@/lib/analysis/cropScorer';

if (analysisData.soilData && analysisData.climateData) {
    const realCrops = scoreCrops(analysisData.soilData, analysisData.climateData);
    analysisData.cropMatrix = realCrops;
    const realEconomics = generateEconomicScenarios(realCrops, acreage);
    analysisData.economics = realEconomics;
}
```

3. Update `defaultLoadingSteps` in `store.ts` to show real source names:
```typescript
const defaultLoadingSteps = [
    { label: 'Location identified',  sublabel: 'OpenStreetMap Nominatim',    status: 'pending' },
    { label: 'Soil composition',     sublabel: 'USDA SSURGO database',        status: 'pending' },
    { label: 'Climate history',      sublabel: 'Open-Meteo 30-year normals',  status: 'pending' },
    { label: 'Vegetation health',    sublabel: 'NASA MODIS satellite',        status: 'pending' },
    { label: 'Crop compatibility',   sublabel: 'USDA NASS benchmarks',        status: 'pending' },
    { label: 'Economic projections', sublabel: 'USDA ERS models',             status: 'pending' },
];
```

**Verify:** `npm run build` in `plantai/` — fix all TypeScript errors before moving on.

**Commit:** `git add . && git commit -m "Session 2: Wire frontend to real data + cropScorer"`

---

### SESSION 3 — Grant Autopilot + AI Dashboard

**Goal:** Rename Agent Swarm, move it to Tab 2, add AI-generated dashboard config.

**Tasks:**

1. In `analysis/[id]/page.tsx`, rename tab and reorder:
```typescript
const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'swarm',    label: 'Grant Autopilot' },  // was "Agent Swarm", moved to Tab 2
    { id: 'soil',     label: 'Soil' },
    { id: 'climate',  label: 'Climate' },
    { id: 'crops',    label: 'Crops' },
    { id: 'economics',label: 'Economics' },
    { id: 'daily',    label: "Today's Plan" },
];
```

2. In `AgentSwarm.tsx`:
   - Header: `"GRANT AUTOPILOT"`
   - Description: `"3-agent pipeline that analyzes your soil, sources amendments, and drafts your USDA grant application"`

3. Add `/api/generate-dashboard` POST endpoint to `main.py`:
```python
@app.post("/api/generate-dashboard")
async def generate_dashboard(request: DashboardRequest):
    prompt = f"""You are an agricultural AI analyzing a farm property.
Property data: Soil: {request.soil_data}, Climate: {request.climate_data},
NDVI: {request.ndvi_value}, Top crops: {request.crop_matrix[:5]},
Acreage: {request.area_acres}, Location: {request.location}

Return ONLY valid JSON:
{{
  "property_summary": "<2 sentence summary>",
  "urgent_flags": ["<issue if any>"],
  "tab_order": ["overview", "soil", "climate", "crops", "economics"],
  "hero_metric": "soil_health",
  "top_insight": "<single most important insight>"
}}"""
    result = await call_nvidia(prompt)
    return parse_json_response(result)
```

4. In `analysis/[id]/page.tsx`, after analysis loads:
   - Call `/api/generate-dashboard`
   - Show `urgent_flags` as alert banners at top
   - Show `top_insight` as highlighted card on Overview tab
   - Replace generic address in header with `property_summary`

**Commit:** `git add . && git commit -m "Session 3: Grant Autopilot + AI-generated dashboard config"`

---

### SESSION 4 — RAG Pipeline for Chat

**Goal:** AI chat gives grounded, cited answers from real agricultural documents.

**Tasks:**

1. Add NVIDIA NemoRetriever embedding function to `main.py`:
```python
async def embed_text(text: str) -> list:
    async with httpx.AsyncClient() as client:
        r = await client.post(
            "https://integrate.api.nvidia.com/v1/embeddings",
            headers={"Authorization": f"Bearer {NVIDIA_API_KEY}"},
            json={
                "model": "nvidia/llama-3_2-nemoretriever-300m-embed-v1",
                "input": text,
                "encoding_format": "float"
            }
        )
        return r.json()["data"][0]["embedding"]
```

2. Create `plantai-backend/index_documents.py` — one-time script that:
   - Creates 5 `.txt` documents in `plantai-backend/docs/`: USDA crop production guide, Penn State Zone 6b planting calendar, USDA EQIP grant eligibility, USDA CSP program overview, common pest/disease guide for top 10 crops (write as real content ~500 words each from training data)
   - Chunks into 500-token segments
   - Embeds each via `embed_text()`
   - Stores in `plantai-backend/vector_store.json` as `[{text, embedding}]`

3. Add `query_local_vector_store(query_embedding, top_k=3)` — cosine similarity search against `vector_store.json`

4. Replace `/api/chat` with RAG version — embed query, retrieve top 3 chunks, build grounded prompt, call `call_nvidia()`

**Commit:** `git add . && git commit -m "Session 4: RAG pipeline for grounded chat"`

---

### SESSION 5 — Persistent Storage via Cloudflare D1

**Goal:** Analyses survive page refresh. Shareable URLs work.

**Tasks:**

1. Use `d1_query()` already in `main.py` (added in Session 1). Create the D1 tables by running the schema SQL from Section 7 of this document via the Cloudflare dashboard or wrangler CLI.

2. Add `/api/save-analysis` POST endpoint — saves property + analysis to D1, returns generated UUID.

3. Add `/api/get-analysis/{id}` GET endpoint — retrieves by ID, returns full analysis JSON.

4. In `map/page.tsx`, after analysis completes, call `/api/save-analysis`, get back ID, redirect to `/analysis/${id}` instead of `/analysis/new`.

5. In `analysis/[id]/page.tsx`, add `useEffect`: if Zustand store is empty and `params.id !== 'new'`, fetch from `/api/get-analysis/${params.id}` and populate store.

**Commit:** `git add . && git commit -m "Session 5: Persistent storage — Cloudflare D1"`

---

### SESSION 6 — 3D Comparison Panel + Final Polish

**Goal:** 3D view connected to real decisions. Full end-to-end clean.

**Tasks:**

1. In `farm/[id]/page.tsx`, add a slide-in comparison panel (toggled by "Compare Layouts" button):
   - Shows Layout A vs Layout B side by side
   - Crop arrangement, estimated sun hours, revenue difference
   - Callout: "Layout A puts tomatoes on south slope — 3 more sun hours than Layout B"

2. Run full end-to-end test with `1000 Agricultural Sciences Dr, State College, PA`:
   - `cd plantai-backend && uvicorn main:app --reload --port 8000`
   - `cd plantai && npm run dev`
   - Walk the full demo flow, list every error

3. Fix every error found.

4. Run `npm run build` — fix all TypeScript errors until build is clean.

5. Grep entire backend for any hardcoded values, mock data, or Gemini references. Fix anything found.

**Commit:** `git add . && git commit -m "Session 6: 3D comparison panel + end-to-end polish"`

---

### SESSION 7 — New Repo + Deployment

**Goal:** Clean repo, live URLs for judges.

**Tasks:**

1. Create `.gitignore` in repo root:
```
plantai-backend/.env
plantai-backend/__pycache__/
plantai-backend/*.pyc
plantai-backend/vector_store.json
plantai/.env.local
plantai/node_modules/
plantai/.next/
.DS_Store
```

2. Create new GitHub repository (name: `plantai` or `farm-ai`). Initialize git, add remote, push:
```bash
git init
git add .
git commit -m "Initial commit — PlantAI"
git remote add origin https://github.com/YOUR_USERNAME/plantai.git
git push -u origin main
```

3. Deploy backend to Render.com:
   - New Web Service → connect GitHub repo
   - Root directory: `plantai-backend`
   - Runtime: Python 3
   - Build command: `pip install -r requirements.txt`
   - Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
   - Add all env vars from Section 4 of this document
   - Create Procfile: `web: uvicorn main:app --host 0.0.0.0 --port $PORT`

4. Add UptimeRobot monitor: ping `https://your-app.onrender.com/health` every 5 minutes to keep it alive.

5. Deploy frontend to Cloudflare Pages:
   - New Pages project → connect GitHub repo
   - Root directory: `plantai`
   - Build command: `npm run build`
   - Build output: `.next`
   - Add env vars: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_MAPTILER_KEY`

6. Update `NEXT_PUBLIC_API_URL` to the live Render URL and redeploy.

7. Test live deployment end-to-end with demo address.

**Commit:** `git add . && git commit -m "Session 7: Production deployment — Render + Cloudflare Pages"`

---

## 9. Competition Checklist

### Must Have Before Demo Day
- [ ] `main.py` fully rewritten — NVIDIA, real USDA, real NASA NDVI
- [ ] `cropScorer.ts` wired to pipeline — 20+ crops with real scores
- [ ] Loading steps show real source names
- [ ] Grant Autopilot renamed + moved to Tab 2
- [ ] `/health` endpoint added to backend
- [ ] End-to-end flow tested with State College PA address
- [ ] Backend deployed to Render.com
- [ ] Frontend deployed to Cloudflare Pages
- [ ] UptimeRobot keeping backend alive
- [ ] Demo script rehearsed

### Nice to Have
- [ ] AI-generated dashboard tab order
- [ ] RAG pipeline for chat
- [ ] Persistent storage (D1)
- [ ] 3D layout comparison panel

### Post-Competition
- [ ] User accounts + auth
- [ ] Mobile responsive
- [ ] Penn State Extension partnership
- [ ] Real Sentinel-2 NDVI integration

---

## 10. Demo Script (4 Minutes)

**Setup:** App open at `localhost:3000` (or live URL). Address pre-typed.

**0:00 — The Problem**
"Maria just bought 8 acres in Centre County. She has $15,000 and has never farmed before. She's about to make a $15,000 planting decision completely blind."

**0:30 — Address Entry**
Type `1000 Agricultural Sciences Dr, State College, PA`. Map flies to property.
"In under 3 seconds, she can see her exact land from satellite."

**1:00 — Draw Property**
Draw polygon around field.
"She draws her boundary. PlantAI is now querying 6 government databases simultaneously."
Show loading screen with real source names.

**1:45 — Analysis Reveal**
Dashboard populates with real USDA soil data.
"pH 6.2 — slightly acidic. The AI flags this immediately."
Click through soil tab, climate tab.

**2:30 — Crop Matrix**
"20+ crops scored against her exact soil and climate profile. Tomatoes: 91% match. Here's why."

**3:00 — Grant Autopilot (THE MOMENT)**
Click Grant Autopilot tab. Click Deploy. Watch 3 agents execute sequentially.
"Agent 1 analyzes her soil. Agent 2 builds a procurement plan. Agent 3 drafts her USDA EQIP grant application — automatically."
Show drafted application with dollar amount.
"Maria just found out she's eligible for up to $20,000 in USDA funding she didn't know existed."

**3:45 — 3D View**
"This is what her farm looks like with the recommended layout."

**4:00 — Close**
"PlantAI turns a $15,000 blind decision into a data-driven plan backed by USDA, NASA, and NOAA — in under 4 minutes. For free."

---

## 11. Competitive Differentiation (For Judges)

- Climate.ai and Granular cost $500+/month and target large commercial farms
- PlantAI targets first-time homesteaders and small farmers (1–50 acres) who have zero tools
- PlantAI is free — no sensors, no hardware, no signup required
- Grant Autopilot is unique — no competitor auto-drafts USDA grant applications
- Dashboard is AI-generated based on what actually matters for that specific property

---

## 12. Key Rules for Claude Code

1. **Never use Gemini or Google AI** — only NVIDIA Build API at `integrate.api.nvidia.com`
2. **Never hardcode API keys** — always use `os.environ.get()`
3. **Always use `python-dotenv` and `load_dotenv()`** in the backend
4. **Real USDA SDA for soil** — no mocks, no hardcoded soil names
5. **Real NASA MODIS for NDVI** — always with `compute_ndvi_estimate()` fallback
6. **D1 via REST API only** — use the `d1_query()` function, no SQLAlchemy, no SQLite
7. **After each backend change:** `python -c "import main; print('OK')"`
8. **After each frontend change:** `npm run build` — fix all TypeScript errors
9. **Commit after each session:** `git add . && git commit -m "Session N: description"`
10. **Never push to GitHub until Session 7** — build and test everything locally first

---

## 13. Local Dev Commands

```bash
# Start backend
cd plantai-backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# Start frontend
cd plantai
npm install
npm run dev

# Test backend — should return real USDA soil name for State College PA
curl -X POST http://localhost:8000/api/point-info \
  -H "Content-Type: application/json" \
  -d '{"lat": 40.7934, "lng": -77.8600}'

# Verify NVIDIA connection
curl -X POST http://localhost:8000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "What crops grow well in pH 6.2 soil?", "history": [], "context": {}}'

# Verify health endpoint
curl http://localhost:8000/health
```

---

## 14. Key Files Reference

| File | Purpose | Status |
|------|---------|--------|
| `plantai-backend/main.py` | All API endpoints | ❌ Needs full rewrite |
| `plantai-backend/services.py` | Data fetch helpers | ⚠️ Crop matrix needs fix |
| `plantai/src/lib/apiClient.ts` | Frontend API calls + data mapping | ✅ Good |
| `plantai/src/lib/store.ts` | Zustand global state | ✅ Good |
| `plantai/src/lib/analysis/cropScorer.ts` | Real crop scoring logic | ✅ Built, not wired yet |
| `plantai/src/lib/data/crops.json` | 20+ crop database | ✅ Good |
| `plantai/src/app/analysis/[id]/page.tsx` | Main dashboard | ✅ Good |
| `plantai/src/components/analysis/AgentSwarm.tsx` | Grant Autopilot UI | ✅ Good |
| `plantai/src/app/map/page.tsx` | Map + analysis trigger | ✅ Good |
| `plantai/src/app/farm/[id]/page.tsx` | 3D visualization | ✅ Good |

---

## 15. How to Start Each Claude Code Session

Open VS Code terminal at the repo root. Run `claude`. Then paste:

> "Read this entire PLANTAI_MASTER.md document fully before doing anything. We are working on PlantAI. The repo is at the current directory. All API keys are configured in .env files. Start with SESSION [N]. Follow the rules in Section 12 exactly. After completing all tasks, confirm what was done and what session is next."

Replace `[N]` with the session number you are starting.

---

*Last updated: Pre-build planning phase | Next step: SESSION 1 — Rewrite main.py*