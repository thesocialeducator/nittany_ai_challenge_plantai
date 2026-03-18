import axios from 'axios';
import type { AnalysisData, SoilData, ClimateData, CropScore, EconomicScenario, ChatMessage } from './store';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

// ─── Data source citations ───────────────────────────────────────────────────

export interface Source {
    id: number;
    name: string;
    url: string;
    category: 'soil' | 'climate' | 'satellite' | 'crop' | 'economic';
}

export const DATA_SOURCES: Source[] = [
    { id: 1, name: 'USDA SSURGO', url: 'https://sdmdataaccess.nrcs.usda.gov/', category: 'soil' },
    { id: 2, name: 'Open-Meteo Climate API', url: 'https://open-meteo.com/', category: 'climate' },
    { id: 3, name: 'Copernicus Sentinel-2', url: 'https://dataspace.copernicus.eu/', category: 'satellite' },
    { id: 4, name: 'USDA NASS', url: 'https://quickstats.nass.usda.gov/', category: 'crop' },
    { id: 5, name: 'Open Elevation API', url: 'https://open-elevation.com/', category: 'soil' },
    { id: 6, name: 'NWS Weather Alerts', url: 'https://api.weather.gov/', category: 'climate' },
    { id: 7, name: 'USDA ERS', url: 'https://www.ers.usda.gov/', category: 'economic' },
];

export function getSourcesByCategory(category: Source['category']): Source[] {
    return DATA_SOURCES.filter(s => s.category === category);
}

// ─── Raw backend response types ───────────────────────────────────────────────

export interface PointInfoResponse {
    lat: number;
    lng: number;
    elevation: number | null;
    soil_type: string;  // e.g. "Hagerstown silt loam, pH 6.8"
    ndvi: number;
}

export interface AnalyzeResponse {
    centroid: { lat: number; lng: number };
    area_acres: number;
    weather_forecast: WeatherDaily;
    weather_historical: WeatherDaily;
    soil_data: BackendSoilData;
    ndvi: number;
    crop_matrix: BackendCropEntry[];
    economic_projections: BackendEconomics;
}

interface WeatherDaily {
    daily: {
        time: string[];
        temperature_2m_max: number[];
        temperature_2m_min: number[];
        precipitation_sum: number[];
    };
}

interface BackendSoilData {
    mu_name: string;
    taxonomy: string;
    drainage: string;
    ph_range: [number, number];
    organic_matter_pct: number;
    sand: number;
    silt: number;
    clay: number;
    awc: number;
}

interface BackendCropEntry {
    crop: string;
    suitability_score: number;
    estimated_yield_revenue_per_acre: number;
}

interface BackendEconomics {
    max_yield:       { description: string; estimated_revenue: number };
    low_maintenance: { description: string; estimated_revenue: number };
    pest_resistant:  { description: string; estimated_revenue: number };
}

// ─── API call functions ────────────────────────────────────────────────────────

export async function fetchPointInfo(lat: number, lng: number): Promise<PointInfoResponse> {
    const { data } = await axios.post<PointInfoResponse>(`${BASE_URL}/api/point-info`, { lat, lng });
    return data;
}

export async function fetchAnalysis(
    coordinates: [number, number][],
    area_acres: number
): Promise<AnalyzeResponse> {
    const { data } = await axios.post<AnalyzeResponse>(`${BASE_URL}/api/analyze`, {
        coordinates,
        area_acres,
    });
    return data;
}

// ─── Chat & Recommendation API calls ─────────────────────────────────────────

export async function fetchChatResponse(
    message: string,
    history: ChatMessage[],
    context?: Record<string, unknown>
): Promise<string> {
    const { data } = await axios.post<{ reply: string }>(`${BASE_URL}/api/chat`, {
        message,
        history: history.map(m => ({ role: m.role, content: m.content })),
        context,
    });
    return data.reply;
}

export async function fetchRecommendations(
    lat: number,
    lng: number
): Promise<GeoJSON.FeatureCollection> {
    const { data } = await axios.post<GeoJSON.FeatureCollection>(`${BASE_URL}/api/recommendations`, {
        lat,
        lng,
    });
    return data;
}

// ─── Dashboard config ─────────────────────────────────────────────────────────

export interface DashboardConfig {
    property_summary: string;
    urgent_flags: string[];
    tab_order: string[];
    hero_metric: string;
    top_insight: string;
}

export async function fetchDashboardConfig(params: {
    soil_data:    SoilData | null;
    climate_data: ClimateData | null;
    ndvi_value:   number | null;
    crop_matrix:  CropScore[];
    area_acres:   number;
    location:     string;
}): Promise<DashboardConfig> {
    const { data } = await axios.post<DashboardConfig>(`${BASE_URL}/api/generate-dashboard`, {
        ...params,
        crop_matrix: params.crop_matrix.slice(0, 5),
    });
    return data;
}

// ─── Save / Retrieve analysis (D1) ────────────────────────────────────────────

export interface SaveAnalysisPayload {
    address: string;
    lat: number;
    lng: number;
    acreage: number;
    polygon_geojson?: string;
    soil_data?: SoilData | null;
    climate_data?: ClimateData | null;
    ndvi_value?: number | null;
    crop_matrix: CropScore[];
    economics?: EconomicScenario[] | null;
    dashboard_config?: DashboardConfig | null;
    user_id?: string;
}

export async function fetchSaveAnalysis(payload: SaveAnalysisPayload): Promise<string> {
    const { data } = await axios.post<{ id: string }>(`${BASE_URL}/api/save-analysis`, payload);
    return data.id;
}

export interface StoredAnalysis {
    id: string;
    created_at: string;
    address: string;
    lat: number;
    lng: number;
    acreage: number;
    polygon_geojson?: string;
    soil_data?: SoilData;
    climate_data?: ClimateData;
    ndvi_value?: number;
    crop_matrix: CropScore[];
    economics?: EconomicScenario[];
    dashboard_config?: DashboardConfig;
}

export async function fetchStoredAnalysis(id: string): Promise<StoredAnalysis> {
    const { data } = await axios.get<StoredAnalysis>(`${BASE_URL}/api/get-analysis/${id}`);
    return data;
}

// ─── Returning user analyses ──────────────────────────────────────────────────

export interface AnalysisSummary {
    id: string;
    address: string;
    acreage: number;
    created_at: string;
    soil_ph: number | null;
    top_crop: string | null;
    ndvi_value: number | null;
}

export async function fetchMyAnalyses(userId: string): Promise<AnalysisSummary[]> {
    const { data } = await axios.get<AnalysisSummary[]>(`${BASE_URL}/api/my-analyses/${userId}`);
    return data;
}

// ─── Main transformation function ─────────────────────────────────────────────

export function mapBackendToAnalysis(
    backend: AnalyzeResponse,
    acreage: number,
    analysisId: string
): AnalysisData {
    return {
        id: analysisId,
        soilData:      mapSoilData(backend.soil_data),
        climateData:   mapClimateData(backend.weather_historical),
        cropMatrix:    mapCropMatrix(backend.crop_matrix, acreage),
        economics:     mapEconomics(backend.economic_projections, backend.crop_matrix, acreage),
        ndviValue:     backend.ndvi,
        elevation:     null,  // /analyze does not return elevation
        weatherAlerts: [],
        droughtStatus: null,
    };
}

// ─── Transformation helpers ───────────────────────────────────────────────────

function mapSoilData(raw: BackendSoilData): SoilData {
    const ph = (raw.ph_range[0] + raw.ph_range[1]) / 2;
    return {
        name:          raw.mu_name,
        ph:            Math.round(ph * 10) / 10,
        organicMatter: raw.organic_matter_pct,
        drainage:      raw.drainage,
        sand:          raw.sand,
        silt:          raw.silt,
        clay:          raw.clay,
        awc:           raw.awc,
        description:   raw.taxonomy,
    };
}

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function mapClimateData(historical: WeatherDaily): ClimateData {
    const { time, temperature_2m_max, temperature_2m_min, precipitation_sum } = historical.daily;

    // Bucket accumulators indexed 0..11
    const buckets = Array.from({ length: 12 }, () => ({
        maxSum: 0, minSum: 0, precipSum: 0, count: 0,
    }));

    for (let i = 0; i < time.length; i++) {
        const month = new Date(time[i]).getMonth();
        const b = buckets[month];
        b.maxSum   += temperature_2m_max[i]  ?? 0;
        b.minSum   += temperature_2m_min[i]  ?? 0;
        b.precipSum += precipitation_sum[i]  ?? 0;
        b.count++;
    }

    const monthlyTemps = MONTH_NAMES.map((month, i) => {
        const b = buckets[i];
        const n = b.count || 1;
        const avgMax   = b.maxSum   / n;
        const avgMin   = b.minSum   / n;
        // Convert avg daily mm to monthly total mm
        const avgPrecip = (b.precipSum / n) * DAYS_IN_MONTH[i];
        return {
            month,
            max:    Math.round(avgMax   * 10) / 10,
            min:    Math.round(avgMin   * 10) / 10,
            precip: Math.round(avgPrecip * 10) / 10,
        };
    });

    const avgAnnualTemp = Math.round(
        (monthlyTemps.reduce((s, m) => s + (m.max + m.min) / 2, 0) / 12) * 10
    ) / 10;

    const annualPrecip = Math.round(monthlyTemps.reduce((s, m) => s + m.precip, 0));

    // Hardiness zone from coldest winter month min temp
    const winterMonths = [monthlyTemps[0], monthlyTemps[1], monthlyTemps[10], monthlyTemps[11]];
    const minWinterTemp = Math.min(...winterMonths.map(m => m.min));
    const hardinessZone = deriveHardinessZone(minWinterTemp);

    // Growing days: months where avg low > 0°C
    const growingDays = monthlyTemps.reduce((s, m, i) => {
        return m.min > 0 ? s + DAYS_IN_MONTH[i] : s;
    }, 0);

    const { lastFrost, firstFrost } = deriveFrostDates(monthlyTemps);

    return {
        monthlyTemps,
        avgAnnualTemp,
        annualPrecip,
        growingDays,
        hardinessZone,
        lastFrost,
        firstFrost,
    };
}

function deriveHardinessZone(minWinterTempC: number): string {
    const f = minWinterTempC * 9 / 5 + 32;
    if (f < -50) return '1a';
    if (f < -45) return '1b';
    if (f < -40) return '2a';
    if (f < -35) return '2b';
    if (f < -30) return '3a';
    if (f < -25) return '3b';
    if (f < -20) return '4a';
    if (f < -15) return '4b';
    if (f < -10) return '5a';
    if (f <  -5) return '5b';
    if (f <   0) return '6a';
    if (f <   5) return '6b';
    if (f <  10) return '7a';
    if (f <  15) return '7b';
    if (f <  20) return '8a';
    if (f <  25) return '8b';
    if (f <  30) return '9a';
    if (f <  35) return '9b';
    if (f <  40) return '10a';
    return '10b';
}

function deriveFrostDates(monthlyTemps: { month: string; min: number }[]): {
    lastFrost: string;
    firstFrost: string;
} {
    // Last spring frost: latest month in Jan–Jun where avg min ≤ 0°C
    let lastFrostMonth = 2;  // default March
    for (let i = 0; i <= 5; i++) {
        if (monthlyTemps[i].min <= 0) lastFrostMonth = i;
    }

    // First autumn frost: earliest month in Jul–Dec where avg min ≤ 0°C
    let firstFrostMonth = 9;  // default October
    for (let i = 11; i >= 6; i--) {
        if (monthlyTemps[i].min <= 0) firstFrostMonth = i;
    }

    return {
        lastFrost:  `${MONTH_NAMES[lastFrostMonth]} 15`,
        firstFrost: `${MONTH_NAMES[firstFrostMonth]} 15`,
    };
}

function mapCropMatrix(crops: BackendCropEntry[], acreage: number): CropScore[] {
    return [...crops]
        .sort((a, b) => b.suitability_score - a.suitability_score)
        .map(c => {
            const score = c.suitability_score;
            const projectedRevenue = Math.round(c.estimated_yield_revenue_per_acre * acreage);
            const projectedYield   = Math.round(projectedRevenue / 0.25);  // lbs at $0.25/lb proxy

            let waterNeed = 'Moderate';
            let laborNeed = 'Moderate';
            if (score >= 80) { waterNeed = 'Low';  laborNeed = 'Low';  }
            if (score <  50) { waterNeed = 'High'; laborNeed = 'High'; }

            let reason = 'Moderate suitability, consider soil amendments';
            if (score >= 80) reason = 'Excellent soil and climate match';
            else if (score >= 60) reason = 'Good compatibility with local conditions';

            return {
                name:           c.crop,
                score,
                soilMatch:      Math.round(score * 0.95),
                climateMatch:   Math.round(score * 0.90),
                waterNeed,
                laborNeed,
                projectedYield,
                projectedRevenue,
                reason,
                companionPlants: [],
                pestRisks:       [],
                rotationTips:    [],
            };
        });
}

export function generateEconomicsFromCropScores(
    crops: CropScore[],
    acreage: number
): EconomicScenario[] {
    if (!crops.length) return [];
    const topCrops = crops.slice(0, 4);
    const baseTotal = crops[0].projectedRevenue * acreage;
    const totalScore = topCrops.reduce((s, c) => s + c.score, 0) || 1;

    const scenarios = [
        { name: 'Max Yield',       description: 'Intensive farming maximizing output.',         multiplier: 1.2, roi: 22, breakEvenMonths: 18, laborReduction: 0  },
        { name: 'Low Maintenance', description: 'Minimal intervention, lower cost.',             multiplier: 0.7, roi: 14, breakEvenMonths: 24, laborReduction: 20 },
        { name: 'Pest Resistant',  description: 'Focus on robust varieties, moderate output.',   multiplier: 0.9, roi: 18, breakEvenMonths: 20, laborReduction: 10 },
    ];

    return scenarios.map(({ name, description, multiplier, roi, breakEvenMonths, laborReduction }) => {
        const totalRevenue = Math.round(baseTotal * multiplier);
        const cropList = topCrops.map(c => ({
            name:    c.name,
            revenue: Math.round(totalRevenue * c.score / totalScore),
            acres:   Math.round((c.score / totalScore) * acreage * 10) / 10,
        }));
        return { name, description, totalRevenue, laborReduction, crops: cropList, breakEvenMonths, roi };
    });
}

function mapEconomics(
    econ: BackendEconomics,
    cropEntries: BackendCropEntry[],
    acreage: number
): EconomicScenario[] {
    const scenarios = [
        { name: 'Max Yield',       data: econ.max_yield,       roi: 22, breakEvenMonths: 18, laborReduction: 0  },
        { name: 'Low Maintenance', data: econ.low_maintenance, roi: 14, breakEvenMonths: 24, laborReduction: 20 },
        { name: 'Pest Resistant',  data: econ.pest_resistant,  roi: 18, breakEvenMonths: 20, laborReduction: 10 },
    ];

    // Distribute each scenario's revenue across top-4 crops proportionally by score
    const topCrops = [...cropEntries]
        .sort((a, b) => b.suitability_score - a.suitability_score)
        .slice(0, 4);
    const totalScore = topCrops.reduce((s, c) => s + c.suitability_score, 0) || 1;

    return scenarios.map(({ name, data, roi, breakEvenMonths, laborReduction }) => {
        const totalRevenue = Math.round(data.estimated_revenue);
        const crops = topCrops.map(c => {
            const share   = c.suitability_score / totalScore;
            return {
                name:    c.crop,
                revenue: Math.round(totalRevenue * share),
                acres:   Math.round(share * acreage * 10) / 10,
            };
        });

        return {
            name,
            description: data.description,
            totalRevenue,
            laborReduction,
            crops,
            breakEvenMonths,
            roi,
        };
    });
}
