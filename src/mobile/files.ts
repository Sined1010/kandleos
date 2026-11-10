import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import type { Files } from './storeFile'

const at = { directory: Directory.Data }

/** The app's private data folder (Android: /data/data/<app>/files). */
export const appFiles: Files = {
  read: (path) =>
    Filesystem.readFile({ path, ...at, encoding: Encoding.UTF8 }).then(
      (r) => r.data as string,
      () => null
    ),
  write: async (path, data) => {
    await Filesystem.writeFile({ path, data, ...at, encoding: Encoding.UTF8, recursive: true })
  },
  rename: async (from, to) => {
    // Replacing in one step first: deleting before would leave only the temp file between the two steps. Some
    // platforms refuse to rename onto an existing file; then delete and retry (the finished temp file survives).
    try {
      await Filesystem.rename({ from, to, ...at, toDirectory: Directory.Data })
    } catch {
      await Filesystem.deleteFile({ path: to, ...at }).catch(() => {})
      await Filesystem.rename({ from, to, ...at, toDirectory: Directory.Data })
    }
  },
  remove: async (path) => {
    await Filesystem.deleteFile({ path, ...at })
  }
}
