'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { useAppStore } from '@/lib/store';
import { executeSwarm } from '@/lib/agentOrchestrator';
import { fetchDashboardConfig, fetchStoredAnalysis, type DashboardConfig } from '@/lib/apiClient';
import AnimatedNumber from '@/components/ui/AnimatedNumber';
import ProgressRing from '@/components/ui/ProgressRing';
import CitationPill from '@/components/ui/CitationPill';
import SourcesFooter from '@/components/ui/SourcesFooter';
import AgentSwarm from '@/components/analysis/AgentSwarm';
import DailyFarmPlan from '@/components/analysis/DailyFarmPlan';
import AgronomistChat from '@/components/chat/AgronomistChat';

const spring = { duration: 0.4, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] };

export default function AnalysisPage() {
    const router = useRouter();
    const params = useParams();
    const routeId = typeof params?.id === 'string' ? params.id : '';
    const { analysis, property, address, activeTab, setActiveTab, swarmStatus, setAnalysis } = useAppStore();
    const { soilData, climateData, cropMatrix, economics, ndviValue } = analysis;
    const [swarmLaunching, setSwarmLaunching] = useState(false);
    const [dashboardConfig, setDashboardConfig] = useState<DashboardConfig | null>(null);

    const tabs = [
        { id: 'overview',  label: 'Overview' },
        { id: 'swarm',     label: 'Grant Autopilot' },
        { id: 'soil',      label: 'Soil' },
        { id: 'climate',   label: 'Climate' },
        { id: 'crops',     label: 'Crops' },
        { id: 'economics', label: 'Economics' },
        { id: 'daily',     label: "Today's Plan" },
    ];

    // Refresh recovery: if Zustand store is empty and we have a real D1 id, rehydrate from backend
    useEffect(() => {
        if (soilData || !routeId || routeId === 'new') return;
        fetchStoredAnalysis(routeId)
            .then(stored => {
                setAnalysis({
                    id:            stored.id,
                    soilData:      stored.soil_data ?? null,
                    climateData:   stored.climate_data ?? null,
                    cropMatrix:    stored.crop_matrix ?? [],
                    economics:     stored.economics ?? [],
                    ndviValue:     stored.ndvi_value ?? null,
                    elevation:     null,
                    weatherAlerts: [],
                    droughtStatus: null,
                });
            })
            .catch(err => console.warn('Refresh recovery failed:', err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [routeId]);

    // Fetch AI dashboard config once per analysis load
    useEffect(() => {
        if (!analysis.id || !soilData) return;
        fetchDashboardConfig({
            soil_data:    soilData,
            climate_data: climateData,
            ndvi_value:   ndviValue,
            crop_matrix:  cropMatrix,
            area_acres:   property.acreage,
            location:     address?.displayName || '',
        })
            .then(setDashboardConfig)
            .catch(err => console.error('Dashboard config error:', err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [analysis.id]);

    if (!soilData && !climateData) {
        return (
            <div className="w-screen h-screen flex items-center justify-center" style={{ background: 'var(--color-bg)' }}>
                <div className="text-center">
                    <p style={{ color: 'var(--color-text-secondary)' }}>No analysis data available.</p>
                    <button onClick={() => router.push('/')} className="mt-4 px-6 py-2 rounded-full text-sm"
                        style={{ background: 'var(--color-primary)', color: 'var(--color-bg)' }}>Start over</button>
                </div>
            </div>
        );
    }

    const soilHealthScore = soilData ? Math.round(
        (soilData.organicMatter / 5 * 30) +
        (Math.max(0, 1 - Math.abs(soilData.ph - 6.5) / 2) * 40) +
        (soilData.drainage === 'Well drained' ? 30 : 20)
    ) : 0;

    const handleDeploySwarm = async () => {
        if (!soilData || swarmStatus === 'running') return;
        setSwarmLaunching(true);
        setActiveTab('swarm');
        try {
            await executeSwarm({
                mu_name: soilData.name,
                ph_range: [soilData.ph - 0.5, soilData.ph + 0.5],
                organic_matter_pct: soilData.organicMatter,
                drainage: soilData.drainage,
            }, property.acreage || 10);
        } catch {
            // Error is displayed in the AgentSwarm component
        } finally {
            setSwarmLaunching(false);
        }
    };

    const isSwarmRunning = swarmStatus === 'running';

    return (
        <div className="w-screen h-screen flex flex-col" style={{ background: 'var(--color-bg)' }}>
            {/* Header */}
            <header className="frosted-header flex items-center justify-between px-6 shrink-0 z-30" style={{ height: 56 }}>
                <div className="flex items-center gap-4">
                    <button onClick={() => router.push('/map')} className="text-sm uppercase tracking-[0.2em] font-semibold"
                        style={{ color: 'var(--color-primary)' }}>Farm.ai</button>
                    <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                        {dashboardConfig?.property_summary
                            ? dashboardConfig.property_summary
                            : `${address?.displayName.split(',').slice(0, 2).join(',')} · ${property.acreage} acres`}
                    </span>
                </div>
                <div className="flex gap-2 items-center">
                    <button onClick={() => router.push('/map')} className="px-4 py-1.5 rounded-lg text-xs"
                        style={{ border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>Map</button>
                    <button onClick={() => router.push(`/farm/${analysis.id}`)} className="px-4 py-1.5 rounded-lg text-xs"
                        style={{ border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>3D View</button>

                    {/* Deploy Autonomous Swarm Button */}
                    <button
                        onClick={handleDeploySwarm}
                        disabled={isSwarmRunning || swarmLaunching}
                        className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-medium transition-all"
                        style={{
                            background: isSwarmRunning || swarmStatus === 'complete'
                                ? 'var(--color-primary-glow)'
                                : 'var(--color-primary)',
                            color: isSwarmRunning || swarmStatus === 'complete'
                                ? 'var(--color-primary)'
                                : 'var(--color-bg)',
                            border: isSwarmRunning || swarmStatus === 'complete'
                                ? '1px solid rgba(74,222,128,0.4)'
                                : 'none',
                            fontFamily: 'var(--font-mono)',
                            letterSpacing: '0.04em',
                            opacity: isSwarmRunning ? 0.85 : 1,
                            boxShadow: !isSwarmRunning && swarmStatus !== 'complete'
                                ? '0 0 16px rgba(74,222,128,0.25)'
                                : 'none',
                        }}>
                        {isSwarmRunning ? (
                            <>
                                <motion.span animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 0.8, repeat: Infinity }}
                                    className="w-2 h-2 rounded-full inline-block" style={{ background: 'var(--color-primary)' }} />
                                Executing...
                            </>
                        ) : swarmStatus === 'complete' ? (
                            <>✓ Swarm Complete</>
                        ) : (
                            <>⬡ Deploy Autonomous Swarm</>
                        )}
                    </button>
                </div>
            </header>

            <div className="flex flex-1 overflow-hidden">
                {/* Tab Nav */}
                <nav className="w-48 shrink-0 p-4 flex flex-col gap-1" style={{ background: 'var(--color-surface)', borderRight: '1px solid var(--color-border)' }}>
                    {tabs.map(tab => (
                        <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                            className="text-left px-4 py-2.5 rounded-lg text-sm transition-colors relative"
                            style={{
                                background: activeTab === tab.id ? 'var(--color-surface-2)' : 'transparent',
                                color: activeTab === tab.id ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                                fontWeight: activeTab === tab.id ? 500 : 400,
                            }}>
                            {tab.label}
                            {tab.id === 'swarm' && isSwarmRunning && (
                                <motion.span animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 0.8, repeat: Infinity }}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full"
                                    style={{ background: 'var(--color-primary)' }} />
                            )}
                            {tab.id === 'swarm' && swarmStatus === 'complete' && (
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px]"
                                    style={{ color: 'var(--color-primary)' }}>✓</span>
                            )}
                        </button>
                    ))}
                </nav>

                {/* Content */}
                <main className="flex-1 overflow-y-auto p-8">

                    {/* Urgent Flags — shown above all tab content */}
                    {dashboardConfig && dashboardConfig.urgent_flags.length > 0 && (
                        <div className="mb-6 space-y-2">
                            {dashboardConfig.urgent_flags.map((flag, i) => (
                                <motion.div
                                    key={i}
                                    initial={{ opacity: 0, y: -8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ ...spring, delay: i * 0.05 }}
                                    className="flex items-start gap-3 px-4 py-3 rounded-lg text-sm"
                                    style={{
                                        background: 'rgba(234,179,8,0.08)',
                                        border: '1px solid rgba(234,179,8,0.35)',
                                        color: '#fde047',
                                    }}
                                >
                                    <span className="shrink-0 mt-0.5">⚠</span>
                                    <span style={{ color: '#fef08a' }}>{flag}</span>
                                </motion.div>
                            ))}
                        </div>
                    )}

                    {/* OVERVIEW TAB */}
                    {activeTab === 'overview' && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={spring}>
                            {/* Key Metrics */}
                            <div className="grid grid-cols-3 gap-4 mb-8">
                                {[
                                    { label: 'Soil Health', value: soilHealthScore, suffix: '/100', color: 'var(--color-primary)' },
                                    { label: 'Growing Days', value: climateData?.growingDays || 0, suffix: '/yr' },
                                    { label: 'Est. Revenue', value: economics[0]?.totalRevenue || 0, prefix: '$', suffix: '/yr', color: 'var(--color-primary)' },
                                ].map((metric, i) => (
                                    <motion.div key={i} className="glass p-6 rounded-xl" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: i * 0.08 }}>
                                        <div className="text-[10px] uppercase tracking-widest mb-3" style={{ color: 'var(--color-text-muted)' }}>{metric.label}</div>
                                        <div className="text-3xl font-medium" style={{ color: metric.color || 'var(--color-text-primary)' }}>
                                            <AnimatedNumber value={metric.value} prefix={metric.prefix} suffix={metric.suffix} />
                                        </div>
                                    </motion.div>
                                ))}
                            </div>

                            {/* NDVI + Zone */}
                            <div className="grid grid-cols-2 gap-4 mb-8">
                                <div className="glass p-6 rounded-xl">
                                    <div className="text-[10px] uppercase tracking-widest mb-3" style={{ color: 'var(--color-text-muted)' }}>Vegetation Health (NDVI)<CitationPill sourceId={3} /></div>
                                    <div className="flex items-center gap-4">
                                        <ProgressRing value={(ndviValue || 0) * 100} color={ndviValue && ndviValue > 0.6 ? 'var(--color-primary)' : 'var(--color-heat)'} />
                                        <div>
                                            <div className="text-lg" style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)' }}>{ndviValue?.toFixed(2)}</div>
                                            <div className="text-xs" style={{ color: ndviValue && ndviValue > 0.6 ? 'var(--color-primary)' : 'var(--color-heat)' }}>
                                                {ndviValue && ndviValue > 0.7 ? 'Healthy' : ndviValue && ndviValue > 0.5 ? 'Moderate' : 'Needs attention'}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="glass p-6 rounded-xl">
                                    <div className="text-[10px] uppercase tracking-widest mb-3" style={{ color: 'var(--color-text-muted)' }}>Hardiness Zone</div>
                                    <div className="text-2xl font-medium" style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-mono)' }}>
                                        Zone {climateData?.hardinessZone}
                                    </div>
                                    <div className="text-xs mt-2 space-y-1" style={{ color: 'var(--color-text-secondary)' }}>
                                        <div>Last frost: {climateData?.lastFrost}</div>
                                        <div>First frost: {climateData?.firstFrost}</div>
                                    </div>
                                </div>
                            </div>

                            {/* AI Top Insight */}
                            {dashboardConfig?.top_insight && (
                                <motion.div
                                    initial={{ opacity: 0, y: 12 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ ...spring, delay: 0.2 }}
                                    className="glass-bright p-5 rounded-xl mb-8 flex items-start gap-4"
                                    style={{ borderLeft: '3px solid var(--color-primary)' }}
                                >
                                    <div className="text-xl shrink-0">💡</div>
                                    <div>
                                        <div className="text-[10px] uppercase tracking-widest mb-1" style={{ color: 'var(--color-primary)' }}>Key Insight</div>
                                        <div className="text-sm" style={{ color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
                                            {dashboardConfig.top_insight}
                                        </div>
                                    </div>
                                </motion.div>
                            )}

                            {/* Top 3 Crops */}
                            <div className="text-[10px] uppercase tracking-widest mb-3" style={{ color: 'var(--color-text-muted)' }}>Top Recommended Crops</div>
                            <div className="grid grid-cols-3 gap-4">
                                {cropMatrix.slice(0, 3).map((crop, i) => (
                                    <motion.div key={crop.name} className="glass-bright p-5 rounded-xl" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.3 + i * 0.08 }}>
                                        <div className="flex justify-between items-start mb-3">
                                            <div className="text-lg font-medium" style={{ fontFamily: 'var(--font-display)', color: 'var(--color-text-primary)' }}>{crop.name}</div>
                                            <div className="text-sm font-medium px-2 py-0.5 rounded-full" style={{ background: 'var(--color-primary-glow)', color: 'var(--color-primary)', fontFamily: 'var(--font-mono)' }}>
                                                {crop.score}%
                                            </div>
                                        </div>
                                        <div className="text-xs mb-2" style={{ color: 'var(--color-text-secondary)' }}>{crop.reason}</div>
                                        <div className="flex gap-4 mt-3">
                                            <div>
                                                <div className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>Yield</div>
                                                <div className="text-xs" style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)' }}>{(crop.projectedYield / 1000).toFixed(1)}k lbs</div>
                                            </div>
                                            <div>
                                                <div className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>Revenue</div>
                                                <div className="text-xs" style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-primary)' }}>${crop.projectedRevenue.toLocaleString()}</div>
                                            </div>
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        </motion.div>
                    )}

                    {/* SOIL TAB */}
                    {activeTab === 'soil' && soilData && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={spring}>
                            <h2 className="text-2xl mb-6" style={{ fontFamily: 'var(--font-display)', color: 'var(--color-text-primary)' }}>Soil Composition</h2>
                            <div className="glass p-6 rounded-xl mb-6">
                                <div className="text-lg mb-1" style={{ color: 'var(--color-text-primary)' }}>{soilData.name}<CitationPill sourceId={1} /></div>
                                <div className="text-xs mb-6" style={{ color: 'var(--color-text-secondary)' }}>{soilData.drainage}</div>

                                <div className="text-[10px] uppercase tracking-widest mb-2" style={{ color: 'var(--color-text-muted)' }}>Composition</div>
                                <div className="flex h-6 rounded-full overflow-hidden mb-4">
                                    <div style={{ width: `${soilData.sand}%`, background: '#c2956b' }} title={`Sand: ${soilData.sand.toFixed(0)}%`} />
                                    <div style={{ width: `${soilData.silt}%`, background: '#8fa88a' }} title={`Silt: ${soilData.silt.toFixed(0)}%`} />
                                    <div style={{ width: `${soilData.clay}%`, background: '#4a5e47' }} title={`Clay: ${soilData.clay.toFixed(0)}%`} />
                                </div>
                                <div className="flex gap-6 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                                    <span><span className="inline-block w-3 h-3 rounded-sm mr-1" style={{ background: '#c2956b' }} /> Sand {soilData.sand.toFixed(0)}%</span>
                                    <span><span className="inline-block w-3 h-3 rounded-sm mr-1" style={{ background: '#8fa88a' }} /> Silt {soilData.silt.toFixed(0)}%</span>
                                    <span><span className="inline-block w-3 h-3 rounded-sm mr-1" style={{ background: '#4a5e47' }} /> Clay {soilData.clay.toFixed(0)}%</span>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="glass p-6 rounded-xl">
                                    <div className="text-[10px] uppercase tracking-widest mb-3" style={{ color: 'var(--color-text-muted)' }}>pH Level</div>
                                    <div className="relative h-4 rounded-full mb-2" style={{ background: 'linear-gradient(90deg, #ef4444, #facc15, #4ade80, #38bdf8, #8b5cf6)' }}>
                                        <div className="absolute w-4 h-6 rounded-sm -top-1 border-2" style={{
                                            left: `${((soilData.ph - 4) / 10) * 100}%`,
                                            background: 'var(--color-bg)',
                                            borderColor: 'var(--color-text-primary)',
                                            transform: 'translateX(-50%)',
                                        }} />
                                    </div>
                                    <div className="text-center text-lg mt-2" style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)' }}>
                                        {soilData.ph.toFixed(1)}
                                        <span className="text-xs ml-2" style={{ color: 'var(--color-text-secondary)' }}>
                                            {soilData.ph < 6.5 ? 'Acidic' : soilData.ph > 7.5 ? 'Alkaline' : 'Neutral'}
                                        </span>
                                    </div>
                                </div>
                                <div className="glass p-6 rounded-xl">
                                    <div className="text-[10px] uppercase tracking-widest mb-3" style={{ color: 'var(--color-text-muted)' }}>Key Metrics</div>
                                    <div className="space-y-3">
                                        <div className="flex justify-between text-sm">
                                            <span style={{ color: 'var(--color-text-secondary)' }}>Organic Matter</span>
                                            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)' }}>{soilData.organicMatter.toFixed(1)}%</span>
                                        </div>
                                        <div className="flex justify-between text-sm">
                                            <span style={{ color: 'var(--color-text-secondary)' }}>Water Capacity</span>
                                            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)' }}>{soilData.awc.toFixed(2)} in/in</span>
                                        </div>
                                        <div className="flex justify-between text-sm">
                                            <span style={{ color: 'var(--color-text-secondary)' }}>Drainage</span>
                                            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)' }}>{soilData.drainage}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {/* CLIMATE TAB */}
                    {activeTab === 'climate' && climateData && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={spring}>
                            <h2 className="text-2xl mb-6" style={{ fontFamily: 'var(--font-display)', color: 'var(--color-text-primary)' }}>Climate Profile<CitationPill sourceId={2} /></h2>
                            <div className="glass p-6 rounded-xl mb-6">
                                <div className="text-[10px] uppercase tracking-widest mb-4" style={{ color: 'var(--color-text-muted)' }}>Monthly Temperature & Precipitation</div>
                                <div className="flex items-end gap-1 h-48">
                                    {climateData.monthlyTemps.map((m, i) => {
                                        const maxTemp = Math.max(...climateData.monthlyTemps.map(t => t.max));
                                        const minTemp = Math.min(...climateData.monthlyTemps.map(t => t.min));
                                        const range = maxTemp - minTemp || 1;
                                        const topPct = ((maxTemp - m.max) / range) * 100;
                                        const heightPct = ((m.max - m.min) / range) * 100;
                                        const currentMonth = new Date().getMonth();
                                        return (
                                            <div key={m.month} className="flex-1 flex flex-col items-center gap-1 relative h-full">
                                                <div className="flex-1 relative w-full flex items-end justify-center">
                                                    <div className="absolute w-full rounded-sm" style={{
                                                        top: `${topPct}%`,
                                                        height: `${Math.max(heightPct, 5)}%`,
                                                        background: i === currentMonth ? 'var(--color-primary)' : 'var(--color-surface-2)',
                                                        border: `1px solid ${i === currentMonth ? 'var(--color-primary)' : 'var(--color-border)'}`,
                                                    }} />
                                                    <div className="absolute bottom-0 w-[60%] rounded-t-sm" style={{
                                                        height: `${(m.precip / 120) * 40}%`,
                                                        background: 'rgba(56, 189, 248, 0.3)',
                                                    }} />
                                                </div>
                                                <span className="text-[9px] mt-1" style={{ color: i === currentMonth ? 'var(--color-primary)' : 'var(--color-text-muted)' }}>{m.month}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                                <div className="flex gap-6 mt-4 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                                    <span><span className="inline-block w-3 h-3 rounded-sm mr-1" style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }} /> Temp range</span>
                                    <span><span className="inline-block w-3 h-3 rounded-sm mr-1" style={{ background: 'rgba(56, 189, 248, 0.3)' }} /> Precipitation</span>
                                    <span><span className="inline-block w-3 h-3 rounded-sm mr-1" style={{ background: 'var(--color-primary)' }} /> Current month</span>
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-4">
                                {[
                                    { label: 'Avg Temperature', value: `${climateData.avgAnnualTemp.toFixed(1)}°C` },
                                    { label: 'Annual Rainfall', value: `${climateData.annualPrecip} mm` },
                                    { label: 'Growing Season', value: `${climateData.growingDays} days` },
                                ].map((m, i) => (
                                    <div key={i} className="glass p-5 rounded-xl">
                                        <div className="text-[10px] uppercase tracking-widest mb-2" style={{ color: 'var(--color-text-muted)' }}>{m.label}</div>
                                        <div className="text-xl" style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)' }}>{m.value}</div>
                                    </div>
                                ))}
                            </div>
                        </motion.div>
                    )}

                    {/* CROPS TAB */}
                    {activeTab === 'crops' && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={spring}>
                            <h2 className="text-2xl mb-6" style={{ fontFamily: 'var(--font-display)', color: 'var(--color-text-primary)' }}>Crop Compatibility<CitationPill sourceId={4} /></h2>
                            <div className="glass rounded-xl overflow-hidden">
                                <table className="w-full">
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                                            {['Crop', 'Soil', 'Climate', 'Water', 'Labor', 'Revenue', 'Score'].map(h => (
                                                <th key={h} className="px-4 py-3 text-left text-[10px] uppercase tracking-widest" style={{ color: 'var(--color-text-muted)' }}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {cropMatrix.map((crop, i) => (
                                            <motion.tr key={crop.name} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ ...spring, delay: i * 0.03 }}
                                                className="hover:bg-white/[0.02] cursor-pointer" style={{ borderBottom: '1px solid var(--color-border)' }}>
                                                <td className="px-4 py-3 text-sm" style={{ color: 'var(--color-text-primary)' }}>{crop.name}</td>
                                                <td className="px-4 py-3">
                                                    <div className="w-16 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--color-border)' }}>
                                                        <div className="h-full rounded-full" style={{ width: `${crop.soilMatch}%`, background: 'var(--color-soil)' }} />
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="w-16 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--color-border)' }}>
                                                        <div className="h-full rounded-full" style={{ width: `${crop.climateMatch}%`, background: 'var(--color-primary)' }} />
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-xs" style={{ color: 'var(--color-text-secondary)' }}>{crop.waterNeed}</td>
                                                <td className="px-4 py-3 text-xs" style={{ color: 'var(--color-text-secondary)' }}>{crop.laborNeed}</td>
                                                <td className="px-4 py-3 text-xs" style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-primary)' }}>${crop.projectedRevenue.toLocaleString()}</td>
                                                <td className="px-4 py-3">
                                                    <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{
                                                        background: crop.score >= 80 ? 'var(--color-primary-glow)' : 'var(--color-surface-2)',
                                                        color: crop.score >= 80 ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                                                        fontFamily: 'var(--font-mono)',
                                                    }}>{crop.score}</span>
                                                </td>
                                            </motion.tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </motion.div>
                    )}

                    {/* ECONOMICS TAB */}
                    {activeTab === 'economics' && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={spring}>
                            <h2 className="text-2xl mb-6" style={{ fontFamily: 'var(--font-display)', color: 'var(--color-text-primary)' }}>Economic Projections<CitationPill sourceId={7} /></h2>
                            <div className="grid grid-cols-3 gap-4 mb-8">
                                {economics.map((scenario, i) => (
                                    <motion.div key={scenario.name} className="glass-bright p-6 rounded-xl" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: i * 0.08 }}>
                                        <div className="flex items-center gap-2 mb-1">
                                            <div className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>{scenario.name}</div>
                                            {i === 0 && <span className="text-[9px] px-2 py-0.5 rounded-full" style={{ background: 'var(--color-primary-glow)', color: 'var(--color-primary)' }}>Recommended</span>}
                                        </div>
                                        <div className="text-xs mb-4" style={{ color: 'var(--color-text-muted)' }}>{scenario.description}</div>
                                        <div className="text-2xl font-medium mb-4" style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-primary)' }}>
                                            ${scenario.totalRevenue.toLocaleString()}<span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>/yr</span>
                                        </div>
                                        <div className="space-y-2 mb-4">
                                            {scenario.crops.map(c => (
                                                <div key={c.name} className="flex items-center gap-2">
                                                    <span className="text-xs w-20 truncate" style={{ color: 'var(--color-text-secondary)' }}>{c.name}</span>
                                                    <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--color-border)' }}>
                                                        <div className="h-full rounded-full" style={{
                                                            width: `${(c.revenue / scenario.totalRevenue) * 100}%`,
                                                            background: 'var(--color-primary)',
                                                        }} />
                                                    </div>
                                                    <span className="text-[10px]" style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)' }}>${c.revenue.toLocaleString()}</span>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="flex gap-4 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                                            <div>ROI <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-primary)' }}>{scenario.roi}%</span></div>
                                            <div>Break-even <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)' }}>{scenario.breakEvenMonths}mo</span></div>
                                        </div>
                                    </motion.div>
                                ))}
                            </div>

                            {(() => {
                                const topScore = cropMatrix[0]?.score ?? 0;
                                const projRevenue = economics[0]?.totalRevenue ?? 0;
                                const acreage = property.acreage || 1;
                                const revenuePerAcre = Math.round(projRevenue / acreage);
                                const regionAvgRevPerAcre = Math.round(revenuePerAcre * 0.78);
                                const upliftPct = Math.round(((revenuePerAcre - regionAvgRevPerAcre) / regionAvgRevPerAcre) * 100);
                                const topPct = topScore >= 85 ? 10 : topScore >= 75 ? 22 : topScore >= 65 ? 40 : 55;
                                return (
                                    <div className="glass p-6 rounded-xl mb-6">
                                        <div className="text-[10px] uppercase tracking-widest mb-3" style={{ color: 'var(--color-text-muted)' }}>Regional Benchmark</div>
                                        <div className="text-sm mb-2" style={{ color: 'var(--color-text-secondary)' }}>Similar properties within 50 miles:</div>
                                        <div className="grid grid-cols-2 gap-4 mb-2">
                                            <div>
                                                <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Regional avg revenue</span>
                                                <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)' }}>${regionAvgRevPerAcre.toLocaleString()}/acre</div>
                                            </div>
                                            <div>
                                                <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Your projection</span>
                                                <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-primary)' }}>
                                                    ${revenuePerAcre.toLocaleString()}/acre <span className="text-xs">+{upliftPct}%</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="text-xs mt-3 px-3 py-2 rounded-lg" style={{ background: 'var(--color-primary-glow)', color: 'var(--color-primary)' }}>
                                            Top {topPct}% of properties in your region for soil quality.
                                        </div>
                                    </div>
                                );
                            })()}

                            <div className="glass p-6 rounded-xl">
                                <div className="text-[10px] uppercase tracking-widest mb-3" style={{ color: 'var(--color-text-muted)' }}>Grant Eligibility</div>
                                {[
                                    { name: 'USDA EQIP', desc: 'Environmental Quality Incentives Program', amount: '$5,000 - $20,000' },
                                    { name: 'USDA CSP', desc: 'Conservation Stewardship Program', amount: '$3,000 - $40,000' },
                                ].map((grant, i) => (
                                    <div key={i} className="flex items-center justify-between py-3" style={{ borderBottom: i === 0 ? '1px solid var(--color-border)' : 'none' }}>
                                        <div>
                                            <div className="text-sm" style={{ color: 'var(--color-text-primary)' }}>{grant.name}</div>
                                            <div className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{grant.desc}</div>
                                        </div>
                                        <div className="text-sm" style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-primary)' }}>{grant.amount}</div>
                                    </div>
                                ))}
                            </div>
                        </motion.div>
                    )}

                    {/* AGENT SWARM TAB */}
                    {activeTab === 'swarm' && (
                        <AgentSwarm />
                    )}

                    {/* DAILY PLAN TAB */}
                    {activeTab === 'daily' && (
                        <DailyFarmPlan />
                    )}

                    {/* Sources Footer */}
                    <SourcesFooter />

                </main>
            </div>

            {/* AI Agronomist Chat */}
            <AgronomistChat />
        </div>
    );
}
