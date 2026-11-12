import { create } from 'zustand'

/**
 * The phone's view of its paired PC (src/mobile/link.ts keeps it current); shared components read it to grey out
 * what needs the PC. syncFailed: the PC answered, but the last sync did not go through (it is not off); 'format': the
 * two apps store different things (shared/sync.ts SYNC_FORMAT), one needs an update.
 */
export const usePcStatus = create<{ state: 'none' | 'online' | 'offline'; pcName: string; lastSeen: number | null; syncFailed: boolean | 'format' }>(() => ({
  state: 'none',
  pcName: '',
  lastSeen: null,
  syncFailed: false
}))
