# Guía de instalación y revisión · Monarca

Lista para marcar en tres momentos: el **ensayo en la oficina**, la **llegada al hotel** y la
**revisión del día de apertura**. Los detalles técnicos de cada comando están en
[README.md](README.md).

**Equipo:**

- Mini PC con **Windows 11 Pro**: servidor y caja.
- **Impresora de caja** 3nstar RPT004 por **USB**, con la gaveta conectada a ella.
- **Impresora de cocina** 3nstar RPT004 por **cable de red**.
- Tablets de meseros y pantalla de recepción.

**Antes de empezar, ten a la mano:**

- [ ] Acceso al repositorio en GitHub, para agregar la llave de despliegue.
- [ ] El comando del conector del túnel, guardado en tu Mac en `~/.config/hassistemas/monarca-conector.txt`.
- [ ] Tu llave SSH pública, `~/.ssh/id_ed25519.pub` en tu Mac.
- [ ] El driver de la RPT004 para Windows, de la página de 3nstar. Si no está, sirve el driver "Generic / Text Only" de Windows.
- [ ] La utilidad de configuración de 3nstar, para fijar la IP de la impresora de cocina.

---

## Fase 1 · Ensayo general en la oficina

### 1. Windows

- [ ] Windows actualizado y reiniciado.
- [ ] Un usuario administrador para soporte, con contraseña.
- [ ] Un nombre de equipo claro, por ejemplo `MONARCA-CAJA` (Configuración → Sistema → Información).

### 2. Instalar el sistema

- [ ] En **Terminal (Administrador)**:
      `Set-ExecutionPolicy -Scope Process Bypass -Force` y luego `.\instalar.ps1 -Caja`.
- [ ] Pegar en GitHub la llave de despliegue que muestra el script (solo lectura).
- [ ] Al terminar, el script muestra la dirección para las tablets.
- [ ] `monarca-estado`:
  - servicio **monarca** en _Running_;
  - "El servidor responde";
  - red como **Private**;
  - firewall abierto.

### 3. Impresora de caja (USB) y gaveta

- [ ] Conectar la impresora por USB y la gaveta al puerto RJ11 de la impresora.
- [ ] Instalar el driver y ponerle de nombre **`Caja`** (Configuración → Bluetooth y dispositivos → Impresoras).
- [ ] En el sistema, entrar como gerente → **Configuración → Impresoras → Caja** → **USB** → elegir **Caja** de la lista → **Guardar**.
- [ ] **Imprimir prueba**: deben salir los acentos y la ñ bien, y el papel debe cortarse.
- [ ] Cobrar algo en **efectivo**: sale el comprobante y **se abre la gaveta**. Con tarjeta, la gaveta no se abre.

### 4. Impresora de cocina (red)

- [ ] Conectarla por cable al mismo router que la mini PC.
- [ ] Ver su IP en la hoja de configuración: se imprime al encenderla con FEED presionado.
- [ ] **Configuración → Impresoras → Cocina** → **Red (IP)** → esa IP, puerto `9100` → **Guardar** → **Imprimir prueba**.
- [ ] Apagar la impresora y enviar una comanda:
  - todas las pantallas muestran "La impresora de cocina no responde";
  - al encenderla, la comanda sale sola.

### 5. Túnel (acceso desde fuera)

- [ ] En Terminal (Administrador), pegar el comando de `monarca-conector.txt`.
- [ ] En Cloudflare → Networks → Tunnels, **monarca** aparece como _Healthy_.
- [ ] Desde el celular **con datos móviles** (sin WiFi), abrir `https://monarca.hassistemas.com`:
  - pide el código por correo;
  - luego el PIN;
  - después aparece el sistema.

### 6. Soporte remoto

- [ ] Pegar tu llave pública en `C:\ProgramData\ssh\administrators_authorized_keys`.
- [ ] Desde tu Mac, en otra red, correr `ssh monarca-soporte.hassistemas.com`. Pide el código por correo y entra con tu llave.
- [ ] Ahí mismo, `monarca-estado` funciona.
- [ ] Probar una actualización completa:
  - sube un cambio pequeño a GitHub;
  - corre `monarca-actualizar`;
  - las tablets muestran "Hay una versión nueva".
- [ ] Probar el regreso: `monarca-actualizar <versión anterior>`.

### 7. Tablets y recorrido completo

- [ ] En cada tablet, conectarla al WiFi, abrir la dirección que dio `monarca-estado` y luego **Chrome → ⋮ → Agregar a pantalla de inicio**.
- [ ] **Recorrido:**
  1. Abrir caja.
  2. Abrir una mesa, pedir y enviar: la comanda sale en cocina.
  3. Marchar un tiempo y anular un platillo con PIN: salen en cocina.
  4. Cobrar: el comprobante sale en caja.
  5. Hacer un cargo a una habitación, una venta de la tienda y un abono de un evento.
  6. Cerrar la caja: sale el resumen del cierre.
- [ ] Dos tablets a la vez: lo que hace una aparece en la otra sin recargar.

### 8. Fallas a propósito

- [ ] **Sin internet:** desconecta el internet del router, pero no el WiFi. Las tablets siguen trabajando normal. Al reconectar, el túnel vuelve solo.
- [ ] **Sin WiFi en una tablet:** sigue tomando el pedido con el aviso "cambios pendientes", y al volver el WiFi se guarda solo.
- [ ] **Reinicio:** apaga y enciende la mini PC. El sistema arranca solo y la caja abre a pantalla completa. Para salir de la pantalla completa: Alt+F4.

---

## Fase 2 · Llegada al hotel

La red cambia, pero el túnel no se afecta. Lo que sí cambia son las IP locales.

- [ ] Conectar la mini PC a la red del hotel, de preferencia **por cable**.
- [ ] `monarca-estado`:
  - si la red aparece como **PÚBLICA**, corre el comando que sugiere para dejarla **Privada**;
  - anota la IP y la dirección para las tablets.
- [ ] En el router del hotel, **reservar IP fija** (reserva DHCP) para la mini PC y para la impresora de cocina.
- [ ] **Impresora de cocina:**
  - darle una IP fija dentro de la red del hotel con la utilidad de 3nstar;
  - cambiarla en **Configuración → Impresoras → Cocina**;
  - **Imprimir prueba**.
- [ ] **Impresora de caja (USB):** no cambia. Solo **Imprimir prueba**.
- [ ] **Tablets:**
  - conectarlas al WiFi del hotel;
  - borrar el ícono anterior;
  - crear el nuevo con la dirección nueva (Agregar a pantalla de inicio).
- [ ] **Desde fuera:** con datos móviles, `https://monarca.hassistemas.com` → código → PIN.
- [ ] **Datos reales:** revisar con la gerencia el menú, precios, recetas, habitaciones, tarifas, salones, productos de la tienda, inventario inicial, y los usuarios con su PIN.
- [ ] **Borrar los datos de prueba:**
  - en Terminal (Administrador), `monarca-limpiar-pruebas` (pide escribir BORRAR);
  - conserva catálogos, usuarios y configuración, y hace un respaldo antes.
- [ ] **Acceso de la dueña:**
  - agregar su correo en Cloudflare → Access controls → Policies → _Monarca · sistema_;
  - instalarle el ícono en su celular.

---

## Fase 3 · Revisión del día de apertura

| Revisar               | Cómo                                                      | ✓   |
| --------------------- | --------------------------------------------------------- | --- |
| Servidor              | `monarca-estado`: monarca _Running_ y responde            | ☐   |
| Red privada e IP fija | `monarca-estado` sin avisos en rojo                       | ☐   |
| Túnel                 | `cloudflared` _Running_; Cloudflare dice _Healthy_        | ☐   |
| Caja (USB)            | Imprimir prueba y abrir caja con un cobro en efectivo     | ☐   |
| Cocina (red)          | Enviar una comanda de prueba                              | ☐   |
| Tablets               | Cada una entra con su PIN desde el ícono                  | ☐   |
| Datos limpios         | Ventas del día en 0; menú y precios reales                | ☐   |
| Caja abierta          | Fondo inicial contado y registrado                        | ☐   |
| Dueña                 | Entra desde su celular con código y PIN                   | ☐   |
| Respaldo              | `monarca-estado` muestra el respaldo previo a la limpieza | ☐   |

---

## Si algo falla

| Síntoma                                        | Causa probable                                                    | Qué hacer                                                                        |
| ---------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Las tablets no abren el sistema                | La red de Windows quedó **Pública**, o cambió la IP de la mini PC | `monarca-estado`: corregir la red; reservar la IP en el router; rehacer el ícono |
| "La impresora de cocina no responde"           | Sin papel, apagada, cable suelto o cambió su IP                   | Revisarla; corregir la IP en Configuración → Impresoras; tocar **Reintentar**    |
| "La impresora USB está desconectada o apagada" | Cable USB, impresora apagada o sin papel                          | Revisarla; el ticket sale solo al volver                                         |
| La gaveta no abre                              | Cable RJ11 o la opción apagada                                    | Revisar el cable y **Configuración → Impresoras → Abrir la gaveta**              |
| Desde fuera, "Error 1033"                      | El túnel no está conectado (sin internet o servicio detenido)     | `monarca-estado`; `Restart-Service cloudflared`                                  |
| Desde fuera no llega el código                 | El correo no está autorizado                                      | Agregarlo en Access controls → Policies                                          |
| Algo falló después de actualizar               | Versión nueva con problema                                        | `monarca-actualizar <versión anterior>` (regresa en ~3 s)                        |
