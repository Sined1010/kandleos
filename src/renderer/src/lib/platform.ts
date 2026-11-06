/** True in the Android build (vite.mobile.config.ts builds with mode 'mobile'); the desktop renderer never is. */
export const IS_MOBILE = import.meta.env.MODE === 'mobile'

/** Side panels (analysis, forecast quality): beside the chart on the PC, the whole screen on the phone. */
export const SIDE_PANEL = IS_MOBILE
  ? 'mobile-page fixed inset-0 z-50 w-full bg-bg pt-[max(env(safe-area-inset-top),var(--safe-area-inset-top,0px))] pb-[max(env(safe-area-inset-bottom),var(--safe-area-inset-bottom,0px))]'
  : 'absolute inset-y-0 right-0 z-20 w-[400px] border-l border-line bg-panel/95 shadow-2xl shadow-black/50 backdrop-blur'
/** The close button of a side panel; on the phone a 48 dp tap target. */
export const PANEL_CLOSE = IS_MOBILE ? 'mobile-icon -mr-2 ml-auto text-muted' : 'ml-auto rounded p-1 text-muted hover:bg-line hover:text-white'

/** Dialogs the phone shows as a whole page instead of a centred window (mobile.css sizes text and controls). */
export const PAGE = IS_MOBILE
  ? {
      backdrop: 'fixed inset-0 z-50 bg-bg',
      dialog: 'mobile-page h-full w-full overflow-y-auto bg-bg px-5 text-sm leading-relaxed text-slate-300',
      head: 'sticky top-0 z-10 -mx-5 mb-3 border-b border-line bg-bg px-5 pb-3 pt-[max(env(safe-area-inset-top),var(--safe-area-inset-top,0px),12px)]',
      foot: 'sticky bottom-0 -mx-5 mt-6 flex flex-col gap-2 border-t border-line bg-bg px-5 pt-3 pb-[max(env(safe-area-inset-bottom),var(--safe-area-inset-bottom,0px),12px)]',
      button: 'h-12 w-full rounded-xl text-base'
    }
  : null
