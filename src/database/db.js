const initSqlJs = require('sql.js')
const fs = require('fs')
const path = require('path')
const { app } = require('electron')

let _db = null

function getDB() { return _db }

// ─────────────────────────────────────────────────────────────
// WRAPPER — imita la API síncrona de better-sqlite3
// sql.js carga SQLite como WebAssembly: sin compilación nativa,
// funciona con cualquier versión de Electron sin recompilar.
// ─────────────────────────────────────────────────────────────

class DB {
  constructor(sqlJsDb, filePath) {
    this._db = sqlJsDb
    this._path = filePath
    this._inTx = false
  }

  pragma() {
    // WAL mode no aplica (sql.js vive en memoria y escribe al disco en bloque).
    // foreign_keys se activa abajo al iniciar.
  }

  // Ejecuta SQL de múltiples sentencias (usado para el schema)
  exec(sql) {
    this._db.run(sql)
    this._flush()
  }

  prepare(sql) {
    return new Stmt(this._db, sql, this)
  }

  // Wrapper de transacción: devuelve una función que al llamarse
  // ejecuta fn() dentro de BEGIN/COMMIT y escribe a disco al final.
  transaction(fn) {
    return () => {
      this._db.run('BEGIN')
      this._inTx = true
      try {
        const result = fn()
        this._db.run('COMMIT')
        this._inTx = false
        this._flush()
        return result
      } catch (e) {
        this._db.run('ROLLBACK')
        this._inTx = false
        throw e
      }
    }
  }

  _lastId() {
    return this._db.exec('SELECT last_insert_rowid()')[0]?.values[0][0] ?? null
  }

  // Vuelca la DB en memoria al archivo en disco.
  // Si estamos dentro de una transacción se omite — el commit lo hará.
  _flush() {
    if (this._inTx) return
    const data = this._db.export()
    fs.mkdirSync(path.dirname(this._path), { recursive: true })
    fs.writeFileSync(this._path, Buffer.from(data))
  }
}

class Stmt {
  constructor(sqlJsDb, sql, parent) {
    this._sqlJsDb = sqlJsDb
    this._sql = sql
    this._parent = parent
  }

  // Normaliza parámetros para sql.js:
  //   {nombre:'x'} → {'@nombre':'x'}  (params nombrados con @param en SQL)
  //   [val1, val2] → [val1, val2]      (params posicionales con ?)
  //   'valor'      → ['valor']         (valor único posicional)
  _norm(params) {
    if (params === undefined || params === null) return undefined
    if (Array.isArray(params)) return params.length ? params : undefined
    if (typeof params === 'object') {
      const keys = Object.keys(params)
      if (!keys.length) return undefined
      if ('@$:'.includes(keys[0][0])) return params   // ya tiene prefijo
      const out = {}
      for (const [k, v] of Object.entries(params)) out[`@${k}`] = v
      return out
    }
    return [params]
  }

  // Retorna la primera fila como objeto, o undefined si no hay resultado
  get(params) {
    const stmt = this._sqlJsDb.prepare(this._sql)
    try {
      const p = this._norm(params)
      if (p) stmt.bind(p)
      return stmt.step() ? stmt.getAsObject() : undefined
    } finally {
      stmt.free()
    }
  }

  // Retorna todas las filas como array de objetos
  all(...args) {
    const stmt = this._sqlJsDb.prepare(this._sql)
    const rows = []
    try {
      const raw = args.length === 1 ? args[0] : args.length > 1 ? args : undefined
      const p = this._norm(raw)
      if (p) stmt.bind(p)
      while (stmt.step()) rows.push(stmt.getAsObject())
    } finally {
      stmt.free()
    }
    return rows
  }

  // Ejecuta la sentencia (INSERT / UPDATE / DELETE) y retorna { lastInsertRowid, changes }
  run(params) {
    const stmt = this._sqlJsDb.prepare(this._sql)
    try {
      const p = this._norm(params)
      if (p) stmt.bind(p)
      stmt.step()
    } finally {
      stmt.free()
    }
    const lastInsertRowid = this._parent._lastId()
    this._parent._flush()
    return { lastInsertRowid, changes: 1 }
  }
}

// ─────────────────────────────────────────────────────────────
// INICIALIZACIÓN
// ─────────────────────────────────────────────────────────────

async function initDB() {
  // Ruta del archivo WASM: en dev está en node_modules, en producción en resources/
  const wasmPath = app.isPackaged
    ? path.join(process.resourcesPath, 'sql-wasm.wasm')
    : path.join(__dirname, '..', '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm')

  const SQL = await initSqlJs({ locateFile: () => wasmPath })

  const dbPath = path.join(app.getPath('userData'), 'mypyme.db')

  // Migración: si existe el archivo antiguo y no existe el nuevo, renombrarlo
  const dbPathLegacy = path.join(app.getPath('userData'), 'localservice.db')
  if (!fs.existsSync(dbPath) && fs.existsSync(dbPathLegacy)) {
    fs.renameSync(dbPathLegacy, dbPath)
  }

  // Carga DB existente o crea una nueva
  const buf = fs.existsSync(dbPath) ? fs.readFileSync(dbPath) : null
  const sqlJsDb = buf ? new SQL.Database(buf) : new SQL.Database()

  sqlJsDb.run('PRAGMA foreign_keys = ON')

  _db = new DB(sqlJsDb, dbPath)

  _createSchema()
  _migrate()
  _seedDemoData()

  console.log(`[DB] Iniciada en: ${dbPath}`)
  return _db
}

function _createSchema() {
  _db._db.run(`
    CREATE TABLE IF NOT EXISTS categoria (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre      TEXT NOT NULL UNIQUE,
      descripcion TEXT,
      creado_en   TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS producto (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      categoria_id   INTEGER REFERENCES categoria(id) ON DELETE SET NULL,
      nombre         TEXT NOT NULL,
      descripcion    TEXT,
      precio_compra  REAL NOT NULL DEFAULT 0,
      precio_venta   REAL NOT NULL,
      stock          INTEGER NOT NULL DEFAULT 0,
      stock_minimo   INTEGER NOT NULL DEFAULT 5,
      unidad         TEXT NOT NULL DEFAULT 'unidad',
      activo         INTEGER NOT NULL DEFAULT 1,
      creado_en      TEXT DEFAULT (datetime('now', 'localtime')),
      actualizado_en TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS codigo_barra (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      producto_id   INTEGER NOT NULL REFERENCES producto(id) ON DELETE CASCADE,
      codigo        TEXT NOT NULL UNIQUE,
      activo        INTEGER NOT NULL DEFAULT 1,
      vigente_desde TEXT DEFAULT (datetime('now', 'localtime')),
      vigente_hasta TEXT,
      motivo_cambio TEXT
    );

    CREATE TABLE IF NOT EXISTS venta (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      numero_boleta TEXT NOT NULL UNIQUE,
      fecha         TEXT DEFAULT (datetime('now', 'localtime')),
      tipo_pago     TEXT NOT NULL DEFAULT 'efectivo',
      total         REAL NOT NULL,
      estado        TEXT NOT NULL DEFAULT 'completada',
      nota          TEXT
    );

    CREATE TABLE IF NOT EXISTS detalle_venta (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      venta_id        INTEGER NOT NULL REFERENCES venta(id) ON DELETE CASCADE,
      producto_id     INTEGER NOT NULL REFERENCES producto(id),
      cantidad        INTEGER NOT NULL,
      precio_unitario REAL NOT NULL,
      subtotal        REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS balance_semanal (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      semana_inicio TEXT NOT NULL,
      semana_fin    TEXT NOT NULL,
      total_ventas  INTEGER NOT NULL DEFAULT 0,
      ingresos      REAL NOT NULL DEFAULT 0,
      costo_total   REAL NOT NULL DEFAULT 0,
      ganancia_neta REAL NOT NULL DEFAULT 0,
      generado_en   TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS usuario (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      username   TEXT NOT NULL UNIQUE,
      password   TEXT NOT NULL,
      nombre     TEXT,
      rol        TEXT NOT NULL DEFAULT 'funcionario',
      activo     INTEGER NOT NULL DEFAULT 1,
      creado_en  TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS config_negocio (
      clave TEXT PRIMARY KEY,
      valor TEXT
    );

    CREATE TABLE IF NOT EXISTS cliente (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre     TEXT NOT NULL,
      telefono   TEXT,
      email      TEXT,
      notas      TEXT,
      activo     INTEGER NOT NULL DEFAULT 1,
      creado_en  TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS proveedor (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre     TEXT NOT NULL,
      contacto   TEXT,
      telefono   TEXT,
      email      TEXT,
      activo     INTEGER NOT NULL DEFAULT 1,
      creado_en  TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS entrada_stock (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      proveedor_id INTEGER REFERENCES proveedor(id) ON DELETE SET NULL,
      fecha        TEXT DEFAULT (datetime('now', 'localtime')),
      total        REAL NOT NULL DEFAULT 0,
      nota         TEXT
    );

    CREATE TABLE IF NOT EXISTS detalle_entrada (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      entrada_id      INTEGER NOT NULL REFERENCES entrada_stock(id) ON DELETE CASCADE,
      producto_id     INTEGER NOT NULL REFERENCES producto(id),
      cantidad        INTEGER NOT NULL,
      precio_unitario REAL NOT NULL,
      subtotal        REAL NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_codigo_activo ON codigo_barra(codigo, activo);
    CREATE INDEX IF NOT EXISTS idx_venta_fecha   ON venta(fecha);
    CREATE INDEX IF NOT EXISTS idx_detalle_vid   ON detalle_venta(venta_id);
    CREATE INDEX IF NOT EXISTS idx_producto_act  ON producto(activo);
  `)
  _db._flush()
}

function _migrate() {
  const cols = _db._db.exec('PRAGMA table_info(categoria)')[0]?.values.map(r => r[1]) ?? []
  if (!cols.includes('activo')) {
    _db._db.run('ALTER TABLE categoria ADD COLUMN activo INTEGER NOT NULL DEFAULT 1')
    _db._flush()
  }

  const ventaCols = _db._db.exec('PRAGMA table_info(venta)')[0]?.values.map(r => r[1]) ?? []
  if (!ventaCols.includes('descuento')) {
    _db._db.run('ALTER TABLE venta ADD COLUMN descuento REAL NOT NULL DEFAULT 0')
    _db._flush()
  }
  if (!ventaCols.includes('cliente_id')) {
    _db._db.run('ALTER TABLE venta ADD COLUMN cliente_id INTEGER REFERENCES cliente(id)')
    _db._flush()
  }
}

function _seedDemoData() {
  const adminCount = _db.prepare('SELECT COUNT(*) as n FROM usuario').get()
  if (adminCount.n === 0) {
    const crypto = require('crypto')
    const hash = crypto.createHash('sha256').update('admin').digest('hex')
    _db.prepare('INSERT INTO usuario (username, password, nombre, rol) VALUES (?, ?, ?, ?)').run(['admin', hash, 'Administrador', 'admin'])
  }
}

function getDBPath() {
  return path.join(app.getPath('userData'), 'mypyme.db')
}

module.exports = { initDB, getDB, getDBPath }

