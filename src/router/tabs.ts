import type { IconName } from '@/components/AppIcon.vue'

// The four tabs of the bottom bar (RF-09). Every internal screen belongs to one of them, so the bar
// always shows where the user is, even on screens that are opened from the Menu.
export type TabId = 'home' | 'income' | 'deductions' | 'menu'

export interface Tab {
  id: TabId
  label: string
  icon: IconName
  // Route name from src/router/index.ts.
  route: string
}

export const TABS: readonly Tab[] = [
  { id: 'home', label: 'Home', icon: 'home', route: 'home' },
  { id: 'income', label: 'Rendas', icon: 'income', route: 'income' },
  { id: 'deductions', label: 'Dedutíveis', icon: 'deductions', route: 'deductions' },
  { id: 'menu', label: 'Menu', icon: 'menu', route: 'menu' },
]

// Screens that are not a tab themselves, by route name.
const SCREEN_TABS: Record<string, TabId> = {
  user: 'menu',
  privacy: 'menu',
  settings: 'menu',
  info: 'menu',
}

export function tabForRoute(routeName: unknown): TabId | null {
  if (typeof routeName !== 'string') return null
  return TABS.find((tab) => tab.route === routeName)?.id ?? SCREEN_TABS[routeName] ?? null
}
