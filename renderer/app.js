// ChemLab Pro LIMS - Frontend Application Logic (Shimadzu LabSolutions Edition)

// Local State
let db = {};
let currentView = 'dashboard';
let activeParameter = 'Phosphate';
let activeCalModel = null;
let standardsList = [];
let samplesList = [];

// Chart.js instance variable
let calibrationChart = null;

// Parameters Config
const PARAM_UNITS = {
    "pH": "AU",
    "Nitrate": "mg/L",
    "Phosphate": "mg/L",
    "Iron": "ppm",
    "Fluoride": "mg/L"
};

// ==========================================================================
// Initialization & Database Sync
// ==========================================================================

document.addEventListener('DOMContentLoaded', async () => {
    // Load database
    try {
        db = await window.chemLabAPI.loadData();
    } catch (e) {
        console.error("Failed to load database via IPC, using fallback template", e);
        db = getTemplateDatabase();
    }

    // Bind navigation tabs (separating BOD and TSS)
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
        document.getElementById(id).addEventListener('click', (e) => {
            e.preventDefault();
            switchView(view);
        });
    });

    // Bind topbar horizontal parameter tab selectors
    document.querySelectorAll('.param-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            document.querySelectorAll('.param-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            activeParameter = tab.getAttribute('data-param');
            updateUIForParameter();
            setStatusText(`Switched parameter tab to: ${activeParameter}`);
        });
    });

    // Operator input sync
    const opInput = document.getElementById('operator-name-input');
    opInput.addEventListener('change', (e) => {
        setStatusText(`Operator updated to: ${e.target.value}`);
    });

    // Bind interactive buttons
    document.getElementById('btn-add-standard-row').addEventListener('click', addStandardRow);
    document.getElementById('btn-calculate-curve').addEventListener('click', calculateCalibrationCurve);
    document.getElementById('btn-save-calibration').addEventListener('click', saveCalibrationModel);
    document.getElementById('btn-export-curve-image').addEventListener('click', exportPlotAsImage);

    document.getElementById('btn-add-sample-row').addEventListener('click', addSampleRow);
    document.getElementById('btn-calculate-batch').addEventListener('click', calculateSampleBatch);
    document.getElementById('btn-save-run').addEventListener('click', saveSampleRun);
    document.getElementById('btn-export-csv').addEventListener('click', exportRunToCSV);

    document.getElementById('btn-calculate-lsi').addEventListener('click', calculateLSI);

    // BOD & TSS bindings
    document.getElementById('bod-is-seeded').addEventListener('change', (e) => {
        const seedCtrls = document.getElementById('bod-seed-controls');
        if (e.target.checked) {
            seedCtrls.classList.remove('hidden');
        } else {
            seedCtrls.classList.add('hidden');
        }
    });

    document.getElementById('btn-calculate-bod').addEventListener('click', calculateBOD);
    document.getElementById('btn-calculate-tss').addEventListener('click', calculateTSS);

    // Initialize Chart.js
    initializeChartJSInstance();

    // Initial draw
    updateUIForParameter();
    switchView('dashboard');
});

// Switch views utility
function switchView(viewName) {
    currentView = viewName;
    
    // Deactivate all nav items & hide all panes
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    document.querySelectorAll('.view-pane').forEach(pane => pane.classList.add('hidden'));

    // Activate selected
    const activeNavId = `nav-${viewName}`;
    const activePaneId = `${viewName}-view`;
    
    if (document.getElementById(activeNavId)) document.getElementById(activeNavId).classList.add('active');
    if (document.getElementById(activePaneId)) document.getElementById(activePaneId).classList.remove('hidden');

    // Update Topbar header label
    const formattedTitle = viewName.toUpperCase().replace('-', ' ');
    document.getElementById('page-title-label').textContent = formattedTitle;

    // Load subview specifics
    if (viewName === 'dashboard') {
        renderDashboard();
    } else if (viewName === 'history') {
        renderHistory();
    }

    setStatusText(`${formattedTitle} view active`);
}

function setStatusText(text) {
    const time = new Date().toLocaleTimeString();
    const op = document.getElementById('operator-name-input').value;
    document.getElementById('status-text-label').textContent = `Ready | Operator: ${op} | ${time} | ${text}`;
}

// ==========================================================================
// Method Configuration and UI Updates
// ==========================================================================

function updateUIForParameter() {
    const unit = PARAM_UNITS[activeParameter] || 'mg/L';
    
    // Update all concentration labels in tables
    document.querySelectorAll('.conc-header-label').forEach(el => {
        el.textContent = `Concentration (${unit})`;
    });

    // Reset current workspace data
    loadDefaultStandardsForParameter();
    loadActiveCalibrationForParameter();
    resetSampleBatch();

    // Trigger Chart.js refresh
    updateChartData();
}

function loadDefaultStandardsForParameter() {
    // Generate typical standard concentrations
    const unit = PARAM_UNITS[activeParameter] || 'mg/L';
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
    }

    standardsList = convals.map((conc, i) => ({
        id: `STD-${i+1}`,
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
            name: activeCal.name
        };
        
        // Load standards list from it if available
        if (activeCal.standards) {
            standardsList = JSON.parse(JSON.stringify(activeCal.standards));
        }
    } else {
        activeCalModel = null;
    }

    renderStandardsTable();
    updateCalibrationSummaryCards();
}

function resetSampleBatch() {
    // Generate fresh Sample IDs
    samplesList = [
        { id: "SMP-1", absorbance: 0.124, dilution: 1.0, concentration: "", status: "Pending" },
        { id: "SMP-2", absorbance: 0.385, dilution: 1.0, concentration: "", status: "Pending" },
        { id: "SMP-3", absorbance: 0.654, dilution: 1.0, concentration: "", status: "Pending" }
    ];

    // Set unique Run ID
    const runDateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const runTimeStr = new Date().toLocaleTimeString('en-US', { hour12: false }).replace(/:/g, "").slice(0, 4);
    document.getElementById('analysis-run-id-input').value = `RUN-${runDateStr}-${runTimeStr}`;

    renderSamplesTable();
}

// ==========================================================================
// Calibration Logic & Standards Table
// ==========================================================================

function renderStandardsTable() {
    const tbody = document.getElementById('cal-standards-tbody');
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
    setStatusText("Added empty standard row");
}

function updateCalibrationSummaryCards() {
    const unit = PARAM_UNITS[activeParameter] || 'mg/L';
    
    if (activeCalModel) {
        document.getElementById('run-cal-name').textContent = activeCalModel.name;
        document.getElementById('run-cal-equation').textContent = `Abs = ${activeCalModel.slope.toFixed(6)} * Conc + ${activeCalModel.intercept.toFixed(6)}`;
        
        const r2Badge = document.getElementById('run-cal-r2');
        r2Badge.textContent = activeCalModel.r2.toFixed(6);
        r2Badge.className = 'val status-indicator ' + (activeCalModel.r2 >= 0.995 ? 'safe' : 'waiting');

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

        // Dashboard sync
        document.getElementById('dash-active-model-name').textContent = "No active calibration model";
        document.getElementById('dash-active-model-slope').textContent = "-";
        document.getElementById('dash-active-model-intercept').textContent = "-";
        document.getElementById('dash-active-model-r2').textContent = "-";
        document.getElementById('dash-active-model-r2').className = "val";
        document.getElementById('dash-active-model-date').textContent = "-";
    }
}

// Linear Regression Calculation
function linearRegression(points) {
    if (points.length < 2) {
        throw new Error("Linear regression requires at least two data points.");
    }
    const n = points.length;
    const xs = points.map(p => p[0]);
    const ys = points.map(p => p[1]);

    const meanX = xs.reduce((a, b) => a + b, 0) / n;
    const meanY = ys.reduce((a, b) => a + b, 0) / n;

    let ssXX = 0;
    let ssXY = 0;
    for (let i = 0; i < n; i++) {
        ssXX += Math.pow(xs[i] - meanX, 2);
        ssXY += (xs[i] - meanX) * (ys[i] - meanY);
    }

    if (ssXX === 0) {
        throw new Error("Concentrations must not all be identical.");
    }

    const slope = ssXY / ssXX;
    const intercept = meanY - slope * meanX;

    // Calculate R2 value
    const predictions = xs.map(x => slope * x + intercept);
    let ssRes = 0;
    let ssTot = 0;
    for (let i = 0; i < n; i++) {
        ssRes += Math.pow(ys[i] - predictions[i], 2);
        ssTot += Math.pow(ys[i] - meanY, 2);
    }

    const r2 = ssTot === 0 ? 1.0 : 1.0 - (ssRes / ssTot);
    return { slope, intercept, r2 };
}

function calculateCalibrationCurve() {
    try {
        const points = standardsList.map(s => [s.concentration, s.absorbance]);
        const model = linearRegression(points);
        
        activeCalModel = {
            slope: model.slope,
            intercept: model.intercept,
            r2: model.r2,
            name: document.getElementById('cal-model-name-input').value || "Standard Calibration Curve"
        };

        updateChartData();
        updateCalibrationSummaryCards();
        setStatusText(`Curve calculated successfully. R² = ${model.r2.toFixed(6)}`);
    } catch (e) {
        dialogError("Calibration Error", e.message);
    }
}

async function saveCalibrationModel() {
    if (!activeCalModel) {
        calculateCalibrationCurve();
        if (!activeCalModel) return;
    }

    // Set all other calibrations for this parameter to active=false
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
        standards: JSON.parse(JSON.stringify(standardsList)),
        active: true,
        created_at: new Date().toISOString()
    };

    db.calibrations.unshift(newModel);

    // Save database
    const success = await window.chemLabAPI.saveData(db);
    if (success) {
        setStatusText(`Stored calibration model: ${newModel.name}`);
        dialogInfo("Database Update", "Calibration model stored and activated globally successfully.");
    } else {
        dialogError("Storage Error", "Failed to write database file to AppData.");
    }
}

// ==========================================================================
// Chart.js Implementation (Shimadzu Light Style)
// ==========================================================================

function initializeChartJSInstance() {
    const canvasCtx = document.getElementById('calibration-chart-canvas').getContext('2d');
    
    calibrationChart = new Chart(canvasCtx, {
        type: 'scatter',
        data: {
            datasets: [
                {
                    label: 'Standards',
                    data: [],
                    backgroundColor: '#e53935', // Red circles for standards
                    borderColor: '#b71c1c',
                    borderWidth: 1.5,
                    pointRadius: 6,
                    pointHoverRadius: 8
                },
                {
                    label: 'Regression Line',
                    data: [],
                    type: 'line',
                    borderColor: '#005bac', // Shimadzu deep cobalt blue
                    borderWidth: 2,
                    fill: false,
                    pointRadius: 0, // No points for the line
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
                        font: {
                            family: 'Inter',
                            size: 11
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
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
                        font: {
                            family: 'Inter',
                            size: 11,
                            weight: 'bold'
                        }
                    },
                    grid: {
                        color: '#e2e8f0'
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'Absorbance',
                        font: {
                            family: 'Inter',
                            size: 11,
                            weight: 'bold'
                        }
                    },
                    grid: {
                        color: '#e2e8f0'
                    }
                }
            }
        }
    });
}

function updateChartData() {
    if (!calibrationChart) return;

    // Translate standardsList to scatter points
    const scatterData = standardsList.map(s => ({ x: s.concentration, y: s.absorbance }));
    calibrationChart.data.datasets[0].data = scatterData;

    // Translate activeCalModel to regression line path
    if (activeCalModel && scatterData.length > 0) {
        const convals = standardsList.map(s => s.concentration);
        const minX = Math.min(...convals);
        const maxX = Math.max(...convals);

        const lineData = [
            { x: minX, y: activeCalModel.slope * minX + activeCalModel.intercept },
            { x: maxX, y: activeCalModel.slope * maxX + activeCalModel.intercept }
        ];
        
        calibrationChart.data.datasets[1].data = lineData;
    } else {
        calibrationChart.data.datasets[1].data = [];
    }

    // Refresh Chart
    calibrationChart.update();
}

function exportPlotAsImage() {
    const dataURL = document.getElementById('calibration-chart-canvas').toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `${activeParameter}_calibration_curve.png`;
    link.href = dataURL;
    link.click();
    setStatusText("Exported calibration plot image");
}

// ==========================================================================
// Water Quality Analysis
// ==========================================================================

function renderSamplesTable() {
    const tbody = document.getElementById('sample-results-tbody');
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
    setStatusText("Added empty sample row");
}

function calculateSampleBatch() {
    if (!activeCalModel) {
        dialogError("Calculation Error", "No active calibration model is loaded for this parameter.");
        return;
    }

    const limits = db.settings.waterLimits[activeParameter] || { min: 0.0, max: 999.0 };

    samplesList.forEach(sample => {
        try {
            let conc = ((sample.absorbance - activeCalModel.intercept) / activeCalModel.slope) * sample.dilution;
            if (conc < 0) conc = 0.0;

            sample.concentration = conc.toFixed(2);
            
            // Check WHO Limits
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
        operator: op,
        created_at: new Date().toISOString(),
        samples: JSON.parse(JSON.stringify(samplesList))
    };

    db.sample_runs.unshift(newRun);

    const success = await window.chemLabAPI.saveData(db);
    if (success) {
        setStatusText(`Saved analytical run: ${runId}`);
        dialogInfo("Run Saved", `Analytical run ${runId} saved successfully.`);
        resetSampleBatch();
    } else {
        dialogError("Storage Error", "Failed to write analytical run records to AppData database.");
    }
}

function exportRunToCSV() {
    if (samplesList.length === 0) return;

    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Sample ID,Absorbance,Dilution Factor,Calculated Concentration,Status\n";

    samplesList.forEach(s => {
        csvContent += `${s.id},${s.absorbance},${s.dilution},${s.concentration || 'uncalculated'},${s.status}\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${activeParameter}_analysis_batch_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setStatusText("Exported batch results to CSV file");
}

// ==========================================================================
// Langelier Saturation Index (LSI) Calculator
// ==========================================================================

function calculateLSI() {
    const temp = parseFloat(document.getElementById('lsi-temp').value) || 25.0;
    const ph = parseFloat(document.getElementById('lsi-ph').value) || 7.0;
    const Ca = parseFloat(document.getElementById('lsi-calcium').value) || 100.0;
    const Alk = parseFloat(document.getElementById('lsi-alkalinity').value) || 100.0;
    const tds = parseFloat(document.getElementById('lsi-tds').value) || 300.0;

    const A = (Math.log10(tds) - 1.0) / 10.0;
    const B = -13.12 * Math.log10(temp + 273.15) + 34.55;
    const C = Math.log10(Ca) - 0.4;
    const D = Math.log10(Alk);

    const pHs = (9.3 + A + B) - (C + D);
    const LSI = ph - pHs;

    // Render results
    document.getElementById('lsi-score-output').textContent = LSI.toFixed(2);
    document.getElementById('lsi-val-phs').textContent = pHs.toFixed(2);
    document.getElementById('lsi-val-tf').textContent = B.toFixed(2);
    document.getElementById('lsi-val-cf').textContent = C.toFixed(2);
    document.getElementById('lsi-val-af').textContent = D.toFixed(2);
    document.getElementById('lsi-val-const').textContent = A.toFixed(2);

    const verdictPanel = document.getElementById('lsi-verdict-panel');
    const verdictTitle = document.getElementById('lsi-verdict-title');
    const verdictDesc = document.getElementById('lsi-verdict-desc');

    verdictPanel.className = 'lsi-verdict-box';

    if (LSI < -0.5) {
        verdictPanel.classList.add('corrosive');
        verdictTitle.textContent = "Corrosive Water Alert";
        verdictDesc.textContent = "LSI is negative. The water is under-saturated with calcium carbonate and is corrosive to metallic pipes.";
    } else if (LSI > 0.5) {
        verdictPanel.classList.add('scale-forming');
        verdictTitle.textContent = "Scale-Forming Water Warning";
        verdictDesc.textContent = "LSI is positive. The water is super-saturated with calcium carbonate and will build scales in heater pipes.";
    } else {
        verdictTitle.textContent = "Balanced Water (Ideal)";
        verdictDesc.textContent = "LSI is within safe parameters. The water chemistry is balanced.";
    }

    setStatusText(`LSI saturation index calculated: ${LSI.toFixed(2)}`);
}

// ==========================================================================
// BOD & TSS Calculators (Separated Views)
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
        verdictTitle.textContent = "Clean Water (Safe)";
        verdictDesc.textContent = "BOD is below 2 mg/L. Water contains minimal organic loading.";
    } else if (bod <= 8.0) {
        verdictPanel.classList.add('scale-forming');
        verdictTitle.textContent = "Moderately Polluted";
        verdictDesc.textContent = "BOD is between 2 and 8 mg/L. Indicates moderate organic loading.";
    } else {
        verdictPanel.classList.add('corrosive');
        verdictTitle.textContent = "Highly Polluted Alert";
        verdictDesc.textContent = "BOD exceeds 8 mg/L. High concentration of organic pollutants. Immediate aeration required.";
    }

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
        verdictTitle.textContent = "Clear Water (Low Solids)";
        verdictDesc.textContent = "TSS is below 25 mg/L. Safe suspended solids concentration.";
    } else if (tss <= 100.0) {
        verdictPanel.classList.add('scale-forming');
        verdictTitle.textContent = "High Suspended Solids";
        verdictDesc.textContent = "TSS is between 25 and 100 mg/L. Moderate turbidity. Filtration recommended.";
    } else {
        verdictPanel.classList.add('corrosive');
        verdictTitle.textContent = "Highly Turbid Water Alert";
        verdictDesc.textContent = "TSS exceeds 100 mg/L. High turbidity. Flocculation settling required.";
    }

    setStatusText(`TSS calculation completed: ${tss.toFixed(1)} mg/L`);
}

// ==========================================================================
// Views Rendering Details (Dashboard & History)
// ==========================================================================

function renderDashboard() {
    loadActiveCalibrationForParameter();
}

function renderHistory() {
    const calTbody = document.getElementById('history-cals-tbody');
    calTbody.innerHTML = '';
    
    db.calibrations.forEach((cal) => {
        const tr = document.createElement('tr');
        const activeText = cal.active ? '<span class="status-indicator safe">Active</span>' : '<span class="status-indicator waiting">Inactive</span>';
        
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
                <button class="btn btn-secondary" onclick="activateCalibrationModel('${cal.id}')" style="padding:2px 6px;">Activate</button>
            </td>
        `;
        calTbody.appendChild(tr);
    });

    const runTbody = document.getElementById('history-runs-tbody');
    runTbody.innerHTML = '';

    db.sample_runs.forEach((run) => {
        const tr = document.createElement('tr');
        const samplesCount = run.samples ? run.samples.length : 0;
        
        tr.innerHTML = `
            <td><strong>${run.run_id}</strong></td>
            <td>${run.parameter}</td>
            <td>${db.calibrations.find(c => c.id === run.calibration_id)?.name || 'Generic Model'}</td>
            <td>${run.operator}</td>
            <td>${samplesCount}</td>
            <td>${new Date(run.created_at).toLocaleString()}</td>
            <td>
                <button class="btn btn-danger" onclick="deleteHistoryRun('${run.run_id}')" style="padding:2px 6px;">🗑️ Delete</button>
            </td>
        `;
        runTbody.appendChild(tr);
    });
}

async function activateCalibrationModel(calId) {
    const cal = db.calibrations.find(c => c.id === calId);
    if (!cal) return;

    db.calibrations.forEach(c => {
        if (c.parameter === cal.parameter) c.active = false;
    });

    cal.active = true;

    const success = await window.chemLabAPI.saveData(db);
    if (success) {
        updateUIForParameter();
        renderHistory();
        setStatusText(`Activated model: ${cal.name}`);
    }
}

async function deleteHistoryRun(runId) {
    const idx = db.sample_runs.findIndex(r => r.run_id === runId);
    if (idx === -1) return;

    db.sample_runs.splice(idx, 1);

    const success = await window.chemLabAPI.saveData(db);
    if (success) {
        renderHistory();
        setStatusText(`Deleted run: ${runId}`);
    }
}

// Dialog helpers
function dialogInfo(title, msg) {
    alert(`${title}\n\n${msg}`);
}

function dialogError(title, msg) {
    alert(`❌ ERROR: ${title}\n\n${msg}`);
}

// Fallback JSON template
function getTemplateDatabase() {
    return {
        calibrations: [],
        sample_runs: [],
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
