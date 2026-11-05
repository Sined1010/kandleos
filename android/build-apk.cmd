@echo off
rem Builds the Android app from the current sources. Needs JDK 21 and the Android SDK
rem (ANDROID_HOME or android\local.properties with sdk.dir).
rem   build-apk.cmd           debug APK (app id ....debug, installs next to the released app)
rem   build-apk.cmd release   signed release APK as release\KandleOS-<version>.apk; needs KANDLEOS_SIGNING =
rem                           path of a .properties file OUTSIDE the repo with storeFile, storePassword,
rem                           keyAlias, keyPassword
cd /d "%~dp0.."
if /i "%~1"=="release" if not defined KANDLEOS_SIGNING (
  echo KANDLEOS_SIGNING is not set: the release APK must be signed with the KandleOS key.
  exit /b 1
)
call npm.cmd run android:sync || exit /b 1
cd android
if /i not "%~1"=="release" (
  call .\gradlew.bat assembleDebug || exit /b 1
  echo.
  echo APK: %CD%\app\build\outputs\apk\debug\app-debug.apk
  exit /b 0
)
call .\gradlew.bat assembleRelease || exit /b 1
cd ..
for /f %%v in ('node -p "require('./package.json').version"') do set VERSION=%%v
if not exist release mkdir release
copy /y android\app\build\outputs\apk\release\app-release.apk release\KandleOS-%VERSION%.apk >nul || exit /b 1
echo.
echo APK: %CD%\release\KandleOS-%VERSION%.apk
