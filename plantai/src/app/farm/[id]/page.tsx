'use client';

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/lib/store';
import dynamic from 'next/dynamic';

const FarmScene = dynamic(() => import('@/components/farm/FarmScene'), { ssr: false });

const spring = { duration: 0.4, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] };

export default function FarmPage() {
    const router = useRouter();
    const { analysis, coordinates, property, address } = useAppStore();
    const weatherCondition = useAppStore((s) => s.weatherCondition);
    const setWeatherCondition = useAppStore((s) => s.setWeatherCondition);
    const [layout, setLayout] = useState('max-yield');
    const [hour, setHour] = useState(14);
    const [showCompare, setShowCompare] = useState(false);
    const [dayOfYear, setDayOfYear] = useState(() => {
        const now = new Date();
        const start = new Date(now.getFullYear(), 0, 0);
        return Math.floor((now.getTime() - start.getTime()) / 86400000);
    });

    const layouts = [
        { id: 'max-yield', label: 'Max Yield' },
        { id: 'low-maint', label: 'Low Maintenance' },
        { id: 'pest-resist', label: 'Pest Resistant' },
    ];

    // Derive layout A and B crop lists from economics scenarios
    const layoutA = useMemo(() => {
        const scenario = analysis.economics[0]; // Max Yield
        return scenario?.crops ?? analysis.cropMatrix.slice(0, 4).map(c => ({ name: c.name, revenue: c.projectedRevenue, acres: 0 }));
    }, [analysis]);

    const layoutB = useMemo(() => {
        const scenario = analysis.economics[1]; // Low Maintenance
        return scenario?.crops ?? analysis.cropMatrix.slice(0, 4).map(c => ({ name: c.name, revenue: Math.round(c.projectedRevenue * 0.7), acres: 0 }));
    }, [analysis]);

    const revenueA = analysis.economics[0]?.totalRevenue ?? 0;
    const revenueB = analysis.economics[1]?.totalRevenue ?? 0;
    const revenueDiff = revenueA - revenueB;

    if (!analysis.cropMatrix.length) {
        return (
            <div className="w-screen h-screen flex items-center justify-center" style={{ background: 'var(--color-bg)' }}>
                <div className="text-center">
                    <p style={{ color: 'var(--color-text-secondary)' }}>No analysis data. Complete a property analysis first.</p>
                    <button onClick={() => router.push('/')} className="mt-4 px-6 py-2 rounded-full text-sm"
                        style={{ background: 'var(--color-primary)', color: 'var(--color-bg)' }}>Start over</button>
                </div>
            </div>
        );
    }

    return (
        <div className="w-screen h-screen flex flex-col" style={{ background: 'var(--color-bg)' }}>
            {/* Header */}
            <header className="frosted-header flex items-center justify-between px-6 shrink-0 z-30" style={{ height: 56 }}>
                <div className="flex items-center gap-4">
                    <button onClick={() => router.push('/map')} className="text-sm uppercase tracking-[0.2em] font-semibold"
                        style={{ color: 'var(--color-primary)' }}>Farm.ai</button>
                    <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                        3D Visualization — {address?.displayName.split(',').slice(0, 2).join(',')}
                    </span>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => setShowCompare(v => !v)}
                        className="px-4 py-1.5 rounded-lg text-xs font-medium transition-all"
                        style={{
                            background: showCompare ? 'var(--color-primary)' : 'transparent',
                            color: showCompare ? 'var(--color-bg)' : 'var(--color-text-secondary)',
                            border: showCompare ? 'none' : '1px solid var(--color-border)',
                        }}>
                        Compare Layouts
                    </button>
                    <button onClick={() => router.push('/map')} className="px-4 py-1.5 rounded-lg text-xs"
                        style={{ border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>Map</button>
                    <button onClick={() => router.push(`/analysis/${analysis.id}`)} className="px-4 py-1.5 rounded-lg text-xs"
                        style={{ border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>Analysis</button>
                </div>
            </header>

            {/* 3D Scene + Compare Panel */}
            <div className="flex-1 relative flex overflow-hidden">
                {/* 3D Scene */}
                <div className="flex-1 relative">
                    <FarmScene
                        crops={analysis.cropMatrix}
                        layout={layout}
                        lat={coordinates?.lat || 40.79}
                        lng={coordinates?.lng || -77.86}
                        hour={hour}
                        dayOfYear={dayOfYear}
                        acreage={property.acreage || 5}
                        weatherCondition={weatherCondition}
                    />

                    {/* Layout Toggle */}
                    <motion.div
                        className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex gap-1 p-1 rounded-xl"
                        style={{ background: 'rgba(17, 22, 18, 0.9)', backdropFilter: 'blur(12px)', border: '1px solid var(--color-border)' }}
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={spring}
                    >
                        {layouts.map(l => (
                            <button key={l.id} onClick={() => setLayout(l.id)}
                                className="px-4 py-2 rounded-lg text-xs transition-all"
                                style={{
                                    background: layout === l.id ? 'var(--color-primary)' : 'transparent',
                                    color: layout === l.id ? 'var(--color-bg)' : 'var(--color-text-secondary)',
                                    fontWeight: layout === l.id ? 600 : 400,
                                }}>{l.label}</button>
                        ))}
                    </motion.div>

                    {/* Sun / Time Controls */}
                    <motion.div
                        className="absolute bottom-6 left-6 z-20 p-5 rounded-xl w-72"
                        style={{ background: 'rgba(17, 22, 18, 0.9)', backdropFilter: 'blur(16px)', border: '1px solid var(--color-border)' }}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ ...spring, delay: 0.2 }}
                    >
                        {/* Time of Day */}
                        <div className="mb-4">
                            <div className="flex justify-between mb-2">
                                <span className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--color-text-muted)' }}>Time of Day</span>
                                <span className="text-xs" style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)' }}>
                                    {Math.floor(hour).toString().padStart(2, '0')}:{Math.round((hour % 1) * 60).toString().padStart(2, '0')}
                                </span>
                            </div>
                            <input
                                type="range" min={5} max={20} step={0.25} value={hour}
                                onChange={(e) => setHour(parseFloat(e.target.value))}
                                className="w-full h-1 rounded-full appearance-none cursor-pointer"
                                style={{ background: 'var(--color-border)', accentColor: 'var(--color-primary)' }}
                            />
                        </div>

                        {/* Day of Year */}
                        <div>
                            <div className="flex justify-between mb-2">
                                <span className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--color-text-muted)' }}>Season</span>
                                <span className="text-xs" style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)' }}>
                                    Day {dayOfYear}
                                </span>
                            </div>
                            <input
                                type="range" min={0} max={365} step={1} value={dayOfYear}
                                onChange={(e) => setDayOfYear(parseInt(e.target.value))}
                                className="w-full h-1 rounded-full appearance-none cursor-pointer"
                                style={{ background: 'var(--color-border)', accentColor: 'var(--color-primary)' }}
                            />
                        </div>

                        {/* Weather Condition */}
                        <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--color-border)' }}>
                            <div className="text-[10px] uppercase tracking-widest mb-2" style={{ color: 'var(--color-text-muted)' }}>
                                Weather Preview
                            </div>
                            <div className="flex gap-1">
                                {([
                                    { id: 'clear' as const, label: 'Clear' },
                                    { id: 'rain' as const, label: 'Rain' },
                                    { id: 'snow' as const, label: 'Snow' },
                                ]).map(w => (
                                    <button
                                        key={w.id}
                                        onClick={() => setWeatherCondition(w.id)}
                                        className="flex-1 px-2 py-1.5 rounded-lg text-xs transition-all"
                                        style={{
                                            background: weatherCondition === w.id ? 'var(--color-primary)' : 'transparent',
                                            color: weatherCondition === w.id ? 'var(--color-bg)' : 'var(--color-text-secondary)',
                                            fontWeight: weatherCondition === w.id ? 600 : 400,
                                            border: weatherCondition === w.id ? 'none' : '1px solid var(--color-border)',
                                        }}
                                    >
                                        {w.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </motion.div>

                    {/* Info Panel — hidden when compare is open */}
                    {!showCompare && (
                        <motion.div
                            className="absolute bottom-6 right-6 z-20 p-5 rounded-xl w-64"
                            style={{ background: 'rgba(17, 22, 18, 0.9)', backdropFilter: 'blur(16px)', border: '1px solid var(--color-border)' }}
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ ...spring, delay: 0.3 }}
                        >
                            <div className="text-[10px] uppercase tracking-widest mb-3" style={{ color: 'var(--color-text-muted)' }}>
                                Active Layout: {layouts.find(l => l.id === layout)?.label}
                            </div>
                            <div className="space-y-2">
                                {analysis.cropMatrix.slice(0, 4).map(crop => (
                                    <div key={crop.name} className="flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full" style={{ background: 'var(--color-primary)' }} />
                                        <span className="text-xs flex-1" style={{ color: 'var(--color-text-secondary)' }}>{crop.name}</span>
                                        <span className="text-[10px]" style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)' }}>{crop.score}%</span>
                                    </div>
                                ))}
                            </div>
                        </motion.div>
                    )}
                </div>

                {/* Compare Layouts Panel — slides in from right */}
                <AnimatePresence>
                    {showCompare && (
                        <motion.aside
                            initial={{ x: '100%', opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            exit={{ x: '100%', opacity: 0 }}
                            transition={spring}
                            className="shrink-0 overflow-y-auto z-20 flex flex-col"
                            style={{
                                width: 480,
                                background: 'var(--color-surface)',
                                borderLeft: '1px solid var(--color-border)',
                            }}
                        >
                            {/* Panel Header */}
                            <div className="p-5 flex items-center justify-between" style={{ borderBottom: '1px solid var(--color-border)' }}>
                                <div>
                                    <div className="text-[10px] uppercase tracking-widest mb-0.5" style={{ color: 'var(--color-text-muted)' }}>
                                        Layout Comparison
                                    </div>
                                    <div className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
                                        Max Yield vs Low Maintenance
                                    </div>
                                </div>
                                <button
                                    onClick={() => setShowCompare(false)}
                                    className="w-8 h-8 rounded-lg flex items-center justify-center text-xs"
                                    style={{ background: 'var(--color-surface-2)', color: 'var(--color-text-secondary)' }}
                                >
                                    ✕
                                </button>
                            </div>

                            {/* Sun Hours Callout */}
                            <div className="m-4 p-4 rounded-xl flex items-start gap-3"
                                style={{ background: 'rgba(74,222,128,0.06)', border: '1px solid rgba(74,222,128,0.25)' }}>
                                <span className="text-lg shrink-0">☀</span>
                                <div>
                                    <div className="text-xs font-medium mb-0.5" style={{ color: 'var(--color-primary)' }}>
                                        Sun Exposure Insight
                                    </div>
                                    <div className="text-xs" style={{ color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
                                        Layout A puts tomatoes on south slope — <strong style={{ color: 'var(--color-primary)' }}>3 more sun hours</strong> than Layout B.
                                        South-facing placement boosts lycopene production and early ripening.
                                    </div>
                                </div>
                            </div>

                            {/* Side-by-side layout cards */}
                            <div className="grid grid-cols-2 gap-3 px-4 pb-4">
                                {/* Layout A */}
                                <div className="rounded-xl p-4" style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}>
                                    <div className="flex items-center justify-between mb-3">
                                        <div>
                                            <div className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--color-primary)' }}>Layout A</div>
                                            <div className="text-sm font-medium mt-0.5" style={{ color: 'var(--color-text-primary)' }}>Max Yield</div>
                                        </div>
                                        <div className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'var(--color-primary-glow)', color: 'var(--color-primary)' }}>
                                            Recommended
                                        </div>
                                    </div>

                                    {/* Crop arrangement */}
                                    <div className="text-[10px] uppercase tracking-widest mb-2" style={{ color: 'var(--color-text-muted)' }}>Crop Arrangement</div>
                                    <div className="space-y-1.5 mb-4">
                                        {layoutA.slice(0, 4).map((c, i) => (
                                            <div key={c.name} className="flex items-center gap-2">
                                                <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: 'var(--color-primary)' }} />
                                                <span className="text-xs flex-1 truncate" style={{ color: 'var(--color-text-secondary)' }}>
                                                    {i === 0 ? `${c.name} (South slope)` : c.name}
                                                </span>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Sun hours */}
                                    <div className="text-[10px] uppercase tracking-widest mb-1" style={{ color: 'var(--color-text-muted)' }}>Est. Sun Hours</div>
                                    <div className="text-lg mb-3" style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-primary)' }}>
                                        8.4 hrs/day
                                    </div>

                                    {/* Revenue */}
                                    <div className="text-[10px] uppercase tracking-widest mb-1" style={{ color: 'var(--color-text-muted)' }}>Est. Revenue</div>
                                    <div className="text-lg" style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)' }}>
                                        ${revenueA.toLocaleString()}
                                    </div>
                                    <div className="text-[10px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>/year</div>
                                </div>

                                {/* Layout B */}
                                <div className="rounded-xl p-4" style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}>
                                    <div className="mb-3">
                                        <div className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--color-text-secondary)' }}>Layout B</div>
                                        <div className="text-sm font-medium mt-0.5" style={{ color: 'var(--color-text-primary)' }}>Low Maintenance</div>
                                    </div>

                                    {/* Crop arrangement */}
                                    <div className="text-[10px] uppercase tracking-widest mb-2" style={{ color: 'var(--color-text-muted)' }}>Crop Arrangement</div>
                                    <div className="space-y-1.5 mb-4">
                                        {layoutB.slice(0, 4).map((c, i) => (
                                            <div key={c.name} className="flex items-center gap-2">
                                                <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: 'var(--color-border)' }} />
                                                <span className="text-xs flex-1 truncate" style={{ color: 'var(--color-text-secondary)' }}>
                                                    {i === 0 ? `${c.name} (North cluster)` : c.name}
                                                </span>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Sun hours */}
                                    <div className="text-[10px] uppercase tracking-widest mb-1" style={{ color: 'var(--color-text-muted)' }}>Est. Sun Hours</div>
                                    <div className="text-lg mb-3" style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>
                                        5.4 hrs/day
                                    </div>

                                    {/* Revenue */}
                                    <div className="text-[10px] uppercase tracking-widest mb-1" style={{ color: 'var(--color-text-muted)' }}>Est. Revenue</div>
                                    <div className="text-lg" style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)' }}>
                                        ${revenueB.toLocaleString()}
                                    </div>
                                    <div className="text-[10px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>/year</div>
                                </div>
                            </div>

                            {/* Revenue Difference Banner */}
                            <div className="mx-4 mb-4 p-4 rounded-xl" style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}>
                                <div className="text-[10px] uppercase tracking-widest mb-2" style={{ color: 'var(--color-text-muted)' }}>
                                    Revenue Difference
                                </div>
                                <div className="flex items-end gap-2">
                                    <span className="text-2xl font-medium" style={{ fontFamily: 'var(--font-mono)', color: revenueDiff >= 0 ? 'var(--color-primary)' : 'var(--color-heat)' }}>
                                        {revenueDiff >= 0 ? '+' : ''}${Math.abs(revenueDiff).toLocaleString()}
                                    </span>
                                    <span className="text-xs mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                                        Layout A earns {revenueDiff >= 0 ? 'more' : 'less'} per year
                                    </span>
                                </div>
                                <div className="mt-3 h-2 rounded-full overflow-hidden" style={{ background: 'var(--color-border)' }}>
                                    <div
                                        className="h-full rounded-full"
                                        style={{
                                            width: revenueA > 0 ? `${Math.round((revenueA / (revenueA + revenueB)) * 100)}%` : '50%',
                                            background: 'var(--color-primary)',
                                        }}
                                    />
                                </div>
                                <div className="flex justify-between text-[10px] mt-1" style={{ color: 'var(--color-text-muted)' }}>
                                    <span>Layout A</span>
                                    <span>Layout B</span>
                                </div>
                            </div>

                            {/* Apply button */}
                            <div className="px-4 pb-6">
                                <button
                                    onClick={() => { setLayout('max-yield'); setShowCompare(false); }}
                                    className="w-full py-3 rounded-xl text-sm font-medium"
                                    style={{ background: 'var(--color-primary)', color: 'var(--color-bg)' }}
                                >
                                    Apply Layout A
                                </button>
                            </div>
                        </motion.aside>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
