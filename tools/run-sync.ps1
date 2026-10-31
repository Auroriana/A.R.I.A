$ErrorActionPreference = 'Stop'
$ariaRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$ariaConfig = Join-Path $ariaRoot '.local\sync.json'
$ariaEnv = Join-Path $ariaRoot '.local\sync.env'
if (!(Test-Path -LiteralPath $ariaConfig) -or !(Test-Path -LiteralPath $ariaEnv)) { throw 'Complete .local/sync.json and .local/sync.env first. See docs/OBSIDIAN-SYNC.md.' }
Set-Location -LiteralPath $ariaRoot
& node "--env-file=$ariaEnv" (Join-Path $PSScriptRoot 'sync-service.mjs') '--config' $ariaConfig *>> (Join-Path $ariaRoot '.local\sync-service.log')
exit $LASTEXITCODE
