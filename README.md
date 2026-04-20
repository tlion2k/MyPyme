# MyPyme

Aplicación de escritorio para gestión de stock y ventas de pequeñas tiendas. Funciona completamente offline — todos los datos se guardan en el equipo, sin servidor ni conexión a internet.

## Stack

- **Electron 41** — app de escritorio para Windows
- **sql.js** — SQLite compilado a WebAssembly (sin compilación nativa, compatible con cualquier versión de Electron)
- **XLSX** — generación de reportes Excel
- **HTML/CSS/JS** — interfaz del punto de venta

## Requisitos (solo para desarrollo)

- [Node.js 20+](https://nodejs.org/)
- El usuario final no necesita instalar nada

## Instalación (desarrollo)

```bash
git clone <repo>
cd mypyme
npm install
npm run dev
```

## Comandos

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Inicia la app en modo desarrollo (con DevTools) |
| `npm start` | Inicia la app en modo normal |
| `npm run build` | Genera el instalador `.exe` en `/dist` |

## Estructura del proyecto

```
mypyme/
├── main.js                    # Proceso principal Electron
├── preload.js                 # Bridge seguro renderer ↔ main
├── package.json
├── src/
│   ├── database/
│   │   └── db.js              # Schema SQLite, migraciones e inicialización
│   ├── handlers/
│   │   └── index.js           # IPC handlers (todas las operaciones de DB)
│   └── renderer/
│       ├── index.html         # UI principal
│       ├── styles.css         # Estilos (tema claro/oscuro)
│       └── app.js             # Lógica del frontend
└── assets/
    └── image/
        └── logo-ico.ico       # Ícono de la app
```

## Base de datos

El archivo `mypyme.db` se guarda automáticamente en:

```
C:\Users\<usuario>\AppData\Roaming\MyPyme\mypyme.db
```

Para respaldar la data se puede usar el botón **Backup** en Configuración, que copia el archivo a la carpeta Descargas. Para reiniciar completamente, usar el botón **Reset** en Configuración.

## Módulos

| Módulo | Descripción |
|--------|-------------|
| **Punto de venta** | Búsqueda por nombre o código de barras, carrito, descuentos, selección de método de pago y confirmación con descuento automático de stock |
| **Dashboard** | KPIs de hoy / últimos 7 días / mes actual, gráfico de tendencia 30 días, top 5 productos y desglose por método de pago |
| **Historial** | Listado de ventas con filtros por fecha y estado, detalle por venta, anulación con restitución de stock e impresión de boleta |
| **Productos** | Listado con alertas de stock, búsqueda, creación, edición, ajuste manual de stock y registro de entradas de mercadería por proveedor |
| **Reportes** | Balance por rango de fechas y reporte Excel mensual de 6 hojas (resumen, ventas por día, top productos, métodos de pago, historial, inventario) |
| **Configuración** | Datos del negocio, gestión de usuarios, categorías, clientes, proveedores, tema claro/oscuro, backup y reset de base de datos |

## Validaciones de stock

- Al confirmar una venta, el sistema verifica stock suficiente para cada ítem.
- Si un producto no tiene stock disponible, la venta se rechaza con mensaje de error y la transacción se revierte completa.
- En Productos, el stock se muestra en rojo **"Sin stock"** cuando llega a 0, y en amarillo con `⚠` cuando está bajo el mínimo configurado.

## Escáner de código de barras

Los lectores USB funcionan como teclado (HID): escriben el código y presionan Enter automáticamente. La app captura el evento en el campo de búsqueda sin configuración adicional. También es posible registrar y reemplazar códigos por producto desde la vista de edición.

## Usuarios y roles

| Rol | Permisos |
|-----|----------|
| `admin` | Acceso completo: ventas, productos, reportes, configuración y gestión de usuarios |
| `funcionario` | Ventas, historial y consulta de productos |

Credenciales por defecto: usuario `admin` / contraseña `admin`. Se recomienda cambiarla antes de operar.

## Reporte Excel mensual

El reporte generado desde **Reportes → Exportar Excel** incluye 6 hojas:

1. **Resumen** — totales de ventas, ingresos, descuentos, costo, ganancia neta y margen %
2. **Ventas por día** — desglose diario del período
3. **Top 20 productos** — unidades vendidas, precio promedio e ingresos
4. **Por método de pago** — efectivo, débito, crédito, transferencia
5. **Historial** — log completo de transacciones con estado
6. **Inventario** — stock actual, mínimos, precios y estado (OK / REPONER)

## Generar instalador .exe

```bash
npm run build
```

Genera `dist/MyPyme Setup X.X.X.exe`. El instalador incluye todo — el usuario solo hace doble clic e instala en el directorio que elija.
