'use strict'

// ─────────────────────────────────────────
// TEMA
// ─────────────────────────────────────────
function aplicarTema(tema) {
  document.documentElement.dataset.theme = tema
  localStorage.setItem('tema', tema)
  document.querySelectorAll('.theme-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.themeVal === tema)
  })
}
aplicarTema(localStorage.getItem('tema') || 'light')

document.getElementById('btn-tema').addEventListener('click', () => {
  aplicarTema(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light')
})

// ─────────────────────────────────────────
// SESIÓN
// ─────────────────────────────────────────
let currentUser = null
let _configNegocio = {}
let _detalleVentaActual = null

async function iniciarSesion() {
  const username = document.getElementById('login-username').value.trim()
  const password = document.getElementById('login-password').value
  const errorEl  = document.getElementById('login-error')
  errorEl.textContent = ''
  if (!username || !password) { errorEl.textContent = 'Completa los campos'; return }
  const user = await window.api.login({ username, password })
  if (!user) { errorEl.textContent = 'Usuario o contraseña incorrectos'; return }
  currentUser = user
  document.getElementById('login-overlay').hidden = true
  document.getElementById('topbar-username').textContent = user.nombre ?? user.username
  if (user.rol === 'admin') document.getElementById('section-usuarios').hidden = false
  _configNegocio = await window.api.configObtener()
  cargarResumenHoy()
}

document.getElementById('btn-login').addEventListener('click', iniciarSesion)
document.getElementById('login-password').addEventListener('keydown', e => { if (e.key === 'Enter') iniciarSesion() })
document.getElementById('login-username').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('login-password').focus() })

document.getElementById('btn-logout').addEventListener('click', () => {
  currentUser = null
  document.getElementById('section-usuarios').hidden = true
  document.getElementById('login-overlay').hidden = false
  document.getElementById('login-username').value = ''
  document.getElementById('login-password').value = ''
  document.getElementById('login-error').textContent = ''
  document.getElementById('login-username').focus()
})

// ─────────────────────────────────────────
// ESTADO
// ─────────────────────────────────────────
const carrito = []

// ─────────────────────────────────────────
// ELEMENTOS
// ─────────────────────────────────────────
const inputBusqueda   = document.getElementById('input-busqueda')
const resultadosEl    = document.getElementById('resultados-lista')
const resultadosVacio = document.getElementById('resultados-vacio')
const carritoBody     = document.getElementById('carrito-body')
const carritoVacio    = document.getElementById('carrito-vacio')
const totalMonto      = document.getElementById('total-monto')
const totalDescuento  = document.getElementById('total-descuento')
const btnConfirmar    = document.getElementById('btn-confirmar')
const btnCancelar     = document.getElementById('btn-cancelar')
const tipoPago        = document.getElementById('tipo-pago')
const inputDescuento  = document.getElementById('input-descuento')
const resumenHoy      = document.getElementById('resumen-hoy')
const badgeAlerta     = document.getElementById('badge-alerta')
const busquedaHint    = document.getElementById('busqueda-hint')

// ─────────────────────────────────────────
// NAVEGACIÓN
// ─────────────────────────────────────────
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'))
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'))
    tab.classList.add('active')
    document.getElementById(`view-${tab.dataset.view}`).classList.add('active')
    const v = tab.dataset.view
    if (v === 'dashboard')  cargarDashboard()
    if (v === 'historial')  cargarHistorial()
    if (v === 'productos')  cargarProductos()
    if (v === 'config') {
      cargarCategorias()
      cargarClientes()
      cargarProveedores()
      cargarConfigNegocio()
      if (currentUser?.rol === 'admin') cargarUsuarios()
    }
    if (v === 'venta') inputBusqueda.focus()
  })
})

// ─────────────────────────────────────────
// BÚSQUEDA (dual: nombre / código)
// ─────────────────────────────────────────
let debounceTimer = null

inputBusqueda.addEventListener('input', () => {
  clearTimeout(debounceTimer)
  const val = inputBusqueda.value.trim()
  if (!val) { limpiarResultados(); return }
  debounceTimer = setTimeout(() => buscarPorNombre(val), 280)
})

inputBusqueda.addEventListener('keydown', async (e) => {
  if (e.key !== 'Enter') return
  const val = inputBusqueda.value.trim()
  if (!val) return
  clearTimeout(debounceTimer)
  const porCodigo = await window.api.buscarCodigo(val)
  if (porCodigo) {
    agregarAlCarrito(porCodigo)
    inputBusqueda.value = ''
    limpiarResultados()
    return
  }
  buscarPorNombre(val)
})

async function buscarPorNombre(q) {
  if (q.length < 2) return
  const productos = await window.api.buscarProductos(q)
  renderizarResultados(productos, q)
}

function renderizarResultados(productos, q = '') {
  resultadosEl.querySelectorAll('.resultado-card').forEach(el => el.remove())
  if (!productos.length) {
    resultadosVacio.textContent = `Sin resultados para "${q}"`
    resultadosVacio.hidden = false
    busquedaHint.textContent = 'Intenta con otro término o escanea el código de barras'
    return
  }
  resultadosVacio.hidden = true
  busquedaHint.textContent = `${productos.length} resultado${productos.length !== 1 ? 's' : ''} · clic para agregar al carrito`
  for (const p of productos) {
    const card = document.createElement('div')
    const sinStock = p.stock <= 0
    card.className = `resultado-card${sinStock ? ' sin-stock' : ''}`
    card.innerHTML = `
      <div class="resultado-info">
        <div class="resultado-nombre">${p.nombre}</div>
        <div class="resultado-meta">Stock: ${p.stock} ${p.unidad ?? 'unid.'} ${p.stock <= p.stock_minimo && p.stock > 0 ? '· ⚠ stock bajo' : ''}</div>
      </div>
      <span class="resultado-precio">${formatPeso(p.precio_venta)}</span>
      <button class="resultado-add" title="Agregar al carrito" ${sinStock ? 'disabled' : ''}>+</button>
    `
    if (!sinStock) {
      card.addEventListener('click', () => {
        agregarAlCarrito(p)
        card.style.borderColor = 'var(--success)'
        setTimeout(() => card.style.borderColor = '', 400)
      })
    }
    resultadosEl.appendChild(card)
  }
}

function limpiarResultados() {
  resultadosEl.querySelectorAll('.resultado-card').forEach(el => el.remove())
  resultadosVacio.textContent = 'Los resultados aparecerán aquí'
  resultadosVacio.hidden = false
  busquedaHint.textContent = 'Escribe para buscar por nombre · Enter para escanear código'
}

// ─────────────────────────────────────────
// CARRITO
// ─────────────────────────────────────────
function agregarAlCarrito(producto) {
  const existente = carrito.find(i => i.productoId === producto.id)
  if (existente) {
    existente.cantidad++
    existente.subtotal = existente.cantidad * existente.precioUnitario
  } else {
    carrito.push({
      productoId:     producto.id,
      nombre:         producto.nombre,
      cantidad:       1,
      precioUnitario: producto.precio_venta,
      subtotal:       producto.precio_venta,
    })
  }
  renderizarCarrito()
  toast(producto.nombre)
}

function calcularTotalCarrito() {
  const subtotal  = carrito.reduce((s, i) => s + i.subtotal, 0)
  const descuento = Math.min(subtotal, Math.max(0, Number(inputDescuento.value) || 0))
  return { subtotal, descuento, total: subtotal - descuento }
}

function renderizarCarrito() {
  carritoVacio.hidden = carrito.length > 0
  carritoBody.querySelectorAll('tr:not(#carrito-vacio)').forEach(r => r.remove())
  for (let i = 0; i < carrito.length; i++) {
    const item = carrito[i]
    const tr = document.createElement('tr')
    tr.innerHTML = `
      <td>${item.nombre}</td>
      <td>
        <div class="cant-ctrl">
          <button class="cant-btn" data-idx="${i}" data-op="menos">−</button>
          <span>${item.cantidad}</span>
          <button class="cant-btn" data-idx="${i}" data-op="mas">+</button>
        </div>
      </td>
      <td>${formatPeso(item.precioUnitario)}</td>
      <td>${formatPeso(item.subtotal)}</td>
      <td><button class="btn-remove" data-idx="${i}" title="Eliminar">×</button></td>
    `
    carritoBody.appendChild(tr)
  }
  const { subtotal, descuento, total } = calcularTotalCarrito()
  totalMonto.textContent = formatPeso(total)
  if (descuento > 0) {
    totalDescuento.textContent = `Subtotal ${formatPeso(subtotal)} − Descuento ${formatPeso(descuento)}`
    totalDescuento.hidden = false
  } else {
    totalDescuento.hidden = true
  }
  btnConfirmar.disabled = carrito.length === 0
}

inputDescuento.addEventListener('input', renderizarCarrito)

carritoBody.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-idx]')
  if (!btn) return
  const idx = Number(btn.dataset.idx)
  if (btn.classList.contains('btn-remove')) {
    carrito.splice(idx, 1)
  } else if (btn.dataset.op === 'mas') {
    carrito[idx].cantidad++
    carrito[idx].subtotal = carrito[idx].cantidad * carrito[idx].precioUnitario
  } else if (btn.dataset.op === 'menos') {
    if (carrito[idx].cantidad <= 1) carrito.splice(idx, 1)
    else {
      carrito[idx].cantidad--
      carrito[idx].subtotal = carrito[idx].cantidad * carrito[idx].precioUnitario
    }
  }
  renderizarCarrito()
})

// ─────────────────────────────────────────
// CONFIRMAR VENTA
// ─────────────────────────────────────────
btnConfirmar.addEventListener('click', async () => {
  if (!carrito.length) return
  const { total, descuento } = calcularTotalCarrito()
  const lineas = carrito.map(i => `• ${i.nombre} x${i.cantidad}  ${formatPeso(i.subtotal)}`).join('\n')
  const resumen = descuento > 0
    ? `${lineas}\n\nDescuento: -${formatPeso(descuento)}\nTOTAL: ${formatPeso(total)}`
    : `${lineas}\n\nTOTAL: ${formatPeso(total)}`
  const ok = confirm(`¿Confirmar venta?\n\n${resumen}\n\nMétodo de pago: ${tipoPago.value}`)
  if (!ok) return
  let result
  try {
    result = await window.api.crearVenta({
      items: carrito.map(i => ({
        productoId:     i.productoId,
        cantidad:       i.cantidad,
        precioUnitario: i.precioUnitario,
        subtotal:       i.subtotal,
      })),
      tipoPago: tipoPago.value,
      descuento,
    })
  } catch (err) {
    const msg = (err.message ?? '').replace(/^Error (?:occurred in handler for|invoking remote method) '[^']+': Error:\s*/i, '') || 'Error al procesar la venta'
    toast(msg, 'err')
    return
  }
  toast(`Venta ${result.numeroBoleta} — ${formatPeso(result.total)}`)
  limpiarCarrito()
  cargarResumenHoy()
})

btnCancelar.addEventListener('click', limpiarCarrito)

function limpiarCarrito() {
  carrito.length = 0
  inputDescuento.value = 0
  renderizarCarrito()
  inputBusqueda.value = ''
  limpiarResultados()
  inputBusqueda.focus()
}

// ─────────────────────────────────────────
// VISTA DASHBOARD
// ─────────────────────────────────────────
async function cargarDashboard() {
  const data = await window.api.dashboardResumen()

  const kpis = [
    { id: 'kpi-hoy',    label: 'Hoy',            d: data.hoy    },
    { id: 'kpi-semana', label: 'Últimos 7 días',  d: data.semana },
    { id: 'kpi-mes',    label: 'Este mes',         d: data.mes    },
  ]
  for (const { id, label, d } of kpis) {
    const el = document.getElementById(id)
    el.innerHTML = `
      <div class="kpi-period">${label}</div>
      <div class="kpi-ventas">${d.ventas} venta${d.ventas !== 1 ? 's' : ''}</div>
      <div class="kpi-ingresos">${formatPeso(d.ingresos)}</div>
      <div class="kpi-ganancia" style="color:${d.ganancia >= 0 ? 'var(--success)' : 'var(--danger)'}">
        Ganancia: ${formatPeso(d.ganancia)}
      </div>
    `
  }

  _renderBarChart(data.porDia)
  _renderTopProductos(data.topProductos)
  _renderPorPago(data.porPago)
}

function _renderBarChart(porDia) {
  const container = document.getElementById('chart-ventas')
  container.innerHTML = ''
  if (!porDia.length) {
    container.innerHTML = '<span style="color:var(--muted);font-size:12px">Sin datos en los últimos 30 días</span>'
    return
  }
  const maxVal = Math.max(...porDia.map(d => d.ingresos), 1)
  const hoy = new Date()
  const dias30 = []
  for (let i = 29; i >= 0; i--) {
    const d = new Date(hoy)
    d.setDate(hoy.getDate() - i)
    dias30.push(d.toISOString().slice(0, 10))
  }
  const mapaData = Object.fromEntries(porDia.map(d => [d.dia, d]))
  for (const fecha of dias30) {
    const d = mapaData[fecha]
    const h = d ? Math.max(4, Math.round((d.ingresos / maxVal) * 100)) : 2
    const col = document.createElement('div')
    col.className = 'bar-col'
    const dd = new Date(fecha + 'T12:00:00')
    const showLbl = dd.getDate() % 5 === 0
    col.innerHTML = `
      <div class="bar-fill" style="height:${h}px" title="${fecha}: ${formatPeso(d?.ingresos ?? 0)}"></div>
      <div class="bar-lbl">${showLbl ? dd.getDate() : ''}</div>
    `
    container.appendChild(col)
  }
}

function _renderTopProductos(top) {
  const el = document.getElementById('top-productos-list')
  if (!top.length) { el.innerHTML = '<span style="color:var(--muted);font-size:12px">Sin ventas este mes</span>'; return }
  el.innerHTML = top.map((p, i) => `
    <div class="top-item">
      <span class="top-rank">${i + 1}</span>
      <div class="top-info">
        <div class="top-nombre">${p.nombre}</div>
        <div class="top-unidades">${p.unidades} unidades</div>
      </div>
      <span class="top-ingresos">${formatPeso(p.ingresos)}</span>
    </div>
  `).join('')
}

function _renderPorPago(porPago) {
  const el = document.getElementById('pago-metodos-list')
  if (!porPago.length) { el.innerHTML = '<span style="color:var(--muted);font-size:12px">Sin ventas este mes</span>'; return }
  el.innerHTML = porPago.map(p => `
    <div class="pago-item">
      <span class="pago-metodo">${p.tipo_pago}</span>
      <span class="pago-total">${formatPeso(p.ingresos)}</span>
      <span class="pago-cantidad">${p.ventas} venta${p.ventas !== 1 ? 's' : ''}</span>
    </div>
  `).join('')
}

// ─────────────────────────────────────────
// VISTA HISTORIAL
// ─────────────────────────────────────────
function _histFechasDefecto() {
  const hoy = new Date()
  const inicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1)
  document.getElementById('hist-desde').value = inicio.toISOString().slice(0, 10)
  document.getElementById('hist-hasta').value = hoy.toISOString().slice(0, 10)
}
_histFechasDefecto()

async function cargarHistorial() {
  const desde  = document.getElementById('hist-desde').value
  const hasta  = document.getElementById('hist-hasta').value
  const estado = document.getElementById('hist-estado').value
  const ventas = await window.api.listarVentas({ desde, hasta, estado: estado || undefined })
  const wrap   = document.getElementById('tabla-historial')

  if (!ventas.length) {
    wrap.innerHTML = '<div class="historial-vacio">No hay ventas en el período seleccionado</div>'
    return
  }

  const tbody = ventas.map(v => `
    <tr class="${v.estado}" data-vid="${v.id}">
      <td>${v.numero_boleta}</td>
      <td>${v.fecha.slice(0, 16).replace('T', ' ')}</td>
      <td>${v.tipo_pago}</td>
      <td style="text-align:right">${formatPeso(v.total)}</td>
      <td style="text-align:right;color:var(--success)">${v.descuento > 0 ? '−' + formatPeso(v.descuento) : '—'}</td>
      <td>${v.cliente_nombre ? `<small>${v.cliente_nombre}</small>` : '—'}</td>
      <td><span class="badge-estado ${v.estado}">${v.estado}</span></td>
    </tr>
  `).join('')

  wrap.innerHTML = `
    <table class="historial-tabla">
      <thead><tr>
        <th>Boleta</th><th>Fecha</th><th>Pago</th>
        <th style="text-align:right">Total</th>
        <th style="text-align:right">Descuento</th>
        <th>Cliente</th><th>Estado</th>
      </tr></thead>
      <tbody>${tbody}</tbody>
    </table>
  `
  wrap.querySelectorAll('tr[data-vid]').forEach(tr => {
    tr.addEventListener('click', () => verDetalleVenta(Number(tr.dataset.vid)))
  })
}

document.getElementById('btn-buscar-historial').addEventListener('click', cargarHistorial)

// ─────────────────────────────────────────
// DETALLE VENTA + ANULAR + IMPRIMIR
// ─────────────────────────────────────────
async function verDetalleVenta(id) {
  const { venta, items } = await window.api.detalleVenta(id)
  _detalleVentaActual = { venta, items }

  const rows = items.map(i => `
    <tr>
      <td>${i.producto_nombre}</td>
      <td style="text-align:center">${i.cantidad}</td>
      <td style="text-align:right">${formatPeso(i.precio_unitario)}</td>
      <td style="text-align:right">${formatPeso(i.subtotal)}</td>
    </tr>
  `).join('')

  document.getElementById('detalle-venta-titulo').textContent = venta.numero_boleta
  document.getElementById('detalle-venta-content').innerHTML = `
    <div class="detalle-meta">
      <span>Fecha: <strong>${venta.fecha.slice(0, 16).replace('T', ' ')}</strong></span>
      <span>Pago: <strong>${venta.tipo_pago}</strong></span>
      ${venta.cliente_nombre ? `<span>Cliente: <strong>${venta.cliente_nombre}</strong></span>` : ''}
      ${venta.nota ? `<span>Nota: <strong>${venta.nota}</strong></span>` : ''}
    </div>
    <table class="detalle-items">
      <thead><tr><th>Producto</th><th>Cant.</th><th style="text-align:right">Precio</th><th style="text-align:right">Subtotal</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="detalle-totales">
      ${venta.descuento > 0 ? `<div>Descuento: <strong>${formatPeso(venta.descuento)}</strong></div>` : ''}
      <div>Total: <strong>${formatPeso(venta.total)}</strong></div>
    </div>
  `

  const btnAnular = document.getElementById('btn-anular-venta')
  btnAnular.hidden = venta.estado !== 'completada'
  btnAnular.dataset.vid = venta.id

  document.getElementById('detalle-venta-overlay').hidden = false
}

document.getElementById('btn-cerrar-detalle').addEventListener('click', () => {
  document.getElementById('detalle-venta-overlay').hidden = true
  _detalleVentaActual = null
})

document.getElementById('btn-anular-venta').addEventListener('click', async (e) => {
  const id = Number(e.currentTarget.dataset.vid)
  if (!confirm('¿Anular esta venta? Se restaurará el stock de los productos.')) return
  await window.api.anularVenta(id)
  document.getElementById('detalle-venta-overlay').hidden = true
  _detalleVentaActual = null
  cargarHistorial()
  cargarResumenHoy()
  toast('Venta anulada — stock restaurado')
})

document.getElementById('btn-imprimir-boleta').addEventListener('click', () => {
  if (!_detalleVentaActual) return
  imprimirBoleta(_detalleVentaActual)
})

function imprimirBoleta({ venta, items }) {
  const neg = _configNegocio
  const rows = items.map(i => `
    <div class="boleta-item">
      <span>${i.producto_nombre} x${i.cantidad}</span>
      <span>${formatPeso(i.subtotal)}</span>
    </div>
  `).join('')

  document.getElementById('print-content').innerHTML = `
    <div class="boleta-titulo">${neg.nombre || 'MyPyme'}</div>
    ${neg.direccion ? `<div class="boleta-negocio">${neg.direccion}</div>` : ''}
    ${neg.telefono  ? `<div class="boleta-negocio">Tel: ${neg.telefono}</div>` : ''}
    ${neg.rut       ? `<div class="boleta-negocio">RUT: ${neg.rut}</div>` : ''}
    <hr class="boleta-sep">
    <div class="boleta-item"><span>Boleta</span><span>${venta.numero_boleta}</span></div>
    <div class="boleta-item"><span>Fecha</span><span>${venta.fecha.slice(0, 16).replace('T', ' ')}</span></div>
    <div class="boleta-item"><span>Pago</span><span>${venta.tipo_pago}</span></div>
    <hr class="boleta-sep">
    ${rows}
    <hr class="boleta-sep">
    ${venta.descuento > 0 ? `<div class="boleta-item"><span>Descuento</span><span>-${formatPeso(venta.descuento)}</span></div>` : ''}
    <div class="boleta-total"><span>TOTAL</span><span>${formatPeso(venta.total)}</span></div>
    <div class="boleta-footer">¡Gracias por su compra!</div>
  `
  window.print()
}

// ─────────────────────────────────────────
// VISTA PRODUCTOS
// ─────────────────────────────────────────
async function cargarProductos(q = '') {
  const lista = q
    ? await window.api.buscarProductos(q)
    : await window.api.listarProductos()

  const contenedor = document.getElementById('lista-productos')
  contenedor.innerHTML = ''

  if (!lista.length) {
    contenedor.innerHTML = '<p style="color:var(--muted);padding:20px;">Sin resultados.</p>'
    return
  }

  const grupos = {}
  for (const p of lista) {
    const cat = p.categoria_nombre ?? 'Sin categoría'
    if (!grupos[cat]) grupos[cat] = []
    grupos[cat].push(p)
  }

  for (const [catNombre, productos] of Object.entries(grupos)) {
    const seccion = document.createElement('div')
    const header = document.createElement('div')
    header.className = 'cat-group-header'
    header.textContent = `${catNombre} (${productos.length})`
    seccion.appendChild(header)

    const grid = document.createElement('div')
    grid.className = 'cat-group-grid'

    for (const p of productos) {
      const div = document.createElement('div')
      const inactivo = !p.activo
      const agotado  = !inactivo && p.stock === 0
      const bajo     = !inactivo && !agotado && p.stock <= p.stock_minimo
      const stockClass = inactivo ? 'stock-inactivo' : agotado ? 'stock-agotado' : bajo ? 'stock-bajo' : ''
      const stockLabel = inactivo ? 'Deshabilitado' : agotado ? 'Sin stock' : `Stock: ${p.stock} ${p.unidad}${bajo ? ' ⚠' : ''}`
      div.className = 'producto-card'
      div.innerHTML = `
        <div class="producto-card-nombre">${p.nombre}</div>
        <div class="producto-card-codigo">${p.codigo_activo ?? '—'}</div>
        <div class="producto-card-row">
          <span class="${stockClass}">${stockLabel}</span>
          <span>${formatPeso(p.precio_venta)}</span>
        </div>
        <div class="producto-card-actions">
          <button class="btn-card" data-action="editar">Editar</button>
          <button class="btn-card" data-action="stock">Ajustar stock</button>
          <button class="btn-card danger" data-action="toggle">${p.activo ? 'Deshabilitar' : 'Habilitar'}</button>
        </div>
      `
      div.addEventListener('click', (e) => {
        const action = e.target.closest('[data-action]')?.dataset.action
        if (!action) {
          document.querySelectorAll('.producto-card.selected').forEach(c => { if (c !== div) c.classList.remove('selected') })
          div.classList.toggle('selected')
          return
        }
        if (action === 'editar') abrirModal(p)
        if (action === 'stock')  abrirModalStock(p)
        if (action === 'toggle') toggleActivo(p)
      })
      grid.appendChild(div)
    }
    seccion.appendChild(grid)
    contenedor.appendChild(seccion)
  }
}

document.getElementById('search-productos').addEventListener('input', (e) => cargarProductos(e.target.value))
document.getElementById('btn-nuevo-producto').addEventListener('click', () => abrirModal())

// ─────────────────────────────────────────
// MODAL PRODUCTO
// ─────────────────────────────────────────
const modalOverlay = document.getElementById('modal-overlay')
let editandoId = null

async function abrirModal(producto = null) {
  editandoId = producto?.id ?? null
  document.getElementById('modal-title').textContent = producto ? 'Editar producto' : 'Nuevo producto'
  document.getElementById('f-nombre').value       = producto?.nombre ?? ''
  document.getElementById('f-codigo').value        = producto?.codigo_activo ?? ''
  document.getElementById('f-precio-compra').value = producto?.precio_compra ?? ''
  document.getElementById('f-precio-venta').value  = producto?.precio_venta ?? ''
  document.getElementById('f-stock').value         = producto?.stock ?? 0
  document.getElementById('f-stock-min').value     = producto?.stock_minimo ?? 5
  document.getElementById('f-unidad').value        = producto?.unidad ?? 'unidad'

  const cats = await window.api.listarCategorias()
  const sel = document.getElementById('f-categoria')
  sel.innerHTML = '<option value="">Sin categoría</option>'
  for (const c of cats) {
    const opt = document.createElement('option')
    opt.value = c.id
    opt.textContent = c.nombre
    if (c.id === producto?.categoria_id) opt.selected = true
    sel.appendChild(opt)
  }
  modalOverlay.hidden = false
  document.getElementById('f-nombre').focus()
}

document.getElementById('btn-modal-cancelar').addEventListener('click', () => { modalOverlay.hidden = true })
document.getElementById('btn-modal-guardar').addEventListener('click', guardarProducto)

async function guardarProducto() {
  const data = {
    nombre:        document.getElementById('f-nombre').value.trim(),
    codigo:        document.getElementById('f-codigo').value.trim(),
    precio_compra: Number(document.getElementById('f-precio-compra').value),
    precio_venta:  Number(document.getElementById('f-precio-venta').value),
    stock:         Number(document.getElementById('f-stock').value),
    stock_minimo:  Number(document.getElementById('f-stock-min').value),
    unidad:        document.getElementById('f-unidad').value.trim() || 'unidad',
    categoria_id:  document.getElementById('f-categoria').value || null,
    descripcion:   null,
  }
  if (!data.nombre || !data.precio_venta) { toast('Nombre y precio son obligatorios', 'warn'); return }
  if (editandoId) {
    await window.api.actualizarProducto(editandoId, data)
    toast('Producto actualizado')
  } else {
    await window.api.crearProducto(data)
    toast('Producto creado')
  }
  modalOverlay.hidden = true
  cargarProductos()
}

// ─────────────────────────────────────────
// MODAL AJUSTE STOCK
// ─────────────────────────────────────────
const stockOverlay = document.getElementById('stock-overlay')
let _stockProducto  = null

function abrirModalStock(p) {
  _stockProducto = p
  document.getElementById('stock-modal-title').textContent = p.nombre
  document.getElementById('stock-actual-val').textContent  = `${p.stock} ${p.unidad}`
  document.getElementById('stock-delta').value = 1
  stockOverlay.hidden = false
  document.getElementById('stock-delta').focus()
}

document.getElementById('btn-stock-cancelar').addEventListener('click', () => { stockOverlay.hidden = true })

document.getElementById('btn-stock-menos').addEventListener('click', async () => {
  const delta = -Math.abs(Number(document.getElementById('stock-delta').value) || 1)
  await window.api.ajustarStock(_stockProducto.id, delta)
  stockOverlay.hidden = true
  cargarProductos(document.getElementById('search-productos').value)
  toast('Stock actualizado')
  cargarResumenHoy()
})

document.getElementById('btn-stock-mas').addEventListener('click', async () => {
  const delta = Math.abs(Number(document.getElementById('stock-delta').value) || 1)
  await window.api.ajustarStock(_stockProducto.id, delta)
  stockOverlay.hidden = true
  cargarProductos(document.getElementById('search-productos').value)
  toast('Stock actualizado')
  cargarResumenHoy()
})

async function toggleActivo(p) {
  const accion = p.activo ? 'deshabilitar' : 'habilitar'
  if (!confirm(`¿${accion[0].toUpperCase() + accion.slice(1)} "${p.nombre}"?`)) return
  await window.api.toggleActivo(p.id)
  cargarProductos(document.getElementById('search-productos').value)
  toast(`Producto ${p.activo ? 'deshabilitado' : 'habilitado'}`)
}

// ─────────────────────────────────────────
// ENTRADA DE STOCK
// ─────────────────────────────────────────
const entradaOverlay = document.getElementById('entrada-overlay')
const entradaCarrito = []

document.getElementById('btn-nueva-entrada').addEventListener('click', async () => {
  entradaCarrito.length = 0
  document.getElementById('entrada-body').innerHTML = ''
  document.getElementById('entrada-resultados').innerHTML = ''
  document.getElementById('entrada-buscar').value = ''
  document.getElementById('entrada-nota').value = ''
  document.getElementById('entrada-total').textContent = '$0'
  document.getElementById('btn-entrada-guardar').disabled = true

  const provs = await window.api.listarProveedores()
  const sel = document.getElementById('entrada-proveedor')
  sel.innerHTML = '<option value="">Sin proveedor</option>'
  for (const p of provs.filter(p => p.activo)) {
    sel.innerHTML += `<option value="${p.id}">${p.nombre}</option>`
  }
  entradaOverlay.hidden = false
})

document.getElementById('btn-entrada-cancelar').addEventListener('click', () => { entradaOverlay.hidden = true })

document.getElementById('btn-entrada-buscar').addEventListener('click', async () => {
  const q = document.getElementById('entrada-buscar').value.trim()
  if (!q) return
  const res = await window.api.buscarProductos(q)
  const cont = document.getElementById('entrada-resultados')
  cont.innerHTML = ''
  if (!res.length) { cont.innerHTML = '<span style="color:var(--muted);font-size:12px">Sin resultados</span>'; return }
  for (const p of res) {
    const btn = document.createElement('button')
    btn.className = 'entrada-resultado-btn'
    btn.textContent = `${p.nombre} (stock: ${p.stock})`
    btn.addEventListener('click', () => agregarAEntrada(p))
    cont.appendChild(btn)
  }
})

document.getElementById('entrada-buscar').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('btn-entrada-buscar').click()
})

function agregarAEntrada(p) {
  const existe = entradaCarrito.find(i => i.productoId === p.id)
  if (existe) { toast('Ya está en la lista'); return }
  entradaCarrito.push({ productoId: p.id, nombre: p.nombre, cantidad: 1, precioUnitario: p.precio_compra || 0, subtotal: p.precio_compra || 0 })
  renderizarEntradaCarrito()
}

function renderizarEntradaCarrito() {
  const tbody = document.getElementById('entrada-body')
  tbody.innerHTML = ''
  for (let i = 0; i < entradaCarrito.length; i++) {
    const item = entradaCarrito[i]
    const tr = document.createElement('tr')
    tr.innerHTML = `
      <td>${item.nombre}</td>
      <td><input type="number" min="1" step="1" value="${item.cantidad}" class="ec-cant" data-idx="${i}"></td>
      <td><input type="number" min="0" step="1" value="${item.precioUnitario}" class="ec-precio" data-idx="${i}"></td>
      <td style="text-align:right">${formatPeso(item.subtotal)}</td>
      <td><button class="btn-remove ec-remove" data-idx="${i}">×</button></td>
    `
    tbody.appendChild(tr)
  }
  _actualizarTotalEntrada()
  document.getElementById('btn-entrada-guardar').disabled = entradaCarrito.length === 0
}

document.getElementById('entrada-body').addEventListener('input', (e) => {
  const idx = Number(e.target.dataset.idx)
  if (isNaN(idx)) return
  if (e.target.classList.contains('ec-cant'))   entradaCarrito[idx].cantidad = Math.max(1, Number(e.target.value) || 1)
  if (e.target.classList.contains('ec-precio')) entradaCarrito[idx].precioUnitario = Math.max(0, Number(e.target.value) || 0)
  entradaCarrito[idx].subtotal = entradaCarrito[idx].cantidad * entradaCarrito[idx].precioUnitario
  _actualizarTotalEntrada()
})

document.getElementById('entrada-body').addEventListener('click', (e) => {
  if (e.target.classList.contains('ec-remove')) {
    entradaCarrito.splice(Number(e.target.dataset.idx), 1)
    renderizarEntradaCarrito()
  }
})

function _actualizarTotalEntrada() {
  const total = entradaCarrito.reduce((s, i) => s + i.subtotal, 0)
  document.getElementById('entrada-total').textContent = formatPeso(total)
}

document.getElementById('btn-entrada-guardar').addEventListener('click', async () => {
  if (!entradaCarrito.length) return
  const proveedorId = document.getElementById('entrada-proveedor').value || null
  const nota = document.getElementById('entrada-nota').value.trim() || null
  try {
    await window.api.crearEntrada({ proveedorId: proveedorId ? Number(proveedorId) : null, nota, items: entradaCarrito })
    entradaOverlay.hidden = true
    cargarProductos(document.getElementById('search-productos').value)
    toast('Entrada de stock registrada')
  } catch (err) {
    toast('Error al registrar la entrada', 'err')
  }
})

// ─────────────────────────────────────────
// VISTA BALANCE / REPORTES
// ─────────────────────────────────────────
function setFechasDefecto() {
  const hoy = new Date()
  const lunes = new Date(hoy)
  lunes.setDate(hoy.getDate() - ((hoy.getDay() + 6) % 7))
  document.getElementById('balance-desde').value = lunes.toISOString().slice(0, 10)
  document.getElementById('balance-hasta').value = hoy.toISOString().slice(0, 10)
}
setFechasDefecto()

document.getElementById('btn-generar-balance').addEventListener('click', async () => {
  const inicio = document.getElementById('balance-desde').value
  const fin    = document.getElementById('balance-hasta').value
  if (!inicio || !fin) return

  const r = await window.api.balanceSemanal(inicio, fin)
  const contenedor = document.getElementById('resultado-balance')
  contenedor.innerHTML = ''

  const tarjetas = [
    { label: 'Ventas realizadas', valor: r.total_ventas ?? 0, formato: 'entero' },
    { label: 'Ingresos totales',  valor: r.ingresos ?? 0,     formato: 'peso' },
    { label: 'Costo de ventas',   valor: r.costo_total ?? 0,  formato: 'peso' },
    { label: 'Ganancia neta',     valor: r.ganancia_neta ?? 0, formato: 'peso', enfasis: true },
  ]

  for (const t of tarjetas) {
    const div = document.createElement('div')
    div.className = 'balance-card'
    const claseValor = t.enfasis
      ? (t.valor >= 0 ? 'balance-card-valor positivo' : 'balance-card-valor negativo')
      : 'balance-card-valor'
    div.innerHTML = `
      <div class="balance-card-label">${t.label}</div>
      <div class="${claseValor}">${t.formato === 'peso' ? formatPeso(t.valor) : t.valor}</div>
    `
    contenedor.appendChild(div)
  }
  cargarAlertasStock()
})

async function cargarAlertasStock() {
  const alertas = await window.api.alertasStock()
  const wrap = document.getElementById('alertas-stock')
  wrap.innerHTML = ''
  if (!alertas.length) return
  const titulo = document.createElement('p')
  titulo.className = 'alerta-titulo'
  titulo.textContent = `Productos con stock bajo (${alertas.length})`
  wrap.appendChild(titulo)
  for (const p of alertas) {
    const div = document.createElement('div')
    div.className = 'alerta-item'
    div.innerHTML = `<span>${p.nombre}</span><span>Stock: ${p.stock} / Mínimo: ${p.stock_minimo}</span>`
    wrap.appendChild(div)
  }
}

// Excel selector defaults
const now = new Date()
document.getElementById('excel-mes').value = now.getMonth() + 1
document.getElementById('excel-ano').value = now.getFullYear()

document.getElementById('btn-generar-excel').addEventListener('click', async () => {
  const mes = Number(document.getElementById('excel-mes').value)
  const año = Number(document.getElementById('excel-ano').value)
  if (!mes || !año) return
  const btn = document.getElementById('btn-generar-excel')
  btn.disabled = true
  btn.textContent = 'Generando...'
  try {
    const r = await window.api.generarExcel({ mes, año })
    toast(`Excel guardado: ${r.fileName}`)
  } catch (err) {
    toast('Error al generar el Excel', 'err')
  } finally {
    btn.disabled = false
    btn.textContent = 'Descargar Excel'
  }
})

// ─────────────────────────────────────────
// RESUMEN DEL DÍA (topbar)
// ─────────────────────────────────────────
async function cargarResumenHoy() {
  const r = await window.api.resumenHoy()
  resumenHoy.textContent = `Hoy: ${r.total_ventas ?? 0} ventas · ${formatPeso(r.ingresos ?? 0)}`
  const alertas = await window.api.alertasStock()
  badgeAlerta.hidden = alertas.length === 0
}

// ─────────────────────────────────────────
// TOAST
// ─────────────────────────────────────────
let toastTimer
function toast(msg, tipo = 'ok') {
  const el = document.getElementById('toast')
  el.textContent = msg
  el.style.background = tipo === 'warn' ? 'var(--warn)' : tipo === 'err' ? 'var(--danger)' : 'var(--text)'
  el.classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => el.classList.remove('show'), 2500)
}

// ─────────────────────────────────────────
// CONFIGURACIÓN — DATOS DEL NEGOCIO
// ─────────────────────────────────────────
async function cargarConfigNegocio() {
  const cfg = await window.api.configObtener()
  _configNegocio = cfg
  document.getElementById('neg-nombre').value   = cfg.nombre    ?? ''
  document.getElementById('neg-rut').value      = cfg.rut       ?? ''
  document.getElementById('neg-direccion').value = cfg.direccion ?? ''
  document.getElementById('neg-telefono').value  = cfg.telefono  ?? ''
  document.getElementById('neg-email').value     = cfg.email     ?? ''
}

document.getElementById('btn-guardar-negocio').addEventListener('click', async () => {
  const datos = {
    nombre:    document.getElementById('neg-nombre').value.trim(),
    rut:       document.getElementById('neg-rut').value.trim(),
    direccion: document.getElementById('neg-direccion').value.trim(),
    telefono:  document.getElementById('neg-telefono').value.trim(),
    email:     document.getElementById('neg-email').value.trim(),
  }
  await window.api.configGuardar(datos)
  _configNegocio = datos
  toast('Datos del negocio guardados')
})

// ─────────────────────────────────────────
// CONFIGURACIÓN — CATEGORÍAS
// ─────────────────────────────────────────
async function cargarCategorias() {
  const lista = await window.api.listarCategorias(false)
  const contenedor = document.getElementById('lista-categorias')
  contenedor.innerHTML = ''

  for (const cat of lista) {
    const row = document.createElement('div')
    row.className = 'cat-row'
    row.dataset.id = cat.id
    row.innerHTML = `
      <div class="cat-row-info">
        <div class="cat-row-nombre${cat.activo ? '' : ' inactiva'}">${cat.nombre}</div>
        ${cat.descripcion ? `<div class="cat-row-desc">${cat.descripcion}</div>` : ''}
      </div>
      <div class="cat-row-edit">
        <input type="text" class="cat-edit-nombre" value="${cat.nombre}" placeholder="Nombre">
        <input type="text" class="cat-edit-desc" value="${cat.descripcion ?? ''}" placeholder="Descripción">
        <button class="btn-primary btn-sm" data-action="guardar">Guardar</button>
        <button class="btn-secondary btn-sm" data-action="cancelar">Cancelar</button>
      </div>
      <span class="cat-badge ${cat.activo ? 'activa' : 'inactiva'}">${cat.activo ? 'Activa' : 'Inactiva'}</span>
      <button class="btn-card" data-action="editar">Editar</button>
      <button class="btn-card ${cat.activo ? 'danger' : ''}" data-action="toggle">${cat.activo ? 'Deshabilitar' : 'Habilitar'}</button>
    `

    row.addEventListener('click', async (e) => {
      const action = e.target.dataset.action
      if (!action) return
      if (action === 'editar')   row.classList.add('editando'), row.querySelector('.cat-edit-nombre').focus()
      if (action === 'cancelar') row.classList.remove('editando')
      if (action === 'guardar') {
        const nombre = row.querySelector('.cat-edit-nombre').value.trim()
        if (!nombre) { toast('El nombre es obligatorio', 'warn'); return }
        await window.api.actualizarCategoria({ id: cat.id, nombre, descripcion: row.querySelector('.cat-edit-desc').value.trim() || null })
        toast('Categoría actualizada')
        cargarCategorias()
      }
      if (action === 'toggle') {
        await window.api.toggleActivoCategoria(cat.id)
        cargarCategorias()
      }
    })
    contenedor.appendChild(row)
  }
}

document.getElementById('btn-guardar-cat').addEventListener('click', async () => {
  const nombre = document.getElementById('cat-nombre').value.trim()
  if (!nombre) { toast('El nombre es obligatorio', 'warn'); return }
  const descripcion = document.getElementById('cat-descripcion').value.trim() || null
  try {
    await window.api.crearCategoria({ nombre, descripcion })
    document.getElementById('cat-nombre').value = ''
    document.getElementById('cat-descripcion').value = ''
    toast('Categoría creada')
    cargarCategorias()
  } catch { toast('Ya existe una categoría con ese nombre', 'err') }
})

document.getElementById('cat-nombre').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('btn-guardar-cat').click()
})

// ─────────────────────────────────────────
// CONFIGURACIÓN — CLIENTES
// ─────────────────────────────────────────
async function cargarClientes() {
  const lista = await window.api.listarClientes()
  const cont  = document.getElementById('lista-clientes')
  cont.innerHTML = ''
  for (const c of lista) {
    const row = document.createElement('div')
    row.className = 'cat-row'
    row.innerHTML = `
      <div class="cat-row-info">
        <div class="cat-row-nombre${c.activo ? '' : ' inactiva'}">${c.nombre}</div>
        ${c.telefono ? `<div class="cat-row-desc">${c.telefono}</div>` : ''}
      </div>
      <span class="cat-badge ${c.activo ? 'activa' : 'inactiva'}">${c.activo ? 'Activo' : 'Inactivo'}</span>
      <button class="btn-card ${c.activo ? 'danger' : ''}" data-cid="${c.id}">${c.activo ? 'Deshabilitar' : 'Habilitar'}</button>
    `
    row.querySelector('[data-cid]').addEventListener('click', async () => {
      await window.api.toggleActivoCliente(c.id)
      cargarClientes()
    })
    cont.appendChild(row)
  }
}

document.getElementById('btn-guardar-cliente').addEventListener('click', async () => {
  const nombre   = document.getElementById('cli-nombre').value.trim()
  const telefono = document.getElementById('cli-telefono').value.trim()
  if (!nombre) { toast('El nombre es obligatorio', 'warn'); return }
  await window.api.crearCliente({ nombre, telefono: telefono || null })
  document.getElementById('cli-nombre').value    = ''
  document.getElementById('cli-telefono').value  = ''
  toast('Cliente agregado')
  cargarClientes()
})

// ─────────────────────────────────────────
// CONFIGURACIÓN — PROVEEDORES
// ─────────────────────────────────────────
async function cargarProveedores() {
  const lista = await window.api.listarProveedores()
  const cont  = document.getElementById('lista-proveedores')
  cont.innerHTML = ''
  for (const p of lista) {
    const row = document.createElement('div')
    row.className = 'cat-row'
    row.innerHTML = `
      <div class="cat-row-info">
        <div class="cat-row-nombre${p.activo ? '' : ' inactiva'}">${p.nombre}</div>
        ${p.telefono ? `<div class="cat-row-desc">${p.telefono}</div>` : ''}
      </div>
      <span class="cat-badge ${p.activo ? 'activa' : 'inactiva'}">${p.activo ? 'Activo' : 'Inactivo'}</span>
      <button class="btn-card ${p.activo ? 'danger' : ''}" data-pid="${p.id}">${p.activo ? 'Deshabilitar' : 'Habilitar'}</button>
    `
    row.querySelector('[data-pid]').addEventListener('click', async () => {
      await window.api.toggleActivoProveedor(p.id)
      cargarProveedores()
    })
    cont.appendChild(row)
  }
}

document.getElementById('btn-guardar-proveedor').addEventListener('click', async () => {
  const nombre   = document.getElementById('prov-nombre').value.trim()
  const telefono = document.getElementById('prov-telefono').value.trim()
  if (!nombre) { toast('El nombre es obligatorio', 'warn'); return }
  await window.api.crearProveedor({ nombre, telefono: telefono || null })
  document.getElementById('prov-nombre').value   = ''
  document.getElementById('prov-telefono').value = ''
  toast('Proveedor agregado')
  cargarProveedores()
})

// ─────────────────────────────────────────
// CONFIGURACIÓN — APARIENCIA
// ─────────────────────────────────────────
document.querySelectorAll('.theme-btn').forEach(btn => {
  btn.addEventListener('click', () => aplicarTema(btn.dataset.themeVal))
})

// ─────────────────────────────────────────
// CONFIGURACIÓN — USUARIOS
// ─────────────────────────────────────────
async function cargarUsuarios() {
  const lista = await window.api.listarUsuarios()
  const contenedor = document.getElementById('lista-usuarios')
  contenedor.innerHTML = ''
  for (const u of lista) {
    const row = document.createElement('div')
    row.className = 'usuario-row'
    row.innerHTML = `
      <div class="usuario-row-info">
        <div class="usuario-row-nombre">${u.nombre ?? u.username} <span class="cat-badge ${u.activo ? 'activa' : 'inactiva'}">${u.activo ? 'Activo' : 'Inactivo'}</span></div>
        <div class="usuario-row-meta">@${u.username} · ${u.rol}</div>
      </div>
      ${u.rol !== 'admin' ? `<button class="btn-card ${u.activo ? 'danger' : ''}" data-uid="${u.id}">${u.activo ? 'Deshabilitar' : 'Habilitar'}</button>` : ''}
    `
    if (u.rol !== 'admin') {
      row.querySelector('[data-uid]').addEventListener('click', async () => {
        await window.api.toggleActivoUsuario(u.id)
        cargarUsuarios()
      })
    }
    contenedor.appendChild(row)
  }
}

document.getElementById('btn-crear-usuario').addEventListener('click', async () => {
  const username = document.getElementById('u-username').value.trim()
  const nombre   = document.getElementById('u-nombre').value.trim()
  const password = document.getElementById('u-password').value
  if (!username || !password) { toast('Usuario y contraseña son obligatorios', 'warn'); return }
  try {
    await window.api.crearUsuario({ username, password, nombre: nombre || null })
    document.getElementById('u-username').value = ''
    document.getElementById('u-nombre').value   = ''
    document.getElementById('u-password').value = ''
    toast('Usuario creado')
    cargarUsuarios()
  } catch { toast('Ya existe un usuario con ese nombre', 'err') }
})

// ─────────────────────────────────────────
// CONFIGURACIÓN — BACKUP + RESET
// ─────────────────────────────────────────
document.getElementById('btn-backup-db').addEventListener('click', async () => {
  try {
    await window.api.configBackup()
    toast('Backup exportado a Descargas')
  } catch { toast('Error al crear el backup', 'err') }
})

document.getElementById('btn-reset-db').addEventListener('click', async () => {
  const ok = confirm('¿Restablecer la base de datos?\n\nSe eliminarán todos los datos. La app se reiniciará con datos de ejemplo.\n\nEsta acción no se puede deshacer.')
  if (!ok) return
  await window.api.resetDB()
})

document.getElementById('btn-reset-db-login').addEventListener('click', async () => {
  const ok = confirm('⚠ Esto eliminará TODOS los datos (productos, ventas, balance).\n\n¿Confirmar reinicio del sistema?')
  if (!ok) return
  await window.api.resetDB()
})

// ─────────────────────────────────────────
// UTILS
// ─────────────────────────────────────────
function formatPeso(n) {
  return '$' + Math.round(n ?? 0).toLocaleString('es-CL')
}

// ─────────────────────────────────────────
// INICIO
// ─────────────────────────────────────────
document.getElementById('login-username').focus()
