package io.github.sined1010.kandleos;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertSame;
import static org.junit.Assert.fail;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

import org.junit.Test;

/** Mirrors the per-run bar loads in src/renderer/src/lib/alarmCore.ts (catchUp). */
public class BarCacheTest {
    private final List<String> asked = new ArrayList<>();

    @Test
    public void barsOfOneSymbolAndStartAreFetchedOncePerPass() throws Exception {
        List<AlarmCheck.Bar> bars = Collections.singletonList(new AlarmCheck.Bar(300, 2, 1));
        BarCache cache = new BarCache((source, symbol, from) -> {
            asked.add(source + "|" + symbol + "|" + from);
            return bars;
        });
        assertSame(bars, cache.bars("yahoo", "AAPL", 300));
        assertSame(bars, cache.bars("yahoo", "AAPL", 300));
        cache.bars("yahoo", "AAPL", 600);
        cache.bars("binance", "AAPL", 300);
        assertEquals(List.of("yahoo|AAPL|300", "yahoo|AAPL|600", "binance|AAPL|300"), asked);
    }

    @Test
    public void aFailedFetchFailsForTheOtherAlarmsWithoutAskingAgain() {
        BarCache cache = new BarCache((source, symbol, from) -> {
            asked.add(symbol);
            throw new Exception("HTTP 429");
        });
        for (int i = 0; i < 2; i++) {
            try {
                cache.bars("yahoo", "AAPL", 300);
                fail("expected the fetch error");
            } catch (Exception e) {
                assertEquals("HTTP 429", e.getMessage());
            }
        }
        assertEquals(List.of("AAPL"), asked);
    }
}
