import AlarmList from '../renderer/src/components/AlarmList'
import { t } from '../shared/i18n'
import { notificationId } from './alarmWatch'
import { KandleNative } from './native'

/** The phone's alarm page: the shared list, plus the notification permission and clearing old notifications. */
export default function AlarmPage({ symbol }: { symbol: string }) {
  return (
    <AlarmList
      symbol={symbol}
      hint={t('Geprüft wird etwa alle 15 Minuten, auch bei geschlossener App; schneller mit „Sofort-Alarme“ in den Einstellungen.')}
      onAdded={async () => void (await KandleNative.requestNotify().catch(() => {}))}
      onForget={(id) => KandleNative.cancelNotification({ id: notificationId(id) }).catch(() => {})}
    />
  )
}
