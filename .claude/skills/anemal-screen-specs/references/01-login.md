# Screen Spec: Login
> Prototype: `stitch_vet_clinic_design_system/login_page/code.html`  
> Component: `src/frontend/src/views/LoginView.tsx`  
> Status: **Implemented** (2026-06-04)

---

## Layout

```
Full-screen flex min-h-screen (no sidebar, no TopNav — public route)

LEFT PANEL (md:w-3/5, hidden on mobile):
  bg-gradient-to-br from-secondary/20 via-primary-container/60 to-primary/80
  Decorative blur circles (absolute positioned)
  Large background paw icon (opacity-10, FILL=1, 320px)
  Bottom overlay card (absolute bottom-lg left-lg right-lg):
    bg-surface/90 backdrop-blur-md p-lg rounded-xl shadow-lvl2
    Label: "PROFESSIONAL EXCELLENCE" — text-label-md font-bold text-secondary uppercase tracking-widest
    H2: text-headline-sm font-headline font-bold text-on-surface
    Body: text-body-sm text-on-surface-variant

RIGHT PANEL (flex-grow md:w-2/5):
  bg-surface flex flex-col justify-center items-center p-margin-desktop
  Inner container: w-full max-w-sm
```

---

## Form elements

### Branding (top of form)
```
flex items-center gap-sm mb-xl
  Icon container: w-10 h-10 rounded-lg bg-primary-container
    MaterialIcon: pets fill=1 size=22 className="text-on-surface"
  "Anemal" — text-headline-sm font-headline font-bold text-primary
```

### Headings
```
H1: "Welcome back" — text-headline-lg font-headline font-bold text-on-surface mb-xs
Subtitle: text-body-md text-on-surface-variant mb-xl
```

### Input fields (all)
```
Label: text-label-md text-on-surface-variant uppercase tracking-wider mb-sm
Input: min-h-[48px] pl-[48px] bg-surface-container-low border border-outline-variant rounded-lg
       text-body-md text-on-surface
       focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20
       transition-colors
Left icon: MaterialIcon absolute left-md, size=18, text-on-surface-variant
```

### Input field map

| Field | Icon | Type |
|---|---|---|
| Clinic ID | `business` | text + right suffix `.anemal.app` |
| Username | `person` | text |
| Password | `lock` | password + eye toggle (visibility / visibility_off) |

### Error state
```
flex items-start gap-sm bg-error-container/30 border border-error/30 rounded-lg px-md py-sm
MaterialIcon: error_outline size=18 className="text-error flex-shrink-0 mt-0.5"
Error text: text-body-sm text-error
```

### Submit button
```
w-full min-h-[48px] bg-primary hover:bg-primary/90 disabled:opacity-50
text-on-primary font-semibold rounded-lg text-body-md transition-colors
Pending state: spinner + "Signing in…"
```

---

## Notes

- Subdomain field retained (multi-tenant requirement — not in Stitch prototype but business-critical)
- Left panel uses gradient + decorative SVG in place of hero photo (no asset provided)
- Password eye toggle uses Material Icons (visibility / visibility_off)
