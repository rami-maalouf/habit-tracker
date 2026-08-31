// derived accessible colors from a board accent; the renderer never trusts
// the raw accent to provide contrast
export type DerivedBoardColors = {
  accent: string;
  // readable text/icon color on top of the accent
  onAccent: string;
  // card background tint (only when the board uses a tinted background)
  tintedCardBackground: string;
  // strip bar for inactive days
  inactiveBar: string;
  // fainter cell for days outside the board's activity periods
  unavailableCell: string;
};

export function parseHexColor(hex: string): { r: number; g: number; b: number } {
  const value = hex.replace('#', '');
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

function channelLuminance(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const { r, g, b } = parseHexColor(hex);
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// picks black or white, whichever clears the higher contrast on the accent
export function readableOn(accentHex: string): string {
  return contrastRatio('#FFFFFF', accentHex) >= contrastRatio('#000000', accentHex)
    ? '#FFFFFF'
    : '#000000';
}

function withAlpha(hex: string, alpha: number): string {
  const { r, g, b } = parseHexColor(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function deriveBoardColors(
  accentHex: string,
  scheme: 'light' | 'dark',
): DerivedBoardColors {
  return {
    accent: accentHex,
    onAccent: readableOn(accentHex),
    tintedCardBackground: withAlpha(accentHex, scheme === 'dark' ? 0.18 : 0.14),
    inactiveBar: scheme === 'dark' ? 'rgba(120, 120, 128, 0.28)' : 'rgba(120, 120, 128, 0.2)',
    unavailableCell: scheme === 'dark' ? 'rgba(120, 120, 128, 0.14)' : 'rgba(120, 120, 128, 0.1)',
  };
}
