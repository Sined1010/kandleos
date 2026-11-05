package io.github.sined1010.kandleos;

import static org.junit.Assert.assertEquals;

import java.util.Arrays;
import java.util.List;

import org.junit.Test;

/** Mirrors src/shared/alarms.test.ts (hit). */
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
}
