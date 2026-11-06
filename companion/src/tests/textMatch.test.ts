import { describe, expect, it } from 'vitest';
import { matchesQuery } from '../calculators/textMatch';

describe('in-page filter', () => {
  it('matches every word, any order, any case', () => {
    expect(matchesQuery('', 'anything')).toBe(true);
    expect(matchesQuery('teddy', 'Teddy Bear Chat Ring')).toBe(true);
    expect(matchesQuery('ring teddy', 'Teddy Bear Chat Ring')).toBe(true);
    expect(matchesQuery('ring wand', 'Teddy Bear Chat Ring')).toBe(false);
  });

  it('searches across several fields and ignores empty ones', () => {
    expect(matchesQuery('horny ant', 'Ant Tunnel I', undefined, null, 'Horny Mushroom')).toBe(true);
    expect(matchesQuery('25', 'Lv', 25)).toBe(true);
    expect(matchesQuery('cafe', 'Café Sign')).toBe(true);
  });
});
