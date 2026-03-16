'use client';

import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '@/lib/store';
import { executeSwarm } from '@/lib/agentOrchestrator';

const spring = { duration: 0.5, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] };

// ── Terminal Log Animator ─────────────────────────────────────────────────────

function TerminalLog({ lines, active }: { lines: string[]; active: boolean }) {
    const [visible, setVisible] = useState<string[]>([]);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        if (!active || lines.length === 0) return;
        setVisible([]);
        let idx = 0;
        intervalRef.current = setInterval(() => {
            if (idx < lines.length) {
                setVisible(prev => [...prev, lines[idx]]);
                idx++;
            } else {
                if (intervalRef.current) clearInterval(intervalRef.current);
            }
        }, 650);
        return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    }, [active, lines]);

    if (!active && lines.length === 0) return null;

    return (
        <div className="mt-3 rounded-lg p-3" style={{
            background: 'rgba(0,0,0,0.4)',
            border: '1px solid var(--color-border)',
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
        }}>
            {(active ? visible : lines).map((line, i) => (
                <motion.div key={i} initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.25 }}
                    className="flex gap-2 py-0.5">
                    <span style={{ color: 'var(--color-primary)' }}>›</span>
                    <span style={{ color: '#a3c9a8' }}>{line}</span>
                </motion.div>
            ))}
            {active && visible.length < lines.length && (
                <div className="flex gap-2 py-0.5">
                    <span style={{ color: 'var(--color-primary)' }}>›</span>
                    <span style={{ color: 'var(--color-text-muted)' }} className="animate-pulse">_</span>
                </div>
            )}
        </div>
    );
}

// ── Connector Line ────────────────────────────────────────────────────────────

function Connector({ lit }: { lit: boolean }) {
    return (
        <div className="flex justify-center py-2">
            <div style={{
                width: 2,
                height: 32,
                background: lit
                    ? 'linear-gradient(to bottom, var(--color-primary), rgba(74,222,128,0.3))'
                    : 'var(--color-border)',
                transition: 'all 0.6s ease',
                borderRadius: 1,
            }} />
        </div>
    );
}

// ── Agent 1 Result Card ───────────────────────────────────────────────────────

function RemediationCard() {
    const { remediationResult } = useAppStore();
    if (!remediationResult) return null;
    const { amendment_plan } = remediationResult;
    return (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={spring}
            className="mt-4 rounded-xl p-4" style={{
                background: 'rgba(74,222,128,0.04)',
                border: '1px solid rgba(74,222,128,0.2)',
            }}>
            <div className="text-[9px] uppercase tracking-[0.2em] mb-3" style={{ color: 'var(--color-primary)' }}>
                Amendment Plan Generated
            </div>
            <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg p-3" style={{ background: 'rgba(0,0,0,0.3)' }}>
                    <div className="text-[10px] mb-1" style={{ color: 'var(--color-text-muted)' }}>Fertilizer Type</div>
                    <div className="text-sm font-medium" style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono)' }}>
                        {amendment_plan.fertilizer_type}
                    </div>
                </div>
                <div className="rounded-lg p-3" style={{ background: 'rgba(0,0,0,0.3)' }}>
                    <div className="text-[10px] mb-1" style={{ color: 'var(--color-text-muted)' }}>Estimated Volume</div>
                    <div className="text-xl font-medium" style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-mono)' }}>
                        {amendment_plan.estimated_tons.toFixed(1)}
                        <span className="text-xs ml-1" style={{ color: 'var(--color-text-muted)' }}>tons</span>
                    </div>
                </div>
            </div>
        </motion.div>
    );
}

// ── Agent 2 Result Card ───────────────────────────────────────────────────────

function ProcurementCard() {
    const { procurementResult } = useAppStore();
    if (!procurementResult) return null;
    const { bill_of_materials, total_cost } = procurementResult;
    return (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={spring}
            className="mt-4 rounded-xl p-4" style={{
                background: 'rgba(74,222,128,0.04)',
                border: '1px solid rgba(74,222,128,0.2)',
            }}>
            <div className="text-[9px] uppercase tracking-[0.2em] mb-3" style={{ color: 'var(--color-primary)' }}>
                Bill of Materials
            </div>
            <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--color-border)' }}>
                <table className="w-full text-xs">
                    <thead>
                        <tr style={{ background: 'rgba(0,0,0,0.3)', borderBottom: '1px solid var(--color-border)' }}>
                            {['Item', 'Qty', 'Cost'].map(h => (
                                <th key={h} className="px-3 py-2 text-left text-[9px] uppercase tracking-widest"
                                    style={{ color: 'var(--color-text-muted)' }}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {bill_of_materials.map((item, i) => (
                            <tr key={i} style={{ borderBottom: i < bill_of_materials.length - 1 ? '1px solid var(--color-border)' : 'none' }}>
                                <td className="px-3 py-2" style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono)' }}>{item.name}</td>
                                <td className="px-3 py-2" style={{ color: 'var(--color-text-secondary)' }}>{item.quantity}</td>
                                <td className="px-3 py-2" style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-mono)' }}>
                                    ${item.estimated_cost.toLocaleString()}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div className="flex justify-between items-center mt-3 px-1">
                <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Total Procurement Cost</span>
                <span className="text-lg font-medium" style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-mono)' }}>
                    ${total_cost.toLocaleString()}
                </span>
            </div>
        </motion.div>
    );
}

// ── Agent 3 Result Card ───────────────────────────────────────────────────────

function FinanceCard() {
    const { financeResult } = useAppStore();
    if (!financeResult) return null;
    const { grant_name, drafted_application } = financeResult;
    return (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={spring}
            className="mt-4 rounded-xl p-4" style={{
                background: 'rgba(74,222,128,0.04)',
                border: '1px solid rgba(74,222,128,0.2)',
            }}>
            <div className="flex items-center gap-3 mb-4">
                <div className="text-[9px] uppercase tracking-[0.2em]" style={{ color: 'var(--color-primary)' }}>
                    Grant Application Drafted
                </div>
                <span className="px-3 py-1 rounded-full text-xs font-medium" style={{
                    background: 'var(--color-primary-glow)',
                    color: 'var(--color-primary)',
                    fontFamily: 'var(--font-mono)',
                    border: '1px solid rgba(74,222,128,0.3)',
                }}>{grant_name}</span>
            </div>
            <div className="rounded-lg p-4" style={{
                background: 'rgba(0,0,0,0.35)',
                border: '1px solid var(--color-border)',
                borderLeft: '3px solid var(--color-primary)',
            }}>
                <div className="text-[9px] uppercase tracking-widest mb-2" style={{ color: 'var(--color-text-muted)' }}>
                    Drafted Narrative
                </div>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                    {drafted_application}
                </p>
            </div>
        </motion.div>
    );
}

// ── Agent Node ────────────────────────────────────────────────────────────────

interface AgentNodeProps {
    index: 1 | 2 | 3;
    label: string;
    sublabel: string;
    statusLines: string[];
    isActive: boolean;
    isDone: boolean;
    children?: React.ReactNode;
}

function AgentNode({ index, label, sublabel, statusLines, isActive, isDone, children }: AgentNodeProps) {
    const glowStyle = isActive ? {
        boxShadow: '0 0 0 1px var(--color-primary), 0 0 24px rgba(74,222,128,0.25), 0 0 48px rgba(74,222,128,0.08)',
        borderColor: 'var(--color-primary)',
        transition: 'all 0.4s ease',
    } : isDone ? {
        boxShadow: '0 0 0 1px rgba(74,222,128,0.3)',
        borderColor: 'rgba(74,222,128,0.3)',
        transition: 'all 0.4s ease',
    } : {
        boxShadow: 'none',
        borderColor: 'var(--color-border)',
        transition: 'all 0.4s ease',
    };

    return (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            transition={{ ...spring, delay: (index - 1) * 0.1 }}
            className="rounded-xl p-5" style={{
                background: 'rgba(17,22,18,0.9)',
                border: '1px solid var(--color-border)',
                ...glowStyle,
            }}>
            {/* Agent Header */}
            <div className="flex items-center gap-3 mb-1">
                <div className="flex items-center justify-center w-8 h-8 rounded-lg text-xs font-bold"
                    style={{
                        background: isActive || isDone ? 'var(--color-primary-glow)' : 'var(--color-surface-2)',
                        color: isActive || isDone ? 'var(--color-primary)' : 'var(--color-text-muted)',
                        fontFamily: 'var(--font-mono)',
                        border: `1px solid ${isActive || isDone ? 'rgba(74,222,128,0.3)' : 'var(--color-border)'}`,
                        transition: 'all 0.4s ease',
                    }}>
                    {String(index).padStart(2, '0')}
                </div>
                <div className="flex-1">
                    <div className="text-sm font-medium" style={{ color: isActive || isDone ? 'var(--color-text-primary)' : 'var(--color-text-secondary)' }}>
                        {label}
                    </div>
                    <div className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>{sublabel}</div>
                </div>
                <div className="flex items-center gap-1.5">
                    {isActive && (
                        <motion.div animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1.2, repeat: Infinity }}
                            className="w-2 h-2 rounded-full" style={{ background: 'var(--color-primary)' }} />
                    )}
                    {isDone && (
                        <div className="text-[10px] px-2 py-0.5 rounded-full" style={{
                            background: 'var(--color-primary-glow)',
                            color: 'var(--color-primary)',
                            fontFamily: 'var(--font-mono)',
                        }}>DONE</div>
                    )}
                    {!isActive && !isDone && (
                        <div className="text-[10px] px-2 py-0.5 rounded-full" style={{
                            background: 'var(--color-surface-2)',
                            color: 'var(--color-text-muted)',
                            fontFamily: 'var(--font-mono)',
                        }}>STANDBY</div>
                    )}
                </div>
            </div>

            {/* Terminal Logs */}
            {(isActive || isDone) && (
                <TerminalLog lines={statusLines} active={isActive} />
            )}

            {/* Result */}
            {isDone && children}
        </motion.div>
    );
}

// ── Main AgentSwarm Component ─────────────────────────────────────────────────

export default function AgentSwarm() {
    const {
        swarmStatus, currentAgent,
        remediationResult, procurementResult, financeResult,
        analysis, property,
        setActiveTab,
    } = useAppStore();

    const [swarmError, setSwarmError] = useState<string | null>(null);

    const isIdle = swarmStatus === 'idle';
    const isRunning = swarmStatus === 'running';
    const isComplete = swarmStatus === 'complete';

    const handleLaunch = async () => {
        if (!analysis.soilData) return;
        setSwarmError(null);
        try {
            await executeSwarm({
                mu_name: analysis.soilData.name,
                ph_range: [analysis.soilData.ph - 0.5, analysis.soilData.ph + 0.5],
                organic_matter_pct: analysis.soilData.organicMatter,
                drainage: analysis.soilData.drainage,
            }, property.acreage || 10);
        } catch (e) {
            setSwarmError(e instanceof Error ? e.message : 'Swarm execution failed. Check that the backend is running.');
        }
    };

    const statusLabel = isIdle ? 'STANDBY' : isRunning ? 'EXECUTING' : 'COMPLETE';
    const statusColor = isIdle ? 'var(--color-text-muted)' : isRunning ? '#fb923c' : 'var(--color-primary)';

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={spring}>
            {/* Dashboard Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <div className="flex items-center gap-3 mb-1">
                        <h2 className="text-xl" style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)', letterSpacing: '-0.01em' }}>
                            GRANT AUTOPILOT
                        </h2>
                        <div className="flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-medium"
                            style={{
                                background: isRunning ? 'rgba(251,146,60,0.1)' : isComplete ? 'var(--color-primary-glow)' : 'var(--color-surface-2)',
                                color: statusColor,
                                fontFamily: 'var(--font-mono)',
                                border: `1px solid ${isRunning ? 'rgba(251,146,60,0.3)' : isComplete ? 'rgba(74,222,128,0.3)' : 'var(--color-border)'}`,
                            }}>
                            {isRunning && <motion.span animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 0.8, repeat: Infinity }} className="mr-1.5 w-1.5 h-1.5 rounded-full inline-block" style={{ background: statusColor }} />}
                            {statusLabel}
                        </div>
                    </div>
                    <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                        3-agent pipeline that analyzes your soil, sources amendments, and drafts your USDA grant application
                    </p>
                </div>

                {isIdle && (
                    <button onClick={handleLaunch} className="px-5 py-2.5 rounded-xl text-sm font-medium glow-pulse"
                        style={{
                            background: 'var(--color-primary)',
                            color: 'var(--color-bg)',
                            fontFamily: 'var(--font-mono)',
                            letterSpacing: '0.05em',
                        }}>
                        ⬡ Deploy Swarm
                    </button>
                )}
                {isComplete && (
                    <button onClick={() => { useAppStore.getState().resetSwarm(); }}
                        className="px-4 py-2 rounded-xl text-xs"
                        style={{ border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
                        Reset
                    </button>
                )}
            </div>

            {swarmError && (
                <div className="mb-4 px-4 py-3 rounded-lg text-sm flex items-center justify-between" style={{
                    background: 'rgba(239,68,68,0.08)',
                    border: '1px solid rgba(239,68,68,0.2)',
                    color: '#f87171',
                    fontFamily: 'var(--font-mono)',
                }}>
                    <span>✗ {swarmError}</span>
                    <button onClick={handleLaunch} className="px-3 py-1 rounded-lg text-xs font-medium ml-4 shrink-0"
                        style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}>
                        Retry
                    </button>
                </div>
            )}

            {/* Idle State Prompt */}
            {isIdle && (
                <div className="rounded-xl p-8 text-center mb-6" style={{
                    background: 'rgba(17,22,18,0.6)',
                    border: '1px dashed var(--color-border)',
                }}>
                    <div className="text-4xl mb-3">⬡</div>
                    <div className="text-sm mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                        Three specialized AI agents await activation
                    </div>
                    <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                        Soil Remediation → Procurement → Financial Grant
                    </div>
                    <div className="flex justify-center gap-6 mt-6 text-xs" style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>
                        {['01 · Remediation', '02 · Procurement', '03 · Finance'].map((label, i) => (
                            <div key={i} className="flex items-center gap-2">
                                <div className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--color-border)' }} />
                                {label}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Agent Pipeline */}
            {(isRunning || isComplete) && (
                <div className="space-y-0">
                    {/* Agent 1 */}
                    <AgentNode
                        index={1}
                        label="Soil Remediation Agent"
                        sublabel="Analyzes soil composition · Generates amendment strategy"
                        statusLines={remediationResult?.status_log || []}
                        isActive={currentAgent === 1}
                        isDone={currentAgent > 1 || isComplete}
                    >
                        <RemediationCard />
                    </AgentNode>

                    <Connector lit={currentAgent >= 2} />

                    {/* Agent 2 */}
                    <AgentNode
                        index={2}
                        label="Procurement Agent"
                        sublabel="Sources materials · Builds bill of materials"
                        statusLines={procurementResult?.status_log || []}
                        isActive={currentAgent === 2}
                        isDone={currentAgent > 2 || isComplete}
                    >
                        <ProcurementCard />
                    </AgentNode>

                    <Connector lit={currentAgent >= 3} />

                    {/* Agent 3 */}
                    <AgentNode
                        index={3}
                        label="Financial Grant Agent"
                        sublabel="Identifies funding · Drafts USDA grant application"
                        statusLines={financeResult?.status_log || []}
                        isActive={currentAgent === 3}
                        isDone={isComplete}
                    >
                        <FinanceCard />
                    </AgentNode>
                </div>
            )}

            {/* Complete Banner */}
            <AnimatePresence>
                {isComplete && (
                    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                        transition={spring}
                        className="mt-6 rounded-xl p-4 flex items-center gap-4" style={{
                            background: 'var(--color-primary-glow)',
                            border: '1px solid rgba(74,222,128,0.3)',
                        }}>
                        <div className="text-xl">✓</div>
                        <div>
                            <div className="text-sm font-medium" style={{ color: 'var(--color-primary)' }}>
                                Swarm execution complete
                            </div>
                            <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
                                Amendment plan generated · Materials sourced · Grant application drafted
                            </div>
                        </div>
                        {procurementResult && (
                            <div className="ml-auto text-right">
                                <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Total project cost</div>
                                <div className="text-lg font-medium" style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-mono)' }}>
                                    ${procurementResult.total_cost.toLocaleString()}
                                </div>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}
