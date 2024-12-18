import { groupBy, randomString } from './utils';

describe('groupBy', () => {
  it('should group objects by a key', () => {
    const testData = [
      { id: 1, category: 'A' },
      { id: 2, category: 'B' },
      { id: 3, category: 'A' },
      { id: 4, category: 'C' },
    ];

    const grouped = groupBy(testData, item => item.category);

    expect(grouped.size).toBe(3);
    expect(grouped.get('A')).toEqual([
      { id: 1, category: 'A' },
      { id: 3, category: 'A' },
    ]);
    expect(grouped.get('B')).toEqual([{ id: 2, category: 'B' }]);
    expect(grouped.get('C')).toEqual([{ id: 4, category: 'C' }]);
  });

  it('should handle empty arrays', () => {
    const grouped = groupBy([], item => item);
    expect(grouped.size).toBe(0);
  });

  it('should group primitive values', () => {
    const numbers = [1, 2, 3, 2, 1, 4];
    const grouped = groupBy(numbers, num => num);

    expect(grouped.size).toBe(4);
    expect(grouped.get(1)).toEqual([1, 1]);
    expect(grouped.get(2)).toEqual([2, 2]);
    expect(grouped.get(3)).toEqual([3]);
    expect(grouped.get(4)).toEqual([4]);
  });
});

describe('randomString', () => {
  it('should generate a string', () => {
    const result = randomString();
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('should generate different strings on subsequent calls', () => {
    const results = new Set();
    for (let i = 0; i < 100; i++) {
      results.add(randomString());
    }
    // If all strings were unique, the set size should equal the number of iterations
    expect(results.size).toBe(100);
  });

  it('should generate strings containing only alphanumeric characters', () => {
    const result = randomString();
    expect(result).toMatch(/^[a-z0-9]+$/);
  });
});
