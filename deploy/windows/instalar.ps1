<#
.SYNOPSIS
  Instalación de POS Monarca en la mini PC con Windows 11 Pro. Se corre una vez.

.DESCRIPTION
  Abrir "Terminal (Administrador)" o "Windows PowerShell (Administrador)" y correr:
    Set-ExecutionPolicy -Scope Process Bypass -Force
    .\instalar.ps1                      # servidor
    .\instalar.ps1 -Caja                # además: la caja abre el sistema a pantalla completa al iniciar sesión

  Se puede volver a correr: lo que ya está hecho no se repite.
  Compatible con Windows PowerShell 5.1 (la que trae Windows); instala PowerShell 7 para lo demás.
#>
param(
  [string]$Repo = 'git@github.com:hugoat003/HOTELMONARCA.git',
  [switch]$Caja
)
$ErrorActionPreference = 'Stop'

$Root = 'C:\Monarca'
$Data = 'C:\ProgramData\Monarca'
$SshDir = Join-Path $Data 'ssh'
$WinSwUrl = 'https://github.com/winsw/winsw/releases/download/v2.12.0/WinSW-x64.exe'
$WinSwSha256 = '05B82D46AD331CC16BDC00DE5C6332C1EF818DF8CEEFCD49C726553209B3A0DA'
$LocalService = '*S-1-5-19' # cuenta "Servicio local"

function Step($msg) { Write-Host "`n== $msg" -ForegroundColor Cyan }
function Refresh-Path {
  $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
}
function Exec([scriptblock]$cmd, [string]$what) {
  & $cmd
  if ($LASTEXITCODE -ne 0) { throw "Falló: $what (código $LASTEXITCODE)" }
}

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
  [Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) { throw 'Abre la terminal como administrador para instalar.' }
$edition = (Get-CimInstance Win32_OperatingSystem).Caption
if ($edition -notmatch 'Pro|Enterprise|Education') {
  Write-Warning "Esta es $edition. Se recomienda Windows 11 Pro para controlar las actualizaciones de Windows."
}

Step 'Programas (winget): Git, Node.js LTS, PowerShell 7, Cloudflare y Chrome'
$apps = @('Git.Git', 'OpenJS.NodeJS.LTS', 'Microsoft.PowerShell', 'Cloudflare.cloudflared', 'Google.Chrome')
foreach ($id in $apps) {
  winget list --id $id -e --accept-source-agreements *> $null
  if ($LASTEXITCODE -ne 0) {
    Write-Host "Instalando $id…"
    winget install --id $id -e --silent --accept-package-agreements --accept-source-agreements --scope machine
    if ($LASTEXITCODE -ne 0) { throw "No se pudo instalar $id" }
  }
}
Refresh-Path
Write-Host ("Node {0} · {1}" -f (node -v), (git --version))

Step 'Carpetas'
foreach ($d in @($Root, "$Root\versiones", "$Root\servicio", "$Root\bin", $Data, "$Data\respaldos", "$Data\logs", $SshDir)) {
  New-Item -ItemType Directory -Force -Path $d | Out-Null
}
# El servicio puede leer el programa y escribir solo en sus datos
icacls $Root /grant "${LocalService}:(OI)(CI)RX" /T /Q | Out-Null
icacls $Data /grant "${LocalService}:(OI)(CI)M" /T /Q | Out-Null
# La llave de GitHub solo la leen los administradores
# (por identificador: el nombre "Administradores" cambia según el idioma de Windows)
icacls $SshDir /inheritance:r /grant:r '*S-1-5-32-544:(OI)(CI)F' '*S-1-5-18:(OI)(CI)F' /Q | Out-Null

Step 'Acceso de solo lectura a GitHub (llave de despliegue)'
$key = Join-Path $SshDir 'deploy_key'
$known = Join-Path $SshDir 'known_hosts'
if (-not (Test-Path $key)) {
  # Llave sin contraseña (la protege el permiso de la carpeta). PowerShell 5.1 y 7 pasan "" distinto.
  $empty = if ($PSVersionTable.PSVersion.Major -ge 7) { '' } else { '""' }
  Exec { ssh-keygen -q -t ed25519 -N $empty -C 'monarca-mini-pc' -f $key } 'crear la llave'
}
if (-not (Test-Path $known) -or -not (Select-String -Quiet -Path $known -Pattern 'github.com')) {
  ssh-keyscan -t ed25519 github.com 2>$null | Out-File -Append -Encoding ascii $known
}
$sshCmd = "ssh -i $($key -replace '\\','/') -o UserKnownHostsFile=$($known -replace '\\','/') -o IdentitiesOnly=yes"
if (-not (Test-Path "$Root\repo\.git")) {
  Write-Host 'Agrega esta llave en GitHub → repositorio → Settings → Deploy keys → Add deploy key'
  Write-Host '(solo lectura: NO marques "Allow write access"):' -ForegroundColor Yellow
  Write-Host ''
  Get-Content "$key.pub"
  Write-Host ''
  Read-Host 'Cuando esté agregada, presiona Enter'
  $env:GIT_SSH_COMMAND = $sshCmd
  Exec { git clone --quiet $Repo "$Root\repo" } 'descargar el repositorio'
  Remove-Item Env:GIT_SSH_COMMAND
}
git -C "$Root\repo" config core.sshCommand $sshCmd
# Lo actualizan distintos administradores (por SSH): git no debe rechazar las carpetas por dueño
git config --system --replace-all safe.directory '*' | Out-Null

Step 'Configuración del servidor'
$envFile = Join-Path $Data 'monarca.env'
if (-not (Test-Path $envFile)) { Copy-Item "$Root\repo\deploy\windows\monarca.env.example" $envFile }
Write-Host "Configuración: $envFile"

Step 'Servicio de Windows (WinSW)'
$svcExe = "$Root\servicio\monarca.exe"
if (-not (Test-Path $svcExe)) {
  Invoke-WebRequest -UseBasicParsing -Uri $WinSwUrl -OutFile $svcExe
  if ((Get-FileHash $svcExe -Algorithm SHA256).Hash -ne $WinSwSha256) {
    Remove-Item $svcExe
    throw 'El archivo de WinSW descargado no coincide con el esperado.'
  }
}
Copy-Item -Force "$Root\repo\deploy\windows\monarca.xml" "$Root\servicio\monarca.xml"
if (-not (Get-Service monarca -ErrorAction SilentlyContinue)) {
  Exec { & $svcExe install } 'registrar el servicio'
}
Exec { sc.exe config monarca obj= 'NT AUTHORITY\LocalService' password= '' } 'asignar la cuenta del servicio'

Step 'Comandos: monarca-actualizar y monarca-estado'
'@"C:\Program Files\PowerShell\7\pwsh.exe" -NoProfile -ExecutionPolicy Bypass -File "C:\Monarca\app\deploy\windows\monarca-actualizar.ps1" %*' |
  Out-File -Encoding ascii "$Root\bin\monarca-actualizar.cmd"
'@"C:\Program Files\PowerShell\7\pwsh.exe" -NoProfile -ExecutionPolicy Bypass -File "C:\Monarca\app\deploy\windows\monarca-estado.ps1" %*' |
  Out-File -Encoding ascii "$Root\bin\monarca-estado.cmd"
$machinePath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
if ($machinePath -notlike "*$Root\bin*") {
  [Environment]::SetEnvironmentVariable('Path', "$machinePath;$Root\bin", 'Machine')
}
Refresh-Path

Step 'Red: puerto 3000 abierto solo en la red del hotel (privada)'
Get-NetConnectionProfile | Where-Object NetworkCategory -eq 'Public' | Set-NetConnectionProfile -NetworkCategory Private
if (-not (Get-NetFirewallRule -DisplayName 'POS Monarca' -ErrorAction SilentlyContinue)) {
  New-NetFirewallRule -DisplayName 'POS Monarca' -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow -Profile Private | Out-Null
}

Step 'Energía: la mini PC nunca se suspende'
powercfg /change standby-timeout-ac 0
powercfg /change hibernate-timeout-ac 0
powercfg /hibernate off

Step 'Actualizaciones de Windows: se instalan de madrugada y no reinician con sesión abierta'
$au = 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate\AU'
$wu = 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate'
New-Item -Force -Path $au | Out-Null
Set-ItemProperty $au -Name NoAutoUpdate -Value 0 -Type DWord
Set-ItemProperty $au -Name AUOptions -Value 4 -Type DWord               # descarga sola e instala en horario
Set-ItemProperty $au -Name ScheduledInstallDay -Value 0 -Type DWord      # todos los días
Set-ItemProperty $au -Name ScheduledInstallTime -Value 3 -Type DWord     # a las 3:00
Set-ItemProperty $au -Name NoAutoRebootWithLoggedOnUsers -Value 1 -Type DWord
Set-ItemProperty $wu -Name SetActiveHours -Value 1 -Type DWord
Set-ItemProperty $wu -Name ActiveHoursStart -Value 6 -Type DWord         # horas de operación: 6:00–23:00
Set-ItemProperty $wu -Name ActiveHoursEnd -Value 23 -Type DWord

Step 'Terminal remota (OpenSSH) para soporte'
$sshCap = Get-WindowsCapability -Online -Name 'OpenSSH.Server*' | Select-Object -First 1
if ($sshCap.State -ne 'Installed') { Add-WindowsCapability -Online -Name $sshCap.Name | Out-Null }
Set-Service sshd -StartupType Automatic
Start-Service sshd
New-ItemProperty -Force -Path 'HKLM:\SOFTWARE\OpenSSH' -Name DefaultShell -Value 'C:\Program Files\PowerShell\7\pwsh.exe' -PropertyType String | Out-Null
# Solo con llave, nunca con contraseña
$sshdConfig = 'C:\ProgramData\ssh\sshd_config'
$conf = Get-Content $sshdConfig
if (-not ($conf -match '^\s*PasswordAuthentication\s+no')) {
  ($conf -replace '^\s*#?\s*PasswordAuthentication\s+.*$', 'PasswordAuthentication no') | Set-Content -Encoding ascii $sshdConfig
  if (-not ((Get-Content $sshdConfig) -match '^\s*PasswordAuthentication\s+no')) { Add-Content -Encoding ascii $sshdConfig 'PasswordAuthentication no' }
  Restart-Service sshd
}
$adminKeys = 'C:\ProgramData\ssh\administrators_authorized_keys'
if (-not (Test-Path $adminKeys)) { New-Item -ItemType File -Path $adminKeys | Out-Null }
icacls $adminKeys /inheritance:r /grant '*S-1-5-32-544:F' '*S-1-5-18:F' /Q | Out-Null
Write-Host "Pega tu llave pública de soporte en: $adminKeys"

Step 'Primera versión del sistema'
& 'C:\Program Files\PowerShell\7\pwsh.exe' -NoProfile -ExecutionPolicy Bypass -File "$Root\repo\deploy\windows\monarca-actualizar.ps1"
if ($LASTEXITCODE -ne 0) { throw 'No se pudo instalar la primera versión.' }

if ($Caja) {
  Step 'Caja: el sistema se abre a pantalla completa al iniciar sesión'
  $chrome = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
  $startup = [Environment]::GetFolderPath('CommonStartup')
  $lnk = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $startup 'POS Monarca.lnk'))
  $lnk.TargetPath = $chrome
  $lnk.Arguments = '--kiosk --app=http://localhost:3000 --no-first-run --disable-translate'
  $lnk.Save()
  Write-Host 'Para salir del modo pantalla completa: Alt+F4.'
}

$ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notmatch 'Loopback|vEthernet' -and $_.IPAddress -notlike '169.*' } | Select-Object -First 1).IPAddress
Write-Host "`n✓ POS Monarca instalado. En las tablets: http://${ip}:3000" -ForegroundColor Green
Write-Host 'Siguiente: túnel de Cloudflare (deploy/README.md → Acceso remoto).'
