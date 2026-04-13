import { padDataForGrid, isPlaceholder } from '../../src/utils/gridHelpers';

describe('padDataForGrid', () => {
  it('returns data unchanged when length is divisible by columns (remainder === 0)', () => {
    const data = [
      { id: '1' },
      { id: '2' },
      { id: '3' },
    ];
    const result = padDataForGrid(data, 3);
    expect(result).toBe(data);
    expect(result).toHaveLength(3);
  });

  it('pads data with placeholders when remainder is non-zero', () => {
    const data = [
      { id: '1' },
      { id: '2' },
    ];
    const result = padDataForGrid(data, 3);
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ id: '1' });
    expect(result[1]).toEqual({ id: '2' });
    expect(result[2]).toEqual({ id: '_placeholder_0', _placeholder: true });
  });

  it('adds multiple placeholders when needed', () => {
    const data = [{ id: '1' }];
    const result = padDataForGrid(data, 4);
    expect(result).toHaveLength(4);
    expect(result[1]).toEqual({ id: '_placeholder_0', _placeholder: true });
    expect(result[2]).toEqual({ id: '_placeholder_1', _placeholder: true });
    expect(result[3]).toEqual({ id: '_placeholder_2', _placeholder: true });
  });

  it('handles empty array (remainder === 0)', () => {
    const result = padDataForGrid([], 3);
    expect(result).toHaveLength(0);
  });
});

describe('isPlaceholder', () => {
  it('returns true for placeholder items', () => {
    expect(isPlaceholder({ _placeholder: true })).toBe(true);
  });

  it('returns false for regular items', () => {
    expect(isPlaceholder({ id: '1' })).toBe(false);
  });

  it('returns false for items with _placeholder set to false', () => {
    expect(isPlaceholder({ _placeholder: false })).toBe(false);
  });
});
