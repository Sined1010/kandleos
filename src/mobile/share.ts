import { Directory, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'

/** The chart as a picture for Android's share menu: all chart canvases inside `root`, drawn at their places. */
export async function shareChart(root: HTMLElement, title: string): Promise<void> {
  const box = root.getBoundingClientRect()
  const dpr = window.devicePixelRatio || 1
  const out = document.createElement('canvas')
  out.width = Math.round(box.width * dpr)
  out.height = Math.round(box.height * dpr)
  const ctx = out.getContext('2d')!
  ctx.fillStyle = '#0a0c16'
  ctx.fillRect(0, 0, out.width, out.height)
  for (const c of root.querySelectorAll('canvas')) {
    const r = c.getBoundingClientRect()
    if (!r.width || !r.height) continue
    ctx.drawImage(c, (r.left - box.left) * dpr, (r.top - box.top) * dpr, r.width * dpr, r.height * dpr)
  }
  const data = out.toDataURL('image/png').split(',')[1]
  const { uri } = await Filesystem.writeFile({ path: 'kandleos-chart.png', data, directory: Directory.Cache })
  await Share.share({ title, files: [uri] })
}
