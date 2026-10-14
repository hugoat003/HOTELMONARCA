#Requires -Version 7
<#
.SYNOPSIS
  Borra los datos de prueba antes de abrir el sistema en el hotel.

.DESCRIPTION
  Conserva el menú, las mesas, las habitaciones, los salones, los usuarios con su PIN o contraseña, el inventario,
  la tienda, las impresoras y la configuración. Borra las ventas, las cuentas, las reservas, los
  huéspedes, los eventos, los turnos de caja, los movimientos, la bitácora y la cola de impresión.
  Hace un respaldo completo antes (C:\ProgramData\Monarca\respaldos\antes-de-limpiar-pruebas-*.db).
#>
param([switch]$Confirmar)
. (Join-Path $PSScriptRoot 'comun.ps1')

if (-not $Confirmar) {
  Write-Host 'Esto borra ventas, cuentas, reservas, huéspedes, eventos y turnos de caja.' -ForegroundColor Yellow
  Write-Host 'Se conservan catálogos, usuarios y configuración. Se hace un respaldo antes.'
  if ((Read-Host 'Escribe BORRAR para continuar') -ne 'BORRAR') { Write-Host 'Cancelado.'; exit 1 }
}
Invoke-Stopped {
  node (Join-Path $Scripts 'limpiar-pruebas.js') --confirmar
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo limpiar (no se cambió nada).' }
}
Write-Host "`n✓ Listo: el sistema arrancó sin datos de prueba." -ForegroundColor Green
