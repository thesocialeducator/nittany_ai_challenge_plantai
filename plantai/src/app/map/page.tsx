'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/lib/store';
import { fetchAnalysis, mapBackendToAnalysis, generateEconomicsFromCropScores, fetchSaveAnalysis } from '@/lib/apiClient';
import { scoreCrops } from '@/lib/analysis/cropScorer';
import dynamic from 'next/dynamic';

const MapCanvas = dynamic(() => import('@/components/map/MapCanvas'), { ssr: false });

const springTransition = { duration: 0.4, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] };

export default function MapPage() {
    const router = useRouter();
    const {
        address, coordinates, property, setProperty,
        setAnalysis, isAnalyzing, setIsAnalyzing,
        loadingSteps, updateLoadingStep, activeLayers, toggleLayer,
    } = useAppStore();

    const [sidebarData, setSidebarData] = useState<{
        acreage: number;
        soil?: string;
        ph?: number;
        drainage?: string;
        organicMatter?: number;
        zone?: string;
        lastFrost?: string;
        firstFrost?: string;
    } | null>(null);

    const handlePolygonComplete = useCallback(async (
        polygon: GeoJSON.Feature,
        acreage: number,
        centroid: { lat: number; lng: number }
    ) => {
        setProperty({ polygon, acreage, centroid });
        setSidebarData({ acreage });
        setIsAnalyzing(true);

        // Extract [lng, lat] coordinate pairs from GeoJSON polygon ring
        const coordinates = (polygon.geometry as GeoJSON.Polygon).coordinates[0] as [number, number][];

        // Step 0: Location identified — mark immediately done
        updateLoadingStep(0, 'done');
        updateLoadingStep(1, 'loading');

        // Simulate progressive step UX while the single backend call is in flight
        const timers = [
            setTimeout(() => { updateLoadingStep(1, 'done'); updateLoadingStep(2, 'loading'); }, 2000),
            setTimeout(() => { updateLoadingStep(2, 'done'); updateLoadingStep(3, 'loading'); }, 4500),
            setTimeout(() => { updateLoadingStep(3, 'done'); updateLoadingStep(4, 'loading'); }, 7000),
            setTimeout(() => { updateLoadingStep(4, 'done'); updateLoadingStep(5, 'loading'); }, 9500),
        ];

        try {
            const backendData = await fetchAnalysis(coordinates, acreage);

            // Cancel any pending simulation timers
            timers.forEach(clearTimeout);

            // Mark all steps done at once
            [0, 1, 2, 3, 4, 5].forEach(i => updateLoadingStep(i, 'done'));

            // Transform backend response → AnalysisData for the store
            const localId = Date.now().toString(36);
            const analysisData = mapBackendToAnalysis(backendData, acreage, localId);

            // Override crop matrix + economics with real frontend scores
            if (analysisData.soilData && analysisData.climateData) {
                const realCrops = scoreCrops(analysisData.soilData, analysisData.climateData);
                analysisData.cropMatrix = realCrops;
                analysisData.economics  = generateEconomicsFromCropScores(realCrops, acreage);
            }

            // Save to D1 and get a persistent UUID; fall back to local ID on error
            let analysisId = localId;
            try {
                analysisId = await fetchSaveAnalysis({
                    address:          address?.displayName ?? '',
                    lat:              centroid.lat,
                    lng:              centroid.lng,
                    acreage,
                    polygon_geojson:  JSON.stringify(polygon),
                    soil_data:        analysisData.soilData ?? null,
                    climate_data:     analysisData.climateData ?? null,
                    ndvi_value:       analysisData.ndviValue ?? null,
                    crop_matrix:      analysisData.cropMatrix,
                    economics:        analysisData.economics ?? null,
                    dashboard_config: null,
                });
            } catch (saveErr) {
                console.warn('D1 save failed, using local id:', saveErr);
            }

            // Stamp the persistent ID onto the store analysis
            analysisData.id = analysisId;
            setAnalysis(analysisData);

            // Populate sidebar from mapped data
            if (analysisData.soilData) {
                setSidebarData(prev => ({
                    ...prev!,
                    soil:          analysisData.soilData!.name,
                    ph:            analysisData.soilData!.ph,
                    drainage:      analysisData.soilData!.drainage,
                    organicMatter: analysisData.soilData!.organicMatter,
                }));
            }
            if (analysisData.climateData) {
                setSidebarData(prev => ({
                    ...prev!,
                    zone:       analysisData.climateData!.hardinessZone,
                    lastFrost:  analysisData.climateData!.lastFrost,
                    firstFrost: analysisData.climateData!.firstFrost,
                }));
            }

            // Brief pause so user sees all checkmarks, then redirect
            setTimeout(() => {
                setIsAnalyzing(false);
                router.push(`/analysis/${analysisId}`);
            }, 1000);
        } catch (err) {
            console.error('Analysis error:', err);
            timers.forEach(clearTimeout);
            setIsAnalyzing(false);
        }
    }, [setProperty, setIsAnalyzing, updateLoadingStep, setAnalysis, router]);

    // Redirect if no coordinates
    if (!coordinates) {
        return (
            <div className="w-screen h-screen flex items-center justify-center" style={{ background: 'var(--color-bg)' }}>
                <div className="text-center">
                    <p style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-body)' }}>
                        No location selected.
                    </p>
                    <button
                        onClick={() => router.push('/')}
                        className="mt-4 px-6 py-2 rounded-full text-sm"
                        style={{ background: 'var(--color-primary)', color: 'var(--color-bg)' }}
                    >
                        Go back
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="w-screen h-screen flex flex-col" style={{ background: 'var(--color-bg)' }}>
            {/* Header Bar */}
            <header
                className="frosted-header flex items-center justify-between px-6 shrink-0 z-30"
                style={{ height: 56 }}
            >
                <button
                    onClick={() => router.push('/')}
                    className="text-sm uppercase tracking-[0.2em] font-semibold"
                    style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-body)' }}
                >
                    Farm.ai
                </button>
                <div className="flex items-center gap-3">
                    {address && (
                        <span className="text-xs" style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>
                            {address.displayName.split(',').slice(0, 2).join(',')}
                        </span>
                    )}
                    {property.acreage > 0 && (
                        <>
                            <button
                                onClick={() => router.push(`/analysis/${useAppStore.getState().analysis.id || 'new'}`)}
                                className="px-4 py-1.5 rounded-lg text-xs font-medium"
                                style={{ background: 'var(--color-primary)', color: 'var(--color-bg)' }}
                            >
                                Analyze
                            </button>
                            <button
                                onClick={() => router.push(`/farm/${useAppStore.getState().analysis.id || 'new'}`)}
                                className="px-4 py-1.5 rounded-lg text-xs"
                                style={{ border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}
                            >
                                3D
                            </button>
                        </>
                    )}
                </div>
            </header>

            <div className="flex flex-1 overflow-hidden">
                {/* Left Sidebar */}
                <aside
                    className="shrink-0 overflow-y-auto z-20 flex flex-col"
                    style={{
                        width: 300,
                        background: 'var(--color-surface)',
                        borderRight: '1px solid var(--color-border)',
                    }}
                >
                    {/* Property Summary */}
                    <div className="p-5" style={{ borderBottom: '1px solid var(--color-border)' }}>
                        <div className="text-[10px] uppercase tracking-widest mb-3" style={{ color: 'var(--color-text-muted)' }}>
                            Property
                        </div>
                        {sidebarData ? (
                            <>
                                <div className="text-xl font-medium" style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)' }}>
                                    {sidebarData.acreage} acres
                                </div>
                                <div className="text-xs mt-1" style={{ color: 'var(--color-text-secondary)' }}>
                                    {address?.displayName.split(',').slice(0, 2).join(', ')}
                                </div>
                            </>
                        ) : (
                            <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                                Draw a property boundary to begin analysis
                            </div>
                        )}
                    </div>

                    {/* Soil Overview */}
                    {sidebarData?.soil && (
                        <motion.div
                            className="p-5"
                            style={{ borderBottom: '1px solid var(--color-border)' }}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={springTransition}
                        >
                            <div className="text-[10px] uppercase tracking-widest mb-3" style={{ color: 'var(--color-text-muted)' }}>
                                Soil Overview
                            </div>
                            <div className="text-sm" style={{ color: 'var(--color-text-primary)' }}>{sidebarData.soil}</div>
                            <div className="text-xs mt-2 space-y-1" style={{ color: 'var(--color-text-secondary)' }}>
                                <div>pH {sidebarData.ph?.toFixed(1)} — {sidebarData.ph && sidebarData.ph < 6.5 ? 'Acidic' : sidebarData.ph && sidebarData.ph > 7.5 ? 'Alkaline' : 'Slightly acidic'}</div>
                                <div>Organic matter: {sidebarData.organicMatter?.toFixed(1)}%</div>
                                <div>Drainage: {sidebarData.drainage}</div>
                            </div>
                        </motion.div>
                    )}

                    {/* Hardiness Zone */}
                    {sidebarData?.zone && (
                        <motion.div
                            className="p-5"
                            style={{ borderBottom: '1px solid var(--color-border)' }}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ ...springTransition, delay: 0.1 }}
                        >
                            <div className="text-[10px] uppercase tracking-widest mb-3" style={{ color: 'var(--color-text-muted)' }}>
                                Hardiness Zone
                            </div>
                            <div className="text-lg font-medium" style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-mono)' }}>
                                Zone {sidebarData.zone}
                            </div>
                            <div className="text-xs mt-2 space-y-1" style={{ color: 'var(--color-text-secondary)' }}>
                                <div>Last frost: {sidebarData.lastFrost}</div>
                                <div>First frost: {sidebarData.firstFrost}</div>
                            </div>
                        </motion.div>
                    )}

                    {/* Layer Controls */}
                    <div className="p-5 mt-auto" style={{ borderTop: '1px solid var(--color-border)' }}>
                        <div className="text-[10px] uppercase tracking-widest mb-3" style={{ color: 'var(--color-text-muted)' }}>
                            Map Layers
                        </div>
                        {[
                            { key: 'satellite', label: 'Satellite', alwaysOn: true },
                            { key: 'ndvi', label: 'NDVI Vegetation' },
                            { key: 'soil', label: 'Soil Zones' },
                            { key: 'elevation', label: 'Elevation Contours' },
                            { key: 'irrigation', label: 'Irrigation Flow' },
                            { key: 'terrain3d', label: '3D Terrain' },
                        ].map(({ key, label, alwaysOn }) => (
                            <label key={key} className="flex items-center justify-between py-2 cursor-pointer group">
                                <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{label}</span>
                                <div
                                    className="relative w-8 h-4 rounded-full transition-colors"
                                    style={{
                                        background: activeLayers[key]
                                            ? 'var(--color-primary)'
                                            : 'var(--color-border)',
                                    }}
                                    onClick={() => !alwaysOn && toggleLayer(key)}
                                >
                                    <div
                                        className="absolute top-0.5 w-3 h-3 rounded-full transition-transform"
                                        style={{
                                            background: activeLayers[key] ? 'var(--color-bg)' : 'var(--color-text-muted)',
                                            transform: activeLayers[key] ? 'translateX(18px)' : 'translateX(2px)',
                                        }}
                                    />
                                </div>
                            </label>
                        ))}
                    </div>
                </aside>

                {/* Map Canvas */}
                <main className="flex-1 relative">
                    <MapCanvas onPolygonComplete={handlePolygonComplete} />
                </main>
            </div>

            {/* Analysis Loading Overlay */}
            <AnimatePresence>
                {isAnalyzing && (
                    <motion.div
                        className="fixed inset-0 z-50 flex items-center justify-center"
                        style={{ background: 'rgba(10, 13, 10, 0.85)', backdropFilter: 'blur(12px)' }}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                    >
                        <motion.div
                            className="glass-bright p-8 rounded-2xl max-w-md w-full mx-4"
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={springTransition}
                        >
                            <h2
                                className="text-xl mb-6"
                                style={{ fontFamily: 'var(--font-display)', color: 'var(--color-text-primary)' }}
                            >
                                Analyzing your property
                            </h2>
                            <div className="space-y-3">
                                {loadingSteps.map((step, i) => (
                                    <motion.div
                                        key={i}
                                        className="flex items-center gap-3"
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: i * 0.1 }}
                                    >
                                        <div className="w-5 h-5 flex items-center justify-center shrink-0">
                                            {step.status === 'done' && (
                                                <svg className="w-4 h-4" style={{ color: 'var(--color-primary)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                </svg>
                                            )}
                                            {step.status === 'loading' && (
                                                <div className="w-3.5 h-3.5 rounded-full" style={{ background: 'var(--color-primary)', animation: 'pulse 1s ease-in-out infinite' }} />
                                            )}
                                            {step.status === 'pending' && (
                                                <div className="w-3 h-3 rounded-full" style={{ border: '1.5px solid var(--color-border)' }} />
                                            )}
                                        </div>
                                        <div className="flex-1">
                                            <div className="text-sm" style={{
                                                color: step.status === 'done' ? 'var(--color-text-primary)' : step.status === 'loading' ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                                            }}>
                                                {step.label}
                                            </div>
                                            {step.sublabel && step.status === 'loading' && (
                                                <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                                                    {step.sublabel}...
                                                </div>
                                            )}
                                        </div>
                                        {step.status === 'loading' && (
                                            <div className="w-16 h-1 rounded-full overflow-hidden" style={{ background: 'var(--color-border)' }}>
                                                <div className="h-full rounded-full skeleton" style={{ width: '60%' }} />
                                            </div>
                                        )}
                                    </motion.div>
                                ))}
                            </div>
                            <div className="mt-6 text-xs" style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>
                                Processing environmental data points...
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
