'use client'

import Link from 'next/link'
import type { Route } from 'next'
import { usePathname } from 'next/navigation'
import { logoutAction } from '@/app/(auth)/login/actions'

interface NavItem {
  href: string
  label: string
  icon: string
  adminOnly?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { href: '/matchdays',     label: 'Giornate',     icon: '📅' },
  { href: '/competitions',  label: 'Competizioni', icon: '🏆', adminOnly: true },
  { href: '/roster',        label: 'Rose',         icon: '📋', adminOnly: true },
  { href: '/players',       label: 'Giocatori',    icon: '👤', adminOnly: true },
  { href: '/league',        label: 'Impostazioni', icon: '⚙',  adminOnly: true },
]

interface AdminSidebarProps {
  isAdmin: boolean
  username: string
  leagueName: string
}

export function AdminSidebar({ isAdmin, username, leagueName }: AdminSidebarProps) {
  const pathname = usePathname()

  const visibleItems = NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin)

  function isActive(href: string) {
    return href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(href)
  }

  return (
    <>
      {/* ── Desktop sidebar (hidden on mobile) ──────────────────────────── */}
      <aside className="hidden md:flex h-screen w-56 shrink-0 flex-col border-r border-[#2e2e42] bg-[#0a0a0f]">
        {/* Brand */}
        <div className="border-b border-[#2e2e42] px-4 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/20 text-sm">
              ⚽
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-white">{leagueName}</p>
              <p className="text-xs text-[#55556a]">Fantacalcio Stat.</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
          {visibleItems.map((item) => (
            <Link
              key={item.href}
              href={item.href as Route}
              className={[
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                isActive(item.href)
                  ? 'bg-indigo-500/15 text-indigo-300'
                  : 'text-[#8888aa] hover:bg-[#1a1a24] hover:text-[#f0f0fa]',
              ].join(' ')}
            >
              <span className="w-4 text-center text-base leading-none">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>

        {/* User footer */}
        <div className="border-t border-[#2e2e42] px-3 py-3">
          <div className="mb-2 flex items-center gap-2.5 px-1">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-500/20 text-xs font-bold text-indigo-300 uppercase">
              {username.slice(0, 1)}
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-white">{username}</p>
              <p className="text-xs text-[#55556a]">{isAdmin ? 'Admin' : 'Manager'}</p>
            </div>
          </div>
          <form action={logoutAction}>
            <button
              type="submit"
              className="w-full rounded-lg px-3 py-1.5 text-left text-xs text-[#55556a] transition-colors hover:bg-[#1a1a24] hover:text-red-400"
            >
              Esci
            </button>
          </form>
        </div>
      </aside>

      {/* ── Mobile bottom nav bar (hidden on desktop) ───────────────────── */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-50 border-t border-[#2e2e42] bg-[#0a0a0f]">
        <div className="flex items-stretch justify-around">
          {visibleItems.map((item) => (
            <Link
              key={item.href}
              href={item.href as Route}
              className={[
                'flex flex-1 flex-col items-center gap-0.5 px-1 pt-2 pb-4 text-center transition-colors',
                isActive(item.href)
                  ? 'text-indigo-300'
                  : 'text-[#55556a] hover:text-[#f0f0fa]',
              ].join(' ')}
            >
              <span className="text-lg leading-none">{item.icon}</span>
              <span className="text-[10px] leading-none font-medium">{item.label}</span>
            </Link>
          ))}

          {/* Logout */}
          <form action={logoutAction} className="flex flex-1">
            <button
              type="submit"
              className="flex flex-1 flex-col items-center gap-0.5 px-1 pt-2 pb-4 text-[#55556a] transition-colors hover:text-red-400"
            >
              <span className="text-lg leading-none">↩</span>
              <span className="text-[10px] leading-none font-medium">Esci</span>
            </button>
          </form>
        </div>
      </nav>
    </>
  )
}
