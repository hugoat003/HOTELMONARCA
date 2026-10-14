<#
  Envía bytes ESC/POS tal cual ("RAW") a una impresora instalada en Windows (USB).
  Lo usa el servidor: powershell.exe -File rawprint.ps1 -Printer "Caja" -File ticket.bin
  La primera vez compila un pequeño ayudante y lo guarda en C:\ProgramData\Monarca para ir rápido.
#>
param(
  [Parameter(Mandatory = $true)][string]$Printer,
  [Parameter(Mandatory = $true)][string]$File
)
$ErrorActionPreference = 'Stop'
# Los mensajes de error llegan al servidor en UTF-8 (acentos y ñ)
[Console]::OutputEncoding = [Text.Encoding]::UTF8
trap {
  $e = $_.Exception
  while ($e.InnerException) { $e = $e.InnerException }
  [Console]::Error.WriteLine($e.Message)
  exit 1
}

# ¿Está conectada y lista? (Windows marca "sin conexión" una impresora USB desconectada)
$p = Get-CimInstance Win32_Printer -Filter ("Name='{0}'" -f ($Printer -replace "'", "''"))
if (-not $p) { throw "No existe la impresora '$Printer' en Windows. Revisa el nombre en Configuración → Impresoras." }
if ($p.WorkOffline) { throw 'La impresora USB está desconectada o apagada.' }
switch ([int]$p.DetectedErrorState) {
  4 { throw 'La impresora no tiene papel.' }
  7 { throw 'La tapa de la impresora está abierta.' }
  8 { throw 'El papel está atorado.' }
  9 { throw 'La impresora USB está desconectada o apagada.' }
}

$dir = Join-Path $env:ProgramData 'Monarca'
$dll = Join-Path $dir 'rawprinter-1.dll'
if (-not ('RawPrinter' -as [type])) {
  if (-not (Test-Path $dll)) {
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    Add-Type -OutputAssembly $dll -OutputType Library -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class RawPrinter {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public class DOCINFO {
    [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
  }
  [DllImport("winspool.drv", EntryPoint = "OpenPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
  static extern bool OpenPrinter(string name, out IntPtr handle, IntPtr defaults);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool ClosePrinter(IntPtr handle);
  [DllImport("winspool.drv", EntryPoint = "StartDocPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
  static extern int StartDocPrinter(IntPtr handle, int level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFO info);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool EndDocPrinter(IntPtr handle);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool StartPagePrinter(IntPtr handle);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool EndPagePrinter(IntPtr handle);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool WritePrinter(IntPtr handle, byte[] data, int count, out int written);

  public static void Send(string printer, byte[] data, string docName) {
    IntPtr h;
    if (!OpenPrinter(printer, out h, IntPtr.Zero))
      throw new Exception("No se pudo abrir la impresora (" + Marshal.GetLastWin32Error() + ")");
    try {
      DOCINFO info = new DOCINFO();
      info.pDocName = docName;
      info.pDataType = "RAW";
      if (StartDocPrinter(h, 1, info) == 0)
        throw new Exception("No se pudo iniciar la impresión (" + Marshal.GetLastWin32Error() + ")");
      try {
        StartPagePrinter(h);
        int written;
        if (!WritePrinter(h, data, data.Length, out written) || written != data.Length)
          throw new Exception("No se pudo enviar el ticket (" + Marshal.GetLastWin32Error() + ")");
        EndPagePrinter(h);
      } finally {
        EndDocPrinter(h);
      }
    } finally {
      ClosePrinter(h);
    }
  }
}
'@
  }
  Add-Type -Path $dll
}
[RawPrinter]::Send($Printer, [IO.File]::ReadAllBytes($File), 'POS Monarca')
