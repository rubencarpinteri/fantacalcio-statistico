'use client'

import { useState, useEffect, useRef } from 'react'

// ── Curated Google Fonts — good candidates for a dark, data-dense sports UI ──
const FONTS: Array<{ name: string; google: string; category: string }> = [
  // ── Currently active ──
  { name: 'JetBrains Mono', google: 'JetBrains+Mono:ital,wght@0,400;0,600;0,700', category: 'Mono' },

  // ── Other Monospace ──
  { name: 'Fira Code',       google: 'Fira+Code:wght@400;600;700',                  category: 'Mono' },
  { name: 'Source Code Pro', google: 'Source+Code+Pro:wght@400;600;700',             category: 'Mono' },
  { name: 'IBM Plex Mono',   google: 'IBM+Plex+Mono:wght@400;600;700',              category: 'Mono' },
  { name: 'Space Mono',      google: 'Space+Mono:wght@400;700',                     category: 'Mono' },
  { name: 'Roboto Mono',     google: 'Roboto+Mono:wght@400;600;700',                category: 'Mono' },
  { name: 'Inconsolata',     google: 'Inconsolata:wght@400;600;700',                category: 'Mono' },

  // ── Clean Sans-Serif ──
  { name: 'Inter',              google: 'Inter:wght@400;500;600;700;800',           category: 'Sans' },
  { name: 'Manrope',            google: 'Manrope:wght@400;500;600;700;800',         category: 'Sans' },
  { name: 'DM Sans',            google: 'DM+Sans:wght@400;500;600;700;800',         category: 'Sans' },
  { name: 'Outfit',             google: 'Outfit:wght@400;500;600;700;800',          category: 'Sans' },
  { name: 'Figtree',            google: 'Figtree:wght@400;500;600;700;800',         category: 'Sans' },
  { name: 'Plus Jakarta Sans',  google: 'Plus+Jakarta+Sans:wght@400;500;600;700;800', category: 'Sans' },
  { name: 'Space Grotesk',      google: 'Space+Grotesk:wght@400;500;600;700',       category: 'Sans' },
  { name: 'Nunito Sans',        google: 'Nunito+Sans:wght@400;600;700;800',         category: 'Sans' },
  { name: 'Open Sans',          google: 'Open+Sans:wght@400;600;700;800',           category: 'Sans' },
  { name: 'Lato',               google: 'Lato:wght@400;700',                        category: 'Sans' },
  { name: 'Rubik',              google: 'Rubik:wght@400;500;600;700;800',           category: 'Sans' },

  // ── Sporty / Condensed ──
  { name: 'Exo 2',             google: 'Exo+2:wght@400;500;600;700;800',            category: 'Sport' },
  { name: 'Rajdhani',          google: 'Rajdhani:wght@400;500;600;700',             category: 'Sport' },
  { name: 'Barlow',            google: 'Barlow:wght@400;500;600;700;800',           category: 'Sport' },
  { name: 'Barlow Condensed',  google: 'Barlow+Condensed:wght@400;500;600;700;800', category: 'Sport' },
  { name: 'Saira',             google: 'Saira:wght@400;500;600;700;800',            category: 'Sport' },
  { name: 'Saira Condensed',   google: 'Saira+Condensed:wght@400;500;600;700',      category: 'Sport' },
  { name: 'Titillium Web',     google: 'Titillium+Web:wght@400;600;700',            category: 'Sport' },
  { name: 'Oswald',            google: 'Oswald:wght@400;500;600;700',               category: 'Sport' },
  { name: 'Orbitron',          google: 'Orbitron:wght@400;500;600;700;800;900',     category: 'Sport' },
  { name: 'Bebas Neue',        google: 'Bebas+Neue',                                category: 'Sport' },

  // ── Rounded / Friendly ──
  { name: 'Nunito',   google: 'Nunito:wght@400;600;700;800',                        category: 'Round' },
  { name: 'Poppins',  google: 'Poppins:wght@400;500;600;700;800',                   category: 'Round' },
  { name: 'Quicksand',google: 'Quicksand:wght@400;500;600;700',                     category: 'Round' },
]

const CATEGORIES = ['Mono', 'Sans', 'Sport', 'Round'] as const

const CATEGORY_LABEL: Record<string, string> = {
  Mono: '⌨ Mono', Sans: '○ Clean', Sport: '⚡ Sport', Round: '● Round',
}

const loaded = new Set<string>()

function loadFont(google: string) {
  if (loaded.has(google)) return
  loaded.add(google)
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = `https://fonts.googleapis.com/css2?family=${google}&display=swap`
  document.head.appendChild(link)
}

export function FontSwitcher() {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState('JetBrains Mono')
  const [filter, setFilter] = useState<string | null>(null)
  const styleRef = useRef<HTMLStyleElement | null>(null)

  // Inject / update the override <style> tag whenever active font changes
  useEffect(() => {
    if (!styleRef.current) {
      const el = document.createElement('style')
      el.id = '__font-switcher-override'
      document.head.appendChild(el)
      styleRef.current = el
    }
    if (active === 'JetBrains Mono') {
      styleRef.current.textContent = ''
    } else {
      styleRef.current.textContent = `
        body, body * {
          font-family: '${active}', system-ui, sans-serif !important;
        }
      `
    }
  }, [active])

  // Cleanup on unmount (shouldn't happen in practice but keep it clean)
  useEffect(() => {
    return () => {
      styleRef.current?.remove()
      document.getElementById('__font-switcher-override')?.remove()
    }
  }, [])

  function selectFont(name: string, google: string) {
    loadFont(google)
    setActive(name)
  }

  const visible = filter ? FONTS.filter((f) => f.category === filter) : FONTS

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col items-end gap-2">
      {/* Panel */}
      {open && (
        <div className="w-72 rounded-xl border border-[#2e2e42] bg-[#0d0d1a] shadow-2xl overflow-hidden flex flex-col max-h-[70dvh]">
          {/* Panel header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-[#1e1e2e] bg-[#111118] shrink-0">
            <p className="text-[11px] font-bold text-white uppercase tracking-wider">Font Switcher</p>
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-indigo-400 font-mono bg-indigo-500/10 px-1.5 py-0.5 rounded">
                {active}
              </span>
              <button onClick={() => setOpen(false)} className="text-[#55556a] hover:text-white text-base leading-none ml-1">×</button>
            </div>
          </div>

          {/* Category filter pills */}
          <div className="flex gap-1 px-3 py-2 border-b border-[#1e1e2e] shrink-0 overflow-x-auto">
            <button
              onClick={() => setFilter(null)}
              className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${
                filter === null ? 'bg-white/10 text-white' : 'text-[#55556a] hover:text-white'
              }`}
            >
              Tutti
            </button>
            {CATEGORIES.map((c) => (
              <button
                key={c}
                onClick={() => setFilter(filter === c ? null : c)}
                className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${
                  filter === c ? 'bg-white/10 text-white' : 'text-[#55556a] hover:text-white'
                }`}
              >
                {CATEGORY_LABEL[c]}
              </button>
            ))}
          </div>

          {/* Font list */}
          <div className="overflow-y-auto">
            {visible.map((f) => {
              const isActive = active === f.name
              return (
                <button
                  key={f.name}
                  onMouseEnter={() => loadFont(f.google)}
                  onClick={() => selectFont(f.name, f.google)}
                  className={`w-full flex items-center justify-between px-3 py-2 text-left transition-colors border-b border-[#0f0f18] last:border-0 ${
                    isActive
                      ? 'bg-indigo-500/15 text-white'
                      : 'text-[#c0c0d8] hover:bg-[#1a1a26] hover:text-white'
                  }`}
                >
                  <span
                    className="text-sm font-medium"
                    style={{ fontFamily: `'${f.name}', system-ui` }}
                  >
                    {f.name}
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[9px] text-[#3a3a52]">{f.category}</span>
                    {isActive && <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />}
                  </div>
                </button>
              )
            })}
          </div>

          {/* Footer hint */}
          <div className="px-3 py-2 border-t border-[#1e1e2e] bg-[#0a0a0f] shrink-0">
            <p className="text-[9px] text-[#3a3a52] text-center">
              Passa il mouse su un font per caricarlo · Clicca per applicarlo
            </p>
          </div>
        </div>
      )}

      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-2 rounded-full border px-3 py-2 text-[11px] font-medium shadow-lg transition-colors ${
          open
            ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300'
            : 'bg-[#0d0d1a] border-[#2e2e42] text-[#8888aa] hover:text-white hover:border-[#3e3e52]'
        }`}
      >
        <span>Aa</span>
        <span>{active}</span>
      </button>
    </div>
  )
}
