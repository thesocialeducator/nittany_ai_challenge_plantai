import { create } from 'zustand';

export interface Coordinates {
    lat: number;
    lng: number;
}

export interface AddressResult {
    displayName: string;
    lat: number;
    lng: number;
    state?: string;
    county?: string;
}

export interface SoilData {
    name: string;
    ph: number;
    organicMatter: number;
    drainage: string;
    sand: number;
    silt: number;
    clay: number;
    awc: number;
    description?: string;
}

export interface ClimateData {
    monthlyTemps: { month: string; min: number; max: number; precip: number }[];
    avgAnnualTemp: number;
    annualPrecip: number;
    growingDays: number;
    hardinessZone: string;
    lastFrost: string;
    firstFrost: string;
}

export interface CropScore {
    name: string;
    score: number;
    soilMatch: number;
    climateMatch: number;
    waterNeed: string;
    laborNeed: string;
    projectedYield: number;
    projectedRevenue: number;
    reason: string;
    companionPlants: string[];
    pestRisks: string[];
    rotationTips: string[];
}

export type WeatherCondition = 'clear' | 'rain' | 'snow';

export interface EconomicScenario {
    name: string;
    description: string;
    totalRevenue: number;
    laborReduction: number;
    crops: { name: string; revenue: number; acres: number }[];
    breakEvenMonths: number;
    roi: number;
}

export interface AnalysisData {
    id: string;
    soilData: SoilData | null;
    climateData: ClimateData | null;
    cropMatrix: CropScore[];
    economics: EconomicScenario[];
    ndviValue: number | null;
    elevation: number | null;
    weatherAlerts: string[];
    droughtStatus: string | null;
}

export interface PropertyData {
    polygon: GeoJSON.Feature | null;
    acreage: number;
    centroid: Coordinates | null;
}

// ── Chat Types ───────────────────────────────────────────────────────────────

export interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
}

// ── Swarm Agent Result Types ──────────────────────────────────────────────────

export interface RemediationResult {
    status_log: string[];
    amendment_plan: {
        fertilizer_type: string;
        estimated_tons: number;
    };
}

export interface BOMItem {
    name: string;
    quantity: string;
    estimated_cost: number;
}

export interface ProcurementResult {
    status_log: string[];
    bill_of_materials: BOMItem[];
    total_cost: number;
}

export interface FinanceResult {
    status_log: string[];
    grant_name: string;
    drafted_application: string;
}

// ─────────────────────────────────────────────────────────────────────────────

interface LoadingStep {
    label: string;
    sublabel: string;
    status: 'pending' | 'loading' | 'done' | 'error';
}

interface AppState {
    // Location
    address: AddressResult | null;
    coordinates: Coordinates | null;
    setAddress: (addr: AddressResult) => void;

    // Property
    property: PropertyData;
    setProperty: (p: PropertyData) => void;

    // Analysis
    analysis: AnalysisData;
    setAnalysis: (a: Partial<AnalysisData>) => void;

    // Loading
    isAnalyzing: boolean;
    loadingSteps: LoadingStep[];
    setIsAnalyzing: (v: boolean) => void;
    updateLoadingStep: (index: number, status: LoadingStep['status']) => void;

    // Map layers
    activeLayers: Record<string, boolean>;
    toggleLayer: (layer: string) => void;

    // UI
    activeTab: string;
    setActiveTab: (tab: string) => void;

    // Weather visualization
    weatherCondition: WeatherCondition;
    setWeatherCondition: (c: WeatherCondition) => void;

    // ── Agent Swarm State ─────────────────────────────────────────────────────
    swarmStatus: 'idle' | 'running' | 'complete';
    currentAgent: 0 | 1 | 2 | 3;
    remediationResult: RemediationResult | null;
    procurementResult: ProcurementResult | null;
    financeResult: FinanceResult | null;
    setSwarmStatus: (s: 'idle' | 'running' | 'complete') => void;
    setCurrentAgent: (n: 0 | 1 | 2 | 3) => void;
    setRemediationResult: (r: RemediationResult) => void;
    setProcurementResult: (r: ProcurementResult) => void;
    setFinanceResult: (r: FinanceResult) => void;
    resetSwarm: () => void;

    // Chat
    chatMessages: ChatMessage[];
    chatOpen: boolean;
    chatLoading: boolean;
    addChatMessage: (msg: ChatMessage) => void;
    setChatOpen: (open: boolean) => void;
    setChatLoading: (loading: boolean) => void;
    clearChat: () => void;

    // Reset
    reset: () => void;
}

const defaultLoadingSteps: LoadingStep[] = [
    { label: 'Location identified',  sublabel: 'OpenStreetMap Nominatim',   status: 'pending' },
    { label: 'Soil composition',     sublabel: 'USDA SSURGO database',       status: 'pending' },
    { label: 'Climate history',      sublabel: 'Open-Meteo 30-year normals', status: 'pending' },
    { label: 'Vegetation health',    sublabel: 'NASA MODIS satellite',        status: 'pending' },
    { label: 'Crop compatibility',   sublabel: 'USDA NASS benchmarks',        status: 'pending' },
    { label: 'Economic projections', sublabel: 'USDA ERS models',             status: 'pending' },
];

const defaultAnalysis: AnalysisData = {
    id: '',
    soilData: null,
    climateData: null,
    cropMatrix: [],
    economics: [],
    ndviValue: null,
    elevation: null,
    weatherAlerts: [],
    droughtStatus: null,
};

export const useAppStore = create<AppState>((set) => ({
    address: null,
    coordinates: null,
    setAddress: (addr) => set({ address: addr, coordinates: { lat: addr.lat, lng: addr.lng } }),

    property: { polygon: null, acreage: 0, centroid: null },
    setProperty: (p) => set({ property: p }),

    analysis: defaultAnalysis,
    setAnalysis: (a) => set((state) => ({ analysis: { ...state.analysis, ...a } })),

    isAnalyzing: false,
    loadingSteps: [...defaultLoadingSteps],
    setIsAnalyzing: (v) => set({ isAnalyzing: v, loadingSteps: v ? defaultLoadingSteps.map(s => ({ ...s })) : [] }),
    updateLoadingStep: (index, status) =>
        set((state) => {
            const steps = [...state.loadingSteps];
            if (steps[index]) steps[index] = { ...steps[index], status };
            return { loadingSteps: steps };
        }),

    activeLayers: {
        satellite: true,
        ndvi: false,
        soil: false,
        elevation: false,
        irrigation: false,
        terrain3d: false,
    },
    toggleLayer: (layer) =>
        set((state) => ({
            activeLayers: { ...state.activeLayers, [layer]: !state.activeLayers[layer] },
        })),

    activeTab: 'overview',
    setActiveTab: (tab) => set({ activeTab: tab }),

    weatherCondition: 'clear',
    setWeatherCondition: (c) => set({ weatherCondition: c }),

    // ── Agent Swarm ───────────────────────────────────────────────────────────
    swarmStatus: 'idle',
    currentAgent: 0,
    remediationResult: null,
    procurementResult: null,
    financeResult: null,
    setSwarmStatus: (s) => set({ swarmStatus: s }),
    setCurrentAgent: (n) => set({ currentAgent: n }),
    setRemediationResult: (r) => set({ remediationResult: r }),
    setProcurementResult: (r) => set({ procurementResult: r }),
    setFinanceResult: (r) => set({ financeResult: r }),
    resetSwarm: () => set({
        swarmStatus: 'idle',
        currentAgent: 0,
        remediationResult: null,
        procurementResult: null,
        financeResult: null,
    }),

    // ── Chat ──────────────────────────────────────────────────────────────────
    chatMessages: [],
    chatOpen: false,
    chatLoading: false,
    addChatMessage: (msg) => set((state) => ({ chatMessages: [...state.chatMessages, msg] })),
    setChatOpen: (open) => set({ chatOpen: open }),
    setChatLoading: (loading) => set({ chatLoading: loading }),
    clearChat: () => set({ chatMessages: [] }),

    reset: () =>
        set({
            address: null,
            coordinates: null,
            property: { polygon: null, acreage: 0, centroid: null },
            analysis: defaultAnalysis,
            isAnalyzing: false,
            loadingSteps: [],
            activeTab: 'overview',
            weatherCondition: 'clear',
            swarmStatus: 'idle',
            currentAgent: 0,
            remediationResult: null,
            procurementResult: null,
            financeResult: null,
            chatMessages: [],
            chatOpen: false,
            chatLoading: false,
        }),
}));
