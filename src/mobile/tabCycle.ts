/** What a tap on the tab button does: with one tab it opens a new one, otherwise it moves on to the next (in a circle). */
export function nextTabAction(tabIds: string[], active: string): { kind: 'add' } | { kind: 'select'; id: string } {
  if (tabIds.length <= 1) return { kind: 'add' }
  return { kind: 'select', id: tabIds[(tabIds.indexOf(active) + 1) % tabIds.length] }
}
