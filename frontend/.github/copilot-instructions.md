# Copilot Instructions
## Stack & Entry Points
- Vite + React 19 + React Router 7; entry is `src/main.tsx` bootstrapping `RouterProvider` with lazy routes.
- Keep new pages under `src/pages`; register them in the router and expose via sidebar navigation.
## UI Components
- Shared primitives live in `src/components/ui`; they follow shadcn patterns using `data-slot` attributes and the `cn` helper (`src/lib/utils.ts`).
- Favor existing variants (e.g. `ToggleGroupItem`, `Badge`, `Card`) before adding new utilities; extend via cva variant props rather than inline duplication.
- Import icons from `lucide-react`; consistent sizing via Tailwind classes `h-*`/`w-*`.
- For global styles, rely on Tailwind 4 layer defined in `src/styles/global.css`; avoid per-component CSS.
## Design System
- Reference the Figma source (`https://www.figma.com/design/4A37SE7FhNp8NdEpMcbwDN/web_MangaSuperb?node-id=0-1&p=f&t=0DKQ2gxPYn8zW5KC-0`) and pull specs through the `Framelink MCP for Figma` server when details are unclear.
- Prefer shadcn components and tokens; the `shadcn` MCP server is available to scaffold new primitives so keep additions aligned with `global.css` semantics.
- Lean on existing Tailwind utility classes and theme tokens rather than introducing bespoke classes unless absolutely necessary.
- Default to lightweight Tailwind-driven transitions; ask the user before introducing `framer-motion`, and only add it when simple class-based effects cannot cover the need.
- Colors and typography should align with the design system, primary、accent is best,or use tailwind colors; avoid hardcoding values outside of Tailwind tokens.
## Data & Services
- HTTP calls go through `src/service/index.ts` `request<TReq,TRes>`; it injects auth tokens from `localStorage`, unwraps `IApiResponse.data`, and handles error messaging when `showError` is not false.
- Service types are centralized in `src/service/types.ts`; add new response interfaces here to keep type safety consistent.
- SWR and jotai are available but unused; prefer this stack if you introduce async state or caching.
## Tooling
- Run `pnpm dev` for local preview, `pnpm build` for production bundles, and `pnpm preview` to verify builds.
- Lint with `pnpm lint`; `eslint.config.mjs` enforces single quotes, sorted imports (`simple-import-sort`), limited blank lines, and hook rules.
- Node 18.12+ required (`package.json` engines); project uses ESM and Vite alias `@` to `src`.
- When adding files, ensure paths align with TypeScript strict mode and React Refresh constraints (default export components if hot reloading).
## Patterns & Expectations
- Keep route components focused on presentation; lift shared state into atoms/jotai if multiple pages need it.
- Prefer lazy-loading new top-level routes in the router to keep bundle size small, matching existing `lazy(() => import(...))` usage.
