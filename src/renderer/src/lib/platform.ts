/** True in the Android build (vite.mobile.config.ts builds with mode 'mobile'); the desktop renderer never is. */
export const IS_MOBILE = import.meta.env.MODE === 'mobile'

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
