/** True in the Android build (vite.mobile.config.ts builds with mode 'mobile'); the desktop renderer never is. */
export const IS_MOBILE = import.meta.env.MODE === 'mobile'
