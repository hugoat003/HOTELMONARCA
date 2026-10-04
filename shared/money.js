export const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

export const sum = (arr, fn = (x) => x) => round2(arr.reduce((a, x) => a + (fn(x) || 0), 0));

export const makeFmt = (currency) => (n) =>
  currency +
  ' ' +
  (n || 0).toLocaleString('es-GT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export const linesTotal = (lines) => sum(lines, (l) => l.price * l.qty);
