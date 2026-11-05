import { registerPlugin, WebPlugin } from '@capacitor/core'
import type { NativeTrigger } from '../shared/alarms'
import type { AlarmSource } from './alarmPlan'

// Our own Android plugin (android/app/src/main/java/.../KandleNativePlugin.java).
export interface KandleNativePlugin {
  secureGet(o: { name: string }): Promise<{ value: string | null }>
  secureSet(o: { name: string; value: string }): Promise<void>
  secureRemove(o: { name: string }): Promise<void>
  /** Android notification; the same id replaces an older one. */
  showNotification(o: { id: number; title: string; body: string }): Promise<void>
  cancelNotification(o: { id: number }): Promise<void>
  /** Asks for the notification permission once (Android 13+). */
  requestNotify(): Promise<{ granted: boolean }>
  /** Hands the armed alarms (with their source) to the background check; empty stops it. */
  setAlarms(o: { alarms: NativeAlarm[]; instant: boolean }): Promise<void>
  /** Triggers the background check found since the last call. */
  takeTriggered(): Promise<{ list: NativeTrigger[] }>
}
export type NativeAlarm = { id: string; symbol: string; title: string; op: 'above' | 'below'; price: number; checkedUntil: number } & AlarmSource

/** Browser preview only (npm run dev:mobile): keys live in memory and are gone on reload — never in web storage. */
class KandleNativeWeb extends WebPlugin implements KandleNativePlugin {
  private keys = new Map<string, string>()
  async secureGet({ name }: { name: string }) {
    return { value: this.keys.get(name) ?? null }
  }
  async secureSet({ name, value }: { name: string; value: string }) {
    this.keys.set(name, value)
  }
  async secureRemove({ name }: { name: string }) {
    this.keys.delete(name)
  }
  async showNotification({ title, body }: { id: number; title: string; body: string }) {
    console.info('[notification]', title, body)
  }
  async cancelNotification() {}
  async requestNotify() {
    return { granted: true }
  }
  async setAlarms() {}
  async takeTriggered() {
    return { list: [] }
  }
}

export const KandleNative = registerPlugin<KandleNativePlugin>('KandleNative', { web: () => new KandleNativeWeb() })
