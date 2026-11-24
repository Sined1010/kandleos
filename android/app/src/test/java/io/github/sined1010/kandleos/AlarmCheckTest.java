package io.github.sined1010.kandleos;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import java.util.Arrays;
import java.util.List;
import java.util.Locale;

import org.junit.Test;

/** Mirrors src/shared/alarms.test.ts (hit) and src/shared/lineAlarm.test.ts (linePrice). */
public class AlarmCheckTest {
    private final List<AlarmCheck.Bar> bars = Arrays.asList(
            new AlarmCheck.Bar(200, 229, 225),
            new AlarmCheck.Bar(300, 231, 226),
            new AlarmCheck.Bar(400, 235, 230));

    @Test
    public void firstBarThatReachedThePrice() {
        assertEquals(300, AlarmCheck.hit("above", 230, 100, false, bars));
        assertEquals(200, AlarmCheck.hit("below", 225.5, 100, false, bars));
    }

    @Test
    public void barsBeforeTheLastCheckDoNotCount() {
        assertEquals(-1, AlarmCheck.hit("above", 230, 450, false, bars));
        assertEquals(400, AlarmCheck.hit("above", 230, 301, false, bars));
    }

    @Test
    public void alreadyTriggeredFiresNothing() {
        assertEquals(-1, AlarmCheck.hit("above", 230, 100, true, bars));
    }

    // 210 at 100, 220 at 1100: +1 per 100 s.
    private final long[] kt = {100, 1100};
    private final double[] kp = {210, 220};

    @Test
    public void linePriceIsStraightBetweenPointsAndNothingOutside() {
        assertEquals(214, AlarmCheck.linePrice(kt, kp, 500), 1e-9);
        assertTrue(Double.isNaN(AlarmCheck.linePrice(kt, kp, 99)));
        assertTrue(Double.isNaN(AlarmCheck.linePrice(kt, kp, 1101)));
    }

    @Test
    public void lineAlarmFiresWhereTheLineIsAtThatBar() {
        List<AlarmCheck.Bar> b = Arrays.asList(
                new AlarmCheck.Bar(200, 210.5, 209),
                new AlarmCheck.Bar(500, 214.2, 212),
                new AlarmCheck.Bar(2000, 300, 100));
        assertEquals(500, AlarmCheck.hitLine("above", 100, b, kt, kp));
        assertEquals(-1, AlarmCheck.hitLine("above", 600, b, kt, kp));
        assertEquals(300, AlarmCheck.hitLine("below", 100, Arrays.asList(new AlarmCheck.Bar(300, 216, 211.9)), kt, kp));
    }

    @Test
    public void pricesHaveTheAppsDecimals() {
        assertEquals("232.70", AlarmCheck.formatPrice(232.7, Locale.US));
        assertEquals("0.123457", AlarmCheck.formatPrice(0.12345678, Locale.US));
        assertEquals("5.1234", AlarmCheck.formatPrice(5.12341, Locale.US));
    }
}
