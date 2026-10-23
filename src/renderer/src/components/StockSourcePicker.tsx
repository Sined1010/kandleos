import { Check } from 'lucide-react'
import { useEffect, useState } from 'react'
import { t } from '../../../shared/i18n'
import type { StockSource } from '../../../shared/types'
import { useStore } from '../store/useStore'

/** State of the stock source choice, shared by the first-start window and the settings. */
export function useSourceForm() {
  const current = useStore((s) => s.stockSource)
  const [source, setSource] = useState<StockSource | null>(current)
  const [extra, setExtra] = useState(useStore.getState().yahooExtra)
  const [ack, setAck] = useState(current === 'yahoo')
  const [id, setId] = useState('')
  const [secret, setSecret] = useState('')
  // Whether Alpaca keys are already stored (the keys themselves never come back from main).
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    window.api.alpacaHasKeys().then(setSaved)
  }, [])

  const newKeys = !!(id.trim() && secret.trim())
  /** Only one of the two Alpaca fields filled in. */
  const halfKeys = !newKeys && !!(id.trim() || secret.trim())
  const readyFor = (s: StockSource | null, acknowledged = ack) =>
    s === 'none' || (s === 'yahoo' && acknowledged) || (s === 'alpaca' && (saved || newKeys))
  const ready = readyFor(source)
  /** What is still missing before the choice can be saved; shown next to the disabled button. */
  const missing = ready
    ? null
    : source === 'alpaca'
      ? halfKeys
        ? t('Bitte beide Alpaca-Keys eintragen.')
        : t('Beide Alpaca-Keys eintragen oder eine andere Quelle wählen.')
      : source === 'yahoo'
        ? t('Bitte bestätigen, dass du Yahoo Finance nur privat nutzt.')
        : t('Bitte zuerst auswählen, welche Kurse du sehen möchtest.')

  /**
   * Checks newly entered Alpaca keys, then stores the choice (by default the selected one; the first-start
   * window passes its own). False if something is missing or the keys were rejected.
   */
  const apply = async (choice = source, acknowledged = ack): Promise<boolean> => {
    if (!readyFor(choice, acknowledged) || !choice) return false
    setError('')
    if (choice === 'alpaca' && newKeys) {
      setBusy(true)
      const err = await window.api.alpacaSetKeys(id, secret)
      setBusy(false)
      if (err) {
        setError(err)
        return false
      }
      setSaved(true)
      setId('')
      setSecret('')
    }
    useStore.getState().setStockSource(choice, extra)
    return true
  }
  const removeKeys = async () => {
    await window.api.alpacaSetKeys('', '')
    setSaved(false)
  }
  return {
    source,
    setSource,
    extra,
    setExtra,
    ack,
    setAck,
    id,
    setId,
    secret,
    setSecret,
    saved,
    newKeys,
    halfKeys,
    removeKeys,
    error,
    busy,
    ready,
    missing,
    apply
  }
}

type Form = ReturnType<typeof useSourceForm>

const input = 'w-full rounded-lg bg-bg px-2 py-1.5 outline-none ring-1 ring-line focus:ring-accent'
const link = 'text-accent hover:underline'

/** Key ID and secret for Alpaca, with the sign-up link; used in the first-start window and the settings. */
export function AlpacaKeyFields({ form }: { form: Form }) {
  return (
    <div className="space-y-1.5">
      {/* First, so users who also want markets outside the US see it before the key fields. Ticking it is the
          private-use confirmation for Yahoo, as with Yahoo as the only source. */}
      <label className="flex cursor-pointer items-start gap-2 pb-1">
        <input
          type="checkbox"
          checked={form.extra}
          onChange={(e) => form.setExtra(e.target.checked)}
          className="mt-0.5 accent-accent"
        />
        <span className="text-slate-200">
          {t('Auch Indizes, Rohstoffe und Aktien außerhalb der USA (z. B. DAX) über Yahoo Finance ergänzen. Ich nutze Yahoo Finance nur für private Zwecke; es gelten Yahoos Nutzungsbedingungen.')}{' '}
          <a href="https://legal.yahoo.com/" target="_blank" rel="noreferrer" className={link}>
            {t('Yahoos Nutzungsbedingungen')}
          </a>
        </span>
      </label>
      {form.saved && (
        <p className="flex items-center gap-1.5 text-up">
          <Check size={13} /> {t('Keys gespeichert')}
          <button type="button" onClick={form.removeKeys} className="ml-2 text-muted hover:text-down">
            {t('Keys entfernen')}
          </button>
        </p>
      )}
      <input
        value={form.id}
        onChange={(e) => form.setId(e.target.value)}
        placeholder={form.saved ? t('API-Key-ID (neu eingeben zum Ersetzen)') : t('API-Key-ID')}
        spellCheck={false}
        aria-label={t('API-Key-ID')}
        className={input}
      />
      <input
        type="password"
        value={form.secret}
        onChange={(e) => form.setSecret(e.target.value)}
        placeholder={t('Secret Key')}
        spellCheck={false}
        aria-label={t('Secret Key')}
        className={input}
      />
      <p className="text-muted">
        {t('Kostenlos registrieren und unter „API Keys“ ein Key-Paar erstellen; ein Testkonto (Paper Trading) ohne Geld genügt:')}{' '}
        <a href="https://app.alpaca.markets/signup" target="_blank" rel="noreferrer" className={link}>
          app.alpaca.markets
        </a>
        . {t('Die Keys werden verschlüsselt auf diesem Rechner gespeichert (unter Linux nur mit gnome-keyring oder KWallet).')}
      </p>
    </div>
  )
}

/** Settings: Alpaca (own free key), Yahoo Finance (private use, acknowledged) or crypto only. */
export default function StockSourcePicker({ form }: { form: Form }) {
  const option = (value: StockSource, title: string, badge: string | null, text: string, extra?: React.ReactNode) => {
    const on = form.source === value
    return (
      <div className={`rounded-lg p-2.5 ring-1 transition ${on ? 'bg-bg ring-accent' : 'ring-line hover:ring-muted'}`}>
        <label className="flex cursor-pointer items-start gap-2">
          <input
            type="radio"
            name="stock-source"
            checked={on}
            onChange={() => form.setSource(value)}
            className="mt-0.5 accent-accent"
          />
          <span>
            <span className="font-medium text-white">{title}</span>
            {badge && <span className="ml-2 rounded bg-brand px-1.5 py-0.5 text-[10px] font-semibold text-white">{badge}</span>}
            <span className="mt-0.5 block text-muted">{text}</span>
          </span>
        </label>
        {on && extra && <div className="mt-2 pl-6">{extra}</div>}
      </div>
    )
  }

  return (
    <div className="space-y-2 text-xs leading-relaxed">
      {option(
        'alpaca',
        t('Aktien über Alpaca'),
        t('empfohlen für US-Werte'),
        t('Nur US-Aktien und ETFs, in Echtzeit von der Börse IEX. Offizielle Schnittstelle; ein kostenloses Alpaca-Konto ist nötig.'),
        <AlpacaKeyFields form={form} />
      )}
      {option(
        'yahoo',
        t('Aktien über Yahoo Finance'),
        null,
        t('Aktien, Indizes und Rohstoffe weltweit, sofort ohne Anmeldung. KandleOS fragt die Kurse alle 15 Sekunden bei Yahoo ab; je nach Börse sind sie verzögert (meist 15 Minuten).'),
        <label className="flex cursor-pointer items-start gap-2">
          <input
            type="checkbox"
            checked={form.ack}
            onChange={(e) => form.setAck(e.target.checked)}
            className="mt-0.5 accent-accent"
          />
          <span className="text-slate-200">
            {t('Ich nutze Yahoo Finance nur für private Zwecke. Es gelten Yahoos Nutzungsbedingungen; KandleOS steht in keiner Verbindung zu Yahoo.')}{' '}
            <a href="https://legal.yahoo.com/" target="_blank" rel="noreferrer" className={link}>
              {t('Yahoos Nutzungsbedingungen')}
            </a>
          </span>
        </label>
      )}
      {option(
        'none',
        t('Nur Krypto'),
        null,
        t('Kryptokurse von Binance, ohne Anmeldung. Aktien lassen sich jederzeit dazunehmen.')
      )}
      {form.error && <p className="text-down">{form.error}</p>}
    </div>
  )
}
