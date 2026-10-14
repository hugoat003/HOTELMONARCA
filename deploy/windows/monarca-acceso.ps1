#Requires -Version 7
<#
.SYNOPSIS
  Acceso de gerencia: nueva contraseña o alta de administración general (soporte).

.EXAMPLE
  monarca-acceso                                                       # lista los usuarios
  monarca-acceso --correo dueña@hotel.com --contrasena "nueva clave"   # olvidó su contraseña
  monarca-acceso --nombre "Ana López" --correo ana@hotel.com --contrasena "clave inicial"

.DESCRIPTION
  Para el personal con PIN no hace falta: el gerente lo cambia en Configuración → Usuarios.
  Cambiar un acceso detiene el servidor unos segundos.
#>
. (Join-Path $PSScriptRoot 'comun.ps1')
$tool = Join-Path $Scripts 'acceso.js'
$params = @($args) # dentro del bloque, $args sería otro
if (-not $params.Count -or $params -contains '--lista') {
  node $tool --lista
  exit $LASTEXITCODE
}
$ok = $false
Invoke-Stopped {
  node $tool @params
  $script:ok = $LASTEXITCODE -eq 0
}
if (-not $ok) { exit 1 }
