// Converts a non-negative integer into Indian-numbering-system words
// (Lakh/Crore, not Million/Billion) — used on payslips/reports for the
// "Rupees ... Only" line.
export function inWords(n: number): string {
  const ones = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine',
    'Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen']
  const tens = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety']
  if (n <= 0) return 'Zero'
  if (n < 20) return ones[n]
  if (n < 100) return tens[Math.floor(n/10)] + (n%10 ? ' '+ones[n%10] : '')
  if (n < 1000) return ones[Math.floor(n/100)]+' Hundred'+(n%100 ? ' '+inWords(n%100) : '')
  if (n < 100000) return inWords(Math.floor(n/1000))+' Thousand'+(n%1000 ? ' '+inWords(n%1000) : '')
  if (n < 10000000) return inWords(Math.floor(n/100000))+' Lakh'+(n%100000 ? ' '+inWords(n%100000) : '')
  return inWords(Math.floor(n/10000000))+' Crore'+(n%10000000 ? ' '+inWords(n%10000000) : '')
}
