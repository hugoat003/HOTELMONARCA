#Requires -Version 7.3
<#
.SYNOPSIS
  Actualiza POS Monarca en la mini PC (Windows 11 Pro).

.DESCRIPTION
  Cada versión se instala completa en su propia carpeta (C:\Monarca\versiones\<commit>) y
  C:\Monarca\app apunta a la versión en uso. Así nada se reemplaza mientras el servidor la usa
  (Windows bloquea los archivos abiertos) y regresar es solo volver a apuntar a la anterior.

  Pasos: respaldo de la base → descarga → instalación y compilación en carpeta nueva → pruebas del
  servidor → cambio de versión y reinicio (unos segundos) → revisión. Si algo falla, regresa a la
  versión anterior (y a la base de antes si la nueva llegó a arrancar).

.EXAMPLE
  monarca-actualizar                 # lo último de GitHub (origin/main)
  monarca-actualizar 5123b14         # una versión específica (también para regresar)
  monarca-actualizar -Forzar         # reinstala aunque ya esté en esa versión
#>
param(
  [Parameter(Position = 0)][string]$Version = 'main',
  [switch]$Forzar
)
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true

$Root = $env:MONARCA_ROOT ?? 'C:\Monarca'
$EnvFile = $env:MONARCA_ENV_FILE ?? 'C:\ProgramData\Monarca\monarca.env'
$Repo = Join-Path $Root 'repo'          # clon de GitHub (solo para descargar)
$Versions = Join-Path $Root 'versiones' # una carpeta por versión instalada
$App = Join-Path $Root 'app'            # enlace a la versión en uso (lo usa el servicio)
$Service = $env:MONARCA_SERVICE ?? 'monarca'

# Configuración del servidor (PORT, MONARCA_DB…)
$cfg = @{}
if (Test-Path $EnvFile) {
  foreach ($line in Get-Content $EnvFile) {
    if ($line -match '^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$') { $cfg[$Matches[1]] = $Matches[2].Trim('"') }
  }
}
$Db = $cfg.MONARCA_DB ?? 'C:\ProgramData\Monarca\monarca.db'
$Port = $cfg.PORT ?? '3000'
$DataDir = Split-Path $Db
$Backups = Join-Path $DataDir 'respaldos'
$Log = Join-Path $DataDir 'actualizaciones.log'
New-Item -ItemType Directory -Force -Path $Backups | Out-Null

# Control del servicio (en pruebas se reemplaza por variables de entorno)
function Invoke-Service([string]$action) {
  $custom = [Environment]::GetEnvironmentVariable("MONARCA_${action}_CMD".ToUpper())
  if ($custom) { & pwsh -NoProfile -Command $custom; return }
  switch ($action) {
    'stop' { Stop-Service -Name $Service -ErrorAction Stop }
    'start' { Start-Service -Name $Service -ErrorAction Stop }
  }
}
# El enlace app → versiones\<commit> (unión de carpetas en Windows)
function Set-AppLink([string]$target) {
  if (Test-Path $App) { (Get-Item $App).Delete() }
  $type = $IsWindows ? 'Junction' : 'SymbolicLink'
  New-Item -ItemType $type -Path $App -Target $target | Out-Null
}
function Get-AppTarget {
  if (-not (Test-Path $App)) { return $null }
  $t = (Get-Item $App).Target
  return ($t -is [array]) ? $t[0] : $t
}
function Wait-Health([string]$want) {
  for ($i = 0; $i -lt 40; $i++) {
    try {
      $h = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/health" -TimeoutSec 2
      if ($h.build -and $h.build -eq $want) { return $true }
    } catch { }
    Start-Sleep -Seconds 1
  }
  return $false
}
# Comando externo cuyo fallo es una respuesta, no un error (ej. "¿existe esta versión?")
function Invoke-Quiet([scriptblock]$cmd) {
  $PSNativeCommandUseErrorActionPreference = $false
  $out = & $cmd 2>$null
  $ok = $LASTEXITCODE -eq 0
  $global:LASTEXITCODE = 0
  return [pscustomobject]@{ Ok = $ok; Out = $out }
}
function Say([string]$msg) { Write-Host "`n$msg" -ForegroundColor Cyan }

Start-Transcript -Path $Log -Append | Out-Null
try {
  Write-Host "===== $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') · monarca-actualizar $Version ====="
  $current = Get-AppTarget
  $prev = $current ? (Split-Path $current -Leaf) : $null

  Say '1/6 · Descargando de GitHub…'
  git -C $Repo fetch --quiet --tags --force origin
  $new = $null
  foreach ($ref in @("origin/$Version", $Version)) {
    $r = Invoke-Quiet { git -C $Repo rev-parse --verify --quiet "$ref^{commit}" }
    if ($r.Ok -and $r.Out) { $new = "$($r.Out)".Trim(); break }
  }
  if (-not $new) { throw "No existe la versión '$Version'." }
  $short = $new.Substring(0, 7)
  if ($prev -eq $short -and -not $Forzar) {
    Write-Host "Ya está instalada la versión $short. Nada que hacer (usa -Forzar para reinstalar)."
    return
  }
  Write-Host "Versión instalada: $($prev ?? 'ninguna') · nueva: $short"
  if ($prev) {
    $prevFull = git -C $Repo rev-parse "$prev^{commit}"
    if ((Invoke-Quiet { git -C $Repo merge-base --is-ancestor $prevFull $new }).Ok) {
      Write-Host 'Cambios:'
      git -C $Repo log --oneline --no-decorate "$prevFull..$new" | Select-Object -First 40 | ForEach-Object { "  · $_" }
    } else { Write-Host "(Es una versión anterior o de otra rama: se regresa a $short)" }
  }

  Say '2/6 · Respaldando la base de datos…'
  $backup = Join-Path $Backups ("antes-de-actualizar-{0}-{1}.db" -f (Get-Date -Format 'yyyyMMdd-HHmmss'), ($prev ?? 'nueva'))
  if (Test-Path $Db) {
    $env:MONARCA_DB = $Db
    node (Join-Path $current 'backend/scripts/respaldo.js') $backup | Out-Null
    Write-Host "Respaldo: $backup"
  } else { $backup = $null; Write-Host '(Todavía no hay base de datos)' }

  # Carpeta de la versión nueva: se arma completa sin tocar la que está en uso
  $dir = Join-Path $Versions $short
  $switched = $false
  $created = $false
  try {
    Say "3/6 · Instalando $short…"
    # Si esa versión sigue instalada (ej. al regresar a la anterior) se reutiliza tal cual
    $ready = (Test-Path (Join-Path $dir 'frontend/dist/version.json')) -and (Test-Path (Join-Path $dir 'backend/node_modules'))
    if ($ready) {
      Write-Host '(Ya estaba instalada: se reutiliza su carpeta)'
    } else {
      if (Test-Path $dir) {
        Invoke-Quiet { git -C $Repo worktree remove --force $dir } | Out-Null
        Remove-Item -Recurse -Force $dir -ErrorAction SilentlyContinue
      }
      $created = $true
      git -C $Repo worktree prune
      git -C $Repo worktree add --quiet --detach $dir $new
      Push-Location (Join-Path $dir 'backend'); npm ci --omit=dev --no-audit --no-fund --loglevel=error; Pop-Location
      Push-Location (Join-Path $dir 'frontend'); npm ci --no-audit --no-fund --loglevel=error

      Say '4/6 · Compilando la aplicación…'
      npx vite build --logLevel warn; Pop-Location

      Say '5/6 · Probando el servidor…'
      Push-Location (Join-Path $dir 'backend')
      try { npm test --silent *> $null } catch { throw 'Las pruebas del servidor fallaron.' } finally { Pop-Location }
    }
    $want = (Get-Content (Join-Path $dir 'frontend/dist/version.json') | ConvertFrom-Json).build

    Say '6/6 · Cambiando de versión y reiniciando (unos segundos sin servicio)…'
    Invoke-Service 'stop'
    $switched = $true
    Set-AppLink $dir
    Invoke-Service 'start'
    if (-not (Wait-Health $want)) { throw 'El servidor no respondió con la versión nueva.' }
  } catch {
    Write-Host "`n✗ Falló la actualización: $($_.Exception.Message)" -ForegroundColor Red
    if ($switched -and $current) {
      Write-Host "Regresando a $prev…" -ForegroundColor Red
      try { Invoke-Service 'stop' } catch { }
      Set-AppLink $current
      if ($backup) {
        # La versión nueva no llegó a atender bien: se devuelve la base exacta de antes
        Copy-Item -Force $backup $Db
        Remove-Item -Force -ErrorAction SilentlyContinue "$Db-wal", "$Db-shm"
      }
      Invoke-Service 'start'
      $was = (Get-Content (Join-Path $current 'frontend/dist/version.json') | ConvertFrom-Json).build
      if (Wait-Health $was) { Write-Host "Se regresó a la versión $prev. El sistema sigue funcionando como antes." }
      else { Write-Host "¡ATENCIÓN! El sistema no responde después de regresar. Revisa: monarca-estado" -ForegroundColor Red }
    } else {
      Write-Host "La versión $($prev ?? '') sigue funcionando: no se cambió nada."
    }
    if ($created -and (Test-Path $dir)) {
      Invoke-Quiet { git -C $Repo worktree remove --force $dir } | Out-Null
      Remove-Item -Recurse -Force $dir -ErrorAction SilentlyContinue
    }
    Write-Host "===== Actualización fallida · $($prev ?? '-') → $short ====="
    exit 1
  }

  Write-Host "`n✓ Listo: versión $short funcionando." -ForegroundColor Green
  Write-Host 'Las tablets verán el aviso "Hay una versión nueva".'
  if ($prev) { Write-Host "Para regresar: monarca-actualizar $prev" }
  Write-Host "===== Actualización correcta · $($prev ?? '-') → $short ====="

  # Se conservan la versión en uso y las 3 anteriores, y los últimos 20 respaldos de actualización
  Get-ChildItem $Versions -Directory | Sort-Object CreationTime -Descending | Select-Object -Skip 4 |
    Where-Object { $_.FullName -ne $dir } | ForEach-Object {
      $old = $_.FullName
      Invoke-Quiet { git -C $Repo worktree remove --force $old } | Out-Null
      Remove-Item -Recurse -Force $_.FullName -ErrorAction SilentlyContinue
    }
  git -C $Repo worktree prune
  Get-ChildItem $Backups -Filter 'antes-de-actualizar-*.db' | Sort-Object LastWriteTime -Descending |
    Select-Object -Skip 20 | Remove-Item -Force
} finally {
  Stop-Transcript | Out-Null
}
