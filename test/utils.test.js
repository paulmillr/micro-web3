import { deepStrictEqual } from 'assert';
import { should } from 'micro-should';
import { parseDecimal, formatDecimal } from '../index.js';

should('utils: parseDecimal', () => {
  deepStrictEqual(parseDecimal('6.30880845', 8), 630880845n);
  deepStrictEqual(parseDecimal('6.308', 8), 630800000n);
  deepStrictEqual(parseDecimal('6.00008', 8), 600008000n);
  deepStrictEqual(parseDecimal('10', 8), 1000000000n);
  deepStrictEqual(parseDecimal('200', 8), 20000000000n);
});

should('utils: formatDecimal', () => {
  const cases = [
    '6.30880845',
    '6.308',
    '6.00008',
    '10',
    '200',
    '0.1',
    '0.01',
    '0.001',
    '0.0001',
    '19.0001',
    '99999999',
    '-6.30880845',
    '-6.308',
    '-6.00008',
    '-10',
    '-200',
    '-0.1',
    '-0.01',
    '-0.001',
    '-0.0001',
    '-19.0001',
    '-99999999',
  ];
  for (let c of cases) deepStrictEqual(formatDecimal(parseDecimal(c, 8), 8), c);
  // Round number if precision is smaller than fraction part length
  deepStrictEqual(parseDecimal('22.11111111111111111', 2), 2211n);
  deepStrictEqual(parseDecimal('222222.11111111111111111', 2), 22222211n);
  deepStrictEqual(formatDecimal(parseDecimal('22.1111', 2), 2), '22.11');
  deepStrictEqual(formatDecimal(parseDecimal('22.9999', 2), 2), '22.99');
  // Doesn't affect integer part
  deepStrictEqual(
    formatDecimal(parseDecimal('222222222222222222222222222.9999', 2), 2),
    '222222222222222222222222222.99'
  );
});


