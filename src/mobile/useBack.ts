import { useEffect, useRef } from 'react'
import { pushBack } from './backStack'

/** While `open`, Android's back gesture calls `close` (newest open layer first). */
export function useBack(id: string, open: boolean, close: () => void): void {
  const closeRef = useRef(close)
  closeRef.current = close
  useEffect(() => (open ? pushBack(id, () => closeRef.current()) : undefined), [id, open])
}
