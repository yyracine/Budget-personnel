import { describe, expect, it } from 'vitest';
import {
  formatMoney,
  formatPercent,
  formatSignedMoney,
  parseAmount,
  sumAmounts,
} from './money';

describe('parseAmount', () => {
  it('accepte les entiers avec espaces et devise', () => {
    expect(parseAmount('300 000')).toEqual({ ok: true, amount: 300000 });
    expect(parseAmount('85\u00a0000 FCFA')).toEqual({ ok: true, amount: 85000 });
    expect(parseAmount('1 234 567')).toEqual({ ok: true, amount: 1234567 });
  });

  it('interprète les groupes de trois chiffres après un point comme des milliers', () => {
    expect(parseAmount('300.000')).toEqual({ ok: true, amount: 300000 });
    expect(parseAmount('1.234.567')).toEqual({ ok: true, amount: 1234567 });
  });

  it('refuse une partie décimale non nulle sans arrondir', () => {
    const result = parseAmount('85 000,50');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('decimal');
      expect(result.rounded).toBe(85001);
    }
  });

  it('accepte une partie décimale nulle', () => {
    expect(parseAmount('300,00')).toEqual({ ok: true, amount: 300 });
    expect(parseAmount('0.000')).toEqual({ ok: false, code: 'zero', rounded: null });
  });

  it('refuse zéro, les négatifs, les vides et le texte', () => {
    expect(parseAmount('0')).toEqual({ ok: false, code: 'zero', rounded: null });
    expect(parseAmount('-5000')).toMatchObject({ ok: false, code: 'negative' });
    expect(parseAmount('')).toMatchObject({ ok: false, code: 'empty' });
    expect(parseAmount('abc')).toMatchObject({ ok: false, code: 'invalid' });
  });

  it('refuse les nombres non entiers fournis en number', () => {
    expect(parseAmount(12.5)).toMatchObject({ ok: false, code: 'decimal' });
    expect(parseAmount(12000)).toEqual({ ok: true, amount: 12000 });
  });
});

describe('formatage', () => {
  it('affiche les montants FCFA avec séparateurs', () => {
    expect(formatMoney(1234567).replace(/[\u202f\u00a0]/g, ' ')).toBe('1 234 567 FCFA');
    expect(formatMoney(0, 'fr-FR', { symbol: false }).replace(/[\u202f\u00a0]/g, ' ')).toBe('0');
  });

  it('affiche les montants signés', () => {
    expect(formatSignedMoney(1500).replace(/[\u202f\u00a0]/g, ' ')).toBe('+1 500 FCFA');
    expect(formatSignedMoney(-1500).replace(/[\u202f\u00a0]/g, ' ')).toBe(
      '\u22121 500 FCFA',
    );
  });

  it('gère les pourcentages non calculables', () => {
    expect(formatPercent(null)).toBe('—');
    expect(formatPercent(83.333).replace(/[\u202f\u00a0]/g, ' ')).toBe('83,33 %');
  });
});

describe('sumAmounts', () => {
  it('additionne exactement des entiers', () => {
    expect(sumAmounts([300000, 150000, -100000])).toBe(350000);
  });

  it('échoue au-delà de la précision entière', () => {
    expect(() => sumAmounts([Number.MAX_SAFE_INTEGER, 1])).toThrow();
  });
});
