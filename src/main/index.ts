import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { PGlite } from '@electric-sql/pglite'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import * as wasm from './src/wasmWrappers.ts'

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  const db = new PGlite('./db')

  wasm.instance()

  ipcMain.handle('ping', async (event, params) => {
    console.log('Received parameters:', params, event)
    initDB()
    const data = await db.query('SELECT * FROM todo;')
    return data
  })

  ipcMain.handle('add', async (event, params) => {
    try {
      // Ensure the WASM module is instantiated and running
      if (typeof add !== 'function') {
        throw new Error('WASM add function is not available.')
      }

      // Extract the numbers array from params
      const { numbers } = params

      // Validate that numbers is an array
      if (!Array.isArray(numbers)) {
        throw new Error('Parameter "numbers" must be an array.')
      }

      // Spread the numbers array to pass individual arguments to the add function
      const addedNumbers = add(...numbers)

      console.log('Added:', addedNumbers)
      return { success: true, result: addedNumbers }
    } catch (error) {
      console.error('Error adding numbers:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('changeImageBrightness', async (event, params) => {
    try {
      // Ensure the WASM module is instantiated and running
      if (typeof changeImageBrightness !== 'function') {
        throw new Error('WASM changeImageBrightness function is not available.')
      }

      // Extract the image and brightness from params
      const { image, brightness } = params

      const brightnessNumber = Number(brightness)

      console.log('Calling wasm...')

      // Call the changeImageBrightness function with the image and brightness
      const changedImage = changeImageBrightness(image, brightnessNumber)

      return { success: true, result: changedImage }
    } catch (error) {
      console.error('Error changing image brightness:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('readoutData', async () => {
    console.log('readoutData')
    const response = await db.query('SELECT * FROM todo;')
    return response
  })

  ipcMain.on('addHelloData', () => {
    console.log('addingHelloData')
    db.query("INSERT INTO todo (task) VALUES ('Hello World');")
  })

  const initDB = async () => {
    try {
      // Create table and insert initial data
      await db.exec(`
      CREATE TABLE IF NOT EXISTS todo (
        id SERIAL PRIMARY KEY,
        task TEXT,
        done BOOLEAN DEFAULT false
      );
      INSERT INTO todo (task, done) VALUES ('Install PGlite from NPM', true);
      INSERT INTO todo (task, done) VALUES ('Load PGlite', true);
      INSERT INTO todo (task, done) VALUES ('Create a table', true);
      INSERT INTO todo (task) VALUES ('Insert some data');
    `)

      console.log('Database initialized and data inserted')
    } catch (error) {
      console.error('Error initializing database:', error)
    }
  }

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app"s specific main process
// code. You can also put them in separate files and require them here.
