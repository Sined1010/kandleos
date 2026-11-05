package io.github.sined1010.kandleos;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * API keys on the phone: AES-256-GCM with a key that never leaves the Android keystore; only the
 * ciphertext (IV + data, Base64) is kept in private SharedPreferences.
 */
public final class SecureStore {
    private static final String ALIAS = "kandleos_secure";
    private static final String PREFS = "kandleos_secure";
    private static final int IV_BYTES = 12;

    private final SharedPreferences prefs;

    public SecureStore(Context context) {
        prefs = context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static SecretKey key() throws Exception {
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
        ks.load(null);
        if (ks.containsAlias(ALIAS)) return ((KeyStore.SecretKeyEntry) ks.getEntry(ALIAS, null)).getSecretKey();
        KeyGenerator gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        gen.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build());
        return gen.generateKey();
    }

    public synchronized void set(String name, String value) throws Exception {
        Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
        c.init(Cipher.ENCRYPT_MODE, key());
        byte[] iv = c.getIV();
        byte[] data = c.doFinal(value.getBytes(StandardCharsets.UTF_8));
        byte[] out = new byte[iv.length + data.length];
        System.arraycopy(iv, 0, out, 0, iv.length);
        System.arraycopy(data, 0, out, iv.length, data.length);
        prefs.edit().putString(name, Base64.encodeToString(out, Base64.NO_WRAP)).commit();
    }

    /** null when nothing is stored or the entry cannot be decrypted (e.g. keystore reset). */
    public synchronized String get(String name) {
        String s = prefs.getString(name, null);
        if (s == null) return null;
        try {
            byte[] all = Base64.decode(s, Base64.NO_WRAP);
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, all, 0, IV_BYTES));
            return new String(c.doFinal(all, IV_BYTES, all.length - IV_BYTES), StandardCharsets.UTF_8);
        } catch (Exception e) {
            return null;
        }
    }

    public synchronized void remove(String name) {
        prefs.edit().remove(name).commit();
    }
}
