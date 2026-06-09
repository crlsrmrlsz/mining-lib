type Rgb = { r: number; g: number; b: number };

function parseColor(input: string): Rgb {
  const s = input.trim();
  // rgb() / rgba() — getComputedStyle normalizes hex to this form.
  const rgbMatch = s.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (rgbMatch) {
    return {
      r: Number(rgbMatch[1]),
      g: Number(rgbMatch[2]),
      b: Number(rgbMatch[3]),
    };
  }
  // Hex — accept #abc or #aabbcc.
  let h = s.replace(/^#/, "");
  if (h.length === 3) {
    h = `${h.charAt(0)}${h.charAt(0)}${h.charAt(1)}${h.charAt(1)}${h.charAt(2)}${h.charAt(2)}`;
  }
  const n = Number.parseInt(h, 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

/**
 * Linear RGB interpolation between two CSS hex colors. `t` is
 * clamped to [0, 1]. Returns an `rgb(r, g, b)` string with
 * channel-wise rounded integer components — usable directly as an
 * SVG `stroke` / `fill` attribute.
 */
export function interpolateRamp(t: number, low: string, high: string): string {
  const clamped = Math.max(0, Math.min(1, t));
  const a = parseColor(low);
  const b = parseColor(high);
  const r = Math.round(a.r + (b.r - a.r) * clamped);
  const g = Math.round(a.g + (b.g - a.g) * clamped);
  const bb = Math.round(a.b + (b.b - a.b) * clamped);
  return `rgb(${r}, ${g}, ${bb})`;
}
