import { app } from 'electron'
import { join } from 'node:path'
import { createArchive, type ForecastArchive } from './archiveFile'

let instance: ForecastArchive | null = null

/** The forecast archive in the app data folder; created on first use, once the data folder is settled. */
export const archive = (): ForecastArchive => (instance ??= createArchive(join(app.getPath('userData'), 'forecasts')))
