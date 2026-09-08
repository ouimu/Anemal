# Frontend Coding Rules

> **Audience:** React developers, UI engineers  
> **See also:** [Index](00-index.md) | [Security Rules](05-security-rules.md)

---

## Frontend Directory Structure

```
src/frontend/src/
  components/       # generic, reusable — no business logic
  views/
    clinic/         # ClinicDashboard, ClinicPets, etc.
    admin/          # AdminView
  hooks/            # custom React hooks
  store/            # Zustand stores
  utils/            # shared helpers
  types/            # shared TypeScript interfaces
```

Naming conventions — paths relative to `src/frontend/src/`. The Example column shows the shape, not
a guaranteed existing file; where a real file is named, it is marked.

| Layer | Pattern | Example |
|-------|---------|---------|
| View | `views/<domain>/<Name>.tsx` | `views/clinic/ClinicPets.tsx` (real) |
| Component | `components/<Name>.tsx` | `components/PetCard.tsx` (shape) |
| Hook | `hooks/use<Name>.ts` | `hooks/useAppointments.ts` (shape) |
| Store | `store/<name>Store.ts` | `store/authStore.ts` (real) |
| Util | `utils/<name>.util.ts` | `utils/date.util.ts` (shape) |

---

## Component Rules (Iron Rules)

### Touch Targets
- **MINIMUM:** 44×44px (WCAG 2.5.5)
- Tailwind: `min-h-[44px] min-w-[44px]`
- No hover-only interactive states (touch devices have no hover)

### Styling
- **No inline styles** — Tailwind only
- **No raw hex colors** — use token names
- Examples: `bg-primary`, `text-secondary`, `border-error`
- **No emoji in navigation** — use Material Symbols Outlined exclusively

### Component Hierarchy

```
View (page-level, routes here)
  └── Feature Components (domain-specific, may call React Query)
        └── Shared Components (generic — Button, Modal, Input)
              └── Primitives (icons, typography)
```

- Views compose feature components
- React Query hooks live in `hooks/` directory
- Shared components receive all data via props
- Zustand stores hold UI state only (sidebar open, active tab, form draft)

---

## React & Data Fetching Rules

- **No `useEffect` for data fetching** — use React Query hooks
- **No raw `fetch` calls** — all via TanStack Query
- **Lazy-load heavy views:**
  ```typescript
  const ClinicEMR = React.lazy(() => import('./views/clinic/ClinicEMR'));
  ```

### React Query Pattern

```typescript
// No console.log
const { data, isLoading, error } = useQuery({
  queryKey: ['pets', tenantId],
  queryFn: () => petApi.list(tenantId),
});
```

---

## Form & Validation

- Use React Hook Form + Zod
- Show inline errors on `blur` (not only on submit)
- Disable submit button while `isSubmitting`
- Server errors: map back to form fields

```typescript
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CreatePetSchema } from '@shared/schemas/pet.schema';

const { register, handleSubmit, errors } = useForm({
  resolver: zodResolver(CreatePetSchema),
});
```

---

## Memoization & Performance

- Memoize **only** when a profiler confirms render performance problem
- Use `key` props on lists with **stable IDs**, never array indexes
- Prefer composition over `useMemo`/`useCallback` by default

---

**See also:** [Security Rules](05-security-rules.md) | [Testing Rules](03-testing-rules.md)
