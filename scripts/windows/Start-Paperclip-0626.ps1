$ErrorActionPreference = "Stop"

$RepoRoot = "C:\Users\glcar\paperclip"
$ServerRoot = Join-Path $RepoRoot "server"
$PaperclipHome = "C:\Users\glcar\.paperclip"
$Port = 626
$Url = "http://127.0.0.1:$Port"
$LogDir = Join-Path $PaperclipHome "instances\default\logs"
$OutLog = Join-Path $LogDir "paperclip-0626.out.log"
$ErrLog = Join-Path $LogDir "paperclip-0626.err.log"

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

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
    Add-Content -LiteralPath $ErrLog -Value "[$(Get-Date -Format o)] Could not open browser automatically: $($_.Exception.Message)"
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
  Add-Content -LiteralPath $ErrLog -Value "[$(Get-Date -Format o)] $message"
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

$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = $node
$psi.WorkingDirectory = $ServerRoot
$psi.Arguments = "`"$tsx`" scripts/dev-watch.ts"
$psi.UseShellExecute = $false
$psi.CreateNoWindow = $true
$psi.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError = $true
$psi.Environment["PORT"] = [string]$Port
$psi.Environment["PAPERCLIP_LISTEN_PORT"] = [string]$Port
$psi.Environment["PAPERCLIP_HOME"] = $PaperclipHome
$psi.Environment["PAPERCLIP_MIGRATION_PROMPT"] = "never"
$psi.Environment["PAPERCLIP_MIGRATION_AUTO_APPLY"] = "true"

$process = [System.Diagnostics.Process]::Start($psi)
$process.BeginOutputReadLine()
$process.BeginErrorReadLine()
$process.add_OutputDataReceived({
  if ($EventArgs.Data) { Add-Content -LiteralPath $OutLog -Value $EventArgs.Data }
})
$process.add_ErrorDataReceived({
  if ($EventArgs.Data) { Add-Content -LiteralPath $ErrLog -Value $EventArgs.Data }
})

$deadline = (Get-Date).AddSeconds(45)
while ((Get-Date) -lt $deadline) {
  if (Test-Health -TargetUrl $Url) {
    Open-Paperclip -TargetUrl $Url
    exit 0
  }
  Start-Sleep -Seconds 1
}

Add-Content -LiteralPath $ErrLog -Value "[$(Get-Date -Format o)] Paperclip did not become healthy on $Url within 45 seconds."
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.MessageBox]::Show("Paperclip started but did not become healthy on $Url within 45 seconds. Check $ErrLog.", "Paperclip 0626 startup timeout", "OK", "Warning") | Out-Null
exit 2
