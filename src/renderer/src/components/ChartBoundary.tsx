import { Component, type ReactNode } from 'react'
import { t } from '../../../shared/i18n'
import { useStore } from '../store/useStore'

/**
 * Keeps one broken piece of data (say a drawing from the paired device) from blanking the whole window: the chart
 * shows a note instead and tries again once symbol, candle size or drawings change, or on the button.
 */
export default class ChartBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }
  private unsubscribe = () => {}

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidMount() {
    this.unsubscribe = useStore.subscribe((s, prev) => {
      if (this.state.error && (s.symbol !== prev.symbol || s.timeframe !== prev.timeframe || s.drawings !== prev.drawings)) this.setState({ error: null })
    })
  }

  componentWillUnmount() {
    this.unsubscribe()
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div role="alert" className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-muted">
        <p>{t('Der Chart konnte nicht angezeigt werden.')}</p>
        <p className="max-w-md break-words text-xs">{this.state.error.message}</p>
        <button className="rounded-lg px-3 py-1.5 text-slate-200 ring-1 ring-line hover:bg-white/5" onClick={() => this.setState({ error: null })}>
          {t('Erneut versuchen')}
        </button>
      </div>
    )
  }
}
