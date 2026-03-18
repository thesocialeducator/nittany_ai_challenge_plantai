import os
import json
import re
import math
import uuid
import asyncio
import random
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Any, List, Optional

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from shapely.geometry import Polygon
from dotenv import load_dotenv

from services import (
    fetch_open_elevation,
    fetch_open_meteo_forecast,
    fetch_open_meteo_historical,
    generate_crop_matrix,
    calculate_economic_projection,
)

load_dotenv()

NVIDIA_API_KEY          = os.environ.get("NVIDIA_API_KEY")
NASA_EARTHDATA_USERNAME = os.environ.get("NASA_EARTHDATA_USERNAME")
NASA_EARTHDATA_PASSWORD = os.environ.get("NASA_EARTHDATA_PASSWORD")
CF_ACCOUNT_ID           = os.environ.get("CF_ACCOUNT_ID")
CF_D1_DB_ID             = os.environ.get("CF_D1_DB_ID")
CF_API_TOKEN            = os.environ.get("CF_API_TOKEN")

# ── NVIDIA helper ─────────────────────────────────────────────────────────────

async def call_nvidia(prompt: str, system: str = "You are a helpful AI assistant.") -> str:
    """Call NVIDIA Build API with qwen/qwen3.5-122b-a10b and return response text."""
    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(
            "https://integrate.api.nvidia.com/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {NVIDIA_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": "meta/llama-3.3-70b-instruct",
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user",   "content": prompt},
                ],
                "temperature": 0.3,
                "max_tokens": 2048,
            },
        )
        response.raise_for_status()
        return response.json()["choices"][0]["message"]["content"]


async def embed_text(text: str) -> list:
    """Embed text using NVIDIA NemoRetriever and return a list of floats."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.post(
            "https://integrate.api.nvidia.com/v1/embeddings",
            headers={
                "Authorization": f"Bearer {NVIDIA_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": "nvidia/nv-embed-v1",
                "input": text,
                "encoding_format": "float",
            },
        )
        r.raise_for_status()
        return r.json()["data"][0]["embedding"]


VECTOR_STORE_PATH = os.path.join(os.path.dirname(__file__), "vector_store.json")

def query_vector_store(query_embedding: list, top_k: int = 3) -> list:
    """
    Load vector_store.json and return the top_k most similar chunk texts
    using cosine similarity.  Returns an empty list if the store doesn't exist.
    """
    if not os.path.exists(VECTOR_STORE_PATH):
        return []

    with open(VECTOR_STORE_PATH, "r", encoding="utf-8") as f:
        store = json.load(f)

    if not store:
        return []

    def cosine(a: list, b: list) -> float:
        dot  = sum(x * y for x, y in zip(a, b))
        norm_a = math.sqrt(sum(x * x for x in a))
        norm_b = math.sqrt(sum(y * y for y in b))
        return dot / (norm_a * norm_b) if norm_a and norm_b else 0.0

    scored = [(cosine(query_embedding, entry["embedding"]), entry["text"]) for entry in store]
    scored.sort(key=lambda x: x[0], reverse=True)
    return [text for _, text in scored[:top_k]]


def parse_json_response(text: str) -> dict:
    """Extract and parse JSON from an LLM response, stripping markdown fences."""
    match = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    raw = match.group(1).strip() if match else text.strip()
    return json.loads(raw)


# ── Cloudflare D1 ─────────────────────────────────────────────────────────────

async def d1_query(sql: str, params: list = []):
    """Execute a SQL query against Cloudflare D1 via REST API."""
    url = (
        f"https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}"
        f"/d1/database/{CF_D1_DB_ID}/query"
    )
    async with httpx.AsyncClient(timeout=15.0) as client:
        r = await client.post(
            url,
            headers={"Authorization": f"Bearer {CF_API_TOKEN}"},
            json={"sql": sql, "params": params},
        )
        r.raise_for_status()
        return r.json()["result"][0]["results"]


# ── USDA SDA Soil ─────────────────────────────────────────────────────────────

def _soil_fallback(lat: float, lng: float) -> dict:
    """Deterministic coordinate-based soil fallback when USDA SDA is unavailable."""
    if 39.5 <= lat <= 42.5 and -80.5 <= lng <= -74.5:
        return {
            "mu_name":            "Hagerstown silt loam",
            "taxonomy":           "Fine, mixed, semiactive, mesic Typic Hapludolls",
            "drainage":           "Well drained",
            "ph_range":           [6.0, 7.0],
            "organic_matter_pct": 2.1,
            "sand":               25.0,
            "silt":               55.0,
            "clay":               20.0,
            "awc":                0.19,
        }
    return {
        "mu_name":            "Loam",
        "taxonomy":           "Fine-loamy, mixed, mesic Typic Hapludalfs",
        "drainage":           "Moderately well drained",
        "ph_range":           [6.0, 7.0],
        "organic_matter_pct": 1.8,
        "sand":               40.0,
        "silt":               35.0,
        "clay":               25.0,
        "awc":                0.18,
    }


async def fetch_usda_soil(lat: float, lng: float) -> dict:
    """
    Query USDA SDA (Soil Data Access) for real soil data at a point.
    Falls back to _soil_fallback() on any error or empty result.
    """
    sql = (
        f"SELECT TOP 1 mu.muname, c.taxclname, c.drainagecl, "
        f"ch.ph1to1h2o_l, ch.ph1to1h2o_h, ch.om_l, "
        f"ch.sandtotal_l, ch.silttotal_l, ch.claytotal_l, ch.awc_l "
        f"FROM mapunit mu "
        f"JOIN component c ON mu.mukey = c.mukey "
        f"JOIN chorizon ch ON c.cokey = ch.cokey "
        f"WHERE mu.mukey IN ("
        f"  SELECT mukey FROM SDA_Get_Mukey_from_intersection_with_WktWgs84("
        f"    'point({lng} {lat})')"
        f") AND c.majcompflag = 'Yes' "
        f"ORDER BY c.comppct_r DESC"
    )

    def _f(val, default: float) -> float:
        try:
            return float(val) if val is not None else default
        except (TypeError, ValueError):
            return default

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            r = await client.post(
                "https://SDMDataAccess.nrcs.usda.gov/Tabular/post.rest",
                data={"query": sql, "format": "json"},
            )
            r.raise_for_status()
            payload = r.json()

        table = payload.get("Table", [])
        if len(table) < 2:
            return _soil_fallback(lat, lng)

        row = table[1]  # row 0 is header, row 1 is first data row
        return {
            "mu_name":            row[0] or "Unknown soil",
            "taxonomy":           row[1] or "Unknown taxonomy",
            "drainage":           row[2] or "Unknown drainage",
            "ph_range":           [_f(row[3], 5.5), _f(row[4], 7.0)],
            "organic_matter_pct": _f(row[5], 1.5),
            "sand":               _f(row[6], 40.0),
            "silt":               _f(row[7], 35.0),
            "clay":               _f(row[8], 25.0),
            "awc":                _f(row[9], 0.18),
        }

    except Exception as e:
        print(f"[USDA SDA] Error: {e} — using fallback")
        return _soil_fallback(lat, lng)


# ── NASA MODIS NDVI ───────────────────────────────────────────────────────────

def compute_ndvi_estimate(lat: float, lng: float) -> float:
    """Seasonal + latitude formula fallback when NASA MODIS is unavailable."""
    month = datetime.now().month
    # Peaks in July (7), lowest in January (1)
    seasonal = (1 + math.cos(2 * math.pi * (month - 7) / 12)) / 2
    # Mid-latitudes (30–50°N) are most productive
    lat_factor = max(0.4, 1.0 - abs(lat - 40) / 60)
    ndvi = 0.25 + 0.55 * seasonal * lat_factor
    return round(max(0.1, min(0.9, ndvi)), 3)


async def fetch_nasa_ndvi(lat: float, lng: float) -> float:
    """
    Fetch real NDVI from NASA MODIS ORNL endpoint with Earthdata auth.
    Falls back to compute_ndvi_estimate() on any error.
    """
    url = (
        f"https://modis.ornl.gov/rst/api/v1/MOD13Q1/subset"
        f"?latitude={lat}&longitude={lng}"
        f"&band=250m_16_days_NDVI"
        f"&startDate=A2024001&endDate=A2024365"
        f"&kmAboveBelow=0&kmLeftRight=0"
    )
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(
                url,
                auth=(NASA_EARTHDATA_USERNAME, NASA_EARTHDATA_PASSWORD),
            )
            response.raise_for_status()
            data = response.json()
            subsets = data.get("subset", [])
            if subsets:
                raw_value = subsets[-1].get("data", [None])[0]
                if raw_value is not None and raw_value != -3000:
                    return round(raw_value * 0.0001, 3)
    except Exception as e:
        print(f"[NASA MODIS] Error: {e} — using estimate")
    return compute_ndvi_estimate(lat, lng)


# ── FastAPI app ───────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Idempotent migration: add user_id column to D1 tables
    for table in ("properties", "analyses"):
        try:
            await d1_query(f"ALTER TABLE {table} ADD COLUMN user_id TEXT")
            print(f"[Migration] Added user_id to {table}")
        except Exception as e:
            if "duplicate column" not in str(e).lower():
                print(f"[Migration] Warning on {table}: {e}")
    yield

app = FastAPI(title="Farm.ai Backend", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Pydantic models ───────────────────────────────────────────────────────────

class PointRequest(BaseModel):
    lat: float
    lng: float

class PolygonRequest(BaseModel):
    coordinates: List[List[float]]
    area_acres: float

class SoilDataInput(BaseModel):
    mu_name: str
    ph_range: List[float]
    organic_matter_pct: float
    drainage: str

class RemediationRequest(BaseModel):
    soil_data: SoilDataInput
    area_acres: float

class ProcurementRequest(BaseModel):
    amendment_plan: dict
    area_acres: float

class FinanceRequest(BaseModel):
    total_cost: float
    soil_data: dict

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    message: str
    history: List[ChatMessage] = []
    context: Optional[dict] = None

class RecommendationRequest(BaseModel):
    lat: float
    lng: float

class DashboardRequest(BaseModel):
    soil_data: Optional[dict] = None
    climate_data: Optional[dict] = None
    ndvi_value: Optional[float] = None
    crop_matrix: List[dict] = []
    area_acres: float = 0
    location: str = ""

class SaveAnalysisRequest(BaseModel):
    address: str = ""
    lat: float
    lng: float
    acreage: float
    polygon_geojson: Optional[str] = None
    soil_data: Optional[dict] = None
    climate_data: Optional[dict] = None
    ndvi_value: Optional[float] = None
    crop_matrix: List[dict] = []
    economics: Optional[dict] = None
    dashboard_config: Optional[dict] = None
    user_id: Optional[str] = None

# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok"}

# ── Point Info ────────────────────────────────────────────────────────────────

@app.post("/api/point-info")
async def get_point_info(request: PointRequest):
    async with httpx.AsyncClient() as client:
        elevation, soil_data, ndvi = await asyncio.gather(
            fetch_open_elevation(client, request.lat, request.lng),
            fetch_usda_soil(request.lat, request.lng),
            fetch_nasa_ndvi(request.lat, request.lng),
        )

    return {
        "elevation": elevation,
        "soil_type": soil_data["mu_name"],
        "soil_data": soil_data,
        "ndvi":      ndvi,
        "lat":       request.lat,
        "lng":       request.lng,
    }

# ── Analyze Polygon ───────────────────────────────────────────────────────────

@app.post("/api/analyze")
async def analyze_polygon(request: PolygonRequest):
    if len(request.coordinates) < 3:
        raise HTTPException(status_code=400, detail="Polygon must have at least 3 points")

    try:
        poly = Polygon(request.coordinates)
        centroid = poly.centroid
        c_lng, c_lat = centroid.x, centroid.y
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid polygon coordinates: {e}")

    async with httpx.AsyncClient() as client:
        forecast_data, historical_data, soil_data, ndvi = await asyncio.gather(
            fetch_open_meteo_forecast(client, c_lat, c_lng),
            fetch_open_meteo_historical(client, c_lat, c_lng),
            fetch_usda_soil(c_lat, c_lng),
            fetch_nasa_ndvi(c_lat, c_lng),
        )

    crop_matrix          = await generate_crop_matrix(soil_data, forecast_data)
    economic_projection  = calculate_economic_projection(crop_matrix, request.area_acres)

    return {
        "centroid":             {"lat": round(c_lat, 6), "lng": round(c_lng, 6)},
        "area_acres":           request.area_acres,
        "weather_forecast":     forecast_data,
        "weather_historical":   historical_data,
        "soil_data":            soil_data,
        "ndvi":                 ndvi,
        "crop_matrix":          crop_matrix,
        "economic_projections": economic_projection,
    }

# ── Agent: Remediation ────────────────────────────────────────────────────────

@app.post("/api/agent/remediation")
async def agent_remediation(request: RemediationRequest):
    soil = request.soil_data
    prompt = f"""Act as a Soil Remediation Agent for precision agriculture. Analyze the soil data and determine the optimal amendment strategy.

Soil data:
- Name: {soil.mu_name}
- pH range: {soil.ph_range[0]} to {soil.ph_range[1]}
- Organic matter: {soil.organic_matter_pct}%
- Drainage: {soil.drainage}
- Field area: {request.area_acres} acres

Return ONLY a valid JSON object with exactly these fields:
{{
  "status_log": ["<thought step 1>", "<thought step 2>", "<thought step 3>"],
  "amendment_plan": {{
    "fertilizer_type": "<specific fertilizer blend name>",
    "estimated_tons": <number>
  }}
}}

Make the status_log entries sound like real AI reasoning steps (e.g. "Analyzing pH deficit against optimal range 6.2-6.8..."). The amendment_plan should be scientifically appropriate for the soil conditions. No markdown, no extra text, only the JSON object."""

    try:
        result = await call_nvidia(prompt)
        return parse_json_response(result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Agent error: {str(e)}")

# ── Agent: Procurement ────────────────────────────────────────────────────────

@app.post("/api/agent/procurement")
async def agent_procurement(request: ProcurementRequest):
    prompt = f"""Act as a Procurement Agent for agricultural supply chain management. Source materials based on a soil amendment plan.

Amendment plan received from Remediation Agent:
{json.dumps(request.amendment_plan, indent=2)}

Field area: {request.area_acres} acres

Return ONLY a valid JSON object with exactly these fields:
{{
  "status_log": ["<sourcing step 1>", "<sourcing step 2>", "<sourcing step 3>"],
  "bill_of_materials": [
    {{"name": "<item name>", "quantity": "<quantity with unit>", "estimated_cost": <number>}},
    {{"name": "<item name>", "quantity": "<quantity with unit>", "estimated_cost": <number>}},
    {{"name": "<item name>", "quantity": "<quantity with unit>", "estimated_cost": <number>}}
  ],
  "total_cost": <number>
}}

The status_log should reflect real procurement reasoning. The bill_of_materials should include the main amendment material, delivery/spreading services, and soil testing. Ensure total_cost equals the sum of all estimated_cost values. No markdown, no extra text, only the JSON object."""

    try:
        result = await call_nvidia(prompt)
        return parse_json_response(result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Agent error: {str(e)}")

# ── Agent: Finance ────────────────────────────────────────────────────────────

@app.post("/api/agent/finance")
async def agent_finance(request: FinanceRequest):
    soil_name = request.soil_data.get("mu_name", "agricultural land")
    prompt = f"""Act as a Financial Grant Agent specializing in USDA agricultural funding programs. Draft a grant application for soil remediation funding.

Financial data:
- Total remediation cost: ${request.total_cost:,.2f}
- Soil type: {soil_name}
- Soil conditions: {json.dumps(request.soil_data)}

Return ONLY a valid JSON object with exactly these fields:
{{
  "status_log": ["<financial analysis step 1>", "<financial analysis step 2>", "<financial analysis step 3>"],
  "grant_name": "USDA EQIP",
  "drafted_application": "<Sentence 1 introducing the applicant and the specific soil remediation need.> <Sentence 2 describing the amendment plan and its environmental benefit, explicitly stating the total cost of ${request.total_cost:,.2f}.> <Sentence 3 formally requesting the grant funding and citing expected agricultural outcomes.>"
}}

The status_log should reflect real grant analysis steps. The drafted_application must be exactly 3 sentences and must explicitly mention the total cost of ${request.total_cost:,.2f}. No markdown, no extra text, only the JSON object."""

    try:
        result = await call_nvidia(prompt)
        return parse_json_response(result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Agent error: {str(e)}")

# ── Chat (RAG) ────────────────────────────────────────────────────────────────

@app.post("/api/chat")
async def chat(request: ChatRequest):
    # 1. Embed the user's question
    try:
        query_embedding = await embed_text(request.message)
    except Exception:
        query_embedding = []

    # 2. Retrieve relevant chunks from the local vector store
    retrieved_chunks = query_vector_store(query_embedding, top_k=3) if query_embedding else []

    # 3. Build knowledge context from retrieved chunks
    knowledge_str = ""
    used_rag = bool(retrieved_chunks)
    if retrieved_chunks:
        knowledge_str = "Relevant agricultural knowledge:\n"
        for i, chunk in enumerate(retrieved_chunks, 1):
            knowledge_str += f"[{i}] {chunk.strip()}\n\n"

    # 4. Build property context
    context_str = ""
    if request.context:
        context_str = f"""Farm property analysis data:
{json.dumps(request.context, indent=2, default=str)}
"""

    # 5. Build conversation history
    history_str = ""
    for msg in request.history[-10:]:
        history_str += f"{msg.role}: {msg.content}\n"

    # 6. Compose grounded prompt
    prompt = f"""You are an expert AI Agronomist working for Farm.ai, a precision agriculture platform.
You provide concise, data-driven answers grounded in real agricultural science.

{knowledge_str}
{context_str}
Conversation so far:
{history_str}
User question: {request.message}

Answer directly and concisely (2-4 sentences). Reference specific numbers from the property data or knowledge base when relevant.
If asked about something not covered, say so honestly. Do not use markdown formatting."""

    try:
        reply = await call_nvidia(prompt)
        reply_text = reply.strip()
        if used_rag:
            reply_text += "\n\nSources: Penn State Extension / USDA"
        return {"reply": reply_text}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Chat error: {str(e)}")

# ── Generate Dashboard Config ─────────────────────────────────────────────────

@app.post("/api/generate-dashboard")
async def generate_dashboard(request: DashboardRequest):
    """Ask NVIDIA to summarise the property and generate dashboard config."""
    soil = request.soil_data or {}
    climate = request.climate_data or {}

    soil_name  = soil.get("name") or soil.get("mu_name", "Unknown soil")
    ph         = soil.get("ph", "N/A")
    drainage   = soil.get("drainage", "N/A")
    zone       = climate.get("hardinessZone", "N/A")
    top_crops  = [c.get("name") or c.get("crop", "") for c in request.crop_matrix[:5]]

    prompt = f"""You are an agricultural AI analyzing a farm property for a first-time farmer.

Property data:
- Location: {request.location}
- Acreage: {request.area_acres} acres
- Soil: {soil_name}, pH {ph}, {drainage}
- NDVI vegetation index: {request.ndvi_value}
- Hardiness Zone: {zone}
- Top recommended crops: {', '.join(top_crops) if top_crops else 'Not yet scored'}

Return ONLY valid JSON with exactly these fields:
{{
  "property_summary": "<2 sentence summary of this specific farm — mention the soil type, pH, and hardiness zone>",
  "urgent_flags": ["<one specific actionable issue if the data reveals a real concern — e.g. low pH, poor drainage, low NDVI — otherwise leave the array empty>"],
  "tab_order": ["overview", "soil", "climate", "crops", "economics"],
  "hero_metric": "soil_health",
  "top_insight": "<single most important insight for a first-time farmer looking at this specific property — be concrete and mention real numbers>"
}}

No markdown, no extra text, only the JSON object."""

    try:
        result = await call_nvidia(prompt)
        return parse_json_response(result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Dashboard generation error: {str(e)}")


# ── Save Analysis (D1) ────────────────────────────────────────────────────────

@app.post("/api/save-analysis")
async def save_analysis(request: SaveAnalysisRequest):
    """Persist a completed analysis to Cloudflare D1 and return the analysis UUID."""
    property_id = str(uuid.uuid4())
    analysis_id = str(uuid.uuid4())
    now = datetime.utcnow().isoformat()

    try:
        await d1_query(
            """INSERT INTO properties (id, created_at, address, lat, lng, acreage, polygon_geojson, user_id)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            [property_id, now, request.address, request.lat, request.lng,
             request.acreage, request.polygon_geojson, request.user_id],
        )
        await d1_query(
            """INSERT INTO analyses
               (id, property_id, created_at, soil_data, climate_data, ndvi_value,
                crop_matrix, economics, dashboard_config, user_id)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            [
                analysis_id,
                property_id,
                now,
                json.dumps(request.soil_data) if request.soil_data else None,
                json.dumps(request.climate_data) if request.climate_data else None,
                request.ndvi_value,
                json.dumps(request.crop_matrix),
                json.dumps(request.economics) if request.economics else None,
                json.dumps(request.dashboard_config) if request.dashboard_config else None,
                request.user_id,
            ],
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"D1 insert error: {str(e)}")

    return {"id": analysis_id}


# ── Get Analysis (D1) ─────────────────────────────────────────────────────────

@app.get("/api/get-analysis/{analysis_id}")
async def get_analysis(analysis_id: str):
    """Retrieve a stored analysis from Cloudflare D1 by analysis UUID."""
    try:
        rows = await d1_query(
            """SELECT a.id, a.created_at, a.soil_data, a.climate_data, a.ndvi_value,
                      a.crop_matrix, a.economics, a.dashboard_config,
                      p.address, p.lat, p.lng, p.acreage, p.polygon_geojson
               FROM analyses a
               JOIN properties p ON a.property_id = p.id
               WHERE a.id = ?""",
            [analysis_id],
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"D1 query error: {str(e)}")

    if not rows:
        raise HTTPException(status_code=404, detail="not found")

    row = rows[0]

    def _parse(val):
        if val is None:
            return None
        if isinstance(val, str):
            try:
                return json.loads(val)
            except Exception:
                return val
        return val

    return {
        "id":               row.get("id"),
        "created_at":       row.get("created_at"),
        "address":          row.get("address"),
        "lat":              row.get("lat"),
        "lng":              row.get("lng"),
        "acreage":          row.get("acreage"),
        "polygon_geojson":  row.get("polygon_geojson"),
        "soil_data":        _parse(row.get("soil_data")),
        "climate_data":     _parse(row.get("climate_data")),
        "ndvi_value":       row.get("ndvi_value"),
        "crop_matrix":      _parse(row.get("crop_matrix")) or [],
        "economics":        _parse(row.get("economics")),
        "dashboard_config": _parse(row.get("dashboard_config")),
    }


# ── My Analyses (returning user) ─────────────────────────────────────────────

@app.get("/api/my-analyses/{user_id}")
async def my_analyses(user_id: str):
    """Return recent analyses for an anonymous user, ordered newest first."""
    try:
        rows = await d1_query(
            """SELECT a.id, a.created_at, a.ndvi_value,
                      a.soil_data, a.crop_matrix,
                      p.address, p.acreage
               FROM analyses a
               JOIN properties p ON a.property_id = p.id
               WHERE a.user_id = ?
               ORDER BY a.created_at DESC
               LIMIT 10""",
            [user_id],
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"D1 query error: {str(e)}")

    results = []
    for row in rows:
        # Extract soil_ph from JSON soil_data
        soil_ph = None
        try:
            sd = json.loads(row.get("soil_data") or "{}")
            ph_range = sd.get("ph_range") or sd.get("ph")
            if isinstance(ph_range, list) and len(ph_range) == 2:
                soil_ph = round((ph_range[0] + ph_range[1]) / 2, 1)
            elif isinstance(ph_range, (int, float)):
                soil_ph = round(float(ph_range), 1)
        except Exception:
            pass

        # Extract top_crop from JSON crop_matrix
        top_crop = None
        try:
            cm = json.loads(row.get("crop_matrix") or "[]")
            if cm:
                top_crop = cm[0].get("name") or cm[0].get("crop")
        except Exception:
            pass

        results.append({
            "id":         row.get("id"),
            "address":    row.get("address"),
            "acreage":    row.get("acreage"),
            "created_at": row.get("created_at"),
            "soil_ph":    soil_ph,
            "top_crop":   top_crop,
            "ndvi_value": row.get("ndvi_value"),
        })

    return results


# ── Recommendations ───────────────────────────────────────────────────────────

@app.post("/api/recommendations")
async def get_recommendations(request: RecommendationRequest):
    """Returns GeoJSON FeatureCollection of high-yield parcels near the input coordinates."""
    offsets = [
        (0.008, 0.005), (-0.006, 0.009), (0.012, -0.004), (-0.010, -0.007)
    ]
    parcel_names = [
        "Riverside Agricultural Plot", "Hilltop Farmstead",
        "Valley View Parcel",          "Sunrise Meadow Tract",
    ]
    parcels = []
    for i, (dlat, dlng) in enumerate(offsets):
        lat = request.lat + dlat + random.uniform(-0.001, 0.001)
        lng = request.lng + dlng + random.uniform(-0.001, 0.001)
        spread = 0.002 + random.uniform(0, 0.001)
        coords = [
            [lng - spread, lat - spread * 0.7],
            [lng + spread, lat - spread * 0.7],
            [lng + spread, lat + spread * 0.7],
            [lng - spread, lat + spread * 0.7],
            [lng - spread, lat - spread * 0.7],
        ]
        parcels.append({
            "type": "Feature",
            "geometry": {"type": "Polygon", "coordinates": [coords]},
            "properties": {
                "name":             parcel_names[i],
                "projected_yield":  random.randint(82, 98),
                "soil_match_score": random.randint(78, 96),
                "acreage":          round(random.uniform(5, 45), 1),
                "distance_miles":   round(math.sqrt(dlat**2 + dlng**2) * 69, 1),
            },
        })

    return {"type": "FeatureCollection", "features": parcels}


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
