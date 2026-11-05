// Android's back gesture closes what is open, newest first (menu → drawing → sheet), and only then the app.

const layers: { id: string; close: () => void }[] = []

/** Registers an open layer; the returned function removes it (call it when the layer closes by itself). */
export function pushBack(id: string, close: () => void): () => void {
  const i = layers.findIndex((l) => l.id === id)
  if (i >= 0) layers.splice(i, 1)
  const layer = { id, close }
  layers.push(layer)
  return () => {
    const j = layers.indexOf(layer)
    if (j >= 0) layers.splice(j, 1)
  }
}

/** Closes the top layer; false when nothing is open (then the app goes to the background). */
export function handleBack(): boolean {
  const top = layers.pop()
  if (!top) return false
  top.close()
  return true
}
