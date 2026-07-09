$ErrorActionPreference = "Stop"

$PaperclipHome = "C:\Users\glcar\.paperclip"
$Port = 3100
$Url = "http://127.0.0.1:$Port"
$LogDir = Join-Path $PaperclipHome "instances\default\logs"
$LauncherLog = Join-Path $LogDir "paperclip-3100.launcher.log"
$DefaultLauncher = Join-Path $PaperclipHome "instances\default\scripts\run-default-3100.ps1"

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
Add-Content -LiteralPath $LauncherLog -Value "[$(Get-Date -Format o)] Desktop launcher starting (url=$Url)"

function Test-PaperclipReady {
  try {
    $response = Invoke-WebRequest -Uri "$Url/" -TimeoutSec 3 -UseBasicParsing
    return [int]$response.StatusCode -eq 200 -and $response.Content -match "<title>"
  } catch {
    return $false
  }
}

function Open-Paperclip {
  try {
    Start-Process -FilePath "explorer.exe" -ArgumentList $Url
  } catch {
    Add-Content -LiteralPath $LauncherLog -Value "[$(Get-Date -Format o)] Could not open browser: $($_.Exception.Message)"
  }
}

if (-not (Test-Path -LiteralPath $DefaultLauncher)) {
  $message = "Paperclip default launcher was not found at $DefaultLauncher."
  Add-Content -LiteralPath $LauncherLog -Value "[$(Get-Date -Format o)] $message"
  Add-Type -AssemblyName System.Windows.Forms
  [System.Windows.Forms.MessageBox]::Show($message, "Paperclip startup failed", "OK", "Error") | Out-Null
  exit 1
}

if (Test-PaperclipReady) {
  Add-Content -LiteralPath $LauncherLog -Value "[$(Get-Date -Format o)] Paperclip already running; opening $Url"
  Open-Paperclip
  exit 0
}

try {
  Start-Process `
    -FilePath "powershell.exe" `
    -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-File", $DefaultLauncher) `
    -WindowStyle Hidden
  Add-Content -LiteralPath $LauncherLog -Value "[$(Get-Date -Format o)] Started default supervisor: $DefaultLauncher"
} catch {
  Add-Content -LiteralPath $LauncherLog -Value "[$(Get-Date -Format o)] Failed to start default supervisor: $($_.Exception.Message)"
  Add-Type -AssemblyName System.Windows.Forms
  [System.Windows.Forms.MessageBox]::Show("Paperclip could not start. Check $LauncherLog.", "Paperclip startup failed", "OK", "Error") | Out-Null
  exit 1
}

$deadline = (Get-Date).AddSeconds(90)
while ((Get-Date) -lt $deadline) {
  if (Test-PaperclipReady) {
    Add-Content -LiteralPath $LauncherLog -Value "[$(Get-Date -Format o)] Paperclip ready; opening $Url"
    Open-Paperclip
    exit 0
  }
  Start-Sleep -Seconds 2
}

Add-Content -LiteralPath $LauncherLog -Value "[$(Get-Date -Format o)] Paperclip did not become ready on $Url within 90 seconds."
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.MessageBox]::Show("Paperclip started but did not become ready on $Url within 90 seconds. Check $LauncherLog.", "Paperclip startup timeout", "OK", "Warning") | Out-Null
exit 2
