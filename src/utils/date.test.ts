import { formatLocalDate } from './date';

test('formats the calendar date in the device local timezone', () => {
  const date = new Date(2026, 9, 31, 23, 45, 0);
  const expected = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  expect(formatLocalDate(date)).toBe(expected);
});
