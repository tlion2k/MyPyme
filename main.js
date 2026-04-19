const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const { initDB } = require('./src/database/db')
const { registerHandlers } = require('./src/handlers')

let mainWindow

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 1024,
    minWidth: 1024,
    minHeight: 1024,
    title: 'MyPyme',
    icon: path.join(__dirname, 'assets/image/logo-ico.ico'),
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  mainWindow.loadFile('src/renderer/index.html')

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools()
  }

  mainWindow.setMenuBarVisibility(false)
}

app.whenReady().then(async () => {
  await initDB()
  registerHandlers(ipcMain)
  createWindow()
})

app.on('window-all-closed', () => {
  app.quit()
})
