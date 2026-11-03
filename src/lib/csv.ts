/** Minimal RFC 4180 CSV writer (quotes fields containing commas, quotes or newlines). */
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  const esc = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // Leading BOM so Excel opens UTF-8 (accents, em dashes) correctly
  return "\uFEFF" + rows.map((r) => r.map(esc).join(",")).join("\r\n") + "\r\n";
}
