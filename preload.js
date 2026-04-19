const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  // Códigos de barra
  buscarCodigo:     (codigo) => ipcRenderer.invoke('codigos:buscar', codigo),
  registrarCodigo:  (data)   => ipcRenderer.invoke('codigos:registrar', data),
  reemplazarCodigo: (data)   => ipcRenderer.invoke('codigos:reemplazar', data),

  // Productos
  listarProductos:   ()         => ipcRenderer.invoke('productos:listar'),
  crearProducto:     (data)     => ipcRenderer.invoke('productos:crear', data),
  actualizarProducto:(id, data) => ipcRenderer.invoke('productos:actualizar', id, data),
  ajustarStock:      (id, delta)=> ipcRenderer.invoke('productos:ajustarStock', { id, delta }),
  toggleActivo:      (id)       => ipcRenderer.invoke('productos:toggleActivo', id),
  buscarProductos:   (q)        => ipcRenderer.invoke('productos:buscar', q),
  alertasStock:      ()         => ipcRenderer.invoke('productos:alertas'),

  // Ventas
  crearVenta:    (data)    => ipcRenderer.invoke('ventas:crear', data),
  listarVentas:  (filtros) => ipcRenderer.invoke('ventas:listar', filtros),
  detalleVenta:  (id)      => ipcRenderer.invoke('ventas:detalle', id),
  anularVenta:   (id)      => ipcRenderer.invoke('ventas:anular', id),

  // Balance
  balanceSemanal: (inicio, fin) => ipcRenderer.invoke('balance:semanal', inicio, fin),
  resumenHoy:     ()            => ipcRenderer.invoke('balance:hoy'),

  // Dashboard
  dashboardResumen: () => ipcRenderer.invoke('dashboard:resumen'),

  // Categorías
  listarCategorias:     (soloActivas) => ipcRenderer.invoke('categorias:listar', soloActivas),
  crearCategoria:       (data)        => ipcRenderer.invoke('categorias:crear', data),
  actualizarCategoria:  (data)        => ipcRenderer.invoke('categorias:actualizar', data),
  toggleActivoCategoria:(id)          => ipcRenderer.invoke('categorias:toggleActivo', id),

  // Clientes
  listarClientes:     ()     => ipcRenderer.invoke('clientes:listar'),
  crearCliente:       (data) => ipcRenderer.invoke('clientes:crear', data),
  actualizarCliente:  (data) => ipcRenderer.invoke('clientes:actualizar', data),
  toggleActivoCliente:(id)   => ipcRenderer.invoke('clientes:toggleActivo', id),

  // Proveedores
  listarProveedores:     ()     => ipcRenderer.invoke('proveedores:listar'),
  crearProveedor:        (data) => ipcRenderer.invoke('proveedores:crear', data),
  actualizarProveedor:   (data) => ipcRenderer.invoke('proveedores:actualizar', data),
  toggleActivoProveedor: (id)   => ipcRenderer.invoke('proveedores:toggleActivo', id),

  // Entradas de stock
  crearEntrada:  (data)    => ipcRenderer.invoke('entradas:crear', data),
  listarEntradas:(filtros) => ipcRenderer.invoke('entradas:listar', filtros),

  // Configuración
  configObtener: ()      => ipcRenderer.invoke('config:obtener'),
  configGuardar: (datos) => ipcRenderer.invoke('config:guardar', datos),
  configBackup:  ()      => ipcRenderer.invoke('config:backup'),
  resetDB:       ()      => ipcRenderer.invoke('config:resetDB'),

  // Reportes
  generarExcel: (params) => ipcRenderer.invoke('reportes:excel', params),

  // Auth / Usuarios
  login:              (data) => ipcRenderer.invoke('auth:login', data),
  listarUsuarios:     ()     => ipcRenderer.invoke('usuarios:listar'),
  crearUsuario:       (data) => ipcRenderer.invoke('usuarios:crear', data),
  toggleActivoUsuario:(id)   => ipcRenderer.invoke('usuarios:toggleActivo', id),
})
