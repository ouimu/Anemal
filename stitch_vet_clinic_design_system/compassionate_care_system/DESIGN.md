---
name: Compassionate Care System
colors:
  surface: '#FFFFFF'
  surface-dim: '#d8dadc'
  surface-bright: '#f7f9fb'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f4f6'
  surface-container: '#eceef0'
  surface-container-high: '#e6e8ea'
  surface-container-highest: '#e0e3e5'
  on-surface: '#191c1e'
  on-surface-variant: '#45464d'
  inverse-surface: '#2d3133'
  inverse-on-surface: '#eff1f3'
  outline: '#76777d'
  outline-variant: '#c6c6cd'
  surface-tint: '#565e74'
  primary: '#000000'
  on-primary: '#ffffff'
  primary-container: '#131b2e'
  on-primary-container: '#7c839b'
  inverse-primary: '#bec6e0'
  secondary: '#006c4a'
  on-secondary: '#ffffff'
  secondary-container: '#82f5c1'
  on-secondary-container: '#00714e'
  tertiary: '#000000'
  on-tertiary: '#ffffff'
  tertiary-container: '#0b1c30'
  on-tertiary-container: '#75859d'
  error: '#EF4444'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dae2fd'
  primary-fixed-dim: '#bec6e0'
  on-primary-fixed: '#131b2e'
  on-primary-fixed-variant: '#3f465c'
  secondary-fixed: '#85f8c4'
  secondary-fixed-dim: '#68dba9'
  on-secondary-fixed: '#002114'
  on-secondary-fixed-variant: '#005137'
  tertiary-fixed: '#d3e4fe'
  tertiary-fixed-dim: '#b7c8e1'
  on-tertiary-fixed: '#0b1c30'
  on-tertiary-fixed-variant: '#38485d'
  background: '#f7f9fb'
  on-background: '#191c1e'
  surface-variant: '#e0e3e5'
  sage-light: '#DCF2EA'
  success: '#22C55E'
  warning: '#EAB308'
  info: '#0EA5E9'
typography:
  display:
    fontFamily: Plus Jakarta Sans
    fontSize: 40px
    fontWeight: '700'
    lineHeight: '1.15'
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '700'
    lineHeight: '1.2'
  headline-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 28px
    fontWeight: '700'
    lineHeight: '1.2'
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.25'
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 20px
    fontWeight: '600'
    lineHeight: '1.3'
  headline-xs:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '500'
    lineHeight: '1.35'
  body-lg:
    fontFamily: DM Sans
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.6'
  body-md:
    fontFamily: DM Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.6'
  body-sm:
    fontFamily: DM Sans
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.5'
  label-md:
    fontFamily: DM Sans
    fontSize: 12px
    fontWeight: '500'
    lineHeight: '1.4'
    letterSpacing: 0.5px
  code:
    fontFamily: Fira Code
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.6'
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 8px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  2xl: 48px
  3xl: 64px
  gutter: 16px
  margin-mobile: 16px
  margin-desktop: 32px
---

## Brand & Style

The design system is a specialized evolution of clinical healthcare standards, tailored specifically for veterinary medicine. It shifts the emotional tone from "sterile precision" to "compassionate expertise." The target audience includes pet owners seeking reassurance and veterinary professionals requiring efficiency.

The visual style is **Corporate / Modern** with a **Tactile** warmth. It retains the structural integrity of a medical platform but introduces softer geometry and pet-centric visual cues to appear more approachable and friendly. The interface should feel like a high-end modern clinic: clean, organized, and deeply caring.

**Design Principles:**
- **Pet-Centricity:** Use animal-specific iconography (paws, whiskers, ears) and soft-focus imagery of pets to humanize the data.
- **Calm Authority:** Maintain high legibility and structured layouts to instill confidence in medical accuracy.
- **Tactile Softness:** Use slightly larger corner radii and subtle depth to make digital interactions feel as gentle as physical care.

## Colors

The palette leverages a high-contrast **Primary Navy** for grounding and authority, while the **Tertiary Sage** is elevated to a secondary role to emphasize growth, health, and vitality.

- **Primary Navy (#0F172A):** Used for critical navigation, headers, and primary buttons. It represents the "Veterinarian" — professional and knowledgeable.
- **Secondary Sage (#059669):** Used for active states, checkboxes, and "Care" actions. It represents "Health" — natural and soothing.
- **Neutral Slate (#64748B):** Used for supporting text and non-critical UI boundaries.
- **Background (#F8FAFC):** A cool, clean canvas that allows the clinical information to breathe.

Color should be used purposefully to distinguish between patient types (e.g., subtle color-coding for feline vs. canine records) without breaking the overall sophisticated aesthetic.

## Typography

This design system uses **Plus Jakarta Sans** for headings to provide a friendly, open, and modern feel. Its slightly rounded terminals complement the pet-focused narrative. **DM Sans** is used for body copy to ensure high readability for medical notes and treatment plans.

For technical data, such as medication dosages or weight tracking, **Fira Code** is utilized to ensure numerical alignment and precision. 

**Usage Guidelines:**
- Use **Display** styles for hero sections or welcome screens (e.g., "Welcome back, Max's Human").
- **Label-md** should be used for chips and small tags, always in uppercase to maintain a "medical-grade" classification look.
- Maintain generous line-heights (1.5x - 1.6x) for body text to reduce cognitive load for pet owners in high-stress situations.

## Layout & Spacing

The layout follows a **Fluid Grid** model based on an 8px rhythmic scale. 

**Grid Configuration:**
- **Desktop:** 12-column grid with 32px outer margins and 16px gutters.
- **Tablet:** 8-column grid with 24px outer margins and 16px gutters.
- **Mobile:** 4-column grid with 16px outer margins and 12px gutters.

**Reflow Rules:**
Cards and data tables should prioritize vertical stacking on mobile devices. Use "safe margins" (spacing-xl) between major sections to prevent the UI from feeling "cramped" or "industrial," maintaining the calm, wellness-focused atmosphere.

## Elevation & Depth

To maintain a friendly yet professional appearance, the system uses **Tonal Layers** combined with **Ambient Shadows**. 

Depth is used sparingly to indicate interactivity:
- **Level 0 (Flat):** Main background surface.
- **Level 1 (Low):** Standard cards and input fields. Uses a 1px border (#E2E8F0) and a very soft 3% opacity Navy shadow.
- **Level 2 (Medium):** Hover states for cards and dropdown menus. Uses a 7% opacity Navy shadow to create a "lifting" effect.
- **Level 3 (High):** Modals and urgent pet health alerts. Uses a 10% opacity Navy shadow with a large 32px blur to focus attention.

Avoid using black shadows; always tint shadows with the Primary Navy (#0F172A) to keep the depth feeling integrated and "soft."

## Shapes

The shape language is consistently **Rounded** (0.5rem base) to move away from the sharp, rigid corners of traditional clinical software. 

- **Cards and Containers:** Use `rounded-lg` (1rem) to feel welcoming.
- **Buttons and Inputs:** Use the base `rounded` (0.5rem) for a balance of precision and friendliness.
- **Avatars/Status Icons:** Always use `rounded-full` (pill) for pet profiles and status indicators.
- **Feature Highlights:** Use `rounded-xl` (1.5rem) for hero containers or promotional "Pet Health Plan" banners.

## Components

### Buttons
- **Primary:** Navy fill with white text. Use for "Book Appointment" or "Save Record."
- **Secondary (Sage):** Sage fill with white text. Use for wellness-focused actions like "Refill Prescription."
- **Outline:** Navy border and text. Use for secondary actions like "Cancel" or "View History."

### Input Fields
Inputs use a 1px border (#E2E8F0) that thickens to 2px Navy on focus. Labels sit 6px above the field in DM Sans Medium. Ensure helper text (e.g., "Enter pet's weight in kg") is always visible to assist users.

### Cards
Cards are the primary vessel for pet information. They feature a 24px padding and a top "Image Slot" for pet photos. The top edge of the card can include a "Category Strip" (e.g., a Sage strip for "Vaccinations" or a Navy strip for "Surgical History").

### Chips & Status
- **Filter Chips:** Use rounded-full corners.
- **Success/Healthy:** Soft Sage background (#DCF2EA) with Dark Green text.
- **Urgent/Warning:** Soft Yellow background with Dark Gold text.
- **Iconography:** Incorporate pet-specific glyphs within components—a "paw" icon next to the pet's name, a "stethoscope" for clinical notes, and a "clock" for feeding/medication schedules.

### Lists
Lists use 1px horizontal dividers (#F1F5F9). Each row should have a 48px minimum height to ensure easy tapping on mobile devices during clinic check-ins.