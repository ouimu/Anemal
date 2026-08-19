# Technology Stack

**Analysis Date:** 2026-06-10

## Languages

**Primary:**
- TypeScript 5.4.x — backend (Node.js/Express) and frontend (React/Vite); strict mode inferred from tsconfig usage
- SQL — PostgreSQL DDL managed via Prisma migrations

**Secondary:**
- HTML — `src/frontend/index.html` entry point; includes Google Fonts and Material Symbols CDN links
- CSS — Tailwind CSS utility classes only; no hand-written CSS files

## Runtime

**Environment:**
- Node.js 20.x (inferred from `@types/node ^20.12.0`; dev Docker container `vetclinic-pg` for DB)

**Package Manager:**
- npm
- Lockfiles: `src/backend/package-lock.json` and `src/frontend/package-lock.json` both present

## Frameworks

**Backend:**
- Express 4.19.x — HTTP server; routes, controllers, middlewares; entry `src/backend/server.ts`, app factory `src/backend/app.ts`
- Zod 3.23.x — runtime schema validation on all incoming request bodies; used in `src/backend/middlewares/validate.middleware.ts`

**Frontend:**
- React 18.3.x — SPA; JSX/TSX components
- React Router DOM 6.23.x — client-side routing; `ProtectedRoute` wrapper in `src/frontend/src/components/`
- TanStack React Query 5.32.x — server state, data fetching, cache invalidation
- Zustand 4.5.x — local/UI state; stores in `src/frontend/src/store/` (`authStore`, `uiStore`)
- Recharts 2.12.x — chart components used in dashboard views

**Testing:**
- Jest 29.7.x — backend test runner; config in `src/backend/jest.config.js`; setup patch in `src/backend/jest.setup.js` (supertest + Node 24 ECONNRESET fix)
- ts-jest 29.1.x — TypeScript transformer for Jest
- Supertest 6.3.x — HTTP integration testing against Express app

**Build/Dev:**
- Vite 5.2.x — frontend dev server (port 5173) and production bundler; config `src/frontend/vite.config.ts`
- @vitejs/plugin-react 4.2.x — Babel-based React Fast Refresh
- ts-node-dev 2.0.x — backend dev server with hot-reload; `npm run dev` in `src/backend/`
- TypeScript compiler (tsc) — type-check + build for production (`tsc && vite build`)
- Tailwind CSS 3.4.x — utility-first CSS; config `src/frontend/tailwind.config.js`
- PostCSS + Autoprefixer — CSS pipeline; `src/frontend/postcss.config.*`
- ESLint — linting; `.eslintrc.*` in both backend and frontend roots

## Key Dependencies

**Critical:**
- `@prisma/client ^5.13.0` — database access layer; single shared `PrismaClient` instance in `src/backend/config/db.ts`
- `prisma ^5.13.0` (dev) — migration engine; schema at `src/backend/prisma/schema.prisma`
- `jsonwebtoken ^9.0.2` — JWT sign/verify; wrapper in `src/backend/config/jwt.ts`; payload: `{ userId, tenantId, branchId, role }`, TTL 8 h
- `bcrypt ^5.1.1` — password hashing; `bcryptRounds` defaults to 10 (configurable via `BCRYPT_ROUNDS`)
- `zod ^3.23.0` — request validation

**Infrastructure:**
- `helmet ^7.1.0` — HTTP security headers on Express
- `cors ^2.8.5` — CORS middleware
- `dotenv ^16.4.5` — `.env` loading; loaded in `src/backend/config/env.ts` resolving to project root
- `pdfkit ^0.19.0` — server-side PDF generation (invoices, receipts); assets in `src/backend/assets/`
- `axios ^1.6.8` — frontend HTTP client communicating to backend via Vite proxy

## Configuration

**Environment:**
- All env vars loaded from `.env` at project root via `src/backend/config/env.ts`
- Required vars (app throws on startup if missing): `DATABASE_URL`, `JWT_SECRET`, `SETTINGS_ENCRYPTION_KEY`
- Optional with defaults: `PORT` (4000), `JWT_EXPIRES_IN` (8h), `NODE_ENV` (development), `BCRYPT_ROUNDS` (10)
- See `.env.example` for full list

**Build:**
- Backend: `src/backend/tsconfig.json`
- Frontend: `src/frontend/tsconfig.json` (implicit via Vite)
- Frontend proxy: Vite dev server proxies `/auth`, `/users`, `/admin`, `/api` → `http://localhost:4000`

## Platform Requirements

**Development:**
- Node.js 20+
- PostgreSQL 15+ (Docker: container `vetclinic-pg`, host port 5432)
- npm

**Production:**
- Cloud: AWS or Google Cloud (TBD — not yet provisioned)
- Backend: Node.js process serving Express on configured `PORT`
- Frontend: Static build output from `tsc && vite build`
- Database: PostgreSQL 15+; connection string via `DATABASE_URL`

---

*Stack analysis: 2026-06-10*
