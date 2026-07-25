const { app, BrowserWindow, ipcMain, dialog, Notification } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;
let splashWindow;

// Define data directory paths inside OS user application data folder
const DATA_DIR = path.join(app.getPath('userData'), 'data');
const DB_PATH = path.join(DATA_DIR, 'database.json');

// Initialize data directories
function initializeDirectories() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
}

// Generate template database if none exists
function getTemplateDatabase() {
    return {
        calibrations: [
            {
                id: "cal-1",
                name: "Phosphate Standard Model 2026",
                parameter: "Phosphate",
                unit: "mg/L",
                slope: 0.00821,
                intercept: 0.00154,
                r2: 0.9985,
                standards: [
                    { standard: "STD-1", concentration: 0.0, absorbance: 0.002 },
                    { standard: "STD-2", concentration: 10.0, absorbance: 0.084 },
                    { standard: "STD-3", concentration: 20.0, absorbance: 0.165 },
                    { standard: "STD-4", concentration: 50.0, absorbance: 0.412 },
                    { standard: "STD-5", concentration: 100.0, absorbance: 0.822 }
                ],
                active: true,
                created_at: new Date().toISOString()
            }
        ],
        sample_runs: [
            {
                run_id: "RUN-20260725-1000",
                parameter: "Phosphate",
                calibration_id: "cal-1",
                operator: "Analyst P. Sharma",
                created_at: new Date().toISOString(),
                samples: [
                    { sample_id: "SMP-A1", absorbance: 0.164, dilution: 1.0, concentration: 19.78, limit_status: "Normal" },
                    { sample_id: "SMP-A2", absorbance: 0.415, dilution: 1.0, concentration: 50.36, limit_status: "Normal" },
                    { sample_id: "SMP-A3", absorbance: 0.985, dilution: 2.0, concentration: 239.57, limit_status: "Exceeded" }
                ]
            }
        ],
        settings: {
            theme: "dark",
            waterLimits: {
                "pH": { min: 6.5, max: 8.5 },
                "Nitrate": { min: 0.0, max: 45.0 },
                "Phosphate": { min: 0.0, max: 5.0 },
                "Iron": { min: 0.0, max: 0.3 },
                "Fluoride": { min: 0.0, max: 1.5 }
            }
        }
    };
}

// Load database from file
function loadDatabase() {
    initializeDirectories();
    if (!fs.existsSync(DB_PATH)) {
        const template = getTemplateDatabase();
        fs.writeFileSync(DB_PATH, JSON.stringify(template, null, 2), 'utf-8');
        return template;
    }
    try {
        const data = fs.readFileSync(DB_PATH, 'utf-8');
        return JSON.parse(data);
    } catch (err) {
        console.error("Error reading database file, loading backup template", err);
        return getTemplateDatabase();
    }
}

// Save database to file
function saveDatabase(data) {
    initializeDirectories();
    try {
        fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
        return true;
    } catch (err) {
        console.error("Error saving database file:", err);
        return false;
    }
}

// IPC Handlers
ipcMain.handle('load-data', () => {
    return loadDatabase();
});

ipcMain.handle('save-data', (event, data) => {
    return saveDatabase(data);
});

// Create Application Window
function createMainWindow() {
    mainWindow = new BrowserWindow({
        width: 1300,
        height: 820,
        minWidth: 1100,
        minHeight: 700,
        show: false,
        backgroundColor: '#0a0813',
        icon: path.join(__dirname, 'renderer', 'logo.png'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
    mainWindow.setMenuBarVisibility(false);

    mainWindow.once('ready-to-show', () => {
        if (splashWindow && !splashWindow.isDestroyed()) {
            splashWindow.close();
        }
        mainWindow.show();
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// Create Splash Screen Loading Window
function createSplashWindow() {
    splashWindow = new BrowserWindow({
        width: 460,
        height: 310,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        resizable: false,
        icon: path.join(__dirname, 'renderer', 'logo.png'),
        webPreferences: {
            nodeIntegration: false
        }
    });

    splashWindow.loadFile(path.join(__dirname, 'renderer', 'splash.html'));
}

app.whenReady().then(() => {
    createSplashWindow();
    
    // Simulate initial checks (3.2 seconds loading)
    setTimeout(() => {
        createMainWindow();
    }, 3200);

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createMainWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
