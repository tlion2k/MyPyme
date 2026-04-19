const { app, shell } = require('electron')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const { getDB, getDBPath } = require('../database/db')

function registerHandlers(ipcMain) {
  // ─────────────────────────────────────────
  // CÓDIGOS DE BARRA
  // ─────────────────────────────────────────

  ipcMain.handle('codigos:buscar', (_e, codigo) => {
    const db = getDB()
    const row = db.prepare(`
      SELECT p.*, cb.codigo, cb.id as codigo_id
      FROM codigo_barra cb
      JOIN producto p ON p.id = cb.producto_id
      WHERE cb.codigo = ? AND cb.activo = 1 AND p.activo = 1
    `).get(codigo)
    return row ?? null
  })

  ipcMain.handle('codigos:registrar', (_e, { productoId, codigo }) => {
    return getDB().prepare('INSERT INTO codigo_barra (producto_id, codigo) VALUES (?, ?)').run(productoId, codigo)
  })

  ipcMain.handle('codigos:reemplazar', (_e, { productoId, codigoNuevo, motivo }) => {
    const db = getDB()
    return db.transaction(() => {
      db.prepare(`
        UPDATE codigo_barra
        SET activo = 0, vigente_hasta = datetime('now','localtime'), motivo_cambio = ?
        WHERE producto_id = ? AND activo = 1
      `).run(motivo ?? 'Reemplazo manual', productoId)
      return db.prepare('INSERT INTO codigo_barra (producto_id, codigo) VALUES (?, ?)').run(productoId, codigoNuevo)
    })()
  })

  // ─────────────────────────────────────────
  // PRODUCTOS
  // ─────────────────────────────────────────

  ipcMain.handle('productos:listar', () => {
    return getDB().prepare(`
      SELECT p.*, c.nombre as categoria_nombre,
             (SELECT codigo FROM codigo_barra WHERE producto_id = p.id AND activo = 1 LIMIT 1) as codigo_activo
      FROM producto p
      LEFT JOIN categoria c ON c.id = p.categoria_id
      ORDER BY p.activo DESC, COALESCE(c.nombre, 'Sin categoría'), p.nombre
    `).all()
  })

  ipcMain.handle('productos:buscar', (_e, q) => {
    const term = `%${q}%`
    return getDB().prepare(`
      SELECT p.*, c.nombre as categoria_nombre
      FROM producto p
      LEFT JOIN categoria c ON c.id = p.categoria_id
      WHERE p.activo = 1 AND (p.nombre LIKE ? OR p.descripcion LIKE ?)
      ORDER BY p.nombre LIMIT 30
    `).all(term, term)
  })

  ipcMain.handle('productos:crear', (_e, data) => {
    const db = getDB()
    return db.transaction(() => {
      const r = db.prepare(`
        INSERT INTO producto (categoria_id, nombre, descripcion, precio_compra, precio_venta, stock, stock_minimo, unidad)
        VALUES (@categoria_id, @nombre, @descripcion, @precio_compra, @precio_venta, @stock, @stock_minimo, @unidad)
      `).run(data)
      if (data.codigo) {
        db.prepare('INSERT INTO codigo_barra (producto_id, codigo) VALUES (?, ?)').run([r.lastInsertRowid, data.codigo])
      }
      return { id: r.lastInsertRowid }
    })()
  })

  ipcMain.handle('productos:actualizar', (_e, id, data) => {
    return getDB().prepare(`
      UPDATE producto SET
        nombre        = @nombre,
        descripcion   = @descripcion,
        precio_compra = @precio_compra,
        precio_venta  = @precio_venta,
        stock         = @stock,
        stock_minimo  = @stock_minimo,
        unidad        = @unidad,
        categoria_id  = @categoria_id,
        actualizado_en = datetime('now','localtime')
      WHERE id = ${id}
    `).run(data)
  })

  ipcMain.handle('productos:ajustarStock', (_e, { id, delta }) => {
    return getDB().prepare(`
      UPDATE producto SET stock = MAX(0, stock + ?), actualizado_en = datetime('now','localtime') WHERE id = ?
    `).run([delta, id])
  })

  ipcMain.handle('productos:toggleActivo', (_e, id) => {
    return getDB().prepare(`
      UPDATE producto SET activo = CASE WHEN activo = 1 THEN 0 ELSE 1 END, actualizado_en = datetime('now','localtime') WHERE id = ?
    `).run([id])
  })

  ipcMain.handle('productos:alertas', () => {
    return getDB().prepare(`
      SELECT p.*, c.nombre as categoria_nombre
      FROM producto p
      LEFT JOIN categoria c ON c.id = p.categoria_id
      WHERE p.activo = 1 AND p.stock <= p.stock_minimo
      ORDER BY (p.stock - p.stock_minimo)
    `).all()
  })

  // ─────────────────────────────────────────
  // VENTAS
  // ─────────────────────────────────────────

  ipcMain.handle('ventas:crear', (_e, { items, tipoPago, nota, descuento = 0, clienteId = null }) => {
    const db = getDB()
    return db.transaction(() => {
      const subtotal = items.reduce((sum, i) => sum + i.subtotal, 0)
      const total = Math.max(0, subtotal - descuento)
      const numeroBoleta = _generarNumeroBoleta()

      const venta = db.prepare(`
        INSERT INTO venta (numero_boleta, tipo_pago, total, descuento, cliente_id, nota)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run([numeroBoleta, tipoPago, total, descuento, clienteId, nota ?? null])

      const ventaId = venta.lastInsertRowid
      const getStock = db.prepare('SELECT stock, nombre FROM producto WHERE id = ?')
      const insertDetalle = db.prepare(`
        INSERT INTO detalle_venta (venta_id, producto_id, cantidad, precio_unitario, subtotal)
        VALUES (?, ?, ?, ?, ?)
      `)
      const actualizarStock = db.prepare(`
        UPDATE producto SET stock = stock - ? WHERE id = ?
      `)

      for (const item of items) {
        const prod = getStock.get([item.productoId])
        if (!prod || prod.stock < item.cantidad) {
          const err = new Error(`Stock insuficiente: "${prod?.nombre ?? item.productoId}" tiene ${prod?.stock ?? 0} unidad(es)`)
          err.code = 'STOCK_INSUFICIENTE'
          throw err
        }
        insertDetalle.run([ventaId, item.productoId, item.cantidad, item.precioUnitario, item.subtotal])
        actualizarStock.run([item.cantidad, item.productoId])
      }

      return { ventaId, numeroBoleta, total, descuento }
    })()
  })

  ipcMain.handle('ventas:listar', (_e, filtros = {}) => {
    const db = getDB()
    let query = `
      SELECT v.*, c.nombre as cliente_nombre
      FROM venta v
      LEFT JOIN cliente c ON c.id = v.cliente_id
      WHERE 1=1`
    const params = []
    if (filtros.desde) { query += ` AND date(v.fecha) >= ?`; params.push(filtros.desde) }
    if (filtros.hasta) { query += ` AND date(v.fecha) <= ?`; params.push(filtros.hasta + ' 23:59:59') }
    if (filtros.estado) { query += ` AND v.estado = ?`; params.push(filtros.estado) }
    query += ` ORDER BY v.fecha DESC LIMIT 200`
    return db.prepare(query).all(...params)
  })

  ipcMain.handle('ventas:detalle', (_e, ventaId) => {
    const db = getDB()
    const venta = db.prepare(`
      SELECT v.*, c.nombre as cliente_nombre
      FROM venta v LEFT JOIN cliente c ON c.id = v.cliente_id
      WHERE v.id = ?
    `).get(ventaId)
    const items = db.prepare(`
      SELECT dv.*, p.nombre as producto_nombre
      FROM detalle_venta dv
      JOIN producto p ON p.id = dv.producto_id
      WHERE dv.venta_id = ?
    `).all(ventaId)
    return { venta, items }
  })

  ipcMain.handle('ventas:anular', (_e, ventaId) => {
    const db = getDB()
    return db.transaction(() => {
      const venta = db.prepare('SELECT * FROM venta WHERE id = ?').get([ventaId])
      if (!venta || venta.estado !== 'completada') throw new Error('La venta no puede anularse')
      const items = db.prepare('SELECT * FROM detalle_venta WHERE venta_id = ?').all([ventaId])
      for (const item of items) {
        db.prepare('UPDATE producto SET stock = stock + ?, actualizado_en = datetime(\'now\',\'localtime\') WHERE id = ?').run([item.cantidad, item.producto_id])
      }
      db.prepare("UPDATE venta SET estado = 'anulada' WHERE id = ?").run([ventaId])
      return { ok: true }
    })()
  })

  // ─────────────────────────────────────────
  // BALANCE
  // ─────────────────────────────────────────

  ipcMain.handle('balance:hoy', () => {
    return getDB().prepare(`
      SELECT
        COUNT(*) as total_ventas,
        COALESCE(SUM(total), 0) as ingresos,
        COALESCE(SUM(
          (SELECT SUM(dv.cantidad * p.precio_compra)
           FROM detalle_venta dv JOIN producto p ON p.id = dv.producto_id
           WHERE dv.venta_id = v.id)
        ), 0) as costo_total
      FROM venta v
      WHERE date(fecha) = date('now','localtime') AND estado = 'completada'
    `).get()
  })

  ipcMain.handle('balance:semanal', (_e, inicio, fin) => {
    const db = getDB()
    const resumen = db.prepare(`
      SELECT
        COUNT(v.id) as total_ventas,
        COALESCE(SUM(v.total), 0) as ingresos,
        COALESCE(SUM(
          (SELECT SUM(dv.cantidad * p.precio_compra)
           FROM detalle_venta dv JOIN producto p ON p.id = dv.producto_id
           WHERE dv.venta_id = v.id)
        ), 0) as costo_total
      FROM venta v
      WHERE date(v.fecha) BETWEEN ? AND ? AND v.estado = 'completada'
    `).get([inicio, fin])

    resumen.ganancia_neta = (resumen.ingresos ?? 0) - (resumen.costo_total ?? 0)

    db.prepare(`
      INSERT INTO balance_semanal (semana_inicio, semana_fin, total_ventas, ingresos, costo_total, ganancia_neta)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run([inicio, fin, resumen.total_ventas, resumen.ingresos ?? 0, resumen.costo_total ?? 0, resumen.ganancia_neta])

    return resumen
  })

  // ─────────────────────────────────────────
  // DASHBOARD
  // ─────────────────────────────────────────

  ipcMain.handle('dashboard:resumen', () => {
    const db = getDB()

    const kpiQuery = (where) => db.prepare(`
      SELECT COUNT(*) as ventas,
             COALESCE(SUM(total), 0) as ingresos,
             COALESCE(SUM((SELECT SUM(dv.cantidad * p.precio_compra)
               FROM detalle_venta dv JOIN producto p ON p.id = dv.producto_id
               WHERE dv.venta_id = v.id)), 0) as costo
      FROM venta v WHERE ${where} AND estado = 'completada'
    `).get()

    const hoy    = kpiQuery(`date(fecha) = date('now','localtime')`)
    const semana = kpiQuery(`date(fecha) >= date('now','localtime','-6 days')`)
    const mes    = kpiQuery(`strftime('%Y-%m', fecha) = strftime('%Y-%m', 'now', 'localtime')`)

    const porDia = db.prepare(`
      SELECT date(fecha) as dia,
             COUNT(*) as ventas,
             COALESCE(SUM(total), 0) as ingresos
      FROM venta
      WHERE date(fecha) >= date('now','localtime','-29 days') AND estado = 'completada'
      GROUP BY dia ORDER BY dia
    `).all()

    const topProductos = db.prepare(`
      SELECT p.nombre,
             SUM(dv.cantidad) as unidades,
             COALESCE(SUM(dv.subtotal), 0) as ingresos
      FROM detalle_venta dv
      JOIN producto p ON p.id = dv.producto_id
      JOIN venta v ON v.id = dv.venta_id
      WHERE strftime('%Y-%m', v.fecha) = strftime('%Y-%m', 'now', 'localtime')
        AND v.estado = 'completada'
      GROUP BY dv.producto_id ORDER BY unidades DESC LIMIT 5
    `).all()

    const porPago = db.prepare(`
      SELECT tipo_pago,
             COUNT(*) as ventas,
             COALESCE(SUM(total), 0) as ingresos
      FROM venta
      WHERE strftime('%Y-%m', fecha) = strftime('%Y-%m', 'now', 'localtime')
        AND estado = 'completada'
      GROUP BY tipo_pago ORDER BY ingresos DESC
    `).all()

    return {
      hoy:    { ...hoy,    ganancia: (hoy.ingresos    ?? 0) - (hoy.costo    ?? 0) },
      semana: { ...semana, ganancia: (semana.ingresos  ?? 0) - (semana.costo  ?? 0) },
      mes:    { ...mes,    ganancia: (mes.ingresos     ?? 0) - (mes.costo     ?? 0) },
      porDia,
      topProductos,
      porPago,
    }
  })

  // ─────────────────────────────────────────
  // CATEGORÍAS
  // ─────────────────────────────────────────

  ipcMain.handle('categorias:listar', (_e, soloActivas = true) => {
    const sql = soloActivas
      ? 'SELECT * FROM categoria WHERE activo = 1 ORDER BY nombre'
      : 'SELECT * FROM categoria ORDER BY activo DESC, nombre'
    return getDB().prepare(sql).all()
  })

  ipcMain.handle('categorias:crear', (_e, { nombre, descripcion }) => {
    return getDB().prepare('INSERT INTO categoria (nombre, descripcion) VALUES (?, ?)').run([nombre, descripcion ?? null])
  })

  ipcMain.handle('categorias:actualizar', (_e, { id, nombre, descripcion }) => {
    return getDB().prepare('UPDATE categoria SET nombre = ?, descripcion = ? WHERE id = ?').run([nombre, descripcion ?? null, id])
  })

  ipcMain.handle('categorias:toggleActivo', (_e, id) => {
    return getDB().prepare('UPDATE categoria SET activo = CASE WHEN activo=1 THEN 0 ELSE 1 END WHERE id = ?').run([id])
  })

  // ─────────────────────────────────────────
  // USUARIOS
  // ─────────────────────────────────────────

  ipcMain.handle('auth:login', (_e, { username, password }) => {
    const hash = crypto.createHash('sha256').update(password).digest('hex')
    const user = getDB().prepare('SELECT id, username, nombre, rol FROM usuario WHERE username = ? AND password = ? AND activo = 1').get([username, hash])
    return user ?? null
  })

  ipcMain.handle('usuarios:listar', () => {
    return getDB().prepare('SELECT id, username, nombre, rol, activo, creado_en FROM usuario ORDER BY rol DESC, username').all()
  })

  ipcMain.handle('usuarios:crear', (_e, { username, password, nombre }) => {
    const hash = crypto.createHash('sha256').update(password).digest('hex')
    return getDB().prepare('INSERT INTO usuario (username, password, nombre, rol) VALUES (?, ?, ?, ?)').run([username, hash, nombre ?? null, 'funcionario'])
  })

  ipcMain.handle('usuarios:toggleActivo', (_e, id) => {
    return getDB().prepare("UPDATE usuario SET activo = CASE WHEN activo=1 THEN 0 ELSE 1 END WHERE id = ? AND rol != 'admin'").run([id])
  })

  // ─────────────────────────────────────────
  // CLIENTES
  // ─────────────────────────────────────────

  ipcMain.handle('clientes:listar', () => {
    return getDB().prepare('SELECT * FROM cliente ORDER BY activo DESC, nombre').all()
  })

  ipcMain.handle('clientes:crear', (_e, data) => {
    return getDB().prepare('INSERT INTO cliente (nombre, telefono, email, notas) VALUES (?, ?, ?, ?)').run([data.nombre, data.telefono ?? null, data.email ?? null, data.notas ?? null])
  })

  ipcMain.handle('clientes:actualizar', (_e, data) => {
    return getDB().prepare('UPDATE cliente SET nombre=?, telefono=?, email=?, notas=? WHERE id=?').run([data.nombre, data.telefono ?? null, data.email ?? null, data.notas ?? null, data.id])
  })

  ipcMain.handle('clientes:toggleActivo', (_e, id) => {
    return getDB().prepare('UPDATE cliente SET activo = CASE WHEN activo=1 THEN 0 ELSE 1 END WHERE id=?').run([id])
  })

  // ─────────────────────────────────────────
  // PROVEEDORES
  // ─────────────────────────────────────────

  ipcMain.handle('proveedores:listar', () => {
    return getDB().prepare('SELECT * FROM proveedor ORDER BY activo DESC, nombre').all()
  })

  ipcMain.handle('proveedores:crear', (_e, data) => {
    return getDB().prepare('INSERT INTO proveedor (nombre, contacto, telefono, email) VALUES (?, ?, ?, ?)').run([data.nombre, data.contacto ?? null, data.telefono ?? null, data.email ?? null])
  })

  ipcMain.handle('proveedores:actualizar', (_e, data) => {
    return getDB().prepare('UPDATE proveedor SET nombre=?, contacto=?, telefono=?, email=? WHERE id=?').run([data.nombre, data.contacto ?? null, data.telefono ?? null, data.email ?? null, data.id])
  })

  ipcMain.handle('proveedores:toggleActivo', (_e, id) => {
    return getDB().prepare('UPDATE proveedor SET activo = CASE WHEN activo=1 THEN 0 ELSE 1 END WHERE id=?').run([id])
  })

  // ─────────────────────────────────────────
  // ENTRADAS DE STOCK
  // ─────────────────────────────────────────

  ipcMain.handle('entradas:crear', (_e, { proveedorId, nota, items }) => {
    const db = getDB()
    return db.transaction(() => {
      const total = items.reduce((s, i) => s + i.subtotal, 0)
      const entrada = db.prepare('INSERT INTO entrada_stock (proveedor_id, total, nota) VALUES (?, ?, ?)').run([proveedorId ?? null, total, nota ?? null])
      const entradaId = entrada.lastInsertRowid
      for (const item of items) {
        db.prepare('INSERT INTO detalle_entrada (entrada_id, producto_id, cantidad, precio_unitario, subtotal) VALUES (?, ?, ?, ?, ?)').run([entradaId, item.productoId, item.cantidad, item.precioUnitario, item.subtotal])
        db.prepare("UPDATE producto SET stock = stock + ?, precio_compra = ?, actualizado_en = datetime('now','localtime') WHERE id = ?").run([item.cantidad, item.precioUnitario, item.productoId])
      }
      return { entradaId, total }
    })()
  })

  ipcMain.handle('entradas:listar', (_e, filtros = {}) => {
    const db = getDB()
    let q = `SELECT e.*, pr.nombre as proveedor_nombre FROM entrada_stock e LEFT JOIN proveedor pr ON pr.id = e.proveedor_id WHERE 1=1`
    const params = []
    if (filtros.desde) { q += ` AND date(e.fecha) >= ?`; params.push(filtros.desde) }
    if (filtros.hasta) { q += ` AND date(e.fecha) <= ?`; params.push(filtros.hasta) }
    q += ` ORDER BY e.fecha DESC LIMIT 50`
    return db.prepare(q).all(...params)
  })

  // ─────────────────────────────────────────
  // CONFIGURACIÓN DEL NEGOCIO
  // ─────────────────────────────────────────

  ipcMain.handle('config:obtener', () => {
    const rows = getDB().prepare('SELECT clave, valor FROM config_negocio').all()
    return Object.fromEntries(rows.map(r => [r.clave, r.valor]))
  })

  ipcMain.handle('config:guardar', (_e, datos) => {
    const db = getDB()
    const stmt = db.prepare('INSERT OR REPLACE INTO config_negocio (clave, valor) VALUES (?, ?)')
    for (const [clave, valor] of Object.entries(datos)) {
      stmt.run([clave, valor ?? ''])
    }
    return { ok: true }
  })

  ipcMain.handle('config:backup', () => {
    const dbPath = getDBPath()
    const downloadsPath = app.getPath('downloads')
    const fecha = new Date().toISOString().slice(0, 10)
    const destPath = path.join(downloadsPath, `mypyme-backup-${fecha}.db`)
    fs.copyFileSync(dbPath, destPath)
    shell.showItemInFolder(destPath)
    return { ok: true, path: destPath }
  })

  ipcMain.handle('config:resetDB', () => {
    const dbPath = getDBPath()
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath)
    app.relaunch()
    app.exit(0)
  })

  // ─────────────────────────────────────────
  // REPORTES EXCEL
  // ─────────────────────────────────────────

  ipcMain.handle('reportes:excel', (_e, { año, mes }) => {
    let XLSX
    try { XLSX = require('xlsx') } catch { throw new Error('Módulo xlsx no disponible') }

    const db = getDB()
    const mesStr = String(mes).padStart(2, '0')
    const periodo = `${año}-${mesStr}`

    const configRows = db.prepare('SELECT clave, valor FROM config_negocio').all()
    const config = Object.fromEntries(configRows.map(r => [r.clave, r.valor]))

    const resumen = db.prepare(`
      SELECT COUNT(*) as total_ventas,
        COALESCE(SUM(total), 0) as ingresos,
        COALESCE(SUM(descuento), 0) as descuentos,
        COALESCE(SUM((SELECT SUM(dv.cantidad * p.precio_compra)
          FROM detalle_venta dv JOIN producto p ON p.id = dv.producto_id
          WHERE dv.venta_id = v.id)), 0) as costo_total
      FROM venta v WHERE strftime('%Y-%m', fecha) = ? AND estado = 'completada'
    `).get([periodo])
    resumen.ganancia_neta = resumen.ingresos - resumen.costo_total
    resumen.margen_pct = resumen.ingresos > 0
      ? ((resumen.ganancia_neta / resumen.ingresos) * 100).toFixed(1) + '%' : '0%'

    const ventasDia = db.prepare(`
      SELECT date(fecha) as fecha, COUNT(*) as cantidad_ventas,
             COALESCE(SUM(total), 0) as ingresos,
             COALESCE(SUM((SELECT SUM(dv.cantidad * p.precio_compra)
               FROM detalle_venta dv JOIN producto p ON p.id = dv.producto_id
               WHERE dv.venta_id = v.id)), 0) as costo
      FROM venta v WHERE strftime('%Y-%m', fecha) = ? AND estado = 'completada'
      GROUP BY date(fecha) ORDER BY fecha
    `).all([periodo])
    ventasDia.forEach(r => { r.ganancia = r.ingresos - r.costo })

    const topProductos = db.prepare(`
      SELECT p.nombre, SUM(dv.cantidad) as unidades_vendidas,
             ROUND(AVG(dv.precio_unitario)) as precio_promedio,
             COALESCE(SUM(dv.subtotal), 0) as ingresos_generados
      FROM detalle_venta dv JOIN producto p ON p.id = dv.producto_id
      JOIN venta v ON v.id = dv.venta_id
      WHERE strftime('%Y-%m', v.fecha) = ? AND v.estado = 'completada'
      GROUP BY dv.producto_id ORDER BY unidades_vendidas DESC LIMIT 20
    `).all([periodo])

    const porPago = db.prepare(`
      SELECT tipo_pago, COUNT(*) as cantidad, COALESCE(SUM(total), 0) as total
      FROM venta WHERE strftime('%Y-%m', fecha) = ? AND estado = 'completada'
      GROUP BY tipo_pago ORDER BY total DESC
    `).all([periodo])

    const historial = db.prepare(`
      SELECT v.numero_boleta, v.fecha, v.tipo_pago,
             v.total, v.descuento, v.estado, v.nota
      FROM venta v WHERE strftime('%Y-%m', fecha) = ? ORDER BY fecha
    `).all([periodo])

    const inventario = db.prepare(`
      SELECT p.nombre, c.nombre as categoria, p.stock, p.stock_minimo,
             p.precio_compra, p.precio_venta,
             CASE WHEN p.stock <= p.stock_minimo THEN 'REPONER' ELSE 'OK' END as estado
      FROM producto p LEFT JOIN categoria c ON c.id = p.categoria_id
      WHERE p.activo = 1 ORDER BY c.nombre, p.nombre
    `).all()

    const wb = XLSX.utils.book_new()
    const mesNombre = new Date(año, mes - 1, 1).toLocaleString('es-CL', { month: 'long', year: 'numeric' })

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{
      'Negocio':          config.nombre ?? 'Mi Negocio',
      'Período':          mesNombre,
      'Total ventas':     resumen.total_ventas,
      'Ingresos':         resumen.ingresos,
      'Descuentos':       resumen.descuentos,
      'Costo de ventas':  resumen.costo_total,
      'Ganancia neta':    resumen.ganancia_neta,
      'Margen %':         resumen.margen_pct,
    }]), 'Resumen')

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      ventasDia.map(r => ({
        'Fecha': r.fecha, 'Ventas': r.cantidad_ventas,
        'Ingresos': r.ingresos, 'Costo': r.costo, 'Ganancia': r.ganancia,
      }))
    ), 'Ventas por día')

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      topProductos.map(r => ({
        'Producto': r.nombre, 'Unidades': r.unidades_vendidas,
        'Precio promedio': r.precio_promedio, 'Ingresos': r.ingresos_generados,
      }))
    ), 'Top productos')

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      porPago.map(r => ({ 'Método': r.tipo_pago, 'Cantidad': r.cantidad, 'Total': r.total }))
    ), 'Por método de pago')

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      historial.map(r => ({
        'Boleta': r.numero_boleta, 'Fecha': r.fecha, 'Método': r.tipo_pago,
        'Total': r.total, 'Descuento': r.descuento, 'Estado': r.estado, 'Nota': r.nota ?? '',
      }))
    ), 'Historial')

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      inventario.map(r => ({
        'Producto': r.nombre, 'Categoría': r.categoria ?? 'Sin categoría',
        'Stock': r.stock, 'Mínimo': r.stock_minimo,
        'Precio compra': r.precio_compra, 'Precio venta': r.precio_venta, 'Estado': r.estado,
      }))
    ), 'Inventario')

    const downloadsPath = app.getPath('downloads')
    const fileName = `mypyme-reporte-${periodo}.xlsx`
    const filePath = path.join(downloadsPath, fileName)
    XLSX.writeFile(wb, filePath)
    shell.openPath(filePath)
    return { ok: true, fileName }
  })
}

function _generarNumeroBoleta() {
  const db = getDB()
  const hoy = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const count = db.prepare(`SELECT COUNT(*) as n FROM venta WHERE date(fecha) = date('now','localtime')`).get()
  const seq = String(count.n + 1).padStart(4, '0')
  return `LS-${hoy}-${seq}`
}

module.exports = { registerHandlers }
