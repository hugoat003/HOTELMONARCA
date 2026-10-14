#Requires -Version 7
<#
.SYNOPSIS
  Respaldo inmediato de la base (el sistema sigue funcionando).

.DESCRIPTION
  Deja la copia en C:\ProgramData\Monarca\respaldos\manual-AAAAMMDD-HHMMSS.db y, si está
  configurado, sube una copia cifrada fuera del hotel. El respaldo de cada noche lo hace el
  servidor solo; su estado se ve con monarca-estado o en Configuración → Respaldo.
#>
. (Join-Path $PSScriptRoot 'comun.ps1')
$args2 = @()
if ($env:MONARCA_S3_ENDPOINT -and $env:MONARCA_RESPALDO_CLAVE) { $args2 += '--subir' }
node (Join-Path $Scripts 'respaldo.js') @args2
if ($LASTEXITCODE -ne 0) { exit 1 }
Write-Host '✓ Respaldo listo.' -ForegroundColor Green
