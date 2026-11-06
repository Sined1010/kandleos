package io.github.sined1010.kandleos;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import org.junit.Test;

/** The background check must read and write exactly the envelope of src/shared/link.ts. */
public class LinkCryptoTest {
    // Key 0, 1, … 31; the envelope was sealed by sealEnvelope() in src/shared/link.ts (device dev-1, direction res,
    // body {"ctr":5,"res":{"running":null}}).
    private static final byte[] KEY = LinkCrypto.fromB64url("AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8");
    private static final String N = "a8IZp7uxQNIm_IY5";
    private static final String C = "Mbtb_-jXy0HI_px7ZUs5KnAmesaXwoFk4-TLEzPjJuwzrkljebO1QstiIv9BfL7M";

    @Test
    public void opensAnEnvelopeSealedInJavaScript() {
        assertEquals("{\"ctr\":5,\"res\":{\"running\":null}}", LinkCrypto.open(KEY, "dev-1", N, C, "res"));
    }

    @Test
    public void sealThenOpenGivesTheSameBody() throws Exception {
        String[] nc = LinkCrypto.seal(KEY, "dev-1", "{\"ctr\":9,\"op\":\"agents.job\"}", "req");
        assertEquals(16, nc[0].length());
        assertEquals("{\"ctr\":9,\"op\":\"agents.job\"}", LinkCrypto.open(KEY, "dev-1", nc[0], nc[1], "req"));
    }

    @Test
    public void wrongDirectionDeviceOrKeyOpensNothing() {
        assertNull(LinkCrypto.open(KEY, "dev-1", N, C, "req"));
        assertNull(LinkCrypto.open(KEY, "dev-2", N, C, "res"));
        assertNull(LinkCrypto.open(new byte[32], "dev-1", N, C, "res"));
        assertNull(LinkCrypto.open(KEY, "dev-1", "kaputt", C, "res"));
    }
}
