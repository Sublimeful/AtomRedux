const { app, BrowserWindow } = require("electron")

require('electron-reloader')(module);

const create_window = () => {
  
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  })
  
  win.loadFile('index.html')
}


app.whenReady().then(() => {
  create_window()
})
