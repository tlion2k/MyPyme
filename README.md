# localService

Administrador de ventas y stock para pequeñas tiendas. Funciona en Windows como app de escritorio (.exe), sin servidor ni instalación adicional para el usuario final.

## Stack

- **Electron 41** — app de escritorio para Windows
- **sql.js** — SQLite compilado a WebAssembly (sin compilación nativa, compatible con cualquier versión de Electron)
- **HTML/CSS/JS** — interfaz del punto de venta

## Requisitos (solo para desarrollo)

- [Node.js 20+](https://nodejs.org/)
- El usuario final no necesita instalar nada

## Instalación

```bash
git clone <repo>
cd localservice
npm install
npm run dev
```

## Comandos

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Inicia la app en modo desarrollo |
| `npm start` | Inicia la app en modo normal |
| `npm run build` | Genera el instalador `.exe` en `/dist` |

## Estructura del proyecto

```
localservice/
├── main.js                    # Proceso principal Electron
├── preload.js                 # Bridge seguro renderer ↔ main
├── package.json
├── src/
│   ├── database/
│   │   └── db.js              # Schema SQLite, inicialización y datos demo
│   ├── handlers/
│   │   └── index.js           # IPC handlers (todas las operaciones de DB)
│   └── renderer/
│       ├── index.html         # UI principal
│       ├── styles.css         # Estilos
│       └── app.js             # Lógica del frontend
└── assets/
    └── icon.ico               # Ícono de la app
```

## Base de datos

El archivo `localservice.db` se guarda automáticamente en:

```
C:\Users\<usuario>\AppData\Roaming\localservice\localservice.db
```

Para respaldar la data basta con copiar ese archivo. Para reiniciar con datos demo, elimínalo y relanza la app.

## Módulos

| Módulo | Descripción |
|--------|-------------|
| **Venta** | Búsqueda por nombre o código de barras, carrito, selección de tipo de pago y confirmación con descuento automático de stock |
| **Productos** | Listado con alertas de stock bajo (amarillo) y sin stock (rojo), búsqueda, creación y edición |
| **Balance** | Generación de resumen semanal: total de ventas, ingresos, costo y ganancia neta |
| **Alertas** | Panel con productos cuyo stock está por debajo del mínimo configurado |

## Validaciones de stock

- Al confirmar una venta, el sistema verifica que haya stock suficiente para cada ítem.
- Si un producto no tiene stock disponible, la venta se rechaza con mensaje de error y la transacción se revierte completa.
- En la vista Productos, el stock se muestra en rojo **"Sin stock"** cuando llega a 0, y en amarillo con `⚠` cuando está bajo el mínimo.

## Escáner de código de barras

Los lectores USB funcionan como teclado (HID): escriben el código y presionan Enter automáticamente. La app captura el evento en el campo de búsqueda — no requiere configuración adicional.

## Generar instalador .exe

```bash
npm run build
```

Genera `dist/localService Setup X.X.X.exe`. El instalador es autocontenido — el usuario solo hace doble clic.

## Próximos pasos sugeridos

- [ ] Generación de boleta en PDF
- [ ] Historial de ventas con filtros por fecha
- [ ] Exportar balance a Excel
- [ ] Configuración de datos de la tienda (nombre, RUT, dirección)
- [ ] Gestión de categorías desde la interfaz
