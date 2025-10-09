const { app, BrowserWindow } = require('electron');
const path = require('path');
// Importar la configuración de la base de datos
let mainWindow;
let splash;
// Crear la ventana principal
function createWindow() {
  // Splash screen
  splash = new BrowserWindow({
    width: 400,
    height: 300,
    frame: false,
    alwaysOnTop: true,
    transparent: true,
    resizable: false,
    center: true
  });

  splash.loadFile(path.join(__dirname, 'Views', 'splash.html'));

  // Ventana principal (oculta al inicio)
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    show: false, // importante
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: true
    }
  });
  // Cargar el archivo HTML de la ventana principal
  mainWindow.loadFile(path.join(__dirname, 'Views', 'Index.html'));

  // Simular carga (3s) o reemplazar por evento real
  setTimeout(() => {
    splash.close();
    mainWindow.show();
  }, 3000);
}
// Iniciar la aplicación
app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

