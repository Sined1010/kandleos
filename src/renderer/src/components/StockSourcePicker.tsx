import { Check } from 'lucide-react'
import { useEffect, useState } from 'react'
import { t } from '../../../shared/i18n'
import type { StockSource } from '../../../shared/types'
import { useStore } from '../store/useStore'

/** State of the stock source choice, shared by the first-start window and the settings. */
export function useSourceForm() {
  const current = useStore((s) => s.stockSource)
  const [source, setSource] = useState<StockSource | null>(current)
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
  const ready =
    source === 'none' || (source === 'yahoo' && ack) || (source === 'alpaca' && (saved || newKeys))

  /** Checks newly entered Alpaca keys, then stores the choice; false if the keys were rejected. */
  const apply = async (): Promise<boolean> => {
    if (!ready || !source) return false
    setError('')
    if (source === 'alpaca' && newKeys) {
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
    useStore.getState().setStockSource(source)
    return true
  }
  const removeKeys = async () => {
    await window.api.alpacaSetKeys('', '')
    setSaved(false)
  }
  return { source, setSource, ack, setAck, id, setId, secret, setSecret, saved, removeKeys, error, busy, ready, apply }
}

type Form = ReturnType<typeof useSourceForm>

/** Choice between Alpaca (own free key), Yahoo Finance (unofficial, explicit opt-in) and crypto only. */
export default function StockSourcePicker({ form }: { form: Form }) {
  const input = 'w-full rounded-lg bg-bg px-2 py-1.5 outline-none ring-1 ring-line focus:ring-accent'
  const link = 'text-accent hover:underline'
  const option = (value: StockSource, title: string, badge: string | null, text: string, extra?: React.ReactNode) => {
    const on = form.source === value
    return (
      <div
        className={`rounded-lg p-2.5 ring-1 transition ${on ? 'bg-bg ring-accent' : 'ring-line hover:ring-muted'}`}
      >
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
        'Alpaca',
        t('empfohlen'),
        t('US-Aktien und ETFs, Echtzeit von der Börse IEX. Offizielle Schnittstelle, kostenloser eigener API-Key nötig.'),
        <div className="space-y-1.5">
          {form.saved && (
            <p className="flex items-center gap-1.5 text-up">
              <Check size={13} /> {t('Keys gespeichert')}
              <button type="button" onClick={form.removeKeys} className="ml-2 text-muted hover:text-down">
                {t('Key entfernen')}
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
            {t('Kostenlos registrieren, dann unter „API Keys“ ein Schlüsselpaar erstellen (ein Paper-Konto genügt):')}{' '}
            <a href="https://app.alpaca.markets/signup" target="_blank" rel="noreferrer" className={link}>
              app.alpaca.markets
            </a>
            . {t('Die Keys werden verschlüsselt auf diesem Rechner gespeichert.')}
          </p>
        </div>
      )}
      {option(
        'yahoo',
        t('Yahoo Finance (inoffiziell)'),
        null,
        t('Aktien weltweit, Indizes und Rohstoffe, ohne Registrierung, etwa 15 Sekunden verzögert. Yahoo bietet dafür keine offizielle Schnittstelle; die Nutzung kann gegen Yahoos Nutzungsbedingungen verstoßen und jederzeit aufhören zu funktionieren.'),
        <label className="flex cursor-pointer items-start gap-2">
          <input
            type="checkbox"
            checked={form.ack}
            onChange={(e) => form.setAck(e.target.checked)}
            className="mt-0.5 accent-accent"
          />
          <span className="text-slate-200">
            {t('Ich nutze Yahoo Finance nur privat und auf eigene Verantwortung. KandleOS ist nicht mit Yahoo verbunden.')}{' '}
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
        t('Kryptokurse von Binance, ohne Registrierung. Aktien lassen sich später in den Einstellungen hinzufügen.')
      )}
      {form.error && <p className="text-down">{form.error}</p>}
    </div>
  )
}
