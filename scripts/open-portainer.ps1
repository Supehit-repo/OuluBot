[CmdletBinding()]
param(
    [switch]$ValidateOnly
)

$ErrorActionPreference = 'Stop'

$distribution = 'Ubuntu'
$agentSocket = '/home/samikoski/.ssh/oamk-agent.sock'
$localPort = 9443

function Test-LocalTcpPortInUse {
    param([Parameter(Mandatory)][int]$Port)

    $listeners = [System.Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners()
    return $null -ne ($listeners | Where-Object { $_.Port -eq $Port } | Select-Object -First 1)
}

function Test-LocalTcpPortReady {
    param(
        [Parameter(Mandatory)][int]$Port,
        [int]$TimeoutSeconds = 20
    )

    $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
    while ([DateTime]::UtcNow -lt $deadline) {
        $client = $null
        try {
            $client = [System.Net.Sockets.TcpClient]::new()
            $connection = $client.BeginConnect('127.0.0.1', $Port, $null, $null)
            if ($connection.AsyncWaitHandle.WaitOne(500)) {
                $client.EndConnect($connection)
                return $true
            }
        }
        catch {
            # Tunneli ei ole vielä valmis.
        }
        finally {
            if ($null -ne $client) {
                $client.Dispose()
            }
        }
        Start-Sleep -Milliseconds 250
    }

    return $false
}

$helperWindowsPath = (Resolve-Path (Join-Path $PSScriptRoot 'ensure-ssh-agent.sh')).Path
if ($helperWindowsPath -notmatch '^(?<drive>[A-Za-z]):\\(?<tail>.+)$') {
    throw "SSH agent helper script must use a local drive-letter path: $helperWindowsPath"
}

$driveLetter = $Matches['drive'].ToLowerInvariant()
$pathTail = $Matches['tail'] -replace '\\', '/'
$helperWslPath = "/mnt/$driveLetter/$pathTail"

if ($ValidateOnly) {
    Write-Host "WSL helper path: $helperWslPath"
    & wsl.exe -d $distribution --exec bash -n $helperWslPath
    if ($LASTEXITCODE -ne 0) {
        throw 'SSH agent helper script syntax validation failed.'
    }

    Write-Host 'Validation completed successfully.'
    return
}

if (Test-LocalTcpPortInUse -Port $localPort) {
    throw "Windows local port $localPort is already in use. Close the process using it before opening the tunnel."
}

Write-Host "Ensuring the WSL2 SSH agent is available at $agentSocket..."
& wsl.exe -d $distribution --exec bash $helperWslPath
if ($LASTEXITCODE -ne 0) {
    throw 'SSH agent setup failed.'
}

$tunnelCommand = @'
$Host.UI.RawUI.WindowTitle = 'Portainer SSH tunnel'
& wsl.exe -d Ubuntu --exec env SSH_AUTH_SOCK=/home/samikoski/.ssh/oamk-agent.sock ssh -N -L 9443:127.0.0.1:9443 oamk-tki
Write-Host ''
Write-Host 'The SSH tunnel ended. Closing this PowerShell window disconnects only the management connection; it does not stop server containers.'
Read-Host 'Press Enter to close this window'
'@

Write-Host 'Opening the SSH tunnel in a separate PowerShell window...'
Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoExit', '-Command', $tunnelCommand) | Out-Null

Write-Host "Waiting for localhost:$localPort to respond..."
if (-not (Test-LocalTcpPortReady -Port $localPort)) {
    throw "The SSH tunnel did not start listening on port $localPort within 20 seconds. Check the separate tunnel window for an error."
}

Start-Process 'https://localhost:9443' | Out-Null
Write-Host 'Portainer opened in the browser: https://localhost:9443'
Write-Host 'Closing the tunnel PowerShell window disconnects only the management connection; it does not stop containers.'
