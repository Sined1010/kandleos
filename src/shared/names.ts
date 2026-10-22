import { msg, t } from './i18n.ts'

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
  let name = raw
    // Yahoo pads short names and appends a share-class letter: "SIEMENS AG          N".
    .replace(/\s{2,}[A-Z]$/, '')
    .replace(/\s+/g, ' ')
    .trim()
    // Continuous futures (GC=F) roll every month, so the contract month in "Gold Dec 26" goes stale.
    .replace(/,?\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[- ]\d{2,4}$/, '')
  for (const [re, short] of LEGAL_FORMS) name = name.replace(re, short)
  return crypto ? name.replace(/ USD$/, '') : name
}

/**
 * German names and search terms for futures and indices: Yahoo's search only knows them in English or by
 * symbol ("Silber" finds nothing, "Gold" ranks a company first).
 */
export const ALIASES: { symbol: string; name: string; terms: string[] }[] = [
  { symbol: 'GC=F', name: 'Gold', terms: ['gold'] },
  { symbol: 'SI=F', name: msg('Silber'), terms: ['silber', 'silver'] },
  { symbol: 'PL=F', name: msg('Platin'), terms: ['platin', 'platinum'] },
  { symbol: 'PA=F', name: 'Palladium', terms: ['palladium'] },
  { symbol: 'HG=F', name: msg('Kupfer'), terms: ['kupfer', 'copper'] },
  { symbol: 'CL=F', name: msg('Rohöl WTI'), terms: ['rohoel', 'oel', 'wti', 'crudeoil'] },
  { symbol: 'BZ=F', name: msg('Rohöl Brent'), terms: ['rohoel', 'oel', 'brent'] },
  { symbol: 'NG=F', name: msg('Erdgas'), terms: ['erdgas', 'gas', 'naturalgas'] },
  { symbol: 'UX=F', name: msg('Uran (U3O8)'), terms: ['uran', 'uranium'] },
  { symbol: 'ZW=F', name: msg('Weizen'), terms: ['weizen', 'wheat'] },
  { symbol: 'ZC=F', name: msg('Mais'), terms: ['mais', 'corn'] },
  { symbol: '^GDAXI', name: 'DAX', terms: ['dax'] },
  { symbol: '^MDAXI', name: 'MDAX', terms: ['mdax'] },
  { symbol: '^TECDAX', name: 'TecDAX', terms: ['tecdax'] },
  { symbol: '^STOXX50E', name: 'Euro Stoxx 50', terms: ['eurostoxx', 'stoxx'] },
  { symbol: '^GSPC', name: 'S&P 500', terms: ['sp500', 'sandp'] },
  { symbol: 'ES=F', name: 'S&P 500 Future', terms: ['sp500', 'sandp'] },
  { symbol: '^NDX', name: 'Nasdaq 100', terms: ['nasdaq100'] },
  { symbol: 'NQ=F', name: 'Nasdaq 100 Future', terms: ['nasdaq100'] },
  { symbol: '^IXIC', name: 'Nasdaq Composite', terms: ['nasdaqcomposite'] },
  { symbol: '^DJI', name: 'Dow Jones', terms: ['dowjones'] },
  { symbol: '^N225', name: 'Nikkei 225', terms: ['nikkei'] },
  { symbol: '^VIX', name: msg('VIX (Volatilität)'), terms: ['vix', 'volatilitaet'] }
]

/** Lowercase, umlauts spelled out, only letters and digits: "Rohöl" -> "rohoel", "S&P 500" -> "sp500". */
export const normalize = (s: string): string =>
  s
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]/g, '')

/** Aliases whose search term, name (German or translated) or symbol starts with the query. */
export function findAliases(query: string): typeof ALIASES {
  const q = normalize(query)
  if (q.length < 2) return []
  return ALIASES.filter((a) => [...a.terms, a.name, t(a.name), a.symbol].some((t) => normalize(t).startsWith(q)))
}

/** Display name of an alias in the current language. */
export function aliasName(symbol: string): string | undefined {
  const name = ALIASES.find((a) => a.symbol === symbol)?.name
  return name && t(name)
}
