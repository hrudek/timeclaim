import { describe, expect, test } from '@jest/globals';

import type { AppState, Employment } from './model';
import {
  allowanceError,
  appStateError,
  assertValid,
  billingError,
  calendarDateError,
  calendarMonthError,
  employmentError,
  getWorkInterval,
  parseAmountInput,
  parseHoursInput,
  parseNumber,
  parseQuantityInput,
  timeToMinutes,
  workDayError,
} from './validation';

function employment(): Employment {
  return {
    id: 'job', name: 'Job', color: 0,
    days: { '2025-01-01': { start: '08:00', end: '16:30', pause: 30, note: '' } },
    allowances: [{ id: 'a', date: '2025-01-01', label: 'Bonus', quantity: 1, amount: 12.5 }],
    billing: { '2025-01': { hours: '8', allowances: { Bonus: { quantity: '1', amount: '12,50' } } } },
  };
}

function state(): AppState {
  return { version: 1, activeEmploymentId: 'job', employments: [employment()] };
}

describe('timeToMinutes', () => {
  test('accepts the full day range', () => {
    expect(timeToMinutes('00:00')).toBe(0);
    expect(timeToMinutes('08:30')).toBe(510);
    expect(timeToMinutes('23:59')).toBe(1439);
  });

  test('rejects out-of-range and malformed times', () => {
    expect(timeToMinutes('24:00')).toBeNull();
    expect(timeToMinutes('12:60')).toBeNull();
    expect(timeToMinutes('7:00')).toBeNull();
    expect(timeToMinutes('')).toBeNull();
  });
});

describe('calendarDateError', () => {
  test('accepts real dates including leap days and year limits', () => {
    expect(calendarDateError('2024-02-29')).toBeNull();
    expect(calendarDateError('1900-01-01')).toBeNull();
    expect(calendarDateError('2200-12-31')).toBeNull();
  });

  test('rejects nonexistent dates, years out of range and bad formats', () => {
    expect(calendarDateError('2023-02-29')).toMatch(/existiert nicht/);
    expect(calendarDateError('2025-13-01')).toMatch(/existiert nicht/);
    expect(calendarDateError('1899-12-31')).toMatch(/zwischen 1900 und 2200/);
    expect(calendarDateError('2201-01-01')).toMatch(/zwischen 1900 und 2200/);
    expect(calendarDateError('2025-1-1')).toMatch(/JJJJ-MM-TT/);
    expect(calendarDateError('', 'Start')).toMatch(/^Start:/);
  });
});

describe('calendarMonthError', () => {
  test('accepts months 01 to 12', () => {
    expect(calendarMonthError('2025-01')).toBeNull();
    expect(calendarMonthError('2025-12')).toBeNull();
  });

  test('rejects month 00, 13, years out of range and bad formats', () => {
    expect(calendarMonthError('2025-00')).toMatch(/Kalendermonat/);
    expect(calendarMonthError('2025-13')).toMatch(/Kalendermonat/);
    expect(calendarMonthError('1899-12')).toMatch(/Kalendermonat/);
    expect(calendarMonthError('2025-1')).toMatch(/Format/);
  });
});

describe('parseNumber', () => {
  test.each([
    ['1', 1],
    ['1,5', 1.5],
    ['1.5', 1.5],
    ['-2,25', -2.25],
    ['1.234', 1234],
    ['1.234.567,89', 1234567.89],
    ['12,50 €', 12.5],
    ['  7  ', 7],
  ])('parses %p', (input, expected) => {
    expect(parseNumber(input)).toBe(expected);
  });

  test.each(['', '   ', 'abc', '1,2,3', '1.23.4', '1,', ',5', '1'.repeat(25)])('rejects %p', (input) => {
    expect(parseNumber(input)).toBeNull();
  });
});

describe('parseQuantityInput', () => {
  test('parses valid quantities with up to three decimals', () => {
    expect(parseQuantityInput('1,5')).toEqual({ value: 1.5, error: null });
    expect(parseQuantityInput('0,125')).toEqual({ value: 0.125, error: null });
    expect(parseQuantityInput('10000')).toEqual({ value: 10000, error: null });
  });

  test('handles empty input depending on optional', () => {
    expect(parseQuantityInput('')).toMatchObject({ value: null, error: expect.stringMatching(/Bitte einen Wert/) });
    expect(parseQuantityInput(' ', true)).toEqual({ value: null, error: null });
  });

  test('allows zero only when requested', () => {
    expect(parseQuantityInput('0').error).toMatch(/größer als 0/);
    expect(parseQuantityInput('0', false, true)).toEqual({ value: 0, error: null });
  });

  test('rejects negative, too large, too precise and malformed values', () => {
    expect(parseQuantityInput('-1').error).toMatch(/höchstens 10\.000/);
    expect(parseQuantityInput('10000,001').error).toMatch(/höchstens 10\.000/);
    expect(parseQuantityInput('1,2345').error).toMatch(/drei Nachkommastellen/);
    expect(parseQuantityInput('1,5x').error).toMatch(/vollständige Zahl/);
  });
});

describe('parseAmountInput', () => {
  test('parses amounts with up to two decimals and an optional euro sign', () => {
    expect(parseAmountInput('12,50')).toEqual({ value: 12.5, error: null });
    expect(parseAmountInput('1.000.000 €')).toEqual({ value: 1_000_000, error: null });
    expect(parseAmountInput('0')).toEqual({ value: 0, error: null });
  });

  test('is optional by default', () => {
    expect(parseAmountInput('')).toEqual({ value: null, error: null });
    expect(parseAmountInput('', false).error).toMatch(/Bitte einen Wert/);
  });

  test('rejects negative, too large, too precise and malformed amounts', () => {
    expect(parseAmountInput('-0,01').error).toMatch(/zwischen 0 und/);
    expect(parseAmountInput('1.000.000,01').error).toMatch(/zwischen 0 und/);
    expect(parseAmountInput('12,505').error).toMatch(/zwei Nachkommastellen/);
    expect(parseAmountInput('zwölf').error).toMatch(/vollständigen Betrag/);
  });
});

describe('parseHoursInput', () => {
  test('parses decimal and clock notation to minutes', () => {
    expect(parseHoursInput('8')).toEqual({ value: 480, error: null });
    expect(parseHoursInput('8,5')).toEqual({ value: 510, error: null });
    expect(parseHoursInput('8.25')).toEqual({ value: 495, error: null });
    expect(parseHoursInput('8:30')).toEqual({ value: 510, error: null });
    expect(parseHoursInput('0:00')).toEqual({ value: 0, error: null });
  });

  test('accepts the upper bound and rejects anything above', () => {
    expect(parseHoursInput('744')).toEqual({ value: 744 * 60, error: null });
    expect(parseHoursInput('744:01').error).toMatch(/zwischen 0 und 744/);
    expect(parseHoursInput('745').error).toMatch(/zwischen 0 und 744/);
  });

  test('handles empty input depending on optional', () => {
    expect(parseHoursInput('')).toEqual({ value: null, error: null });
    expect(parseHoursInput('', false).error).toMatch(/Bitte einen Wert/);
  });

  test('rejects malformed, negative and overly long input', () => {
    expect(parseHoursInput('8:60').error).toMatch(/Stunden:Minuten/);
    expect(parseHoursInput('8,125').error).toMatch(/Stunden:Minuten/);
    expect(parseHoursInput('-1').error).toMatch(/Stunden:Minuten/);
    expect(parseHoursInput('1'.repeat(25)).error).toMatch(/zu lang/);
  });
});

describe('getWorkInterval', () => {
  test('returns the elapsed minutes of a same-day shift', () => {
    expect(getWorkInterval('2025-05-12', '00:00', '23:59')).toEqual({
      elapsed: 1439, clockElapsed: 1439, overnight: false,
      startAmbiguous: false, endAmbiguous: false, dstAdjustment: 0,
    });
  });

  test('treats an end before the start as crossing midnight', () => {
    expect(getWorkInterval('2025-05-12', '23:30', '00:15')).toMatchObject({ elapsed: 45, overnight: true, dstAdjustment: 0 });
    expect(getWorkInterval('2025-12-31', '22:00', '02:00')).toMatchObject({ elapsed: 240, overnight: true });
  });

  test('returns null for equal or invalid times', () => {
    expect(getWorkInterval('2025-05-12', '08:00', '08:00')).toBeNull();
    expect(getWorkInterval('2025-05-12', '25:00', '08:00')).toBeNull();
  });

  test('flags ambiguous times in the autumn repeat', () => {
    expect(getWorkInterval('2025-10-26', '02:30', '04:00')).toMatchObject({ elapsed: 150, startAmbiguous: true, endAmbiguous: false });
  });
});

describe('workDayError', () => {
  const day = { start: '08:00', end: '16:00', pause: 30, note: '' };

  test('accepts a valid day and an overnight shift', () => {
    expect(workDayError('2025-01-01', day)).toBeNull();
    expect(workDayError('2025-01-01', { ...day, start: '22:00', end: '06:00' })).toBeNull();
  });

  test('rejects invalid dates, times and identical start/end', () => {
    expect(workDayError('2025-02-30', day)).toMatch(/existiert nicht/);
    expect(workDayError('2025-01-01', { ...day, start: '8:00' })).toMatch(/^Beginn:/);
    expect(workDayError('2025-01-01', { ...day, end: '24:00' })).toMatch(/^Ende:/);
    expect(workDayError('2025-01-01', { ...day, end: '08:00' })).toMatch(/unterschiedlich/);
  });

  test('checks pause bounds against the gross duration', () => {
    expect(workDayError('2025-01-01', { ...day, pause: 0 })).toBeNull();
    expect(workDayError('2025-01-01', { ...day, pause: 479 })).toBeNull();
    expect(workDayError('2025-01-01', { ...day, pause: 480 })).toMatch(/kürzer als die Bruttozeit von 480/);
    expect(workDayError('2025-01-01', { ...day, pause: -1 })).toMatch(/nicht negative/);
    expect(workDayError('2025-01-01', { ...day, pause: 1.5 })).toMatch(/ganze/);
  });

  test('limits the note length', () => {
    expect(workDayError('2025-01-01', { ...day, note: 'x'.repeat(500) })).toBeNull();
    expect(workDayError('2025-01-01', { ...day, note: 'x'.repeat(501) })).toMatch(/Notiz/);
  });

  test('rejects incomplete records', () => {
    expect(workDayError('2025-01-01', { ...day, pause: '30' } as any)).toMatch(/Unvollständige/);
  });
});

describe('allowanceError', () => {
  const allowance = { id: 'a', date: '2025-01-01', label: 'Bonus', quantity: 1, amount: 12.5 };

  test('accepts valid allowances with and without amount', () => {
    expect(allowanceError(allowance)).toBeNull();
    expect(allowanceError({ ...allowance, amount: null })).toBeNull();
  });

  test.each([
    [{ id: '' }, /Kennung/],
    [{ id: 'x'.repeat(121) }, /Kennung/],
    [{ date: '2025-02-30' }, /existiert nicht/],
    [{ label: '   ' }, /Namen/],
    [{ label: 'x'.repeat(81) }, /Maximal 80/],
    [{ quantity: 0 }, /Anzahl/],
    [{ quantity: 1.0005 }, /Anzahl/],
    [{ quantity: Number.NaN }, /Anzahl/],
    [{ amount: -1 }, /Betrag/],
    [{ amount: 1.005 }, /Betrag/],
    [{ quantity: '1' }, /Unvollständige/],
  ])('rejects %p', (change, expected) => {
    expect(allowanceError({ ...allowance, ...change } as any)).toMatch(expected);
  });
});

describe('billingError', () => {
  const billing = { hours: '8', allowances: { Bonus: { quantity: '1', amount: '12,50' } } };

  test('accepts valid and empty billing records', () => {
    expect(billingError('2025-01', billing)).toBeNull();
    expect(billingError('2025-01', { hours: '', allowances: {} })).toBeNull();
    expect(billingError('2025-01', { hours: '', allowances: { Bonus: { quantity: '0', amount: '' } } })).toBeNull();
  });

  test('rejects invalid months, hours and positions', () => {
    expect(billingError('2025-13', billing)).toMatch(/Kalendermonat/);
    expect(billingError('2025-01', { ...billing, hours: '800' })).toMatch(/^Abrechnung – Stunden/);
    expect(billingError('2025-01', { hours: '', allowances: { ' ': { quantity: '1', amount: '' } } })).toMatch(/leer oder länger/);
    expect(billingError('2025-01', { hours: '', allowances: { Bonus: { quantity: '-1', amount: '' } } })).toMatch(/„Bonus“ – Anzahl/);
    expect(billingError('2025-01', { hours: '', allowances: { Bonus: { quantity: '', amount: '1,999' } } })).toMatch(/„Bonus“ – Betrag/);
    expect(billingError('2025-01', { hours: '', allowances: { Bonus: { quantity: 1 } } } as any)).toMatch(/Unvollständige Daten/);
    expect(billingError('2025-01', { hours: '', allowances: [] } as any)).toMatch(/ungültige Daten/);
  });
});

describe('employmentError', () => {
  test('accepts a valid employment', () => {
    expect(employmentError(employment())).toBeNull();
  });

  test('rejects invalid metadata', () => {
    expect(employmentError({ ...employment(), id: '' })).toMatch(/Kennung/);
    expect(employmentError({ ...employment(), name: '  ' })).toMatch(/1 bis 80/);
    expect(employmentError({ ...employment(), color: 4 })).toMatch(/Farbe/);
    expect(employmentError({ ...employment(), allowances: {} } as any)).toMatch(/ungültiges Format/);
  });

  test('reports the first invalid nested entry', () => {
    expect(employmentError({ ...employment(), days: { '2025-01-01': { start: '08:00', end: '08:00', pause: 0, note: '' } } })).toMatch(/unterschiedlich/);
    expect(employmentError({ ...employment(), allowances: [{ ...employment().allowances[0], label: '' }] })).toMatch(/Bezeichnung/);
    expect(employmentError({ ...employment(), billing: { '2025-1': { hours: '', allowances: {} } } })).toMatch(/Format/);
  });
});

describe('appStateError and assertValid', () => {
  test('accepts a valid state', () => {
    expect(appStateError(state())).toBeNull();
    expect(() => assertValid(appStateError(state()))).not.toThrow();
  });

  test('rejects empty, duplicate and dangling references', () => {
    expect(appStateError({ ...state(), employments: [] })).toMatch(/keinen gültigen/);
    expect(appStateError({ ...state(), activeEmploymentId: 'missing' })).toMatch(/aktive/);
    expect(appStateError({ ...state(), employments: [employment(), employment()] })).toMatch(/doppelte Arbeitsverhältnis/);
    expect(appStateError({ ...state(), employments: [employment(), { ...employment(), id: 'job-2' }] })).toMatch(/doppelte Zulagen/);
  });

  test('assertValid throws the error message', () => {
    expect(() => assertValid('kaputt')).toThrow('kaputt');
  });
});
