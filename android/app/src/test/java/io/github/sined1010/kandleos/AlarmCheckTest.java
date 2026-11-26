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

    // Position boxes, mirroring src/shared/boxAlarm.test.ts (scanBox, pairWinner).
    private static long[] flat(double p) { return new long[] {0, 100_000}; }
    private static double[] flatP(double p) { return new double[] {p, p}; }

    @Test
    public void waitingBreakoutIgnoresTheStopUntilTheEntry() {
        // Long breakout: stop 58, entry 60, armed at 100 with the price at 55.
        List<AlarmCheck.Bar> early = Arrays.asList(new AlarmCheck.Bar(200, 57, 55), new AlarmCheck.Bar(300, 58.5, 57));
        long[] r = AlarmCheck.boxScan("below", 100, early, flat(58), flatP(58), 60, true, false, -1);
        assertEquals(-1, r[0]);
        assertEquals(-1, r[1]);
        List<AlarmCheck.Bar> later = Arrays.asList(new AlarmCheck.Bar(200, 57, 55), new AlarmCheck.Bar(300, 58.5, 57),
                new AlarmCheck.Bar(400, 60.2, 59), new AlarmCheck.Bar(500, 59, 57.9));
        r = AlarmCheck.boxScan("below", 100, later, flat(58), flatP(58), 60, true, false, -1);
        assertEquals(500, r[0]);
        assertEquals(400, r[1]);
    }

    @Test
    public void pairThatCountsAtOnceHitsWithoutTheEntry() {
        // Long: entry 53, target 56, armed with the price at 54.
        List<AlarmCheck.Bar> b = Arrays.asList(new AlarmCheck.Bar(200, 55, 54), new AlarmCheck.Bar(300, 56.1, 55));
        long[] r = AlarmCheck.boxScan("above", 100, b, flat(56), flatP(56), 53, false, false, -1);
        assertEquals(300, r[0]);
        assertEquals(-1, r[1]);
        // An entry already seen stays.
        assertEquals(150, AlarmCheck.boxScan("above", 100, b, flat(56), flatP(56), 53, false, false, 150)[1]);
    }

    @Test
    public void entryBarDoesNotCountTheNearSide() {
        // Breakout long: stop 58 lies between the arming price 55 and the entry 60.
        List<AlarmCheck.Bar> one = Arrays.asList(new AlarmCheck.Bar(200, 60.1, 57.5));
        long[] r = AlarmCheck.boxScan("below", 100, one, flat(58), flatP(58), 60, true, true, -1);
        assertEquals(-1, r[0]);
        assertEquals(200, r[1]);
        List<AlarmCheck.Bar> two = Arrays.asList(new AlarmCheck.Bar(200, 60.1, 57.5), new AlarmCheck.Bar(300, 59, 57.9));
        assertEquals(300, AlarmCheck.boxScan("below", 100, two, flat(58), flatP(58), 60, true, true, -1)[0]);
    }

    @Test
    public void storedEntryFromTheBarReadAgainKeepsItTheEntryBar() {
        // Checked up to 200 and the entry stored at 200 (the newest bar is read again).
        List<AlarmCheck.Bar> one = Arrays.asList(new AlarmCheck.Bar(200, 60.1, 57.5));
        long[] r = AlarmCheck.boxScan("below", 200, one, flat(58), flatP(58), 60, true, true, 200);
        assertEquals(-1, r[0]);
        assertEquals(200, r[1]);
        // An entry from inside a later bar (a live price at 250) does not open the bars before it.
        List<AlarmCheck.Bar> two = Arrays.asList(new AlarmCheck.Bar(150, 58.2, 55), new AlarmCheck.Bar(200, 60.1, 57.5));
        r = AlarmCheck.boxScan("below", 100, two, flat(58), flatP(58), 60, true, true, 250);
        assertEquals(-1, r[0]);
        assertEquals(200, r[1]);
    }

    @Test
    public void pairWinnerEarlierSideStopOnATie() {
        assertEquals(0, AlarmCheck.pairWinner(-1, -1));
        assertEquals(1, AlarmCheck.pairWinner(5, 7));
        assertEquals(1, AlarmCheck.pairWinner(7, -1));
        assertEquals(2, AlarmCheck.pairWinner(7, 7));
        assertEquals(2, AlarmCheck.pairWinner(-1, 3));
    }
    @Test
    public void entryTouchedAfterTheDecidingHitDoesNotCount() {
        // alarmCore.ts catchUpBox: the earliest entry of both sides, but only up to the winner's hit.
        assertEquals(-1, AlarmCheck.entryUntil(new long[] {-1, 30}, 20));
        assertEquals(15, AlarmCheck.entryUntil(new long[] {30, 15}, 20));
        assertEquals(20, AlarmCheck.entryUntil(new long[] {20, -1}, 20));
        assertEquals(-1, AlarmCheck.entryUntil(new long[] {-1, -1}, 20));
    }
}
