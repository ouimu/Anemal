/** @type {import('tailwindcss').Config} */
// ─── Compassionate Care System ───────────────────────────────────────────────
// Sourced from Stitch design system (project 7554962619985960081).
// Primary Black #000000 · Secondary Sage #006c4a · Neutral Slate #64748B
// Headline: Plus Jakarta Sans · Body: DM Sans · Code: Fira Code
//
// THEMING (2026-06-13): colors are CSS variables (RGB channel triplets) so the
// SAME utility classes (bg-surface, text-on-surface, …) flip automatically
// between light and dark. Light values live in :root, dark in .dark — both in
// src/index.css. `rgb(var(--token) / <alpha-value>)` preserves /opacity modifiers
// (e.g. focus:ring-primary/20). Dark mode = class strategy (.dark on <html>).
// ─────────────────────────────────────────────────────────────────────────────
const tok = (name) => `rgb(var(${name}) / <alpha-value>)`

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      // ── Colors (token → CSS variable) ────────────────────────────────────────
      colors: {
        primary: {
          DEFAULT:        tok('--primary'),
          container:      tok('--primary-container'),
          on:             tok('--primary-on'),
          'on-container': tok('--primary-on-container'),
          fixed:          tok('--primary-fixed'),
          'fixed-dim':    tok('--primary-fixed-dim'),
          inverse:        tok('--primary-inverse'),
        },
        secondary: {
          DEFAULT:        tok('--secondary'),
          container:      tok('--secondary-container'),
          on:             tok('--secondary-on'),
          'on-container': tok('--secondary-on-container'),
          fixed:          tok('--secondary-fixed'),
          'fixed-dim':    tok('--secondary-fixed-dim'),
          light:          tok('--secondary-light'),
        },
        neutral: {
          DEFAULT:        tok('--neutral'),
          container:      tok('--neutral-container'),
          on:             tok('--neutral-on'),
          'on-container': tok('--neutral-on-container'),
        },
        surface: {
          DEFAULT:             tok('--surface'),
          dim:                 tok('--surface-dim'),
          bright:              tok('--surface-bright'),
          'container-lowest':  tok('--surface-container-lowest'),
          'container-low':     tok('--surface-container-low'),
          container:           tok('--surface-container'),
          'container-high':    tok('--surface-container-high'),
          'container-highest': tok('--surface-container-highest'),
          tint:                tok('--surface-tint'),
          variant:             tok('--surface-variant'),
        },
        'on-surface': {
          DEFAULT: tok('--on-surface'),
          variant: tok('--on-surface-variant'),
        },
        background:     tok('--background'),
        'on-background':tok('--on-background'),
        outline: {
          DEFAULT: tok('--outline'),
          variant: tok('--outline-variant'),
        },
        inverse: {
          surface:      tok('--inverse-surface'),
          'on-surface': tok('--inverse-on-surface'),
          primary:      tok('--inverse-primary'),
        },
        error: {
          DEFAULT:        tok('--error'),
          container:      tok('--error-container'),
          on:             tok('--error-on'),
          'on-container': tok('--error-on-container'),
        },
        success: tok('--success'),
        warning: tok('--warning'),
        info:    tok('--info'),
      },

      // ── Typography ──────────────────────────────────────────────────────────
      // Noto Sans Thai appended so Thai (ภาษาไทย) renders in the same weights.
      fontFamily: {
        sans:     ['"DM Sans"', '"Noto Sans Thai"', 'system-ui', 'sans-serif'],
        headline: ['"Plus Jakarta Sans"', '"Noto Sans Thai"', 'system-ui', 'sans-serif'],
        code:     ['"Fira Code"', 'monospace'],
      },
      fontSize: {
        'display':            ['40px', { lineHeight: '1.15', fontWeight: '700' }],
        'headline-lg':        ['32px', { lineHeight: '1.2',  fontWeight: '700' }],
        'headline-lg-mobile': ['28px', { lineHeight: '1.2',  fontWeight: '700' }],
        'headline-md':        ['24px', { lineHeight: '1.25', fontWeight: '600' }],
        'headline-sm':        ['20px', { lineHeight: '1.3',  fontWeight: '600' }],
        'headline-xs':        ['16px', { lineHeight: '1.35', fontWeight: '500' }],
        'body-lg':            ['18px', { lineHeight: '1.6',  fontWeight: '400' }],
        'body-md':            ['16px', { lineHeight: '1.6',  fontWeight: '400' }],
        'body-sm':            ['14px', { lineHeight: '1.5',  fontWeight: '400' }],
        'title-md':           ['18px', { lineHeight: '1.4',  fontWeight: '500' }],
        'label-md':           ['12px', { lineHeight: '1.4',  fontWeight: '500', letterSpacing: '0.5px' }],
        'code':               ['14px', { lineHeight: '1.6',  fontWeight: '400' }],
      },

      // ── Border Radius ───────────────────────────────────────────────────────
      borderRadius: {
        sm:      '0.25rem',
        DEFAULT: '0.5rem',
        md:      '0.75rem',
        lg:      '1rem',
        xl:      '1.5rem',
        '2xl':   '1.25rem',
        full:    '9999px',
      },

      // ── Spacing (8px base scale) ────────────────────────────────────────────
      spacing: {
        'xs':             '4px',
        'sm':             '8px',
        'md':             '16px',
        'lg':             '24px',
        'xl':             '32px',
        '2xl':            '48px',
        '3xl':            '64px',
        'gutter':         '16px',
        'margin-mobile':  '16px',
        'margin-desktop': '32px',
      },

      // ── Box Shadows ─────────────────────────────────────────────────────────
      boxShadow: {
        'lvl1': '0 0 0 1px rgb(var(--shadow-ring) / 1), 0 1px 3px rgba(15,23,42,0.03)',
        'lvl2': '0 4px 12px rgba(15,23,42,0.07)',
        'lvl3': '0 8px 32px rgba(15,23,42,0.10)',
      },

      // ── Tap targets (tablet/touch requirement: ≥ 44px) ──────────────────────
      minHeight: { tap: '44px', row: '48px' },
      minWidth:  { tap: '44px' },
    },
  },
  plugins: [],
}
