/**
 * SIGA EDUCA — Academic Core design tokens (Tailwind CDN).
 * Carregar imediatamente após https://cdn.tailwindcss.com
 */
(function (global) {
  'use strict';

  var colors = {
    surface: '#f8f9ff',
    'surface-dim': '#cbdbf5',
    'surface-bright': '#f8f9ff',
    'surface-container-lowest': '#ffffff',
    'surface-container-low': '#eff4ff',
    'surface-container': '#e5eeff',
    'surface-container-high': '#dce9ff',
    'surface-container-highest': '#d3e4fe',
    'on-surface': '#0b1c30',
    'on-surface-variant': '#444651',
    'inverse-surface': '#213145',
    'inverse-on-surface': '#eaf1ff',
    outline: '#757682',
    'outline-variant': '#c5c5d3',
    'surface-tint': '#4059aa',
    primary: '#00236f',
    'on-primary': '#ffffff',
    'primary-container': '#1e3a8a',
    'on-primary-container': '#90a8ff',
    'inverse-primary': '#b6c4ff',
    secondary: '#bb0112',
    'on-secondary': '#ffffff',
    'secondary-container': '#e02928',
    'on-secondary-container': '#fffbff',
    tertiary: '#3e2400',
    'on-tertiary': '#ffffff',
    'tertiary-container': '#5c3800',
    'on-tertiary-container': '#ef9900',
    error: '#ba1a1a',
    'on-error': '#ffffff',
    'error-container': '#ffdad6',
    'on-error-container': '#93000a',
    'primary-fixed': '#dce1ff',
    'primary-fixed-dim': '#b6c4ff',
    'on-primary-fixed': '#00164e',
    'on-primary-fixed-variant': '#264191',
    'secondary-fixed': '#ffdad6',
    'secondary-fixed-dim': '#ffb4ab',
    'on-secondary-fixed': '#410002',
    'on-secondary-fixed-variant': '#93000b',
    'tertiary-fixed': '#ffddb8',
    'tertiary-fixed-dim': '#ffb95f',
    'on-tertiary-fixed': '#2a1700',
    'on-tertiary-fixed-variant': '#653e00',
    background: '#f8f9ff',
    'on-background': '#0b1c30',
    'surface-variant': '#d3e4fe',
    'primary-light': '#b6c4ff',
    'border-subtle': '#E2E8F0',
    'background-surface': '#FFFFFF',
    'background-page': '#F8FAFC',
    'text-secondary': '#475569'
  };

  var inter = ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'];

  var config = {
    darkMode: 'class',
    theme: {
      extend: {
        colors: colors,
        borderRadius: {
          sm: '0.25rem',
          DEFAULT: '0.5rem',
          md: '0.75rem',
          lg: '0.5rem',
          xl: '0.75rem',
          '2xl': '1rem',
          '3xl': '1.5rem',
          full: '9999px'
        },
        spacing: {
          'card-padding': '20px',
          gutter: '1.25rem',
          'gutter-mobile': '0.75rem',
          'section-gap': '1.5rem',
          'container-margin': '1.5rem',
          'margin-mobile': '1rem',
          base: '4px',
          'touch-target': '40px',
          'stack-gap-sm': '0.5rem',
          'stack-gap-md': '1rem',
          'stack-gap-lg': '1.5rem',
          'container-padding': '1.25rem',
          'inline-gutter': '0.75rem'
        },
        fontFamily: {
          sans: inter,
          display: inter,
          'headline-xl': inter,
          'headline-lg': inter,
          'headline-lg-mobile': inter,
          'headline-md': inter,
          'headline-sm': inter,
          'title-sm': inter,
          'body-lg': inter,
          'body-md': inter,
          'body-sm': inter,
          'label-lg': inter,
          'label-md': inter,
          'label-sm': inter
        },
        fontSize: {
          'display-lg': ['36px', { lineHeight: '44px', fontWeight: '700' }],
          'headline-xl': ['28px', { lineHeight: '36px', fontWeight: '700' }],
          'headline-lg': ['22px', { lineHeight: '28px', fontWeight: '600' }],
          'headline-lg-mobile': ['20px', { lineHeight: '26px', fontWeight: '600' }],
          'headline-md': ['18px', { lineHeight: '24px', fontWeight: '600' }],
          'headline-sm': ['16px', { lineHeight: '24px', fontWeight: '600' }],
          'title-sm': ['15px', { lineHeight: '20px', fontWeight: '600' }],
          'body-lg': ['16px', { lineHeight: '24px', fontWeight: '400' }],
          'body-md': ['14px', { lineHeight: '20px', fontWeight: '400' }],
          'body-sm': ['13px', { lineHeight: '18px', fontWeight: '400' }],
          'label-lg': ['14px', { lineHeight: '20px', fontWeight: '500' }],
          'label-md': ['12px', { lineHeight: '16px', fontWeight: '500' }],
          'label-sm': ['11px', { lineHeight: '14px', fontWeight: '600' }]
        },
        boxShadow: {
          card: '0 1px 3px rgba(15, 23, 42, 0.05)',
          'card-hover': '0 4px 6px -1px rgba(15, 23, 42, 0.08), 0 2px 4px -2px rgba(15, 23, 42, 0.04)',
          float: '0 10px 15px -3px rgba(15, 23, 42, 0.10)',
          modal: '0 20px 25px -5px rgba(15, 23, 42, 0.15)'
        }
      }
    }
  };

  global.SIGA_THEME = { colors: colors, config: config };
  global.tailwind = global.tailwind || {};
  global.tailwind.config = config;
})(typeof window !== 'undefined' ? window : this);
