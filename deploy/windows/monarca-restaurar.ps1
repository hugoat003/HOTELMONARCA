#Requires -Version 7
<#
.SYNOPSIS
  Restaura la base desde un respaldo de la mini PC o de fuera del hotel.

.EXAMPLE
  monarca-restaurar                                  # lista los respaldos disponibles
  monarca-restaurar diario-20261014-030000.db        # restaura ese (pide escribir RESTAURAR)

.DESCRIPTION
  Antes de reemplazar, la base actual se guarda como respaldos\antes-de-restaurar-*.db, así que
  también se puede deshacer. El servidor se detiene unos segundos.
#>
param([string]$Respaldo, [switch]$Confirmar)
. (Join-Path $PSScriptRoot 'comun.ps1')
if (-not $Respaldo) {
  node (Join-Path $Scripts 'restaurar.js') --lista
  exit $LASTEXITCODE
}
if (-not $Confirmar) {
  Write-Host "Esto reemplaza TODOS los datos actuales por los del respaldo $Respaldo." -ForegroundColor Yellow
  Write-Host 'Lo que se haya registrado después de ese respaldo se pierde (la base actual queda guardada aparte).'
  if ((Read-Host 'Escribe RESTAURAR para continuar') -ne 'RESTAURAR') { Write-Host 'Cancelado.'; exit 1 }
}
$ok = $false
Invoke-Stopped {
  node (Join-Path $Scripts 'restaurar.js') $Respaldo --confirmar
  $script:ok = $LASTEXITCODE -eq 0
}
if (-not $ok) { Write-Host 'No se restauró nada.' -ForegroundColor Red; exit 1 }
Write-Host "`n✓ Restaurado. Las tablets se reconectan solas; si alguna pide entrar de nuevo, es normal." -ForegroundColor Green
