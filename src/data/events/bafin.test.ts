import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bafinDeals, bafinUrl, parseBafin, setCsvLoader } from './bafin.ts'

const HEAD = '\uFEFFEmittent;Bafin-ID;ISIN;Meldepflichtiger;Position / Status;Art des Instruments;Art des Geschäfts;Durchschnittspreis;Aggregiertes Volumen;Mitteilungsdatum;Datum des Geschäfts;Ort des Geschäfts;Datum der Aktivierung'
const CSV = [HEAD,
  'Muster SE;40001244;DE0007164600;Muster, Anna;Vorstand;Aktie;Kauf;178,30 EUR;267.450,00 EUR;26.08.2026;26.08.2026;Tradegate;26.08.2026 15:34:16',
  'Muster SE;40001244;DE0007164600;Beispiel, Bernd;Aufsichtsrat;Aktie;Verkauf;218,15 EUR;95.331,55 EUR;13.11.2025;13.11.2025;XETRA;14.11.2025 09:50:35',
  'Muster SE;40001244;DE0007164600;Muster, Anna;Vorstand;Aktie;Sonstiges;176,64 EUR;34.485,73 EUR;14.09.2026;11.09.2026;;14.09.2026 14:27:19',
  'Muster SE;40001244;DE0007164600;Test GmbH;in enger Beziehung;Derivat;Kauf;1,00 EUR;5.000,00 EUR;01.09.2026;01.09.2026;;01.09.2026 10:00:00',
  'Andere AG;40009999;;Fremd, Carl;Sonstige Führungsperson;Aktie;Verkauf;52,00 HKD;416.000,00 HKD;05.11.2026;04.11.2026;Hong Kong Stock Exchange;06.11.2026 08:00:00',
  ''].join('\r\n')

test('the export address', () => assert.equal(bafinUrl('DE0007164600', 0),
  'https://portal.mvp.bafin.de/database/DealingsInfo/sucheForm.do?emittentIsin=DE0007164600&emittentName=&meldepflichtigerName=&zeitraum=0&emittentButton=Suche+Emittent&d-4000784-e=1&6578706f7274=1'))
test('only buys and sells of shares of that ISIN', () => {
  const list = parseBafin(CSV, 'DE0007164600').deals
  assert.deepEqual(list[0], { source: 'BaFin', person: 'Muster, Anna', role: 'vorstand', side: 'buy', date: '2026-08-26', published: '2026-08-26', shares: 1500, price: 178.3, volume: 267_450, currency: 'EUR', venue: 'Tradegate' })
  assert.deepEqual([list.length, list[1].side, list[1].role, list[1].published], [2, 'sell', 'aufsichtsrat', '2025-11-14'])
})
test('without an ISIN every issuer, other currencies included', () => {
  const last = parseBafin(CSV).deals.at(-1)!
  assert.deepEqual([parseBafin(CSV).deals.length, last.role, last.currency, last.volume], [3, 'fuehrung', 'HKD', 416_000])
})
test('no rows is empty, anything but the CSV is an error', () => {
  assert.deepEqual(parseBafin(HEAD + '\r\n', 'DE0007164600'), { deals: [], hidden: 0 })
  assert.throws(() => parseBafin('<!DOCTYPE html><html><body>Wartung</body></html>'))
  assert.throws(() => parseBafin(''))
})
test('bafinDeals asks the loader for that ISIN', async () => {
  let asked = ''
  setCsvLoader(async (url) => ((asked = url), CSV))
  assert.equal((await bafinDeals('DE0007164600')).deals.length, 2)
  assert.equal(asked, bafinUrl('DE0007164600', 0))
})
test('rows of that ISIN left out (other dealings, derivatives) are counted', () => {
  assert.equal(parseBafin(CSV, 'DE0007164600').hidden, 2)
  assert.equal(parseBafin(CSV).hidden, 2)
})
