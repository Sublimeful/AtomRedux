const { app, BrowserWindow } = require("electron")
const { ipcMain, dialog } = require("electron");

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

  ipcMain.handle("import_playlist", (e, default_path) => {
    dialog.showOpenDialog({title: "Import Playlist", defaultPath: default_path, filters: [{ name: 'CSV Files', extensions: ['csv'] }]})
    .then(res => {
      win.webContents.send("import_playlist", res);
    })
  })

  ipcMain.handle("export_playlist", (e, default_path) => {
    dialog.showSaveDialog({title: "Export Playlist", defaultPath: default_path, filters: [{ name: 'CSV Files', extensions: ['csv'] }]})
    .then(res => {
      win.webContents.send("export_playlist", res);
    })
  })
}





app.whenReady().then(() => {
  create_window()
})


