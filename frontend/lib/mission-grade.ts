export type PointerState = {
  x: number;
  y: number;
};

export type MissionGrade = {
  star: string;
  aurora: string;
  aqua: string;
  mint: string;
  solar: string;
  line: string;
  bodyTop: string;
  bodyMid: string;
  bodyBottom: string;
  topbarTop: string;
  topbarBottom: string;
  overlayPrimary: string;
  overlaySecondary: string;
  navGlass: string;
  panelGlass: string;
  panelSoft: string;
  panelBorder: string;
  heroGlowPrimary: string;
  heroGlowSecondary: string;
  heroGlowTertiary: string;
  badge: string;
  accent: string;
  buttonShadow: string;
  shadow: string;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function mix(start: number, end: number, amount: number) {
  return start + (end - start) * amount;
}

function hsla(hue: number, saturation: number, lightness: number, alpha = 1) {
  return `hsla(${Math.round(hue)}, ${Math.round(saturation)}%, ${Math.round(lightness)}%, ${alpha})`;
}

export function sampleMissionGrade(time: number, pointer: PointerState, isDark = true): MissionGrade {
  const drift = clamp((Math.sin(time * 0.13) + 1) * 0.5 + pointer.x * 0.09, 0, 1);
  const tide = clamp((Math.sin(time * 0.1 + 1.6) + 1) * 0.5 - pointer.y * 0.07, 0, 1);
  const flare = clamp((Math.sin(time * 0.18 + 2.2) + 1) * 0.5, 0, 1);
  const hush = clamp((Math.sin(time * 0.07 + 0.8) + 1) * 0.5, 0, 1);

  const auroraHue = mix(164, 188, drift);
  const aquaHue = mix(188, 208, tide);
  const mintHue = mix(148, 172, flare * 0.78 + drift * 0.22);
  const solarHue = mix(42, 72, flare);
  const lineHue = mix(aquaHue, solarHue, 0.18);

  const shadowLum = isDark ? 0 : 18;
  const shadowAlpha = isDark ? 0.6 : 0.12;
  const backLum = isDark ? 2 : 98;
  const midLum = isDark ? 1 : 95;
  const bottomLum = isDark ? 1 : 97;
  const topbarLum = isDark ? 2 : 98;
  const topbarMidLum = isDark ? 3 : 96;
  const glassLum = isDark ? 4 : 99;
  const borderLum = isDark ? 12 : 82;
  const badgeLum = isDark ? 8 : 95;
  const starLum = isDark ? 14 : 96;

  return {
    star: hsla(mix(aquaHue, solarHue, 0.16), mix(34, 54, hush), mix(starLum, starLum + 4, hush), 1),
    aurora: hsla(auroraHue, 72, 63, 1),
    aqua: hsla(aquaHue, 76, 57, 1),
    mint: hsla(mintHue, 74, 61, 1),
    solar: hsla(solarHue, 86, 72, 1),
    line: hsla(lineHue, 34, borderLum, 1),
    bodyTop: hsla(mix(aquaHue, solarHue, 0.06), 22, backLum, 1),
    bodyMid: hsla(mix(aquaHue, auroraHue, 0.28), 24, midLum, 1),
    bodyBottom: hsla(mix(solarHue, aquaHue, 0.38), 18, bottomLum, 1),
    topbarTop: hsla(mix(aquaHue, solarHue, 0.08), 20, topbarLum, 0.84),
    topbarBottom: hsla(mix(aquaHue, auroraHue, 0.28), 22, topbarMidLum, 0.58),
    overlayPrimary: hsla(auroraHue, 72, 68, isDark ? 0.04 : 0.16),
    overlaySecondary: hsla(solarHue, 82, 78, isDark ? 0.03 : 0.11),
    navGlass: hsla(mix(aquaHue, auroraHue, 0.18), 36, glassLum, 0.68),
    panelGlass: hsla(mix(aquaHue, solarHue, 0.1), 30, glassLum, 0.74),
    panelSoft: hsla(mix(aquaHue, auroraHue, 0.16), 38, glassLum - 2, 0.8),
    panelBorder: hsla(mix(aquaHue, solarHue, 0.16), 28, borderLum, 0.64),
    heroGlowPrimary: hsla(auroraHue, 76, 68, isDark ? 0.08 : 0.24),
    heroGlowSecondary: hsla(aquaHue, 60, 76, isDark ? 0.08 : 0.22),
    heroGlowTertiary: hsla(solarHue, 82, 82, isDark ? 0.04 : 0.14),
    badge: hsla(auroraHue, 78, badgeLum, 0.94),
    accent: hsla(mix(auroraHue, aquaHue, 0.62), 78, 44, 1),
    buttonShadow: hsla(aquaHue, 64, 46, isDark ? 0.1 : 0.24),
    shadow: hsla(mix(aquaHue, solarHue, 0.2), 24, shadowLum, shadowAlpha),
  };
}

export function missionGradeVars(grade: MissionGrade) {
  return {
    "--mission-body-top": grade.bodyTop,
    "--mission-body-mid": grade.bodyMid,
    "--mission-body-bottom": grade.bodyBottom,
    "--mission-topbar-top": grade.topbarTop,
    "--mission-topbar-bottom": grade.topbarBottom,
    "--mission-overlay-primary": grade.overlayPrimary,
    "--mission-overlay-secondary": grade.overlaySecondary,
    "--mission-nav-glass": grade.navGlass,
    "--mission-panel-glass": grade.panelGlass,
    "--mission-panel-soft": grade.panelSoft,
    "--mission-panel-border": grade.panelBorder,
    "--mission-hero-glow-primary": grade.heroGlowPrimary,
    "--mission-hero-glow-secondary": grade.heroGlowSecondary,
    "--mission-hero-glow-tertiary": grade.heroGlowTertiary,
    "--mission-badge": grade.badge,
    "--mission-accent": grade.accent,
    "--mission-button-shadow": grade.buttonShadow,
    "--mission-shadow": grade.shadow,
  };
}
