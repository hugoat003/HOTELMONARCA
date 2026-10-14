#Requires -Version 7
<#
.SYNOPSIS
  Borra los datos de prueba antes de abrir el sistema en el hotel.

.DESCRIPTION
  Conserva el menú, las mesas, las habitaciones, los salones, los usuarios con sus PIN, el inventario,
  la tienda, las impresoras y la configuración. Borra las ventas, las cuentas, las reservas, los
  huéspedes, los eventos, los turnos de caja, los movimientos, la bitácora y la cola de impresión.
  Hace un respaldo completo antes (C:\ProgramData\Monarca\respaldos\antes-de-limpiar-pruebas-*.db).
#>
param([switch]$Confirmar)
$ErrorActionPreference = 'Stop'
$Root = $env:MONARCA_ROOT ?? 'C:\Monarca'
$EnvFile = $env:MONARCA_ENV_FILE ?? 'C:\ProgramData\Monarca\monarca.env'
$Service = $env:MONARCA_SERVICE ?? 'monarca'
$cfg = @{}
if (Test-Path $EnvFile) {
  foreach ($line in Get-Content $EnvFile) {
    if ($line -match '^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$') { $cfg[$Matches[1]] = $Matches[2].Trim('"') }
  }
}
$env:MONARCA_DB = $cfg.MONARCA_DB ?? 'C:\ProgramData\Monarca\monarca.db'
$env:PORT = $cfg.PORT ?? '3000'

if (-not $Confirmar) {
  Write-Host 'Esto borra ventas, cuentas, reservas, huéspedes, eventos y turnos de caja.' -ForegroundColor Yellow
  Write-Host 'Se conservan catálogos, usuarios y configuración. Se hace un respaldo antes.'
  if ((Read-Host 'Escribe BORRAR para continuar') -ne 'BORRAR') { Write-Host 'Cancelado.'; exit 1 }
}
Write-Host 'Deteniendo el servidor (las tablets verán "sin conexión" unos segundos)…'
Stop-Service -Name $Service
try {
  node (Join-Path $Root 'app\backend\scripts\limpiar-pruebas.js') --confirmar
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo limpiar (no se cambió nada).' }
} finally {
  Start-Service -Name $Service
}
Write-Host "`n✓ Listo: el sistema arrancó sin datos de prueba." -ForegroundColor Green
