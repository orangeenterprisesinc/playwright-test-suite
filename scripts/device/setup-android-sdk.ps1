# Bootstrap the Android toolchain needed by the mobile/ Appium harness.
# Idempotent: safe to re-run; each step is skipped when already satisfied.
#
# Installs to %LOCALAPPDATA%\Android\Sdk:
#   cmdline-tools, platform-tools (adb), emulator,
#   system-images;android-29;google_apis;x86_64 (matches the CipherLab RS35 -> API 29),
#   platforms;android-29 + android-35, build-tools;35.0.0 (AndroidPET compileSdk 35)
# Then creates the AVD "petpocket_rs35" patched to the RS35 hardware profile
# (AndroidPET/Docs/Rs35Device.xml: 5.5" 720x1440 xhdpi, 3 GiB RAM).

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

# ANDROID_HOME wins (set persistently to D:\Android\Sdk — C: lacked disk space);
# same for the AVD home, which otherwise lands on C: under ~\.android\avd.
$SdkRoot = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { 'D:\Android\Sdk' }
$AvdRoot = if ($env:ANDROID_AVD_HOME) { $env:ANDROID_AVD_HOME } else { 'D:\Android\avd' }
$env:ANDROID_AVD_HOME = $AvdRoot
New-Item -ItemType Directory -Force $AvdRoot | Out-Null
$CmdlineToolsUrl = 'https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip'
$SysImage = 'system-images;android-29;google_apis;x86_64'
$AvdName = 'petpocket_rs35'

Write-Host "== Android SDK root: $SdkRoot"

# ── 1. cmdline-tools ─────────────────────────────────────────────────────────
$SdkManager = Join-Path $SdkRoot 'cmdline-tools\latest\bin\sdkmanager.bat'
if (-not (Test-Path $SdkManager)) {
    Write-Host '== Downloading commandline-tools...'
    New-Item -ItemType Directory -Force $SdkRoot | Out-Null
    $zip = Join-Path $env:TEMP 'android-cmdline-tools.zip'
    Invoke-WebRequest -Uri $CmdlineToolsUrl -OutFile $zip -UseBasicParsing
    $extract = Join-Path $env:TEMP 'android-cmdline-tools-extract'
    if (Test-Path $extract) { Remove-Item -Recurse -Force $extract }
    Expand-Archive -Path $zip -DestinationPath $extract
    # Zip contains a bare "cmdline-tools" dir; the SDK layout wants it under cmdline-tools\latest
    New-Item -ItemType Directory -Force (Join-Path $SdkRoot 'cmdline-tools') | Out-Null
    Move-Item (Join-Path $extract 'cmdline-tools') (Join-Path $SdkRoot 'cmdline-tools\latest')
    Remove-Item $zip -Force
    Remove-Item -Recurse -Force $extract
} else {
    Write-Host '== cmdline-tools already installed'
}

# ── 2. Licenses + packages ───────────────────────────────────────────────────
# Pre-write the license hash files (the CI-standard way): sdkmanager treats a
# licenses/<name> file whose lines contain the license hash as "accepted", so
# no interactive prompt ever fires. Files must be BOM-less (ascii).
Write-Host '== Writing SDK license acceptance files...'
$licensesDir = Join-Path $SdkRoot 'licenses'
New-Item -ItemType Directory -Force $licensesDir | Out-Null
$licenses = @{
    'android-sdk-license'         = @(
        '24333f8a63b6825ea9c5514f83c2829b004d1fee',
        'd56f5187479451eabf01fb78af6dfcb131a6481e',
        '8933bad161af4178b1185d1a37fbf41ea5269c55')
    'android-sdk-preview-license' = @('84831b9409646a918e30573bab4c9c91346d8abd')
    'intel-android-extra-license' = @('d975f751698a77b662f1254ddbeed3901e976f5a')
}
foreach ($name in $licenses.Keys) {
    $licenses[$name] | Set-Content (Join-Path $licensesDir $name) -Encoding ascii
}

$packages = @(
    'platform-tools',
    'emulator',
    $SysImage,
    'platforms;android-29',
    'platforms;android-35',
    'build-tools;35.0.0'
)
Write-Host "== Installing packages: $($packages -join ', ')"
& $SdkManager --install $packages
if ($LASTEXITCODE -ne 0) { throw "sdkmanager --install failed with exit code $LASTEXITCODE" }

# ── 3. AVD ───────────────────────────────────────────────────────────────────
$AvdManager = Join-Path $SdkRoot 'cmdline-tools\latest\bin\avdmanager.bat'
$AvdHome = Join-Path $AvdRoot "$AvdName.avd"
if (-not (Test-Path $AvdHome)) {
    Write-Host "== Creating AVD $AvdName..."
    # cmd-level pipe so the "custom hardware profile?" prompt reliably reads "no"
    cmd /c "echo no| `"$AvdManager`" create avd -n $AvdName -k `"$SysImage`" -f"
    if ($LASTEXITCODE -ne 0) { throw "avdmanager create avd failed with exit code $LASTEXITCODE" }
} else {
    Write-Host "== AVD $AvdName already exists"
}

# Patch the AVD to the RS35 hardware profile (720x1440 xhdpi, 3 GiB RAM, keyboard for tests)
$configIni = Join-Path $AvdHome 'config.ini'
$overrides = @{
    'hw.lcd.width'            = '720'
    'hw.lcd.height'           = '1440'
    'hw.lcd.density'          = '320'
    'hw.ramSize'              = '3072'
    'hw.keyboard'             = 'yes'
    'hw.gpu.enabled'          = 'yes'
    'hw.gpu.mode'             = 'auto'
    'disk.dataPartition.size' = '2G'
}
$lines = Get-Content $configIni | Where-Object { $_ -notmatch ('^(' + (($overrides.Keys | ForEach-Object { [regex]::Escape($_) }) -join '|') + ')\s*=') }
$lines += $overrides.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" }
$lines | Sort-Object | Set-Content $configIni -Encoding ascii
Write-Host "== AVD config patched: $configIni"

# ── 4. Acceleration check ────────────────────────────────────────────────────
$EmulatorExe = Join-Path $SdkRoot 'emulator\emulator.exe'
Write-Host '== Emulator acceleration check:'
& $EmulatorExe -accel-check

Write-Host ''
Write-Host '== Done. Set for your shell (or rely on wdio.conf resolving the SDK path):'
Write-Host "   ANDROID_HOME=$SdkRoot"
Write-Host "   PATH += $SdkRoot\platform-tools;$SdkRoot\emulator"
