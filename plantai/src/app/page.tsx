'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/lib/store';
import { geocodeAddress } from '@/lib/api/nominatim';
import { getUserId } from '@/lib/identity';
import { fetchMyAnalyses, type AnalysisSummary } from '@/lib/apiClient';

const springTransition = { duration: 0.6, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] };

export default function LandingPage() {
  const router = useRouter();
  const setAddress = useAppStore((s) => s.setAddress);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Awaited<ReturnType<typeof geocodeAddress>>>([]);
  const [showResults, setShowResults] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pastAnalyses, setPastAnalyses] = useState<AnalysisSummary[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  useEffect(() => {
    const userId = getUserId();
    if (!userId) { setLoadingHistory(false); return; }
    fetchMyAnalyses(userId)
      .then(setPastAnalyses)
      .catch((err) => console.warn('Failed to load history:', err))
      .finally(() => setLoadingHistory(false));
  }, []);

  const search = useCallback(async (q: string) => {
    if (q.length < 3) { setResults([]); return; }
    setIsLoading(true);
    try {
      const r = await geocodeAddress(q);
      setResults(r);
      setShowResults(r.length > 0);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(query), 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, search]);

  const handleSelect = (result: Awaited<ReturnType<typeof geocodeAddress>>[0]) => {
    setAddress({
      displayName: result.displayName,
      lat: result.lat,
      lng: result.lng,
      state: result.state,
      county: result.county,
    });
    setShowResults(false);
    router.push('/map');
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden flex" style={{ background: 'var(--color-bg)' }}>
      {/* Left Panel — Background Image + Headlines */}
      <motion.div
        className="relative w-[55%] h-full overflow-hidden hidden lg:block"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8 }}
      >
        {/* Ken Burns background */}
        <div className="absolute inset-0 ken-burns">
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{
              backgroundImage: `url('https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=1600&q=80')`,
            }}
          />
        </div>
        {/* Dark overlay gradient */}
        <div
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(135deg, rgba(10,13,10,0.7) 0%, rgba(10,13,10,0.4) 50%, rgba(10,13,10,0.8) 100%)',
          }}
        />
        {/* Headline content */}
        <div className="relative z-10 flex flex-col justify-end h-full p-12 pb-20">
          {['Know your land', 'before you plant', 'a single seed.'].map((line, i) => (
            <motion.h1
              key={i}
              className="leading-tight"
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'clamp(36px, 4.5vw, 64px)',
                color: 'var(--color-text-primary)',
                fontWeight: 400,
              }}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...springTransition, delay: 0.3 + i * 0.12 }}
            >
              {line}
            </motion.h1>
          ))}
        </div>
      </motion.div>

      {/* Right Panel — Search Interface */}
      <motion.div
        className="flex-1 flex flex-col justify-center px-8 lg:px-16"
        style={{ background: 'var(--color-bg)' }}
        initial={{ opacity: 0, x: 40 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ ...springTransition, delay: 0.5 }}
      >
        {/* Logo */}
        <motion.div
          className="mb-12"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
        >
          <span
            className="text-sm uppercase tracking-[0.25em]"
            style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-body)', fontWeight: 600 }}
          >
            Farm.ai
          </span>
        </motion.div>

        {/* Mobile headline */}
        <div className="lg:hidden mb-8">
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '36px',
              color: 'var(--color-text-primary)',
              lineHeight: 1.2,
            }}
          >
            Know your land before you plant a single seed.
          </h1>
        </div>

        {/* Subheadline */}
        <motion.p
          className="mb-10 max-w-md leading-relaxed"
          style={{
            color: 'var(--color-text-secondary)',
            fontFamily: 'var(--font-body)',
            fontSize: '16px',
            lineHeight: 1.7,
          }}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springTransition, delay: 0.8 }}
        >
          Enter your address. Farm.ai pulls soil composition, climate history,
          vegetation health, and crop intelligence for your exact property —
          before you buy a single sensor.
        </motion.p>

        {/* Welcome Back — Past Analyses */}
        {!loadingHistory && pastAnalyses.length > 0 && (
          <motion.div
            className="mb-8 max-w-lg"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...springTransition, delay: 0.85 }}
          >
            <div
              className="text-[10px] uppercase tracking-[0.2em] mb-3"
              style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-body)', fontWeight: 600 }}
            >
              Your saved farms
            </div>
            <div
              className="rounded-xl overflow-hidden"
              style={{
                background: 'rgba(17, 22, 18, 0.95)',
                backdropFilter: 'blur(20px)',
                border: '1px solid var(--color-border)',
              }}
            >
              {pastAnalyses.map((a, i) => (
                <button
                  key={a.id}
                  onClick={() => router.push(`/analysis/${a.id}`)}
                  className="w-full text-left px-4 py-3 transition-colors hover:bg-white/5 flex items-center gap-3"
                  style={{
                    borderBottom: i < pastAnalyses.length - 1 ? '1px solid var(--color-border)' : 'none',
                  }}
                >
                  <svg
                    className="w-4 h-4 shrink-0"
                    style={{ color: 'var(--color-primary)' }}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round"
                      d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15" />
                  </svg>
                  <div className="flex-1 min-w-0">
                    <div
                      className="text-sm truncate"
                      style={{ color: 'var(--color-text-primary)' }}
                    >
                      {a.address || 'Unnamed property'}
                    </div>
                    <div className="flex gap-3 mt-0.5">
                      <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                        {a.acreage} acres
                      </span>
                      {a.top_crop && (
                        <span className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
                          {a.top_crop}
                        </span>
                      )}
                      {a.soil_ph != null && (
                        <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                          pH {a.soil_ph}
                        </span>
                      )}
                    </div>
                  </div>
                  <svg
                    className="w-4 h-4 shrink-0"
                    style={{ color: 'var(--color-text-muted)' }}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              ))}
            </div>
            <div className="mt-3 text-center">
              <span
                className="text-[11px]"
                style={{ color: 'var(--color-text-muted)' }}
              >
                Welcome back — or start a new analysis below
              </span>
            </div>
          </motion.div>
        )}

        {/* Search Input */}
        <motion.div
          className="relative max-w-lg"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springTransition, delay: 0.9 }}
        >
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => results.length > 0 && setShowResults(true)}
            placeholder="Street address, city, or coordinates"
            className="w-full bg-transparent border-0 border-b-2 px-0 py-4 text-lg outline-none transition-colors focus:ring-0"
            style={{
              color: 'var(--color-text-primary)',
              borderColor: query ? 'var(--color-primary)' : 'var(--color-border)',
              fontFamily: 'var(--font-body)',
              caretColor: 'var(--color-primary)',
            }}
          />
          {isLoading && (
            <div className="absolute right-0 top-4">
              <div
                className="w-5 h-5 border-2 rounded-full animate-spin"
                style={{ borderColor: 'var(--color-border)', borderTopColor: 'var(--color-primary)' }}
              />
            </div>
          )}

          {/* Autocomplete dropdown */}
          <AnimatePresence>
            {showResults && results.length > 0 && (
              <motion.div
                className="absolute z-50 w-full mt-2 rounded-xl overflow-hidden"
                style={{
                  background: 'rgba(17, 22, 18, 0.95)',
                  backdropFilter: 'blur(20px)',
                  border: '1px solid var(--color-border)',
                }}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                {results.map((r, i) => (
                  <button
                    key={i}
                    onClick={() => handleSelect(r)}
                    className="w-full text-left px-4 py-3 transition-colors hover:bg-white/5 flex items-start gap-3"
                    style={{ borderBottom: i < results.length - 1 ? '1px solid var(--color-border)' : 'none' }}
                  >
                    <svg
                      className="w-4 h-4 mt-1 shrink-0"
                      style={{ color: 'var(--color-primary)' }}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                    >
                      <path d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <span
                      className="text-sm leading-snug"
                      style={{ color: 'var(--color-text-primary)' }}
                    >
                      {r.displayName}
                    </span>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* CTA Button */}
        <motion.div
          className="mt-10 flex gap-4 items-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springTransition, delay: 1.0 }}
        >
          <button
            onClick={() => {
              if (results.length > 0) handleSelect(results[0]);
            }}
            className="glow-pulse px-8 py-3.5 rounded-full text-sm font-medium transition-all hover:scale-[1.02]"
            style={{
              background: 'var(--color-primary)',
              color: 'var(--color-bg)',
              fontFamily: 'var(--font-body)',
              fontWeight: 600,
            }}
          >
            Analyze my land
          </button>
          <button
            className="px-6 py-3.5 rounded-full text-sm transition-all hover:bg-white/5"
            style={{
              color: 'var(--color-text-secondary)',
              border: '1px solid var(--color-border)',
              fontFamily: 'var(--font-body)',
            }}
          >
            Watch 90-second demo
          </button>
        </motion.div>

        {/* Footer info */}
        <motion.p
          className="mt-16 text-xs"
          style={{ color: 'var(--color-text-muted)' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.3 }}
        >
          No signup required. Free analysis powered by USDA, NOAA, and Sentinel-2 data.
        </motion.p>
      </motion.div>
    </div>
  );
}
