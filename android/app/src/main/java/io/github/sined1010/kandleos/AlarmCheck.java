package io.github.sined1010.kandleos;

import java.text.NumberFormat;
import java.util.List;
import java.util.Locale;

/**
 * Same rules as src/shared/alarms.ts hit() and src/shared/lineAlarm.ts linePrice(): keep both in step. Times in
 * seconds. A line alarm comes with a table of points (the app works out where the line runs); this only reads it.
 */
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

    /** Price of the line table at {@code t}, straight between points; NaN outside the table. */
    public static double linePrice(long[] kt, double[] kp, long t) {
        if (kt.length == 0 || t < kt[0] || t > kt[kt.length - 1]) return Double.NaN;
        for (int i = 1; i < kt.length; i++) {
            if (t <= kt[i]) {
                if (kt[i] == kt[i - 1]) return kp[i];
                return kp[i - 1] + (kp[i] - kp[i - 1]) * (t - kt[i - 1]) / (double) (kt[i] - kt[i - 1]);
            }
        }
        return kp[0];
    }

    /** Like {@link #hit}, but against the line where it is at each bar; bars outside the table do not count. */
    public static long hitLine(String op, long from, List<Bar> bars, long[] kt, double[] kp) {
        for (Bar b : bars) {
            if (b.time < from) continue;
            double price = linePrice(kt, kp, b.time);
            if (Double.isNaN(price)) continue;
            if ("above".equals(op) ? b.high >= price : b.low <= price) return b.time;
        }
        return -1;
    }

    /** Price with the app's decimals (src/renderer/src/lib/format.ts formatPrice). */
    public static String formatPrice(double p, Locale locale) {
        NumberFormat f = NumberFormat.getNumberInstance(locale);
        f.setMinimumFractionDigits(2);
        f.setMaximumFractionDigits(p < 1 ? 6 : p < 10 ? 4 : 2);
        return f.format(p);
    }
}
