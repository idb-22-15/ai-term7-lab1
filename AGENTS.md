# Agent Guidelines for term7-lab1

## Commands
- **Build**: `bun run build`
- **Dev server**: `bun run dev`
- **Generate static**: `bun run generate`
- **Preview**: `bun run preview`
- **Lint**: `npx eslint .` or `npx eslint [file]`
- **Type check**: `npx tsc`
- **Install deps**: `bun install`

No test framework configured. Add Vitest or similar if needed.

## Code Style
- **Framework**: Nuxt 4 with Vue 3, TypeScript
- **UI**: @nuxt/ui components (U-prefixed: UApp, UContainer, UPage, etc.)
- **Styling**: Tailwind CSS
- **Script**: Use `<script setup lang="ts">` in Vue components
- **Imports**: Use relative imports with `~` for Nuxt aliases
- **Naming**: PascalCase for components, camelCase for variables/functions
- **Types**: Strict TypeScript, use interfaces for complex objects
- **Error handling**: Use try/catch for async operations
- **File structure**: Use FSD (Feature Sliced Design), pages in `app/_routes/`, layers: `app`, `shared` (model, components, ...etc)  
- **Formatting**: ESLint with stylistic rules enabled