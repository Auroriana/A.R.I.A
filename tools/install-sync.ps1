# One-time, per-user task. Run only after reviewing the dry-run sync plan.
$ErrorActionPreference = 'Stop'
$ariaRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
foreach ($ariaName in @('sync.json', 'sync.env')) {
    if (!(Test-Path -LiteralPath (Join-Path $ariaRoot ".local\$ariaName"))) { throw "Missing .local/$ariaName. See docs/OBSIDIAN-SYNC.md." }
}
$ariaRunner = Join-Path $PSScriptRoot 'run-sync.ps1'
$ariaUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$ariaAction = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -NonInteractive -WindowStyle Hidden -File `"$ariaRunner`"" -WorkingDirectory $ariaRoot
$ariaTrigger = New-ScheduledTaskTrigger -AtLogOn -User $ariaUser
$ariaPrincipal = New-ScheduledTaskPrincipal -UserId $ariaUser -LogonType Interactive -RunLevel Limited
$ariaSettings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName 'Aria Obsidian Sync' -Action $ariaAction -Trigger $ariaTrigger -Principal $ariaPrincipal -Settings $ariaSettings -Description 'Two-way sync for explicitly paired Aria and Obsidian vaults.' -Force | Out-Null
Start-ScheduledTask -TaskName 'Aria Obsidian Sync'
Write-Output 'Aria sync is installed and running. It will start automatically at sign-in.'
