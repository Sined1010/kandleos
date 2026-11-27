package io.github.sined1010.kandleos;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Bars per source, symbol and start, fetched once in one pass (src/renderer/src/lib/alarmCore.ts catchUp does the
 * same): alarms on one symbol line up their starts once a pass has seen a bar after all of them, so they share one
 * request instead of asking the source once each; armed while the market is closed they line up at its next session.
 * A failed fetch stays failed for this pass.
 */
final class BarCache {
    interface Fetch {
        List<AlarmCheck.Bar> bars(String source, String symbol, long from) throws Exception;
    }

    private final Fetch fetch;
    private final Map<String, Object> got = new HashMap<>();

    BarCache(Fetch fetch) {
        this.fetch = fetch;
    }

    @SuppressWarnings("unchecked")
    List<AlarmCheck.Bar> bars(String source, String symbol, long from) throws Exception {
        String key = source + "|" + symbol + "|" + from;
        if (!got.containsKey(key)) {
            try {
                got.put(key, fetch.bars(source, symbol, from));
            } catch (Exception e) {
                got.put(key, e);
            }
        }
        Object v = got.get(key);
        if (v instanceof Exception) throw (Exception) v;
        return (List<AlarmCheck.Bar>) v;
    }
}
