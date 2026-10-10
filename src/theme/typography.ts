import { TextStyle } from 'react-native';

/**
 * typography.ts — anyfetch typography design token system
 *
 * Font Pairing:
 * 1. Gambetta (Regular) — High-contrast editorial serif with contemporary elegance.
 *    Used for: Brand hero, screen headers, card titles, dial numbers/hero labels.
 * 2. General Sans (Semibold) — Precise, geometric neo-grotesque sans-serif.
 *    Used for: UI controls, button labels, inputs, tabs, captions, and body copy.
 */

export const FONTS = {
  /** Editorial serif for titles, branding, and hero elements */
  display: 'Gambetta-Regular',
  serif: 'Gambetta-Regular',

  /** Geometric sans-serif for UI labels, buttons, inputs, and body text */
  sans: 'GeneralSans-Semibold',
  ui: 'GeneralSans-Semibold',
} as const;

export type FontFamilyToken = (typeof FONTS)[keyof typeof FONTS];

export const typography: Record<string, TextStyle> = {
  // ─── Display & Editorial Headings (Gambetta) ───
  hero: {
    fontFamily: FONTS.display,
    fontSize: 26,
    letterSpacing: -0.4,
  },
  screenTitle: {
    fontFamily: FONTS.display,
    fontSize: 20,
    letterSpacing: -0.3,
  },
  cardTitle: {
    fontFamily: FONTS.display,
    fontSize: 17,
    letterSpacing: -0.2,
  },
  sectionTitle: {
    fontFamily: FONTS.display,
    fontSize: 15,
    letterSpacing: -0.1,
  },
  dialogTitle: {
    fontFamily: FONTS.display,
    fontSize: 18,
    letterSpacing: -0.2,
  },

  // ─── UI & Functional Controls (General Sans) ───
  body: {
    fontFamily: FONTS.sans,
    fontSize: 14,
    letterSpacing: -0.1,
  },
  bodySmall: {
    fontFamily: FONTS.sans,
    fontSize: 12.5,
    letterSpacing: -0.05,
  },
  button: {
    fontFamily: FONTS.sans,
    fontSize: 14,
    letterSpacing: 0.1,
  },
  buttonSmall: {
    fontFamily: FONTS.sans,
    fontSize: 12,
    letterSpacing: 0.1,
  },
  input: {
    fontFamily: FONTS.sans,
    fontSize: 13.5,
    letterSpacing: -0.1,
  },
  tabLabel: {
    fontFamily: FONTS.sans,
    fontSize: 12.5,
    letterSpacing: -0.1,
  },
  caption: {
    fontFamily: FONTS.sans,
    fontSize: 11.5,
    letterSpacing: 0.2,
  },
  badge: {
    fontFamily: FONTS.sans,
    fontSize: 9.5,
    letterSpacing: 0.3,
  },
};
