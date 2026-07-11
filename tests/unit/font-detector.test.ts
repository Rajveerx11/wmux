import { describe, it, expect } from 'vitest';
import { fontNameToFamily, parseFontRegistryOutput } from '../../src/main/font-detector';

describe('fontNameToFamily', () => {
  it('strips the technology suffix', () => {
    expect(fontNameToFamily('Cascadia Code (TrueType)')).toBe('Cascadia Code');
    expect(fontNameToFamily('Segoe UI (OpenType)')).toBe('Segoe UI');
  });

  it('strips trailing style words', () => {
    expect(fontNameToFamily('Cascadia Code SemiBold (TrueType)')).toBe('Cascadia Code');
    expect(fontNameToFamily('Segoe UI Semibold Italic (TrueType)')).toBe('Segoe UI');
    expect(fontNameToFamily('Arial Bold (TrueType)')).toBe('Arial');
  });

  it('keeps distinct families that end in non-style words', () => {
    expect(fontNameToFamily('Arial Narrow (TrueType)')).toBe('Arial Narrow');
    expect(fontNameToFamily('Cascadia Mono (TrueType)')).toBe('Cascadia Mono');
  });

  it('does not strip a style word that is the whole name', () => {
    expect(fontNameToFamily('Bold (TrueType)')).toBe('Bold');
  });
});

describe('parseFontRegistryOutput', () => {
  const sample = [
    '',
    'HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts',
    '    Arial (TrueType)    REG_SZ    arial.ttf',
    '    Arial Bold (TrueType)    REG_SZ    arialbd.ttf',
    '    Cascadia Code SemiBold (TrueType)    REG_SZ    CascadiaCodeSemiBold.ttf',
    '    Cascadia Mono (TrueType)    REG_SZ    CascadiaMono.ttf',
    '    MS Gothic & MS UI Gothic & MS PGothic (TrueType)    REG_SZ    msgothic.ttc',
    '    @MS Gothic (TrueType)    REG_SZ    msgothic.ttc',
    '',
  ].join('\r\n');

  it('extracts deduplicated, sorted family names', () => {
    expect(parseFontRegistryOutput(sample)).toEqual([
      'Arial', 'Cascadia Code', 'Cascadia Mono', 'MS Gothic', 'MS PGothic', 'MS UI Gothic',
    ]);
  });

  it('ignores headers, blank lines and vertical-writing aliases', () => {
    const families = parseFontRegistryOutput(sample);
    expect(families.some((f) => f.startsWith('@'))).toBe(false);
    expect(families.some((f) => f.includes('HKEY'))).toBe(false);
  });

  it('returns an empty list for empty output', () => {
    expect(parseFontRegistryOutput('')).toEqual([]);
  });
});
