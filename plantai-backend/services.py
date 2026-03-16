import os
import json
import re
import httpx

from dotenv import load_dotenv

load_dotenv()

TIMEOUT_SECONDS  = 10.0
NVIDIA_API_KEY   = os.environ.get("NVIDIA_API_KEY")

# ── Full crop list from crops.json (20 crops) ─────────────────────────────────

CROP_LIST = [
    "Tomatoes", "Sweet Corn", "Bell Peppers", "Lettuce", "Strawberries",
    "Basil", "Potatoes", "Sunflowers", "Soybeans", "Garlic",
    "Zucchini", "Carrots", "Kale", "Blueberries", "Winter Wheat",
    "Lavender", "Cucumbers", "Pumpkins", "Green Beans", "Onions",
]

# ── Weather data helpers ──────────────────────────────────────────────────────

async def fetch_open_elevation(client: httpx.AsyncClient, lat: float, lng: float):
    url = f"https://api.open-elevation.com/api/v1/lookup?locations={lat},{lng}"
    try:
        response = await client.get(url, timeout=TIMEOUT_SECONDS)
        response.raise_for_status()
        data = response.json()
        if data.get("results"):
            return data["results"][0].get("elevation")
    except Exception as e:
        print(f"[Open-Elevation] Error: {e}")
    return None


async def fetch_open_meteo_forecast(client: httpx.AsyncClient, lat: float, lng: float):
    url = (
        f"https://api.open-meteo.com/v1/forecast"
        f"?latitude={lat}&longitude={lng}"
        f"&daily=temperature_2m_max,temperature_2m_min,precipitation_sum"
        f"&timezone=auto&forecast_days=16"
    )
    try:
        response = await client.get(url, timeout=TIMEOUT_SECONDS)
        response.raise_for_status()
        return response.json()
    except Exception as e:
        print(f"[Open-Meteo Forecast] Error: {e}")
    return {"error": "Failed to fetch forecast"}


async def fetch_open_meteo_historical(client: httpx.AsyncClient, lat: float, lng: float):
    url = (
        f"https://archive-api.open-meteo.com/v1/archive"
        f"?latitude={lat}&longitude={lng}"
        f"&start_date=1993-01-01&end_date=2023-12-31"
        f"&daily=temperature_2m_max,temperature_2m_min,precipitation_sum"
        f"&timezone=auto"
    )
    try:
        response = await client.get(url, timeout=TIMEOUT_SECONDS)
        response.raise_for_status()
        return response.json()
    except Exception as e:
        print(f"[Open-Meteo Historical] Error: {e}")
    return {"error": "Failed to fetch historical data"}


# ── Crop matrix via NVIDIA ────────────────────────────────────────────────────

def _parse_nvidia_json(text: str):
    match = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    raw = match.group(1).strip() if match else text.strip()
    return json.loads(raw)


def _crop_matrix_fallback() -> list:
    """Fallback 5-crop hardcoded list if NVIDIA call fails."""
    return [
        {"crop": "Tomatoes",    "suitability_score": 85, "estimated_yield_revenue_per_acre": 15000, "rationale": "Widely adaptable"},
        {"crop": "Bell Peppers","suitability_score": 80, "estimated_yield_revenue_per_acre": 18000, "rationale": "High value crop"},
        {"crop": "Basil",       "suitability_score": 78, "estimated_yield_revenue_per_acre": 22000, "rationale": "High revenue per acre"},
        {"crop": "Zucchini",    "suitability_score": 75, "estimated_yield_revenue_per_acre": 10000, "rationale": "Low maintenance"},
        {"crop": "Kale",        "suitability_score": 72, "estimated_yield_revenue_per_acre": 8000,  "rationale": "Cold tolerant"},
    ]


async def generate_crop_matrix(soil_data: dict, climate_data: dict) -> list:
    """
    Score the 20 crops in CROP_LIST against real soil and climate data using NVIDIA.
    Returns list of top 10 crops with suitability_score, revenue estimate, and rationale.
    Falls back to _crop_matrix_fallback() if NVIDIA call fails.
    """
    # Summarise climate data for the prompt
    climate_summary = "Unavailable"
    if isinstance(climate_data, dict) and "daily" in climate_data:
        daily = climate_data["daily"]
        temps = [t for t in daily.get("temperature_2m_max", []) if t is not None]
        precip = [p for p in daily.get("precipitation_sum", []) if p is not None]
        if temps:
            climate_summary = (
                f"16-day forecast: avg high {sum(temps)/len(temps):.1f}°C, "
                f"max {max(temps):.1f}°C, min {min(temps):.1f}°C. "
                f"Total precip: {sum(precip):.1f}mm."
            )

    ph_low  = soil_data.get("ph_range", [6.0, 7.0])[0]
    ph_high = soil_data.get("ph_range", [6.0, 7.0])[1]

    prompt = f"""You are an expert agronomist. Score each crop in this list for suitability based on the given soil and climate conditions.

Soil conditions:
- Soil name: {soil_data.get('mu_name', 'Unknown')}
- pH range: {ph_low} – {ph_high}
- Organic matter: {soil_data.get('organic_matter_pct', 1.5)}%
- Drainage: {soil_data.get('drainage', 'Unknown')}
- Sand/Silt/Clay: {soil_data.get('sand', 40)}% / {soil_data.get('silt', 35)}% / {soil_data.get('clay', 25)}%

Climate summary: {climate_summary}

Crop list to score:
{json.dumps(CROP_LIST)}

Return ONLY a valid JSON array of the top 10 crops, sorted by suitability_score descending:
[
  {{
    "crop": "<crop name from the list>",
    "suitability_score": <integer 0-100>,
    "estimated_yield_revenue_per_acre": <integer USD>,
    "rationale": "<one sentence explaining the score>"
  }}
]

No markdown, no extra text, only the JSON array."""

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                "https://integrate.api.nvidia.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {NVIDIA_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": "qwen/qwen3.5-122b-a10b",
                    "messages": [
                        {"role": "system", "content": "You are an expert agronomist. Always respond with valid JSON only."},
                        {"role": "user",   "content": prompt},
                    ],
                    "temperature": 0.2,
                    "max_tokens": 1024,
                },
            )
            response.raise_for_status()
            text = response.json()["choices"][0]["message"]["content"]
            return _parse_nvidia_json(text)
    except Exception as e:
        print(f"[generate_crop_matrix] NVIDIA error: {e} — using fallback")
        return _crop_matrix_fallback()


# ── Economic projection ───────────────────────────────────────────────────────

def calculate_economic_projection(crop_matrix: list, area_acres: float) -> dict:
    if not crop_matrix:
        return {}

    top_crop_revenue = crop_matrix[0].get("estimated_yield_revenue_per_acre", 10000)
    base_total       = top_crop_revenue * area_acres

    return {
        "max_yield": {
            "description":       "Intensive farming maximizing output.",
            "estimated_revenue": round(base_total * 1.2, 2),
        },
        "low_maintenance": {
            "description":       "Minimal intervention, lower cost.",
            "estimated_revenue": round(base_total * 0.7, 2),
        },
        "pest_resistant": {
            "description":       "Focus on robust varieties, moderate output.",
            "estimated_revenue": round(base_total * 0.9, 2),
        },
    }
