// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',

  devtools: { enabled: true },

  modules: ['@nuxt/eslint', '@nuxt/ui'],

  components: {
    dirs: [],
  },

  css: ['~/shared/assets/css/main.css'],

  dir: {
    pages: '_routes',
    middleware: '_middleware',
  },

  experimental: {
    typedPages: true,
  },


  eslint: {
    config: {
      stylistic: true,
    },
  },
})