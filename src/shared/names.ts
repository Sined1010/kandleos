// Long legal forms from exchange listings, shortened to what people actually say.
const LEGAL_FORMS: [RegExp, string][] = [
  [/\bAktiengesellschaft\b/i, 'AG'],
  [/\bKommanditgesellschaft auf Aktien\b/i, 'KGaA'],
  [/\bPublic Limited Company\b/i, 'PLC'],
  [/\bIncorporated\b/i, 'Inc.'],
  [/\bCorporation\b/i, 'Corp.'],
  [/\bSociet(?:as|à) Europaea\b/i, 'SE']
]

/** Readable display name from a Yahoo listing name; crypto pairs drop the trailing quote currency. */
export function cleanName(raw: string, crypto: boolean): string {
  let name = raw.replace(/\s+/g, ' ').trim()
  for (const [re, short] of LEGAL_FORMS) name = name.replace(re, short)
  return crypto ? name.replace(/ USD$/, '') : name
}
