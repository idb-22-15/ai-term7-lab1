// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({

  modules: ['@nuxt/eslint', '@nuxt/ui'],

  components: {
    dirs: [],
  },

  devtools: { enabled: true },

  css: ['~/shared/assets/css/main.css'],

  dir: {
    pages: '_routes',
    middleware: '_middleware',
  },

  experimental: {
    typedPages: true,
  },
  compatibilityDate: '2025-07-15',

  eslint: {
    config: {
      stylistic: true,
    },
  },
})
