package io.github.sined1010.kandleos;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.time.Instant;

import org.junit.Test;

/** Alpaca's bars for the background check keep the regular session only, as the app does (alpaca.ts). */
public class AlarmFetchTest {
    private static long at(String iso) {
        return Instant.parse(iso).getEpochSecond();
    }

    @Test
    public void regularSessionInNewYorkTime() {
        // Thursday 2026-11-12, New York is UTC-5: 9:30 = 14:30 UTC, 16:00 = 21:00 UTC.
        assertFalse(AlarmFetch.regularUs(at("2026-11-12T14:25:00Z")));
        assertTrue(AlarmFetch.regularUs(at("2026-11-12T14:30:00Z")));
        assertTrue(AlarmFetch.regularUs(at("2026-11-12T20:55:00Z")));
        assertFalse(AlarmFetch.regularUs(at("2026-11-12T21:00:00Z")));
        // Summer time (UTC-4): 9:30 = 13:30 UTC.
        assertTrue(AlarmFetch.regularUs(at("2026-07-09T13:30:00Z")));
        // Saturday.
        assertFalse(AlarmFetch.regularUs(at("2026-11-14T15:00:00Z")));
    }
}
