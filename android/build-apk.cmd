@echo off
rem Builds the Android app (debug APK) from the current sources. Needs JDK 21 and the Android SDK
rem (ANDROID_HOME or android\local.properties with sdk.dir).
cd /d "%~dp0.."
call npm.cmd run android:sync || exit /b 1
cd android
call .\gradlew.bat assembleDebug || exit /b 1
echo.
echo APK: %CD%\app\build\outputs\apk\debug\app-debug.apk
