// ChemLab Pro LIMS - Frontend Application Logic (Shimadzu LabSolutions Edition)
// Enhanced Industrial Analytical Chemistry & Water Metrology Suite

// ==========================================================================
// Global State & Configuration
// ==========================================================================

let db = {};
let currentView = 'dashboard';
let activeParameter = 'Phosphate';
let activeCalModel = null;
let standardsList = [];
let samplesList = [];
let calibrationChart = null;
let isShowingResiduals = false;
let currentInspectedRun = null;

// Dynamic Parameter Units Map
const PARAM_UNITS = {
    "pH": "AU",
    "Nitrate": "mg/L",
    "Phosphate": "mg/L",
    "Iron": "ppm",
    "Fluoride": "mg/L",
    "Lead": "mg/L",
    "Arsenic": "mg/L",
    "Turbidity": "NTU",
    "Chlorine": "mg/L"
};

// ==========================================================================
// Toast Notification Engine (Non-blocking Modern UX)
// ==========================================================================

function showToast(message, type = 'info', duration = 3500) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    else if (type === 'error') icon = '❌';
    else if (type === 'warn') icon = '⚠️';

    toast.innerHTML = `<span style="font-size: 1.1rem;">${icon}</span><span style="flex: 1;">${message}</span>`;
    
    toast.addEventListener('click', () => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(50px)';
        setTimeout(() => toast.remove(), 300);
    });

    container.appendChild(toast);

    setTimeout(() => {
        if (toast.parentElement) {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(50px)';
            setTimeout(() => toast.remove(), 300);
        }
    }, duration);
}

function dialogInfo(title, msg) {
    showToast(`${title}: ${msg}`, 'info', 4000);
}

function dialogError(title, msg) {
    showToast(`${title}: ${msg}`, 'error', 5000);
}

// Modal Helpers
function openModal(modalId) {
    const el = document.getElementById(modalId);
    if (el) el.classList.remove('hidden');
}

function closeModal(modalId) {
    const el = document.getElementById(modalId);
    if (el) el.classList.add('hidden');
}

// ==========================================================================
// Database Storage & Sync (Electron IPC + localStorage Fallback)
// ==========================================================================

async function loadDatabase() {
    try {
        if (window.chemLabAPI && typeof window.chemLabAPI.loadData === 'function') {
            const data = await window.chemLabAPI.loadData();
            if (data && data.calibrations) {
                localStorage.setItem('chemlab_db_cache', JSON.stringify(data));
                return data;
            }
        }
    } catch (e) {
        console.warn("IPC load failed, attempting localStorage fallback", e);
    }

    const localCached = localStorage.getItem('chemlab_db_cache');
    if (localCached) {
        try {
            return JSON.parse(localCached);
        } catch (err) {
            console.error("Local cache corrupt", err);
        }
    }

    return getTemplateDatabase();
}

async function saveDatabase(data) {
    localStorage.setItem('chemlab_db_cache', JSON.stringify(data));
    try {
        if (window.chemLabAPI && typeof window.chemLabAPI.saveData === 'function') {
            return await window.chemLabAPI.saveData(data);
        }
    } catch (e) {
        console.warn("IPC save failed, persisted to local storage", e);
    }
    return true;
}

// ==========================================================================
// Application Bootstrap & Event Wiring
// ==========================================================================

document.addEventListener('DOMContentLoaded', async () => {
    db = await loadDatabase();

    // Ensure settings structure
    if (!db.settings) db.settings = { theme: "light", waterLimits: {} };
    if (!db.settings.waterLimits) {
        db.settings.waterLimits = getTemplateDatabase().settings.waterLimits;
    }
    if (!db.calibrations) db.calibrations = [];
    if (!db.sample_runs) db.sample_runs = [];

    // Sync unit dictionary from settings
    Object.keys(db.settings.waterLimits).forEach(param => {
        if (!PARAM_UNITS[param]) PARAM_UNITS[param] = "mg/L";
    });

    renderParameterTabs();

    // Bind navigation tabs
    const navItems = {
        'nav-dashboard': 'dashboard',
        'nav-calibration': 'calibration',
        'nav-analysis': 'analysis',
        'nav-lsi': 'lsi',
        'nav-bod': 'bod',
        'nav-tss': 'tss',
        'nav-history': 'history'
    };

    Object.entries(navItems).forEach(([id, view]) => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('click', (e) => {
                e.preventDefault();
                switchView(view);
            });
        }
    });

    // Operator input sync
    const opInput = document.getElementById('operator-name-input');
    if (opInput) {
        opInput.addEventListener('change', (e) => {
            setStatusText(`Operator updated to: ${e.target.value}`);
            showToast(`Active operator set to: ${e.target.value}`, 'info', 2500);
        });
    }

    // Topbar Parameter Management button
    const btnOpenParams = document.getElementById('btn-open-params-modal');
    if (btnOpenParams) {
        btnOpenParams.addEventListener('click', openManageParamsModal);
    }

    // Calibration Buttons & Controls
    document.getElementById('btn-add-standard-row').addEventListener('click', addStandardRow);
    document.getElementById('btn-import-standards').addEventListener('click', () => openBatchImportModal('standards'));
    document.getElementById('btn-calculate-curve').addEventListener('click', calculateCalibrationCurve);
    document.getElementById('btn-save-calibration').addEventListener('click', saveCalibrationModel);
    document.getElementById('btn-export-curve-image').addEventListener('click', exportPlotAsImage);
    document.getElementById('btn-toggle-residuals').addEventListener('click', toggleResidualsPlot);
    document.getElementById('cal-force-zero').addEventListener('change', () => {
        if (standardsList.length >= 2) calculateCalibrationCurve();
    });

    // Analysis Buttons & Controls
    document.getElementById('btn-add-sample-row').addEventListener('click', addSampleRow);
    document.getElementById('btn-import-samples').addEventListener('click', () => openBatchImportModal('samples'));
    document.getElementById('btn-calculate-batch').addEventListener('click', calculateSampleBatch);
    document.getElementById('btn-save-run').addEventListener('click', saveSampleRun);
    document.getElementById('btn-export-csv').addEventListener('click', exportRunToCSV);
    document.getElementById('btn-generate-coa').addEventListener('click', () => {
        calculateSampleBatch();
        generateCertificateOfAnalysis(null);
    });

    // Stability & Water Quality Indices
    document.getElementById('btn-calculate-lsi').addEventListener('click', calculateLSI);

    // BOD & TSS bindings
    const seededCheck = document.getElementById('bod-is-seeded');
    if (seededCheck) {
        seededCheck.addEventListener('change', (e) => {
            const seedCtrls = document.getElementById('bod-seed-controls');
            if (seedCtrls) {
                if (e.target.checked) seedCtrls.classList.remove('hidden');
                else seedCtrls.classList.add('hidden');
            }
        });
    }

    document.getElementById('btn-calculate-bod').addEventListener('click', calculateBOD);
    document.getElementById('btn-calculate-tss').addEventListener('click', calculateTSS);

    // Batch Importer Modal execution
    document.getElementById('btn-execute-import').addEventListener('click', executeBatchImport);

    // History Run Search Filter
    const searchInput = document.getElementById('history-runs-search');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            renderHistoryRuns(e.target.value.trim().toLowerCase());
        });
    }

    // Parameter limits configuration buttons
    document.getElementById('btn-add-custom-param').addEventListener('click', addCustomParameterRow);
    document.getElementById('btn-save-params-settings').addEventListener('click', saveParameterSettings);

    // Initialize Chart.js
    initializeChartJSInstance();

    // Initial draw
    updateUIForParameter();
    switchView('dashboard');
    showToast("ChemLab Pro Workstation Loaded & Calibrated", "success", 2800);
});

// Switch views utility
function switchView(viewName) {
    currentView = viewName;
    
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    document.querySelectorAll('.view-pane').forEach(pane => pane.classList.add('hidden'));

    const activeNavId = `nav-${viewName}`;
    const activePaneId = `${viewName}-view`;
    
    if (document.getElementById(activeNavId)) document.getElementById(activeNavId).classList.add('active');
    if (document.getElementById(activePaneId)) document.getElementById(activePaneId).classList.remove('hidden');

    const formattedTitle = viewName.toUpperCase().replace('-', ' ');
    const titleLabel = document.getElementById('page-title-label');
    if (titleLabel) titleLabel.textContent = formattedTitle;

    if (viewName === 'dashboard') {
        renderDashboard();
    } else if (viewName === 'history') {
        renderHistory();
    }

    setStatusText(`${formattedTitle} view active`);
}

function setStatusText(text) {
    const time = new Date().toLocaleTimeString();
    const opInput = document.getElementById('operator-name-input');
    const op = opInput ? opInput.value : 'Analyst';
    const statusLabel = document.getElementById('status-text-label');
    if (statusLabel) {
        statusLabel.textContent = `Ready | Operator: ${op} | ${time} | ${text}`;
    }
}

// ==========================================================================
// Dynamic Analyte Tabs & Guidelines Management
// ==========================================================================

function renderParameterTabs() {
    const tabBar = document.getElementById('parameter-tab-bar');
    if (!tabBar) return;

    tabBar.innerHTML = '';
    const params = Object.keys(db.settings.waterLimits);

    if (!params.includes(activeParameter) && params.length > 0) {
        activeParameter = params[0];
    }

    params.forEach(param => {
        const unit = PARAM_UNITS[param] || 'mg/L';
        const btn = document.createElement('button');
        btn.className = `param-tab ${param === activeParameter ? 'active' : ''}`;
        btn.setAttribute('data-param', param);
        btn.textContent = `${param} (${unit})`;
        btn.addEventListener('click', () => {
            document.querySelectorAll('.param-tab').forEach(t => t.classList.remove('active'));
            btn.classList.add('active');
            activeParameter = param;
            updateUIForParameter();
            setStatusText(`Switched analyte method to: ${activeParameter}`);
            showToast(`Active Analyte: ${activeParameter}`, 'info', 2000);
        });
        tabBar.appendChild(btn);
    });
}

function updateUIForParameter() {
    const unit = PARAM_UNITS[activeParameter] || 'mg/L';
    
    document.querySelectorAll('.conc-header-label').forEach(el => {
        el.textContent = `Concentration (${unit})`;
    });

    loadDefaultStandardsForParameter();
    loadActiveCalibrationForParameter();
    resetSampleBatch();

    // Reset Residuals view mode
    isShowingResiduals = false;
    const toggleBtn = document.getElementById('btn-toggle-residuals');
    if (toggleBtn) toggleBtn.textContent = "📉 View Residuals";
    const plotTitle = document.getElementById('plot-header-title');
    if (plotTitle) plotTitle.textContent = "📈 Calibration Curve & Regression";

    updateChartData();
}

function loadDefaultStandardsForParameter() {
    let convals = [0.0, 10.0, 20.0, 50.0, 100.0];
    let absvals = [0.002, 0.084, 0.165, 0.412, 0.822];

    if (activeParameter === 'pH') {
        convals = [4.0, 5.0, 7.0, 8.0, 10.0];
        absvals = [0.05, 0.12, 0.35, 0.58, 0.92];
    } else if (activeParameter === 'Iron') {
        convals = [0.0, 0.1, 0.2, 0.5, 1.0];
        absvals = [0.001, 0.052, 0.104, 0.261, 0.518];
    } else if (activeParameter === 'Fluoride') {
        convals = [0.0, 0.2, 0.5, 1.0, 2.0];
        absvals = [0.003, 0.042, 0.106, 0.218, 0.435];
    } else if (activeParameter === 'Lead') {
        convals = [0.0, 0.005, 0.010, 0.020, 0.050];
        absvals = [0.002, 0.045, 0.091, 0.183, 0.455];
    } else if (activeParameter === 'Nitrate') {
        convals = [0.0, 5.0, 10.0, 25.0, 50.0];
        absvals = [0.003, 0.065, 0.131, 0.325, 0.650];
    }

    standardsList = convals.map((conc, i) => ({
        id: `STD-${i + 1}`,
        concentration: conc,
        absorbance: absvals[i]
    }));

    renderStandardsTable();
}

function loadActiveCalibrationForParameter() {
    const activeCal = db.calibrations.find(c => c.parameter === activeParameter && c.active === true);
    
    if (activeCal) {
        activeCalModel = {
            slope: activeCal.slope,
            intercept: activeCal.intercept,
            r2: activeCal.r2,
            name: activeCal.name,
            lod: activeCal.lod || null,
            loq: activeCal.loq || null,
            syx: activeCal.syx || null,
            sm: activeCal.sm || null,
            forceZero: activeCal.forceZero || false
        };
        
        if (activeCal.standards && activeCal.standards.length > 0) {
            standardsList = JSON.parse(JSON.stringify(activeCal.standards));
        }

        const forceZeroBox = document.getElementById('cal-force-zero');
        if (forceZeroBox) forceZeroBox.checked = !!activeCal.forceZero;
    } else {
        activeCalModel = null;
    }

    renderStandardsTable();
    updateCalibrationSummaryCards();
}

function resetSampleBatch() {
    samplesList = [
        { id: "SMP-A1", absorbance: 0.124, dilution: 1.0, concentration: "", status: "Pending" },
        { id: "SMP-A2", absorbance: 0.385, dilution: 1.0, concentration: "", status: "Pending" },
        { id: "SMP-A3", absorbance: 0.654, dilution: 1.0, concentration: "", status: "Pending" }
    ];

    const runDateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const runTimeStr = new Date().toLocaleTimeString('en-US', { hour12: false }).replace(/:/g, "").slice(0, 4);
    const runInput = document.getElementById('analysis-run-id-input');
    if (runInput) runInput.value = `RUN-${runDateStr}-${runTimeStr}`;

    renderSamplesTable();
}

// ==========================================================================
// Advanced Metrology & Linear Regression Engine (IUPAC / ISO 11843)
// ==========================================================================

function linearRegressionMetrology(points, forceZero = false) {
    if (points.length < 2) {
        throw new Error("Linear regression requires at least two analytical standards.");
    }

    const n = points.length;
    const xs = points.map(p => p[0]);
    const ys = points.map(p => p[1]);

    const meanX = xs.reduce((a, b) => a + b, 0) / n;
    const meanY = ys.reduce((a, b) => a + b, 0) / n;

    let slope = 0;
    let intercept = 0;
    let ssXX = 0;
    let ssYY = 0;
    let ssXY = 0;
    let sumXY = 0;
    let sumX2 = 0;

    for (let i = 0; i < n; i++) {
        ssXX += Math.pow(xs[i] - meanX, 2);
        ssYY += Math.pow(ys[i] - meanY, 2);
        ssXY += (xs[i] - meanX) * (ys[i] - meanY);
        sumXY += xs[i] * ys[i];
        sumX2 += Math.pow(xs[i], 2);
    }

    if (forceZero) {
        if (sumX2 === 0) throw new Error("Concentrations sum of squares cannot be zero.");
        slope = sumXY / sumX2;
        intercept = 0.0;
    } else {
        if (ssXX === 0) throw new Error("All standard concentrations are identical. Provide distinct standards.");
        slope = ssXY / ssXX;
        intercept = meanY - slope * meanX;
    }

    // Residuals and Standard Error of Regression (Sy/x)
    const residuals = [];
    let ssRes = 0;

    for (let i = 0; i < n; i++) {
        const yPred = slope * xs[i] + intercept;
        const res = ys[i] - yPred;
        residuals.push({ x: xs[i], residual: res, actual: ys[i], pred: yPred });
        ssRes += Math.pow(res, 2);
    }

    const r2 = ssYY === 0 ? 1.0 : Math.max(0, 1.0 - (ssRes / ssYY));
    const df = forceZero ? (n - 1) : (n - 2);
    const syx = df > 0 ? Math.sqrt(ssRes / df) : 0.0;

    // Standard Error of Slope (Sm)
    const sm = (!forceZero && ssXX > 0) ? (syx / Math.sqrt(ssXX)) : (sumX2 > 0 ? syx / Math.sqrt(sumX2) : 0.0);

    // Limit of Detection (LOD) & Limit of Quantitation (LOQ)
    const lod = slope > 0 ? (3.3 * syx) / slope : 0.0;
    const loq = slope > 0 ? (10.0 * syx) / slope : 0.0;

    return {
        slope,
        intercept,
        r2,
        syx,
        sm,
        lod,
        loq,
        residuals,
        forceZero
    };
}

function calculateCalibrationCurve() {
    try {
        const forceZero = document.getElementById('cal-force-zero').checked;
        const points = standardsList.map(s => [s.concentration, s.absorbance]);
        const model = linearRegressionMetrology(points, forceZero);

        activeCalModel = {
            slope: model.slope,
            intercept: model.intercept,
            r2: model.r2,
            syx: model.syx,
            sm: model.sm,
            lod: model.lod,
            loq: model.loq,
            residuals: model.residuals,
            forceZero: model.forceZero,
            name: document.getElementById('cal-model-name-input').value || `${activeParameter} Calibration Curve`
        };

        updateChartData();
        updateCalibrationSummaryCards();
        showToast(`Regression Calculated: R² = ${model.r2.toFixed(6)} | LOD = ${model.lod.toFixed(4)}`, 'success', 3200);
        setStatusText(`Curve computed. R² = ${model.r2.toFixed(6)} | Sy/x = ${model.syx.toFixed(6)}`);
    } catch (e) {
        dialogError("Calibration Error", e.message);
    }
}

async function saveCalibrationModel() {
    if (!activeCalModel) {
        calculateCalibrationCurve();
        if (!activeCalModel) return;
    }

    db.calibrations.forEach(c => {
        if (c.parameter === activeParameter) c.active = false;
    });

    const newModel = {
        id: `cal-${Date.now()}`,
        name: activeCalModel.name,
        parameter: activeParameter,
        unit: PARAM_UNITS[activeParameter] || 'mg/L',
        slope: activeCalModel.slope,
        intercept: activeCalModel.intercept,
        r2: activeCalModel.r2,
        syx: activeCalModel.syx,
        sm: activeCalModel.sm,
        lod: activeCalModel.lod,
        loq: activeCalModel.loq,
        forceZero: activeCalModel.forceZero,
        standards: JSON.parse(JSON.stringify(standardsList)),
        active: true,
        created_at: new Date().toISOString()
    };

    db.calibrations.unshift(newModel);

    const success = await saveDatabase(db);
    if (success) {
        setStatusText(`Stored calibration model: ${newModel.name}`);
        showToast(`Model '${newModel.name}' stored & activated globally.`, 'success', 3500);
    } else {
        dialogError("Storage Error", "Failed to write calibration database.");
    }
}

// Standards Table UI
function renderStandardsTable() {
    const tbody = document.getElementById('cal-standards-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    standardsList.forEach((std, index) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><input type="text" class="table-cell-input" value="${std.id}" onchange="updateStandardField(${index}, 'id', this.value)"></td>
            <td><input type="number" step="any" class="table-cell-input" value="${std.concentration}" onchange="updateStandardField(${index}, 'concentration', this.value)"></td>
            <td><input type="number" step="any" class="table-cell-input" value="${std.absorbance}" onchange="updateStandardField(${index}, 'absorbance', this.value)"></td>
            <td>
                <button class="btn btn-secondary" onclick="deleteStandardRow(${index})" style="padding:2px 6px; color:var(--status-danger);">🗑️</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function updateStandardField(index, key, val) {
    if (key === 'concentration' || key === 'absorbance') {
        standardsList[index][key] = parseFloat(val) || 0.0;
    } else {
        standardsList[index][key] = val;
    }
    updateChartData();
}

function deleteStandardRow(index) {
    standardsList.splice(index, 1);
    renderStandardsTable();
    updateChartData();
}

function addStandardRow() {
    const nextNum = standardsList.length + 1;
    standardsList.push({
        id: `STD-${nextNum}`,
        concentration: 0.0,
        absorbance: 0.000
    });
    renderStandardsTable();
    updateChartData();
    setStatusText("Added standard row");
}

function updateCalibrationSummaryCards() {
    const unit = PARAM_UNITS[activeParameter] || 'mg/L';
    
    if (activeCalModel) {
        document.getElementById('run-cal-name').textContent = activeCalModel.name;
        document.getElementById('run-cal-equation').textContent = `Abs = ${activeCalModel.slope.toFixed(6)} · Conc + ${activeCalModel.intercept.toFixed(6)}`;
        
        const r2Badge = document.getElementById('run-cal-r2');
        r2Badge.textContent = activeCalModel.r2.toFixed(6);
        r2Badge.className = 'val status-indicator ' + (activeCalModel.r2 >= 0.995 ? 'safe' : 'waiting');

        // Metrology metrics
        document.getElementById('metro-lod').textContent = activeCalModel.lod !== null ? `${activeCalModel.lod.toFixed(4)} ${unit}` : '-';
        document.getElementById('metro-loq').textContent = activeCalModel.loq !== null ? `${activeCalModel.loq.toFixed(4)} ${unit}` : '-';
        document.getElementById('metro-syx').textContent = activeCalModel.syx !== null ? activeCalModel.syx.toFixed(6) : '-';
        document.getElementById('metro-sm').textContent = activeCalModel.sm !== null ? activeCalModel.sm.toFixed(6) : '-';

        // Dashboard sync
        document.getElementById('dash-active-model-name').textContent = activeCalModel.name;
        document.getElementById('dash-active-model-slope').textContent = activeCalModel.slope.toFixed(8);
        document.getElementById('dash-active-model-intercept').textContent = activeCalModel.intercept.toFixed(8);
        document.getElementById('dash-active-model-r2').textContent = activeCalModel.r2.toFixed(6);
        document.getElementById('dash-active-model-r2').className = 'val status-indicator ' + (activeCalModel.r2 >= 0.995 ? 'safe' : 'waiting');
        document.getElementById('dash-active-model-date').textContent = new Date().toLocaleDateString();
    } else {
        document.getElementById('run-cal-name').textContent = "None Selected";
        document.getElementById('run-cal-equation').textContent = "-";
        document.getElementById('run-cal-r2').textContent = "-";
        document.getElementById('run-cal-r2').className = "val";

        document.getElementById('metro-lod').textContent = '-';
        document.getElementById('metro-loq').textContent = '-';
        document.getElementById('metro-syx').textContent = '-';
        document.getElementById('metro-sm').textContent = '-';

        document.getElementById('dash-active-model-name').textContent = "No active calibration model";
        document.getElementById('dash-active-model-slope').textContent = "-";
        document.getElementById('dash-active-model-intercept').textContent = "-";
        document.getElementById('dash-active-model-r2').textContent = "-";
        document.getElementById('dash-active-model-r2').className = "val";
        document.getElementById('dash-active-model-date').textContent = "-";
    }
}

// ==========================================================================
// Chart.js Plotting & Residuals Diagnostics
// ==========================================================================

function initializeChartJSInstance() {
    const canvas = document.getElementById('calibration-chart-canvas');
    if (!canvas) return;
    const canvasCtx = canvas.getContext('2d');
    
    calibrationChart = new Chart(canvasCtx, {
        type: 'scatter',
        data: {
            datasets: [
                {
                    label: 'Standards',
                    data: [],
                    backgroundColor: '#e53935',
                    borderColor: '#b71c1c',
                    borderWidth: 1.5,
                    pointRadius: 6,
                    pointHoverRadius: 8
                },
                {
                    label: 'Regression Line',
                    data: [],
                    type: 'line',
                    borderColor: '#005bac',
                    borderWidth: 2,
                    fill: false,
                    pointRadius: 0,
                    showLine: true
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        font: { family: 'Inter', size: 11 }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            if (isShowingResiduals) {
                                return `Conc: ${context.parsed.x.toFixed(2)}, Residual: ${context.parsed.y.toFixed(4)}`;
                            }
                            return `Conc: ${context.parsed.x.toFixed(2)}, Abs: ${context.parsed.y.toFixed(3)}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Concentration',
                        font: { family: 'Inter', size: 11, weight: 'bold' }
                    },
                    grid: { color: '#e2e8f0' }
                },
                y: {
                    title: {
                        display: true,
                        text: 'Absorbance',
                        font: { family: 'Inter', size: 11, weight: 'bold' }
                    },
                    grid: { color: '#e2e8f0' }
                }
            }
        }
    });
}

function toggleResidualsPlot() {
    isShowingResiduals = !isShowingResiduals;
    const toggleBtn = document.getElementById('btn-toggle-residuals');
    const plotTitle = document.getElementById('plot-header-title');

    if (isShowingResiduals) {
        toggleBtn.textContent = "📈 View Standard Curve";
        plotTitle.textContent = "📉 Residual Errors Plot (ei vs Standard Conc)";
        showToast("Switched to Residuals Homoscedasticity Analysis", "info", 2500);
    } else {
        toggleBtn.textContent = "📉 View Residuals";
        plotTitle.textContent = "📈 Calibration Curve & Regression";
        showToast("Switched to Calibration Standard Curve", "info", 2500);
    }

    updateChartData();
}

function updateChartData() {
    if (!calibrationChart) return;

    const unit = PARAM_UNITS[activeParameter] || 'mg/L';

    if (isShowingResiduals) {
        // Residuals mode
        calibrationChart.options.scales.y.title.text = 'Residual Error (ei = y - ŷ)';
        calibrationChart.options.scales.x.title.text = `Standard Concentration (${unit})`;

        const resData = (activeCalModel && activeCalModel.residuals) 
            ? activeCalModel.residuals.map(r => ({ x: r.x, y: r.residual }))
            : standardsList.map(s => ({ x: s.concentration, y: 0.0 }));

        calibrationChart.data.datasets[0].label = 'Residuals (ei)';
        calibrationChart.data.datasets[0].backgroundColor = '#7c3aed';
        calibrationChart.data.datasets[0].borderColor = '#5b21b6';
        calibrationChart.data.datasets[0].data = resData;

        // Baseline zero line
        const convals = standardsList.map(s => s.concentration);
        const minX = convals.length > 0 ? Math.min(...convals) : 0;
        const maxX = convals.length > 0 ? Math.max(...convals) : 100;

        calibrationChart.data.datasets[1].label = 'Zero Reference Line';
        calibrationChart.data.datasets[1].borderColor = '#94a3b8';
        calibrationChart.data.datasets[1].borderWidth = 1.5;
        calibrationChart.data.datasets[1].data = [
            { x: minX, y: 0 },
            { x: maxX, y: 0 }
        ];
    } else {
        // Standard Curve mode
        calibrationChart.options.scales.y.title.text = 'Absorbance (AU)';
        calibrationChart.options.scales.x.title.text = `Concentration (${unit})`;

        const scatterData = standardsList.map(s => ({ x: s.concentration, y: s.absorbance }));
        calibrationChart.data.datasets[0].label = 'Standards';
        calibrationChart.data.datasets[0].backgroundColor = '#e53935';
        calibrationChart.data.datasets[0].borderColor = '#b71c1c';
        calibrationChart.data.datasets[0].data = scatterData;

        calibrationChart.data.datasets[1].label = 'Regression Line';
        calibrationChart.data.datasets[1].borderColor = '#005bac';
        calibrationChart.data.datasets[1].borderWidth = 2;

        if (activeCalModel && scatterData.length > 0) {
            const convals = standardsList.map(s => s.concentration);
            const minX = Math.min(0, Math.min(...convals));
            const maxX = Math.max(...convals);

            const lineData = [
                { x: minX, y: activeCalModel.slope * minX + activeCalModel.intercept },
                { x: maxX, y: activeCalModel.slope * maxX + activeCalModel.intercept }
            ];
            calibrationChart.data.datasets[1].data = lineData;
        } else {
            calibrationChart.data.datasets[1].data = [];
        }
    }

    calibrationChart.update();
}

function exportPlotAsImage() {
    const canvas = document.getElementById('calibration-chart-canvas');
    if (!canvas) return;
    const dataURL = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `${activeParameter}_calibration_${Date.now()}.png`;
    link.href = dataURL;
    link.click();
    showToast("Calibration plot saved to image file", "success", 2500);
    setStatusText("Exported calibration plot image");
}

// ==========================================================================
// Water Quality Sample Batch Quantitation
// ==========================================================================

function renderSamplesTable() {
    const tbody = document.getElementById('sample-results-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    samplesList.forEach((sample, index) => {
        const tr = document.createElement('tr');
        
        let statusBadge = `<span class="status-indicator waiting">${sample.status}</span>`;
        if (sample.status === 'Safe') {
            statusBadge = `<span class="status-indicator safe">${sample.status}</span>`;
        } else if (sample.status === 'Exceeded') {
            statusBadge = `<span class="status-indicator danger">${sample.status}</span>`;
        }

        tr.innerHTML = `
            <td><input type="text" class="table-cell-input" value="${sample.id}" onchange="updateSampleField(${index}, 'id', this.value)"></td>
            <td><input type="number" step="any" class="table-cell-input" value="${sample.absorbance}" onchange="updateSampleField(${index}, 'absorbance', this.value)"></td>
            <td><input type="number" step="any" class="table-cell-input" value="${sample.dilution}" onchange="updateSampleField(${index}, 'dilution', this.value)"></td>
            <td><input type="text" class="table-cell-input-read" value="${sample.concentration}" readonly></td>
            <td>${statusBadge}</td>
            <td>
                <button class="btn btn-secondary" onclick="deleteSampleRow(${index})" style="padding:2px 6px; color:var(--status-danger);">🗑️</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function updateSampleField(index, key, val) {
    if (key === 'absorbance' || key === 'dilution') {
        samplesList[index][key] = parseFloat(val) || 0.0;
    } else {
        samplesList[index][key] = val;
    }
}

function deleteSampleRow(index) {
    samplesList.splice(index, 1);
    renderSamplesTable();
}

function addSampleRow() {
    const nextNum = samplesList.length + 1;
    samplesList.push({
        id: `SMP-${nextNum}`,
        absorbance: 0.000,
        dilution: 1.0,
        concentration: "",
        status: "Pending"
    });
    renderSamplesTable();
    setStatusText("Added sample row");
}

function calculateSampleBatch() {
    if (!activeCalModel) {
        dialogError("Calculation Error", "No active calibration model loaded for this parameter.");
        return;
    }

    const limits = db.settings.waterLimits[activeParameter] || { min: 0.0, max: 999.0 };

    samplesList.forEach(sample => {
        try {
            let conc = ((sample.absorbance - activeCalModel.intercept) / activeCalModel.slope) * sample.dilution;
            if (conc < 0) conc = 0.0;

            sample.concentration = conc.toFixed(2);
            
            // Check limits
            if (conc >= limits.min && conc <= limits.max) {
                sample.status = 'Safe';
            } else {
                sample.status = 'Exceeded';
            }
        } catch (e) {
            sample.concentration = "Error";
            sample.status = "Error";
        }
    });

    renderSamplesTable();
    showToast(`Batch Quantitation Complete (${samplesList.length} samples evaluated)`, 'success', 3000);
    setStatusText("Batch calculations completed");
}

async function saveSampleRun() {
    calculateSampleBatch();

    if (samplesList.length === 0) {
        dialogError("Save Error", "Add at least one sample row before saving.");
        return;
    }

    const runId = document.getElementById('analysis-run-id-input').value;
    const op = document.getElementById('operator-name-input').value;

    const newRun = {
        run_id: runId,
        parameter: activeParameter,
        calibration_id: db.calibrations.find(c => c.parameter === activeParameter && c.active === true)?.id || "unknown",
        calibration_name: activeCalModel ? activeCalModel.name : "Custom Curve",
        operator: op,
        created_at: new Date().toISOString(),
        samples: JSON.parse(JSON.stringify(samplesList))
    };

    db.sample_runs.unshift(newRun);

    const success = await saveDatabase(db);
    if (success) {
        setStatusText(`Saved analytical run: ${runId}`);
        showToast(`Analytical Run ${runId} saved successfully.`, 'success', 3500);
        resetSampleBatch();
    } else {
        dialogError("Storage Error", "Failed to write analytical run records.");
    }
}

function exportRunToCSV() {
    if (samplesList.length === 0) {
        showToast("No sample records to export", "warn", 2500);
        return;
    }

    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Sample ID,Absorbance,Dilution Factor,Calculated Concentration,Status\n";

    samplesList.forEach(s => {
        csvContent += `"${s.id}",${s.absorbance},${s.dilution},${s.concentration || 'uncalculated'},"${s.status}"\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${activeParameter}_analysis_batch_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showToast("Exported batch results to CSV file", "success", 2500);
    setStatusText("Exported batch results to CSV file");
}

// ==========================================================================
// Batch Clipboard / CSV Importer
// ==========================================================================

function openBatchImportModal(target = 'standards') {
    const select = document.getElementById('import-target-select');
    if (select) select.value = target;

    const title = document.getElementById('import-modal-title');
    if (title) {
        title.textContent = target === 'standards' ? '📥 Batch Import Calibration Standards' : '📥 Batch Import Sample Runs';
    }

    const textarea = document.getElementById('import-raw-textarea');
    if (textarea) textarea.value = '';

    const preview = document.getElementById('import-preview-box');
    if (preview) preview.textContent = '';

    openModal('batch-import-modal');
}

function executeBatchImport() {
    const target = document.getElementById('import-target-select').value;
    const raw = document.getElementById('import-raw-textarea').value.trim();

    if (!raw) {
        dialogError("Import Error", "Please paste text data before importing.");
        return;
    }

    const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    const parsedData = [];

    lines.forEach((line, idx) => {
        // Split by tabs or commas
        const tokens = line.split(/[\t,;]+/).map(t => t.trim());
        if (tokens.length >= 2) {
            if (target === 'standards') {
                if (tokens.length >= 3) {
                    parsedData.push({
                        id: tokens[0] || `STD-${idx + 1}`,
                        concentration: parseFloat(tokens[1]) || 0.0,
                        absorbance: parseFloat(tokens[2]) || 0.0
                    });
                } else {
                    parsedData.push({
                        id: `STD-${idx + 1}`,
                        concentration: parseFloat(tokens[0]) || 0.0,
                        absorbance: parseFloat(tokens[1]) || 0.0
                    });
                }
            } else {
                // Samples target
                parsedData.push({
                    id: tokens[0] || `SMP-${idx + 1}`,
                    absorbance: parseFloat(tokens[1]) || 0.0,
                    dilution: tokens[2] ? parseFloat(tokens[2]) || 1.0 : 1.0,
                    concentration: "",
                    status: "Pending"
                });
            }
        }
    });

    if (parsedData.length === 0) {
        dialogError("Import Error", "Could not parse any valid numeric rows from input. Check format.");
        return;
    }

    if (target === 'standards') {
        standardsList = parsedData;
        renderStandardsTable();
        updateChartData();
        showToast(`Imported ${parsedData.length} Calibration Standards!`, 'success', 3000);
    } else {
        samplesList = parsedData;
        renderSamplesTable();
        showToast(`Imported ${parsedData.length} Sample Rows!`, 'success', 3000);
    }

    closeModal('batch-import-modal');
}

// ==========================================================================
// Certificate of Analysis (CoA) Reporting Engine
// ==========================================================================

function generateCertificateOfAnalysis(customRun) {
    const runData = customRun || {
        run_id: document.getElementById('analysis-run-id-input').value,
        parameter: activeParameter,
        operator: document.getElementById('operator-name-input').value,
        created_at: new Date().toISOString(),
        samples: samplesList
    };

    const unit = PARAM_UNITS[runData.parameter] || 'mg/L';
    const limits = db.settings.waterLimits[runData.parameter] || { min: 0.0, max: 999.0 };

    document.getElementById('coa-report-id').textContent = `COA-${runData.run_id.replace('RUN-', '')}`;
    document.getElementById('coa-issue-date').textContent = new Date(runData.created_at).toLocaleDateString();
    document.getElementById('coa-meta-param').textContent = `${runData.parameter} (${unit})`;
    document.getElementById('coa-meta-run-id').textContent = runData.run_id;
    document.getElementById('coa-meta-operator').textContent = runData.operator;
    
    if (activeCalModel) {
        document.getElementById('coa-meta-equation').textContent = `Abs = ${activeCalModel.slope.toFixed(6)} · Conc + ${activeCalModel.intercept.toFixed(6)}`;
        document.getElementById('coa-meta-r2').textContent = activeCalModel.r2.toFixed(6);
        document.getElementById('coa-meta-lod').textContent = activeCalModel.lod !== null ? `${activeCalModel.lod.toFixed(4)} ${unit}` : 'N/A';
        document.getElementById('coa-meta-loq').textContent = activeCalModel.loq !== null ? `${activeCalModel.loq.toFixed(4)} ${unit}` : 'N/A';
    } else {
        document.getElementById('coa-meta-equation').textContent = "Calibrated Linear Model";
        document.getElementById('coa-meta-r2').textContent = "> 0.995";
        document.getElementById('coa-meta-lod').textContent = "N/A";
        document.getElementById('coa-meta-loq').textContent = "N/A";
    }

    document.getElementById('coa-meta-limits').textContent = `${limits.min.toFixed(2)} - ${limits.max.toFixed(2)} ${unit}`;
    document.getElementById('coa-th-conc').textContent = `Concentration (${unit})`;
    document.getElementById('coa-sig-analyst').textContent = runData.operator;

    const tbody = document.getElementById('coa-samples-tbody');
    tbody.innerHTML = '';

    (runData.samples || []).forEach(sample => {
        const tr = document.createElement('tr');
        const concVal = parseFloat(sample.concentration) || 0.0;
        const isSafe = sample.status === 'Safe';

        const statusHtml = isSafe 
            ? `<span class="status-indicator safe">PASSED</span>`
            : `<span class="status-indicator danger">EXCEEDED</span>`;

        const verdictText = isSafe 
            ? "Conforms to WHO Potable Limit" 
            : "Requires Dilution / Treatment Intervention";

        tr.innerHTML = `
            <td><strong>${sample.id}</strong></td>
            <td>${sample.absorbance.toFixed(3)}</td>
            <td>${sample.dilution.toFixed(1)}x</td>
            <td><strong>${sample.concentration || '-'}</strong></td>
            <td>${statusHtml}</td>
            <td>${verdictText}</td>
        `;
        tbody.appendChild(tr);
    });

    openModal('coa-modal');
    showToast("Certificate of Analysis Generated", "info", 2500);
}

// ==========================================================================
// Comprehensive Water Chemistry & Stability Indices (LSI / RSI / PSI)
// ==========================================================================

function calculateLSI() {
    const temp = parseFloat(document.getElementById('lsi-temp').value) || 25.0;
    const ph = parseFloat(document.getElementById('lsi-ph').value) || 7.0;
    const Ca = parseFloat(document.getElementById('lsi-calcium').value) || 100.0;
    const Alk = parseFloat(document.getElementById('lsi-alkalinity').value) || 100.0;
    const tds = parseFloat(document.getElementById('lsi-tds').value) || 300.0;

    const A = (Math.log10(Math.max(1, tds)) - 1.0) / 10.0;
    const B = -13.12 * Math.log10(temp + 273.15) + 34.55;
    const C = Math.log10(Math.max(1, Ca)) - 0.4;
    const D = Math.log10(Math.max(1, Alk));

    const pHs = (9.3 + A + B) - (C + D);
    const LSI = ph - pHs;

    // Ryznar Stability Index: RSI = 2*pHs - pH
    const RSI = 2.0 * pHs - ph;

    // Puckorius Scaling Index: PSI = 2*pHs - pHeq
    const pHeq = 1.465 * Math.log10(Math.max(1, Alk)) + 4.54;
    const PSI = 2.0 * pHs - pHeq;

    // Render Metric Cards
    document.getElementById('lsi-score-output').textContent = LSI.toFixed(2);
    document.getElementById('rsi-score-output').textContent = RSI.toFixed(2);
    document.getElementById('psi-score-output').textContent = PSI.toFixed(2);

    document.getElementById('lsi-val-phs').textContent = pHs.toFixed(2);
    document.getElementById('lsi-val-tf').textContent = B.toFixed(2);
    document.getElementById('lsi-val-cf').textContent = C.toFixed(2);
    document.getElementById('lsi-val-af').textContent = D.toFixed(2);
    document.getElementById('lsi-val-const').textContent = A.toFixed(2);

    // LSI Tag & Verdict
    const lsiTag = document.getElementById('lsi-tag');
    const verdictPanel = document.getElementById('lsi-verdict-panel');
    const verdictTitle = document.getElementById('lsi-verdict-title');
    const verdictDesc = document.getElementById('lsi-verdict-desc');

    verdictPanel.className = 'lsi-verdict-box';

    if (LSI < -0.5) {
        lsiTag.className = 'verdict-tag danger';
        lsiTag.textContent = 'Corrosive';
        verdictPanel.classList.add('corrosive');
        verdictTitle.textContent = "Corrosive Water Alert (Under-Saturated)";
        verdictDesc.textContent = "LSI is negative. Water will dissolve protective calcium carbonate coatings and corrode metallic piping networks.";
    } else if (LSI > 0.5) {
        lsiTag.className = 'verdict-tag warning';
        lsiTag.textContent = 'Scale-Forming';
        verdictPanel.classList.add('scale-forming');
        verdictTitle.textContent = "Scale-Forming Water Warning (Super-Saturated)";
        verdictDesc.textContent = "LSI is positive. Calcium carbonate will precipitate out and accumulate severe scaling in heat exchangers and pipes.";
    } else {
        lsiTag.className = 'verdict-tag safe';
        lsiTag.textContent = 'Balanced';
        verdictTitle.textContent = "Balanced Water (Equilibrium)";
        verdictDesc.textContent = "LSI is in optimal balance. Water is in chemical equilibrium, neither aggressively corrosive nor scale-forming.";
    }

    // RSI Tag
    const rsiTag = document.getElementById('rsi-tag');
    if (RSI < 5.5) {
        rsiTag.className = 'verdict-tag danger';
        rsiTag.textContent = 'Heavy Scaling';
    } else if (RSI < 6.2) {
        rsiTag.className = 'verdict-tag warning';
        rsiTag.textContent = 'Scale Tendency';
    } else if (RSI <= 6.8) {
        rsiTag.className = 'verdict-tag safe';
        rsiTag.textContent = 'Equilibrium';
    } else if (RSI <= 8.5) {
        rsiTag.className = 'verdict-tag warning';
        rsiTag.textContent = 'Corrosive';
    } else {
        rsiTag.className = 'verdict-tag danger';
        rsiTag.textContent = 'Severe Corrosion';
    }

    // PSI Tag
    const psiTag = document.getElementById('psi-tag');
    if (PSI < 6.0) {
        psiTag.className = 'verdict-tag warning';
        psiTag.textContent = 'Scaling Risk';
    } else {
        psiTag.className = 'verdict-tag safe';
        psiTag.textContent = 'Corrosion Safe';
    }

    // Hardness Classification
    const hardnessBadge = document.getElementById('hardness-badge');
    if (Ca < 60) {
        hardnessBadge.className = 'status-indicator waiting';
        hardnessBadge.textContent = 'Soft Water (< 60 mg/L)';
    } else if (Ca <= 120) {
        hardnessBadge.className = 'status-indicator safe';
        hardnessBadge.textContent = 'Moderately Hard (60-120 mg/L)';
    } else if (Ca <= 180) {
        hardnessBadge.className = 'status-indicator waiting';
        hardnessBadge.textContent = 'Hard Water (121-180 mg/L)';
    } else {
        hardnessBadge.className = 'status-indicator danger';
        hardnessBadge.textContent = 'Very Hard Water (> 180 mg/L)';
    }

    showToast(`Stability Indices Calculated: LSI ${LSI.toFixed(2)} | RSI ${RSI.toFixed(2)}`, 'info', 2800);
    setStatusText(`LSI saturation index calculated: ${LSI.toFixed(2)}`);
}

// ==========================================================================
// BOD & TSS Calculators
// ==========================================================================

function calculateBOD() {
    const d1 = parseFloat(document.getElementById('bod-initial-do').value) || 0.0;
    const d2 = parseFloat(document.getElementById('bod-final-do').value) || 0.0;
    const sampleVol = parseFloat(document.getElementById('bod-sample-vol').value) || 1.0;
    const bottleVol = parseFloat(document.getElementById('bod-bottle-vol').value) || 300.0;
    const isSeeded = document.getElementById('bod-is-seeded').checked;

    if (sampleVol <= 0 || bottleVol <= 0) {
        dialogError("BOD Calculation Error", "Sample volume and bottle volume must be greater than zero.");
        return;
    }

    const P = sampleVol / bottleVol;
    let bod = 0.0;

    if (isSeeded) {
        const b1 = parseFloat(document.getElementById('bod-seed-b1').value) || 0.0;
        const b2 = parseFloat(document.getElementById('bod-seed-b2').value) || 0.0;
        const seedVolInBottle = parseFloat(document.getElementById('bod-seed-vol-in-bottle').value) || 0.0;
        const f = seedVolInBottle / bottleVol;
        bod = ((d1 - d2) - (b1 - b2) * f) / P;
    } else {
        bod = (d1 - d2) / P;
    }

    if (bod < 0) bod = 0.0;

    document.getElementById('bod-results-box').style.display = 'grid';
    document.getElementById('bod-score-output').textContent = bod.toFixed(2);

    const verdictPanel = document.getElementById('bod-verdict-panel');
    const verdictTitle = document.getElementById('bod-verdict-title');
    const verdictDesc = document.getElementById('bod-verdict-desc');

    verdictPanel.className = 'lsi-verdict-box';

    if (bod < 2.0) {
        verdictTitle.textContent = "Clean Potable / Natural Water (Safe)";
        verdictDesc.textContent = "BOD is below 2 mg/L. Minimal organic microbial degradation oxygen demand.";
    } else if (bod <= 8.0) {
        verdictPanel.classList.add('scale-forming');
        verdictTitle.textContent = "Moderately Polluted Water";
        verdictDesc.textContent = "BOD is between 2 and 8 mg/L. Indicates moderate organic loading and active biochemical consumption.";
    } else {
        verdictPanel.classList.add('corrosive');
        verdictTitle.textContent = "Highly Polluted Effluent Alert";
        verdictDesc.textContent = "BOD exceeds 8 mg/L. High concentration of organic pollutants. Biological aeration treatment required.";
    }

    showToast(`BOD₅ Computed: ${bod.toFixed(2)} mg/L`, 'info', 2800);
    setStatusText(`BOD calculation completed: ${bod.toFixed(2)} mg/L`);
}

function calculateTSS() {
    const emptyWeight = parseFloat(document.getElementById('tss-paper-empty').value) || 0.0;
    const dirtyWeight = parseFloat(document.getElementById('tss-paper-dirty').value) || 0.0;
    const sampleVol = parseFloat(document.getElementById('tss-sample-vol').value) || 1.0;

    if (sampleVol <= 0) {
        dialogError("TSS Calculation Error", "Sample volume must be greater than zero.");
        return;
    }

    if (dirtyWeight < emptyWeight) {
        dialogError("TSS Calculation Warning", "Filter weight with residue is less than empty filter weight.");
        return;
    }

    const tss = ((dirtyWeight - emptyWeight) * 1000000) / sampleVol;

    document.getElementById('tss-results-box').style.display = 'grid';
    document.getElementById('tss-score-output').textContent = tss.toFixed(1);

    const verdictPanel = document.getElementById('tss-verdict-panel');
    const verdictTitle = document.getElementById('tss-verdict-title');
    const verdictDesc = document.getElementById('tss-verdict-desc');

    verdictPanel.className = 'lsi-verdict-box';

    if (tss < 25.0) {
        verdictTitle.textContent = "Clear Water (Low Suspended Solids)";
        verdictDesc.textContent = "TSS is below 25 mg/L. High clarity water meeting potable standards.";
    } else if (tss <= 100.0) {
        verdictPanel.classList.add('scale-forming');
        verdictTitle.textContent = "High Suspended Solids";
        verdictDesc.textContent = "TSS is between 25 and 100 mg/L. Moderate turbidity. Sand bed filtration recommended.";
    } else {
        verdictPanel.classList.add('corrosive');
        verdictTitle.textContent = "Highly Turbid Water Alert";
        verdictDesc.textContent = "TSS exceeds 100 mg/L. Severe turbidity. Coagulation and flocculation settling required.";
    }

    showToast(`TSS Computed: ${tss.toFixed(1)} mg/L`, 'info', 2800);
    setStatusText(`TSS calculation completed: ${tss.toFixed(1)} mg/L`);
}

// ==========================================================================
// Run History & Model Management
// ==========================================================================

function renderDashboard() {
    loadActiveCalibrationForParameter();
}

function renderHistory() {
    renderHistoryCals();
    renderHistoryRuns();
}

function renderHistoryRuns(searchFilter = '') {
    const runTbody = document.getElementById('history-runs-tbody');
    if (!runTbody) return;
    runTbody.innerHTML = '';

    const runs = db.sample_runs || [];
    const filtered = searchFilter 
        ? runs.filter(r => r.run_id.toLowerCase().includes(searchFilter) || r.parameter.toLowerCase().includes(searchFilter) || (r.operator && r.operator.toLowerCase().includes(searchFilter)))
        : runs;

    if (filtered.length === 0) {
        runTbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted);">No analytical runs found.</td></tr>`;
        return;
    }

    filtered.forEach((run) => {
        const tr = document.createElement('tr');
        const samplesCount = run.samples ? run.samples.length : 0;
        
        tr.innerHTML = `
            <td><strong>${run.run_id}</strong></td>
            <td><span class="status-indicator safe">${run.parameter}</span></td>
            <td>${run.calibration_name || db.calibrations.find(c => c.id === run.calibration_id)?.name || 'Generic Model'}</td>
            <td>${run.operator}</td>
            <td>${samplesCount}</td>
            <td>${new Date(run.created_at).toLocaleString()}</td>
            <td>
                <button class="btn btn-primary" onclick="viewHistoryRun('${run.run_id}')" style="padding:2px 7px; font-size:0.75rem;">👁️ View</button>
                <button class="btn btn-secondary" onclick="exportSpecificRunToCSV('${run.run_id}')" style="padding:2px 7px; font-size:0.75rem;">📤 CSV</button>
                <button class="btn btn-secondary" onclick="deleteHistoryRun('${run.run_id}')" style="padding:2px 7px; color:var(--status-danger); font-size:0.75rem;">🗑️</button>
            </td>
        `;
        runTbody.appendChild(tr);
    });
}

function renderHistoryCals() {
    const calTbody = document.getElementById('history-cals-tbody');
    if (!calTbody) return;
    calTbody.innerHTML = '';
    
    (db.calibrations || []).forEach((cal) => {
        const tr = document.createElement('tr');
        const activeText = cal.active ? '<span class="status-indicator safe">Active</span>' : '<span class="status-indicator waiting">Inactive</span>';
        
        const deleteBtn = !cal.active 
            ? `<button class="btn btn-secondary" onclick="deleteCalibrationModel('${cal.id}')" style="padding:2px 6px; color:var(--status-danger); font-size:0.75rem;">🗑️</button>` 
            : '';

        tr.innerHTML = `
            <td><strong>${cal.id.slice(4, 9)}</strong></td>
            <td>${cal.parameter}</td>
            <td>${cal.name}</td>
            <td>${cal.slope.toFixed(6)}</td>
            <td>${cal.intercept.toFixed(6)}</td>
            <td>${cal.r2.toFixed(6)}</td>
            <td>${activeText}</td>
            <td>${new Date(cal.created_at).toLocaleDateString()}</td>
            <td>
                <button class="btn btn-secondary" onclick="activateCalibrationModel('${cal.id}')" style="padding:2px 6px; font-size:0.75rem;">Activate</button>
                ${deleteBtn}
            </td>
        `;
        calTbody.appendChild(tr);
    });
}

function viewHistoryRun(runId) {
    const run = (db.sample_runs || []).find(r => r.run_id === runId);
    if (!run) return;

    currentInspectedRun = run;

    document.getElementById('modal-run-id-title').textContent = run.run_id;
    document.getElementById('modal-run-param').textContent = run.parameter;
    document.getElementById('modal-run-op').textContent = run.operator;
    document.getElementById('modal-run-cal').textContent = run.calibration_name || "Standard Model";
    document.getElementById('modal-run-time').textContent = new Date(run.created_at).toLocaleString();

    const unit = PARAM_UNITS[run.parameter] || 'mg/L';
    document.querySelectorAll('.modal-conc-unit-lbl').forEach(el => el.textContent = `Concentration (${unit})`);

    const tbody = document.getElementById('modal-run-samples-tbody');
    tbody.innerHTML = '';

    (run.samples || []).forEach(sample => {
        const tr = document.createElement('tr');
        const badgeClass = sample.status === 'Safe' ? 'safe' : (sample.status === 'Exceeded' ? 'danger' : 'waiting');
        tr.innerHTML = `
            <td><strong>${sample.id}</strong></td>
            <td>${sample.absorbance.toFixed(3)}</td>
            <td>${sample.dilution.toFixed(1)}x</td>
            <td><strong>${sample.concentration}</strong></td>
            <td><span class="status-indicator ${badgeClass}">${sample.status}</span></td>
        `;
        tbody.appendChild(tr);
    });

    document.getElementById('modal-btn-export-csv').onclick = () => exportSpecificRunToCSV(run.run_id);
    document.getElementById('modal-btn-print-coa').onclick = () => {
        closeModal('run-details-modal');
        generateCertificateOfAnalysis(run);
    };

    openModal('run-details-modal');
}

function exportSpecificRunToCSV(runId) {
    const run = (db.sample_runs || []).find(r => r.run_id === runId);
    if (!run || !run.samples) return;

    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += `Analytical Run ID: ${run.run_id}, Parameter: ${run.parameter}, Operator: ${run.operator}\n`;
    csvContent += "Sample ID,Absorbance,Dilution Factor,Calculated Concentration,Status\n";

    run.samples.forEach(s => {
        csvContent += `"${s.id}",${s.absorbance},${s.dilution},${s.concentration},"${s.status}"\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${run.run_id}_${run.parameter}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showToast(`Exported ${run.run_id} to CSV`, 'success', 2500);
}

async function activateCalibrationModel(calId) {
    const cal = db.calibrations.find(c => c.id === calId);
    if (!cal) return;

    db.calibrations.forEach(c => {
        if (c.parameter === cal.parameter) c.active = false;
    });

    cal.active = true;

    const success = await saveDatabase(db);
    if (success) {
        if (cal.parameter === activeParameter) {
            loadActiveCalibrationForParameter();
            updateChartData();
        }
        renderHistory();
        showToast(`Activated model: ${cal.name}`, 'success', 2500);
        setStatusText(`Activated model: ${cal.name}`);
    }
}

async function deleteCalibrationModel(calId) {
    const idx = (db.calibrations || []).findIndex(c => c.id === calId);
    if (idx === -1) return;

    if (db.calibrations[idx].active) {
        dialogError("Cannot Delete", "Cannot delete an active calibration model. Activate another model first.");
        return;
    }

    db.calibrations.splice(idx, 1);
    const success = await saveDatabase(db);
    if (success) {
        renderHistoryCals();
        showToast("Calibration model removed.", 'info', 2500);
    }
}

async function deleteHistoryRun(runId) {
    const idx = db.sample_runs.findIndex(r => r.run_id === runId);
    if (idx === -1) return;

    db.sample_runs.splice(idx, 1);

    const success = await saveDatabase(db);
    if (success) {
        renderHistoryRuns();
        showToast(`Deleted run: ${runId}`, 'info', 2500);
        setStatusText(`Deleted run: ${runId}`);
    }
}

// ==========================================================================
// Parameter & Limits Configuration Modal Logic
// ==========================================================================

function openManageParamsModal() {
    renderManageParamsTable();
    openModal('manage-params-modal');
}

function renderManageParamsTable() {
    const tbody = document.getElementById('manage-params-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const limits = db.settings.waterLimits;
    Object.keys(limits).forEach(param => {
        const item = limits[param];
        const unit = PARAM_UNITS[param] || 'mg/L';
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${param}</strong></td>
            <td>${unit}</td>
            <td><input type="number" step="any" class="table-cell-input" value="${item.min}" id="param-min-${param}"></td>
            <td><input type="number" step="any" class="table-cell-input" value="${item.max}" id="param-max-${param}"></td>
            <td>
                <button class="btn btn-secondary" onclick="deleteCustomParameter('${param}')" style="padding:2px 6px; color:var(--status-danger);">🗑️</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function addCustomParameterRow() {
    const nameInput = document.getElementById('new-param-name');
    const unitInput = document.getElementById('new-param-unit');
    const minInput = document.getElementById('new-param-min');
    const maxInput = document.getElementById('new-param-max');

    const name = nameInput.value.trim();
    const unit = unitInput.value.trim() || 'mg/L';
    const min = parseFloat(minInput.value) || 0.0;
    const max = parseFloat(maxInput.value) || 1.0;

    if (!name) {
        dialogError("Validation Error", "Please provide a parameter analyte name.");
        return;
    }

    if (db.settings.waterLimits[name]) {
        dialogError("Validation Error", "Parameter already exists.");
        return;
    }

    db.settings.waterLimits[name] = { min, max };
    PARAM_UNITS[name] = unit;

    nameInput.value = '';
    renderManageParamsTable();
    showToast(`Added analyte parameter: ${name}`, 'success', 2500);
}

function deleteCustomParameter(param) {
    if (Object.keys(db.settings.waterLimits).length <= 1) {
        dialogError("Warning", "At least one analyte parameter must be retained.");
        return;
    }

    delete db.settings.waterLimits[param];
    renderManageParamsTable();
    showToast(`Removed parameter: ${param}`, 'info', 2500);
}

async function saveParameterSettings() {
    Object.keys(db.settings.waterLimits).forEach(param => {
        const minEl = document.getElementById(`param-min-${param}`);
        const maxEl = document.getElementById(`param-max-${param}`);
        if (minEl && maxEl) {
            db.settings.waterLimits[param].min = parseFloat(minEl.value) || 0.0;
            db.settings.waterLimits[param].max = parseFloat(maxEl.value) || 0.0;
        }
    });

    const success = await saveDatabase(db);
    if (success) {
        closeModal('manage-params-modal');
        renderParameterTabs();
        updateUIForParameter();
        showToast("Analyte limits & parameters updated globally!", 'success', 3000);
    } else {
        dialogError("Storage Error", "Failed to write parameter settings.");
    }
}

// Fallback JSON template
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
            }
        ],
        sample_runs: [
            {
                run_id: "RUN-20260725-1000",
                parameter: "Phosphate",
                calibration_id: "cal-1",
                calibration_name: "Phosphate Standard Model 2026",
                operator: "Analyst P. Sharma",
                created_at: new Date().toISOString(),
                samples: [
                    { id: "SMP-A1", absorbance: 0.164, dilution: 1.0, concentration: "19.78", status: "Safe" },
                    { id: "SMP-A2", absorbance: 0.415, dilution: 1.0, concentration: "50.36", status: "Exceeded" },
                    { id: "SMP-A3", absorbance: 0.985, dilution: 2.0, concentration: "239.57", status: "Exceeded" }
                ]
            }
        ],
        settings: {
            theme: "light",
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
