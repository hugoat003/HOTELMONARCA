# Común a los comandos de mantenimiento: lee monarca.env y deja su configuración en el entorno
# (base, puerto, respaldos y almacenamiento externo) para los scripts de Node.
$ErrorActionPreference = 'Stop'
$Root = $env:MONARCA_ROOT ?? 'C:\Monarca'
$EnvFile = $env:MONARCA_ENV_FILE ?? 'C:\ProgramData\Monarca\monarca.env'
$Service = $env:MONARCA_SERVICE ?? 'monarca'
$Scripts = Join-Path $Root 'app\backend\scripts'
if (Test-Path $EnvFile) {
  foreach ($line in Get-Content $EnvFile) {
    if ($line -match '^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$') {
      Set-Item -Path "Env:$($Matches[1])" -Value $Matches[2].Trim('"')
    }
  }
}
$env:MONARCA_DB ??= 'C:\ProgramData\Monarca\monarca.db'
$env:PORT ??= '3000'

# Detiene el servidor, corre el bloque y lo vuelve a encender pase lo que pase
function Invoke-Stopped([scriptblock]$Block) {
  Write-Host 'Deteniendo el servidor (las tablets verán "sin conexión" unos segundos)…'
  Stop-Service -Name $Service
  try { & $Block } finally {
    Start-Service -Name $Service
    Write-Host 'Servidor encendido.'
  }
}
