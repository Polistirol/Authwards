# Generates dashboard/public/authward-sdk-v1_beta.zip (same layout as build-sdk-zip.sh).
$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
$OutZipName = "authward-sdk-v1_beta.zip"
$Staging = Join-Path ([System.IO.Path]::GetTempPath()) "authward-sdk-zip-staging"
$PkgDir = Join-Path $Staging "authward-sdk"
$SdkRoot = Join-Path $Root "sdk"
$PublicDir = Join-Path $Root "dashboard\public"
$OutZip = Join-Path $PublicDir $OutZipName

Remove-Item $OutZip -Force -ErrorAction SilentlyContinue
Remove-Item $Staging -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $PkgDir -Force | Out-Null

Copy-Item -Recurse (Join-Path $SdkRoot "src") (Join-Path $PkgDir "src")
Copy-Item (Join-Path $SdkRoot "index.ts") $PkgDir
Copy-Item (Join-Path $SdkRoot "package.json") $PkgDir
Copy-Item (Join-Path $SdkRoot "SDK_README.md") (Join-Path $PkgDir "README.md")
Copy-Item (Join-Path $SdkRoot "example.tsx") $PkgDir

New-Item -ItemType Directory -Path $PublicDir -Force | Out-Null
Compress-Archive -Path $PkgDir -DestinationPath $OutZip -Force
Remove-Item $Staging -Recurse -Force

Write-Host "OK: $OutZipName created in dashboard/public/"
