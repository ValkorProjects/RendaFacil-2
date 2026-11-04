import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '@/views/HomeView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView,
    },
    // The remaining views are lazy-loaded: each becomes its own chunk.
    {
      path: '/user',
      name: 'user',
      component: () => import('@/views/UserView.vue'),
    },
    {
      path: '/income',
      name: 'income',
      component: () => import('@/views/IncomeView.vue'),
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('@/views/SettingsView.vue'),
    },
    {
      path: '/info',
      name: 'info',
      component: () => import('@/views/InfoView.vue'),
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: { name: 'home' },
    },
  ],
})

export default router
