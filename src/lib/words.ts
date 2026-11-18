const ONES = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

function under1000(n: number): string {
  const h = Math.floor(n / 100), r = n % 100;
  const rest = r < 20 ? ONES[r] : TENS[Math.floor(r / 10)] + (r % 10 ? `-${ONES[r % 10]}` : "");
  if (!h) return rest;
  return `${ONES[h]} hundred${rest ? ` and ${rest}` : ""}`;
}

export function numberInWords(n: number): string {
  if (n === 0) return "zero";
  const parts: string[] = [];
  for (const [size, name] of [[1e9, "billion"], [1e6, "million"], [1e3, "thousand"]] as const) {
    if (n >= size) {
      parts.push(`${under1000(Math.floor(n / size))} ${name}`);
      n %= size;
    }
  }
  if (n) parts.push(parts.length && n < 100 ? `and ${under1000(n)}` : under1000(n));
  return parts.join(" ");
}

/** "Twelve thousand five hundred shillings only" / "… and fifty cents only" */
export function kesInWords(cents: bigint): string {
  const abs = cents < 0n ? -cents : cents;
  const sh = Number(abs / 100n), c = Number(abs % 100n);
  const s = `${numberInWords(sh)} shilling${sh === 1 ? "" : "s"}${c ? ` and ${numberInWords(c)} cent${c === 1 ? "" : "s"}` : ""} only`;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
