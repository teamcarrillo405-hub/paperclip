$ErrorActionPreference = "Stop"

$RepoRoot = "C:\Users\glcar\paperclip"
$ServerRoot = Join-Path $RepoRoot "server"
$PaperclipHome = "C:\Users\glcar\.paperclip"
$Port = 626
$Url = "http://127.0.0.1:$Port"
$LogDir = Join-Path $PaperclipHome "instances\default\logs"
$OutLog = Join-Path $LogDir "paperclip-0626.out.log"
$ErrLog = Join-Path $LogDir "paperclip-0626.err.log"
$LauncherLog = Join-Path $LogDir "paperclip-0626.launcher.log"

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
Add-Content -LiteralPath $LauncherLog -Value "[$(Get-Date -Format o)] Paperclip 0626 launcher starting (url=$Url)"

function Test-Health {
  param([string]$TargetUrl)
  try {
    $response = Invoke-RestMethod -Uri "$TargetUrl/api/health" -TimeoutSec 2
    return $null -ne $response
  } catch {
    return $false
  }
}

function Open-Paperclip {
  param([string]$TargetUrl)
  try {
    Start-Process -FilePath "explorer.exe" -ArgumentList $TargetUrl
  } catch {
    Add-Content -LiteralPath $LauncherLog -Value "[$(Get-Date -Format o)] Could not open browser automatically: $($_.Exception.Message)"
  }
}

function Get-DescendantProcessIds {
  param([int[]]$RootIds)
  $all = Get-CimInstance Win32_Process
  $ids = New-Object 'System.Collections.Generic.HashSet[int]'
  foreach ($id in $RootIds) {
    if ($id -gt 0) { [void]$ids.Add($id) }
  }

  $changed = $true
  while ($changed) {
    $changed = $false
    foreach ($process in $all) {
      if ($null -ne $process.ParentProcessId -and
          $ids.Contains([int]$process.ParentProcessId) -and
          -not $ids.Contains([int]$process.ProcessId)) {
        [void]$ids.Add([int]$process.ProcessId)
        $changed = $true
      }
    }
  }

  return @($ids)
}

function Stop-PaperclipDevProcesses {
  $currentPid = $PID
  $roots = @()
  Get-CimInstance Win32_Process | ForEach-Object {
    $commandLine = [string]$_.CommandLine
    if ($_.ProcessId -eq $currentPid) { return }
    if ($_.Name -ne "node.exe") { return }
    $isPaperclipDev =
      $commandLine -like "*$RepoRoot*" -and (
        $commandLine -like "*scripts/dev-watch.ts*" -or
        $commandLine -like "*src/index.ts*" -or
        $commandLine -like "*@paperclipai/server*dev:watch*" -or
        $commandLine -like "*cross-env PAPERCLIP_MIGRATION*"
      )
    if ($isPaperclipDev) {
      $roots += [int]$_.ProcessId
    }
  }

  if ($roots.Count -eq 0) { return }
  $ids = Get-DescendantProcessIds -RootIds $roots
  $ids | Sort-Object -Descending | ForEach-Object {
    if ($_ -ne $currentPid) {
      try { Stop-Process -Id $_ -Force -ErrorAction Stop } catch {}
    }
  }
  Start-Sleep -Seconds 2
}

function Get-PortOwner {
  param([int]$TargetPort)
  try {
    return Get-NetTCPConnection -LocalAddress "127.0.0.1" -LocalPort $TargetPort -State Listen -ErrorAction Stop |
      Select-Object -First 1
  } catch {
    return $null
  }
}

if (Test-Health -TargetUrl $Url) {
  Open-Paperclip -TargetUrl $Url
  exit 0
}

Stop-PaperclipDevProcesses

$owner = Get-PortOwner -TargetPort $Port
if ($owner) {
  $ownerProcess = Get-Process -Id $owner.OwningProcess -ErrorAction SilentlyContinue
  $message = "Port $Port is already in use by PID $($owner.OwningProcess)"
  if ($ownerProcess) { $message += " ($($ownerProcess.ProcessName))" }
  Add-Content -LiteralPath $LauncherLog -Value "[$(Get-Date -Format o)] $message"
  Add-Type -AssemblyName System.Windows.Forms
  [System.Windows.Forms.MessageBox]::Show($message, "Paperclip 0626 cannot start", "OK", "Error") | Out-Null
  exit 1
}

Push-Location $ServerRoot
try {
  $node = (Get-Command node -ErrorAction Stop).Source
  $tsx = (& $node -p "require.resolve('tsx/cli')").Trim()
} finally {
  Pop-Location
}

$env:PORT = [string]$Port
$env:HOST = "127.0.0.1"
$env:PAPERCLIP_LISTEN_PORT = [string]$Port
$env:PAPERCLIP_HOME = $PaperclipHome
$env:PAPERCLIP_MIGRATION_PROMPT = "never"
$env:PAPERCLIP_MIGRATION_AUTO_APPLY = "true"
$env:PAPERCLIP_AUTH_BASE_URL_MODE = "explicit"
$env:BETTER_AUTH_BASE_URL = $Url
$env:BETTER_AUTH_URL = $Url
$env:PAPERCLIP_AUTH_PUBLIC_BASE_URL = $Url

try {
  $process = Start-Process `
    -FilePath $node `
    -ArgumentList @($tsx, "scripts/dev-watch.ts") `
    -WorkingDirectory $ServerRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput $OutLog `
    -RedirectStandardError $ErrLog `
    -PassThru
  Add-Content -LiteralPath $LauncherLog -Value "[$(Get-Date -Format o)] Started Paperclip 0626 node process PID $($process.Id)"
} catch {
  Add-Content -LiteralPath $LauncherLog -Value "[$(Get-Date -Format o)] Failed to start Paperclip 0626: $($_.Exception.Message)"
  Add-Type -AssemblyName System.Windows.Forms
  [System.Windows.Forms.MessageBox]::Show("Paperclip 0626 could not start. Check $ErrLog.", "Paperclip 0626 startup failed", "OK", "Error") | Out-Null
  exit 1
}

$deadline = (Get-Date).AddSeconds(45)
while ((Get-Date) -lt $deadline) {
  if ($process.HasExited) {
    Add-Content -LiteralPath $LauncherLog -Value "[$(Get-Date -Format o)] Paperclip 0626 process exited before health check passed (exitCode=$($process.ExitCode))."
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show("Paperclip 0626 exited before it became healthy. Check $ErrLog.", "Paperclip 0626 startup failed", "OK", "Error") | Out-Null
    exit 1
  }
  if (Test-Health -TargetUrl $Url) {
    Add-Content -LiteralPath $LauncherLog -Value "[$(Get-Date -Format o)] Paperclip 0626 healthy; opening $Url"
    Open-Paperclip -TargetUrl $Url
    exit 0
  }
  Start-Sleep -Seconds 1
}

Add-Content -LiteralPath $LauncherLog -Value "[$(Get-Date -Format o)] Paperclip did not become healthy on $Url within 45 seconds."
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.MessageBox]::Show("Paperclip started but did not become healthy on $Url within 45 seconds. Check $ErrLog.", "Paperclip 0626 startup timeout", "OK", "Warning") | Out-Null
exit 2
