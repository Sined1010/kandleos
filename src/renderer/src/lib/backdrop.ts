type Press = { target: unknown; currentTarget: unknown }
// The backdrop the last press started on; kept outside the component so a re-render in between (an input's blur)
// does not lose it.
let pressed: unknown = null

/**
 * Props for a dialog's backdrop: it closes only when the press started and ended on the backdrop itself. A click
 * goes to the nearest common ancestor of press and release, so marking text in a field and letting go outside the
 * dialog would otherwise land on the backdrop and close it.
 */
export function backdropClose(onClose: () => void) {
  return {
    onMouseDown: (e: Press) => void (pressed = e.target === e.currentTarget ? e.currentTarget : null),
    onClick: (e: Press) => {
      if (pressed === e.currentTarget && e.target === e.currentTarget) onClose()
      pressed = null
    }
  }
}
