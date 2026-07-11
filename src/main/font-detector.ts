import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

// Windows font registrations (issue #89: font picker). Machine-wide fonts live
// under HKLM, per-user installs (the Microsoft Store / "install for me" path)
// under HKCU. Value names are font names like "Cascadia Code (TrueType)".
const FONT_REGISTRY_KEYS = [
  'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts',
  'HKCU\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts',
];

// Style words that registry font names append to the family name. Stripped
// iteratively from the end so "Segoe UI Semibold Italic" → "Segoe UI".
// Deliberately conservative: "Narrow"/"Condensed" stay, since Arial Narrow
// etc. are distinct CSS families a user may genuinely want to pick.
const STYLE_SUFFIXES = new Set([
  'regular', 'bold', 'italic', 'oblique', 'light', 'semilight', 'semibold',
  'demibold', 'medium', 'black', 'thin', 'extralight', 'extrabold', 'heavy',
  'ultralight', 'ultrabold', 'book',
]);

/** Reduce a registry font name to its CSS family name (best effort). */
export function fontNameToFamily(rawName: string): string {
  // Drop the technology suffix: "(TrueType)", "(OpenType)", "(All res)"…
  let name = rawName.trim();
  if (name.endsWith(')')) {
    const open = name.lastIndexOf('(');
    if (open > 0) name = name.slice(0, open).trimEnd();
  }
  // Drop trailing style words one at a time.
  for (;;) {
    const idx = name.lastIndexOf(' ');
    if (idx <= 0) break;
    const last = name.slice(idx + 1).toLowerCase();
    if (!STYLE_SUFFIXES.has(last)) break;
    name = name.slice(0, idx).trimEnd();
  }
  return name;
}

/**
 * Parse `reg query …\Fonts` output into a sorted, deduplicated list of font
 * family names. Data lines look like:
 *   "    Cascadia Code SemiBold (TrueType)    REG_SZ    CascadiaCodeSemiBold.ttf"
 * Some registrations bundle several families in one value name, separated by
 * " & " ("MS Gothic & MS UI Gothic & MS PGothic (TrueType)").
 */
export function parseFontRegistryOutput(output: string): string[] {
  const families = new Set<string>();
  for (const line of output.split('\n')) {
    // Value lines are "    <name>    REG_SZ    <file>"; columns are separated
    // by runs of spaces, and font names never contain the type token.
    if (!line.startsWith('  ')) continue;
    const typeIdx = line.indexOf('    REG_');
    if (typeIdx <= 0) continue;
    const valueName = line.slice(0, typeIdx).trim();
    if (!valueName) continue;
    for (const part of valueName.split(' & ')) {
      const family = fontNameToFamily(part);
      // Skip vertical-writing aliases ("@MS Gothic") and empty leftovers.
      if (family && !family.startsWith('@')) families.add(family);
    }
  }
  return [...families].sort((a, b) => a.localeCompare(b));
}

let cachedFonts: string[] | null = null;

/** Enumerate installed font families. Cached: the set only changes when the user installs fonts. */
export async function listSystemFonts(): Promise<string[]> {
  if (cachedFonts) return cachedFonts;
  const outputs = await Promise.all(
    FONT_REGISTRY_KEYS.map(async (key) => {
      try {
        const { stdout } = await execFileAsync('reg', ['query', key], {
          encoding: 'utf8', windowsHide: true, timeout: 5000, maxBuffer: 4 * 1024 * 1024,
        });
        return stdout;
      } catch {
        return ''; // key missing (no per-user fonts) or reg unavailable — non-fatal
      }
    }),
  );
  const fonts = parseFontRegistryOutput(outputs.join('\n'));
  if (fonts.length > 0) cachedFonts = fonts;
  return fonts;
}
