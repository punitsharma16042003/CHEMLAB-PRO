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
                id: "cal-phos-1",
                name: "Phosphate Standard Model 2026",
                parameter: "Phosphate",
                unit: "mg/L",
                slope: 0.00821,
                intercept: 0.00154,
                r2: 0.9985,
                syx: 0.0035,
                sm: 0.00012,
                lod: 1.4068,
                loq: 4.2631,
                forceZero: false,
                standards: [
                    { id: "STD-1", concentration: 0.0, absorbance: 0.002 },
                    { id: "STD-2", concentration: 10.0, absorbance: 0.084 },
                    { id: "STD-3", concentration: 20.0, absorbance: 0.165 },
                    { id: "STD-4", concentration: 50.0, absorbance: 0.412 },
                    { id: "STD-5", concentration: 100.0, absorbance: 0.822 }
                ],
                active: true,
                created_at: new Date().toISOString()
            },
            {
                id: "cal-nit-1",
                name: "Nitrate Cadmium Reduction Model",
                parameter: "Nitrate",
                unit: "mg/L",
                slope: 0.01300,
                intercept: 0.00200,
                r2: 0.9992,
                syx: 0.0018,
                sm: 0.00008,
                lod: 0.456,
                loq: 1.384,
                forceZero: false,
                standards: [
                    { id: "STD-1", concentration: 0.0, absorbance: 0.003 },
                    { id: "STD-2", concentration: 5.0, absorbance: 0.065 },
                    { id: "STD-3", concentration: 10.0, absorbance: 0.131 },
                    { id: "STD-4", concentration: 25.0, absorbance: 0.325 },
                    { id: "STD-5", concentration: 50.0, absorbance: 0.650 }
                ],
                active: true,
                created_at: new Date().toISOString()
            },
            {
                id: "cal-iron-1",
                name: "Iron Phenanthroline Method 2026",
                parameter: "Iron",
                unit: "ppm",
                slope: 0.51800,
                intercept: 0.00100,
                r2: 0.9994,
                syx: 0.0025,
                sm: 0.0011,
                lod: 0.0159,
                loq: 0.0482,
                forceZero: false,
                standards: [
                    { id: "STD-1", concentration: 0.0, absorbance: 0.001 },
                    { id: "STD-2", concentration: 0.1, absorbance: 0.052 },
                    { id: "STD-3", concentration: 0.2, absorbance: 0.104 },
                    { id: "STD-4", concentration: 0.5, absorbance: 0.261 },
                    { id: "STD-5", concentration: 1.0, absorbance: 0.518 }
                ],
                active: true,
                created_at: new Date().toISOString()
            },
            {
                id: "cal-fluor-1",
                name: "Fluoride SPADNS Spectrophotometric Model",
                parameter: "Fluoride",
                unit: "mg/L",
                slope: 0.21700,
                intercept: 0.00250,
                r2: 0.9989,
                syx: 0.0030,
                sm: 0.0015,
                lod: 0.0456,
                loq: 0.1382,
                forceZero: false,
                standards: [
                    { id: "STD-1", concentration: 0.0, absorbance: 0.003 },
                    { id: "STD-2", concentration: 0.2, absorbance: 0.042 },
                    { id: "STD-3", concentration: 0.5, absorbance: 0.106 },
                    { id: "STD-4", concentration: 1.0, absorbance: 0.218 },
                    { id: "STD-5", concentration: 2.0, absorbance: 0.435 }
                ],
                active: true,
                created_at: new Date().toISOString()
            },
            {
                id: "cal-ph-1",
                name: "pH Bromothymol Blue Absorbance Model",
                parameter: "pH",
                unit: "AU",
                slope: 0.09200,
                intercept: 0.04000,
                r2: 0.9975,
                syx: 0.008,
                sm: 0.002,
                lod: 0.28,
                loq: 0.85,
                forceZero: false,
                standards: [
                    { id: "STD-1", concentration: 4.0, absorbance: 0.05 },
                    { id: "STD-2", concentration: 5.0, absorbance: 0.12 },
                    { id: "STD-3", concentration: 7.0, absorbance: 0.35 },
                    { id: "STD-4", concentration: 8.0, absorbance: 0.58 },
                    { id: "STD-5", concentration: 10.0, absorbance: 0.92 }
                ],
                active: true,
                created_at: new Date().toISOString()
            },
            {
                id: "cal-lead-1",
                name: "Lead Dithizone Extraction Model",
                parameter: "Lead",
                unit: "mg/L",
                slope: 9.06000,
                intercept: 0.00180,
                r2: 0.9995,
                syx: 0.0012,
                sm: 0.035,
                lod: 0.0004,
                loq: 0.0013,
                forceZero: false,
                standards: [
                    { id: "STD-1", concentration: 0.0, absorbance: 0.002 },
                    { id: "STD-2", concentration: 0.005, absorbance: 0.045 },
                    { id: "STD-3", concentration: 0.010, absorbance: 0.091 },
                    { id: "STD-4", concentration: 0.020, absorbance: 0.183 },
                    { id: "STD-5", concentration: 0.050, absorbance: 0.455 }
                ],
                active: true,
                created_at: new Date().toISOString()
            }
        ],
        sample_runs: [
            {
                run_id: "SMP-20261118-001",
                sample_name: "Municipal Tap Water - Zone 1",
                source: "Central Water Distribution Grid",
                parameter: "Multi-Analyte",
                operator: "Analyst P. Sharma",
                created_at: new Date().toISOString(),
                overall_status: "Safe",
                results: [
                    { parameter: "Phosphate", unit: "mg/L", absorbance: 0.084, dilution: 1.0, concentration: "10.04", status: "Exceeded", calibration_name: "Phosphate Standard Model 2026" },
                    { parameter: "Nitrate", unit: "mg/L", absorbance: 0.250, dilution: 1.0, concentration: "19.08", status: "Safe", calibration_name: "Nitrate Cadmium Reduction Model" },
                    { parameter: "Iron", unit: "ppm", absorbance: 0.052, dilution: 1.0, concentration: "0.10", status: "Safe", calibration_name: "Iron Phenanthroline Method 2026" },
                    { parameter: "Fluoride", unit: "mg/L", absorbance: 0.106, dilution: 1.0, concentration: "0.48", status: "Safe", calibration_name: "Fluoride SPADNS Model" }
                ],
                samples: []
            }
        ],
        settings: {
            theme: "light",
            waterLimits: {
                "pH": { min: 6.5, max: 8.5 },
                "Nitrate": { min: 0.0, max: 45.0 },
                "Phosphate": { min: 0.0, max: 5.0 },
                "Iron": { min: 0.0, max: 0.3 },
                "Fluoride": { min: 0.0, max: 1.5 },
                "Lead": { min: 0.0, max: 0.01 },
                "Copper": { min: 0.0, max: 2.0 },
                "Ammonia": { min: 0.0, max: 1.5 }
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
