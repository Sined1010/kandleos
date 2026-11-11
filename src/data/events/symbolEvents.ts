// The app's events lookup, wired to BaFin, Finnhub and the ISIN of German listings (Xetra list, then Wikidata).
// It imports the app's fetchers and is therefore loaded by no test (see index.ts for the tested part).
import type { InsiderDeal } from '../../shared/events'
import { bafinDeals } from './bafin'
import { finnhubFilings, finnhubInsider, finnhubNews } from './finnhub'
import { wikidataAdr } from '../isin'
import { createSymbolEvents, germanIsin } from './index'

// The phone puts its own BaFin source here (direct, then through the paired PC; src/mobile/api.ts).
let bafinSource: (isin: string) => Promise<{ deals: InsiderDeal[]; hidden: number; via?: 'pc' }> = (isin) => bafinDeals(isin)
export function setBafinSource(fn: typeof bafinSource): void {
  bafinSource = fn
}

export const symbolEvents = createSymbolEvents({
  isin: (s) => germanIsin(s),
  bafin: (isin) => bafinSource(isin),
  insider: finnhubInsider,
  filings: finnhubFilings,
  news: finnhubNews,
  adr: wikidataAdr,
  now: () => Date.now() / 1000
})
