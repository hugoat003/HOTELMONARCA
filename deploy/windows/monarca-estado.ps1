#Requires -Version 7
# Resumen del estado de POS Monarca en la mini PC (para soporte).
$Root = $env:MONARCA_ROOT ?? 'C:\Monarca'
$EnvFile = $env:MONARCA_ENV_FILE ?? 'C:\ProgramData\Monarca\monarca.env'
$cfg = @{}
if (Test-Path $EnvFile) {
  foreach ($line in Get-Content $EnvFile) {
    if ($line -match '^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$') { $cfg[$Matches[1]] = $Matches[2].Trim('"') }
  }
}
$Db = $cfg.MONARCA_DB ?? 'C:\ProgramData\Monarca\monarca.db'
$Port = $cfg.PORT ?? '3000'
$DataDir = Split-Path $Db
function Title($t) { Write-Host "`n== $t" -ForegroundColor Cyan }

Title 'Servicios'
foreach ($s in 'monarca', 'cloudflared', 'sshd', 'Tailscale') {
  $svc = Get-Service $s -ErrorAction SilentlyContinue
  '{0,-12} {1}' -f $s, ($svc ? $svc.Status : 'no instalado')
}

Title 'Versión'
$app = Join-Path $Root 'app'
if (Test-Path $app) {
  $target = (Get-Item $app).Target
  "En uso: $(Split-Path ($target -is [array] ? $target[0] : $target) -Leaf)"
  "Instaladas: $((Get-ChildItem (Join-Path $Root 'versiones') -Directory | Sort-Object CreationTime -Descending).Name -join ', ')"
}
try {
  $h = Invoke-RestMethod "http://127.0.0.1:$Port/api/health" -TimeoutSec 3
  "El servidor responde · compilación $($h.build) · datos v$($h.rev)"
} catch { Write-Host "El servidor NO responde en el puerto $Port" -ForegroundColor Red }

Title 'Red del hotel'
# Las tablets entran por la red local: la red debe ser "Privada" (la regla del puerto solo abre ahí)
$profiles = Get-NetConnectionProfile -ErrorAction SilentlyContinue
foreach ($n in $profiles) {
  $line = '{0} ({1}): {2}' -f $n.Name, $n.InterfaceAlias, $n.NetworkCategory
  if ($n.NetworkCategory -eq 'Public') {
    Write-Host "$line  ← ¡PÚBLICA! Las tablets no podrán entrar." -ForegroundColor Red
    Write-Host "   Corrígelo:  Set-NetConnectionProfile -InterfaceAlias '$($n.InterfaceAlias)' -NetworkCategory Private"
  } else { $line }
}
$ips = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object { $_.InterfaceAlias -notmatch 'Loopback|vEthernet|Tailscale' -and $_.IPAddress -notlike '169.*' }
foreach ($ip in $ips) { "Tablets: http://$($ip.IPAddress):$Port   ($($ip.InterfaceAlias), $($ip.PrefixOrigin))" }
if ($ips | Where-Object PrefixOrigin -eq 'Dhcp') {
  Write-Host 'Recomendado: reserva esta IP en el router del hotel para que no cambie.' -ForegroundColor Yellow
}
$rule = Get-NetFirewallRule -DisplayName 'POS Monarca' -ErrorAction SilentlyContinue
if ($rule -and $rule.Enabled -eq 'True') { 'Firewall: puerto abierto para la red privada' }
else { Write-Host 'Firewall: falta la regla "POS Monarca" (corre instalar.ps1 de nuevo)' -ForegroundColor Red }

Title 'Impresoras instaladas en Windows'
$ps = Get-Printer -ErrorAction SilentlyContinue | Where-Object { $_.Name -notmatch 'PDF|XPS|OneNote|Fax' }
if ($ps) { $ps | ForEach-Object { '{0,-28} {1}' -f $_.Name, $_.PrinterStatus } }
else { '(ninguna: la de caja por USB se instala con su driver; la de cocina va por red)' }

Title 'Base de datos y respaldos'
if (Test-Path $Db) { '{0:N1} MB · modificada {1}' -f ((Get-Item $Db).Length / 1MB), (Get-Item $Db).LastWriteTime }
Get-ChildItem (Join-Path $DataDir 'respaldos') -Filter *.db -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending | Select-Object -First 3 | ForEach-Object { "  $($_.Name)" }

Title 'Disco'
$drive = Get-PSDrive ($DataDir.Substring(0, 1))
'{0:N1} GB libres de {1:N1} GB' -f ($drive.Free / 1GB), (($drive.Used + $drive.Free) / 1GB)

Title 'Windows'
$reboot = Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired'
if ($reboot) { Write-Host 'Windows tiene actualizaciones esperando reinicio (se hará de madrugada)' -ForegroundColor Yellow }
else { 'Sin reinicios pendientes' }
"Encendida desde: $((Get-CimInstance Win32_OperatingSystem -ErrorAction SilentlyContinue).LastBootUpTime)"

Title 'Últimos errores del servidor'
$err = Get-ChildItem (Join-Path $DataDir 'logs') -Filter 'monarca*.err.log' -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($err) { Get-Content $err.FullName -Tail 15 } else { '(sin errores registrados)' }
