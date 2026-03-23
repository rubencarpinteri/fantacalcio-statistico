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
  { href: '/dashboard',    label: 'Dashboard',    icon: '▦' },
  { href: '/league',       label: 'Lega',         icon: '⚙', adminOnly: true },
  { href: '/players',      label: 'Giocatori',    icon: '👤' },
  { href: '/formations',   label: 'Formazioni',   icon: '⊞',  adminOnly: true },
  { href: '/roster',       label: 'Rose',         icon: '📋', adminOnly: true },
  { href: '/pool',         label: 'Pool Giocatori', icon: '⚽', adminOnly: true },
  { href: '/matchdays',    label: 'Giornate',     icon: '📅' },
  { href: '/competitions', label: 'Competizioni', icon: '⚔', adminOnly: true },
  { href: '/standings',    label: 'Classifica',   icon: '🏆' },
  { href: '/methodology',  label: 'Metodologia',  icon: '📐' },
  { href: '/audit',        label: 'Audit Log',    icon: '🔍', adminOnly: true },
]

interface AdminSidebarProps {
  isAdmin: boolean
  username: string
  leagueName: string
}

export function AdminSidebar({ isAdmin, username, leagueName }: AdminSidebarProps) {
  const pathname = usePathname()

  const visibleItems = NAV_ITEMS.filter(
    (item) => !item.adminOnly || isAdmin
  )

  return (
    <aside className="flex h-screen w-56 shrink-0 flex-col border-r border-[#2e2e42] bg-[#0a0a0f]">
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
        {visibleItems.map((item) => {
          const isActive =
            item.href === '/dashboard'
              ? pathname === '/dashboard'
              : pathname.startsWith(item.href)

          return (
            <Link
              key={item.href}
              href={item.href as Route}
              className={[
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                isActive
                  ? 'bg-indigo-500/15 text-indigo-300'
                  : 'text-[#8888aa] hover:bg-[#1a1a24] hover:text-[#f0f0fa]',
              ].join(' ')}
            >
              <span className="w-4 text-center text-base leading-none">{item.icon}</span>
              {item.label}
            </Link>
          )
        })}
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
  )
}
