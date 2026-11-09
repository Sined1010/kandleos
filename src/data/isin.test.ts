import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isinFromCusip, isinValid, looksLikeWkn, parseXetra, pickIsin, wknOf, xetraPath } from './isin.ts'

test('a WKN is six letters or digits with at least one digit', () => {
  for (const q of ['716460', 'A0RPWH']) assert.equal(looksLikeWkn(q), true, q)
  for (const q of ['ABCDEF', 'RHM.DE', '71646', 'A0RPWH1']) assert.equal(looksLikeWkn(q), false, q)
})

test('ISIN check digits', () => {
  for (const ok of ['US0378331005', 'DE0007164600', 'DE000BASF111', 'NL0000235190', 'DE0007664039']) assert.ok(isinValid(ok), ok)
  assert.equal(isinValid('US0378331006'), false)
  // A broken Wikidata entry (XPEV) must not pass.
  assert.equal(isinValid('NET000AXPEN7'), false)
})

test('US ISIN from a CUSIP', () => {
  assert.equal(isinFromCusip('037833100'), 'US0378331005')
  assert.equal(isinFromCusip('67066G104'), 'US67066G1040')
  assert.equal(isinFromCusip('03783310'), undefined)
  assert.equal(isinFromCusip(null), undefined)
})

test('WKN from a German ISIN only', () => {
  assert.equal(wknOf('DE0007164600'), '716460')
  assert.equal(wknOf('DE000BASF111'), 'BASF11')
  assert.equal(wknOf('US0378331005'), undefined)
})

test('Xetra list: mnemonic to ISIN and WKN, share classes apart', () => {
  const csv = [
    'Market:;XETR',
    'Date Last Update:;08.11.2026',
    'Product Status;Instrument Status;Instrument;ISIN;Product ID;Instrument ID;WKN;Mnemonic',
    'Active;Active;VOLKSWAGEN AG VZO O.N.;DE0007664039;1;2;000766403;VOW3',
    'Active;Active;VOLKSWAGEN AG ST O.N.;DE0007664005;1;3;000766400;VOW',
    'Active;Active;APPLE INC.;US0378331005;1;4;000865985;APC',
    'Active;Active;BROKEN;XX123;1;5;000000000;BRK',
    ''
  ].join('\r\n')
  const m = parseXetra(csv)
  assert.deepEqual(m.get('VOW3'), { isin: 'DE0007664039', wkn: '766403' })
  assert.deepEqual(m.get('VOW'), { isin: 'DE0007664005', wkn: '766400' })
  assert.deepEqual(m.get('APC'), { isin: 'US0378331005', wkn: '865985' })
  assert.equal(m.has('BRK'), false)
})

test('Xetra file path from the download page, never another host', () => {
  const html =
    '<a href="/resource/blob/1530/aa11/data/t7-xfra-BF-allTradableInstruments.csv">FRA</a>' +
    '<a href="/resource/blob/1528/0123abcd/data/t7-xetr-allTradableInstruments.csv">XETR</a>'
  assert.equal(xetraPath(html), '/resource/blob/1528/0123abcd/data/t7-xetr-allTradableInstruments.csv')
  assert.equal(xetraPath('<a href="https://evil.example/t7-xetr-allTradableInstruments.csv">'), undefined)
  assert.equal(xetraPath(''), undefined)
})

test('Wikidata: show an ISIN only when exactly one fits', () => {
  assert.equal(pickIsin(['NL0000235190', 'NL0000235190'], 'PA'), 'NL0000235190')
  // Two share classes on one item: unknown which one the ticker is.
  assert.equal(pickIsin(['DE0007664005', 'DE0007664039'], 'DE'), undefined)
  // On a US exchange the home ISIN of an ADR's company is not the ADR's.
  assert.equal(pickIsin(['DE0007164600'], ''), undefined)
  // Elsewhere the ADR's US ISIN next to the home one is left out; a US company keeps its US ISIN.
  assert.equal(pickIsin(['CH0038863350', 'US6410694060'], 'SW'), 'CH0038863350')
  assert.equal(pickIsin(['US0378331005'], 'L'), 'US0378331005')
  assert.equal(pickIsin(['NET000AXPEN7'], ''), undefined)
  assert.equal(pickIsin([], 'PA'), undefined)
})
