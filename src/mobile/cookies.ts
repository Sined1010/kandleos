/** Splits a joined Set-Cookie header ("a=1; Path=/, b=2; Expires=Wed, 21 Oct …") into "name=value" pairs. */
export function cookiePairs(header: string | string[] | undefined): string[] {
  const all = Array.isArray(header) ? header : header ? [header] : []
  return all
    .flatMap((h) => h.split(/,(?=\s*[A-Za-z0-9_.-]+=)/))
    .map((c) => c.trim().split(';')[0])
    .filter((c) => c.includes('='))
}
