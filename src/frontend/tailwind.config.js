/** @type {import('tailwindcss').Config} */
// ─── Compassionate Care System ───────────────────────────────────────────────
// Sourced from Stitch design system (project 7554962619985960081).
// Primary Navy #0F172A · Secondary Sage #059669 · Neutral Slate #64748B
// Headline: Plus Jakarta Sans · Body: DM Sans · Code: Fira Code
// ─────────────────────────────────────────────────────────────────────────────
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      // ── Colors ──────────────────────────────────────────────────────────────
      colors: {
        // Primary — Black (authority, professionalism)
        primary: {
          DEFAULT:       '#000000',
          container:     '#131b2e',
          on:            '#ffffff',
          'on-container':'#7c839b',
          fixed:         '#dae2fd',
          'fixed-dim':   '#bec6e0',
          inverse:       '#bec6e0',
        },
        // Secondary — Sage (health, wellness, care actions)
        secondary: {
          DEFAULT:       '#006c4a',
          container:     '#82f5c1',
          on:            '#ffffff',
          'on-container':'#00714e',
          fixed:         '#85f8c4',
          'fixed-dim':   '#68dba9',
          light:         '#DCF2EA',   // chip/tag background
        },
        // Neutral — Slate (supporting text, dividers)
        neutral: {
          DEFAULT:       '#64748b',
          container:     '#0b1c30',
          on:            '#ffffff',
          'on-container':'#75859d',
        },
        // Surfaces
        surface: {
          DEFAULT:              '#ffffff',
          dim:                  '#d8dadc',
          bright:               '#f7f9fb',
          'container-lowest':   '#ffffff',
          'container-low':      '#f2f4f6',
          container:            '#eceef0',
          'container-high':     '#e6e8ea',
          'container-highest':  '#e0e3e5',
          tint:                 '#565e74',
          variant:              '#e0e3e5',
        },
        'on-surface': {
          DEFAULT: '#191c1e',
          variant: '#45464d',
        },
        background:    '#f7f9fb',
        'on-background':'#191c1e',
        outline: {
          DEFAULT: '#76777d',
          variant: '#c6c6cd',
        },
        inverse: {
          surface:     '#2d3133',
          'on-surface':'#eff1f3',
          primary:     '#bec6e0',
        },
        // Status
        error: {
          DEFAULT:       '#EF4444',
          container:     '#ffdad6',
          on:            '#ffffff',
          'on-container':'#93000a',
        },
        success: '#22C55E',
        warning: '#EAB308',
        info:    '#0EA5E9',
      },

      // ── Typography ──────────────────────────────────────────────────────────
      fontFamily: {
        sans:     ['"DM Sans"', 'system-ui', 'sans-serif'],
        headline: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
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
        'label-md':           ['12px', { lineHeight: '1.4',  fontWeight: '500', letterSpacing: '0.5px' }],
        'code':               ['14px', { lineHeight: '1.6',  fontWeight: '400' }],
      },

      // ── Border Radius ───────────────────────────────────────────────────────
      borderRadius: {
        sm:      '0.25rem',   // 4px
        DEFAULT: '0.5rem',    // 8px  — buttons, inputs
        md:      '0.75rem',   // 12px
        lg:      '1rem',      // 16px — cards, containers
        xl:      '1.5rem',    // 24px — feature highlights, banners
        full:    '9999px',    // pill — avatars, chips, status badges
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

      // ── Box Shadows (Navy-tinted elevation) ─────────────────────────────────
      // Level 0: flat (no shadow)
      // Level 1: card/input at rest — 1px border + soft navy shadow
      // Level 2: hover/dropdown     — 7% navy shadow
      // Level 3: modal/alert        — 10% navy shadow, 32px blur
      boxShadow: {
        'lvl1': '0 0 0 1px #e2e8f0, 0 1px 3px rgba(15,23,42,0.03)',
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
