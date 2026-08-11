# Build the PET Pocket debug APK from the AndroidPET repo (sibling checkout).
# Debug variant needs no signing keystore and allows `adb run-as` data access,
# which the seeding/verification helpers depend on.
#
# Output: mobile/apps/petpocket-debug.apk (gitignored)

$ErrorActionPreference = 'Stop'

$RepoDir = 'D:\RnD\playwrightNewFrameworkBuild\AndroidPET'
$SdkRoot = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { 'D:\Android\Sdk' }
# Keep Gradle's cache off the space-starved C: drive too.
if (-not $env:GRADLE_USER_HOME) { $env:GRADLE_USER_HOME = 'D:\Android\gradle-home' }
$MobileDir = Split-Path $PSScriptRoot -Parent
$AppsDir = Join-Path $MobileDir 'apps'
$Variant = 'assembleFullPlayStoreWindowsPetDebug'

if (-not (Test-Path (Join-Path $RepoDir '.git'))) {
    Write-Host "== Cloning AndroidPET to $RepoDir..."
    gh repo clone orangeenterprisesinc/AndroidPET $RepoDir
    if ($LASTEXITCODE -ne 0) { throw 'gh repo clone failed' }
} else {
    Write-Host '== AndroidPET already cloned'
}

# Gradle resolves the SDK via local.properties (no reliance on machine env vars)
$gradleProjectDir = Join-Path $RepoDir 'AndroidPET'
$localProps = Join-Path $gradleProjectDir 'local.properties'
$sdkEscaped = $SdkRoot -replace '\\', '\\\\'
Set-Content $localProps "sdk.dir=$sdkEscaped" -Encoding ascii
Write-Host "== Wrote $localProps"

Write-Host "== Building $Variant (first run downloads Gradle + dependencies)..."
Push-Location $gradleProjectDir
try {
    & .\gradlew.bat $Variant --no-daemon
    if ($LASTEXITCODE -ne 0) { throw "gradlew $Variant failed with exit code $LASTEXITCODE" }
} finally {
    Pop-Location
}

$apk = Get-ChildItem -Recurse (Join-Path $gradleProjectDir 'app\build\outputs\apk') -Filter '*.apk' |
    Where-Object { $_.FullName -match 'fullPlayStoreWindowsPet' -and $_.FullName -match 'debug' } |
    Select-Object -First 1
if ($null -eq $apk) { throw 'Built APK not found under app\build\outputs\apk' }

New-Item -ItemType Directory -Force $AppsDir | Out-Null
Copy-Item $apk.FullName (Join-Path $AppsDir 'petpocket-debug.apk') -Force
Write-Host "== APK ready: $AppsDir\petpocket-debug.apk (from $($apk.Name))"
