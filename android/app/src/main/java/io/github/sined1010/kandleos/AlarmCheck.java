package io.github.sined1010.kandleos;

import java.util.List;

/** Same rule as src/shared/alarms.ts hit(): keep both in step. Times in seconds. */
public final class AlarmCheck {
    private AlarmCheck() {}

    /** A bar: start time, high, low. */
    public static final class Bar {
        public final long time;
        public final double high, low;

        public Bar(long time, double high, double low) {
            this.time = time;
            this.high = high;
            this.low = low;
        }
    }

    /**
     * Start time of the first bar at or after {@code from} that reached {@code price}
     * (high for "above", low for "below"), or -1. An alarm that already went off never fires again.
     */
    public static long hit(String op, double price, long from, boolean triggered, List<Bar> bars) {
        if (triggered) return -1;
        for (Bar b : bars) {
            if (b.time < from) continue;
            if ("above".equals(op) ? b.high >= price : b.low <= price) return b.time;
        }
        return -1;
    }
}
