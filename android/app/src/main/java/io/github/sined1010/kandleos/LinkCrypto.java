package io.github.sined1010.kandleos;

import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Base64;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

/**
 * The link envelope of src/shared/link.ts for the background check: AES-256-GCM, 12-byte nonce, 128-bit tag,
 * "<dir>:<device>" as additional data, everything base64url without padding. Plain strings in and out, so it
 * runs in a JVM unit test without Android's JSON.
 */
public final class LinkCrypto {
    private static final SecureRandom RANDOM = new SecureRandom();

    private LinkCrypto() {}

    public static byte[] fromB64url(String s) {
        return Base64.getUrlDecoder().decode(s);
    }

    static String toB64url(byte[] b) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(b);
    }

    /** Returns { n, c }: nonce and ciphertext with tag. */
    public static String[] seal(byte[] key, String device, String body, String dir) throws Exception {
        byte[] iv = new byte[12];
        RANDOM.nextBytes(iv);
        Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
        c.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(key, "AES"), new GCMParameterSpec(128, iv));
        c.updateAAD((dir + ":" + device).getBytes(StandardCharsets.UTF_8));
        return new String[] {toB64url(iv), toB64url(c.doFinal(body.getBytes(StandardCharsets.UTF_8)))};
    }

    /** The body, or null when it was not sealed with this key, for this device and direction. */
    public static String open(byte[] key, String device, String n, String ct, String dir) {
        try {
            byte[] iv = fromB64url(n);
            if (iv.length != 12) return null;
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.DECRYPT_MODE, new SecretKeySpec(key, "AES"), new GCMParameterSpec(128, iv));
            c.updateAAD((dir + ":" + device).getBytes(StandardCharsets.UTF_8));
            return new String(c.doFinal(fromB64url(ct)), StandardCharsets.UTF_8);
        } catch (Exception e) {
            return null;
        }
    }
}
