// ChemLab Pro LIMS - Frontend Application Logic (Shimadzu LabSolutions Edition)
// Multi-Analyte Sample Quantitation & Calibration Suite

// ==========================================================================
// Global State & Configuration
// ==========================================================================

let db = {};
let currentView = 'multiparam';
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
    "Copper": "mg/L",
    "Ammonia": "mg/L",
    "Turbidity": "NTU",
    "Chlorine": "mg/L",
    "Sulfate": "mg/L"
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
            if (data && data.calibrations && data.calibrations.length > 0) {
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

    // Ensure database structure integrity
    if (!db.settings) db.settings = { theme: "light", waterLimits: {} };
    if (!db.settings.waterLimits || Object.keys(db.settings.waterLimits).length === 0) {
        db.settings.waterLimits = getTemplateDatabase().settings.waterLimits;
    }
    if (!db.calibrations || db.calibrations.length === 0) {
        db.calibrations = getTemplateDatabase().calibrations;
    }
    if (!db.sample_runs) db.sample_runs = [];

    // Ensure all parameters in waterLimits have unit mappings
    Object.keys(db.settings.waterLimits).forEach(param => {
        if (!PARAM_UNITS[param]) PARAM_UNITS[param] = "mg/L";
    });

    // Set today's date in multi-param sampling date
    const dateInput = document.getElementById('mp-sample-date');
    if (dateInput) dateInput.value = new Date().toISOString().slice(0, 10);

    // Bind navigation tabs
    const navItems = {
        'nav-multiparam': 'multiparam',
        'nav-calibration': 'calibration',
        'nav-analysis': 'analysis',
        'nav-dashboard': 'dashboard',
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

    // Topbar Parameter Management button & New Cal button
    const btnOpenParams = document.getElementById('btn-open-params-modal');
    if (btnOpenParams) {
        btnOpenParams.addEventListener('click', openManageParamsModal);
    }

    const btnTopbarNewCal = document.getElementById('btn-topbar-new-cal');
    if (btnTopbarNewCal) {
        btnTopbarNewCal.addEventListener('click', () => openModal('create-param-modal'));
    }

    // Multi-Parameter Workstation buttons
    document.getElementById('btn-mp-create-cal').addEventListener('click', () => openModal('create-param-modal'));
    document.getElementById('btn-mp-reset-sample').addEventListener('click', resetMultiParamSample);
    document.getElementById('btn-mp-fill-demo').addEventListener('click', fillMultiParamDemo);
    document.getElementById('btn-mp-clear-abs').addEventListener('click', clearMultiParamAbsorbances);
    document.getElementById('btn-mp-save-run').addEventListener('click', saveMultiParamSampleRun);
    document.getElementById('btn-mp-export-csv').addEventListener('click', exportMultiParamToCSV);
    document.getElementById('btn-mp-print-final').addEventListener('click', generateMultiParamReport);

    // Calibration Buttons & Controls
    document.getElementById('btn-open-create-param-modal').addEventListener('click', () => openModal('create-param-modal'));
    document.getElementById('btn-submit-create-param').addEventListener('click', submitCreateCustomParam);
    document.getElementById('btn-refresh-cal-library').addEventListener('click', renderCalibrationsLibrary);
    document.getElementById('cal-analyte-picker').addEventListener('change', (e) => {
        activeParameter = e.target.value;
        updateUIForParameter();
    });

    document.getElementById('btn-add-standard-row').addEventListener('click', addStandardRow);
    document.getElementById('btn-import-standards').addEventListener('click', () => openBatchImportModal('standards'));
    document.getElementById('btn-calculate-curve').addEventListener('click', calculateCalibrationCurve);
    document.getElementById('btn-save-calibration').addEventListener('click', saveCalibrationModel);
    document.getElementById('btn-export-curve-image').addEventListener('click', exportPlotAsImage);
    document.getElementById('btn-toggle-residuals').addEventListener('click', toggleResidualsPlot);
    document.getElementById('cal-force-zero').addEventListener('change', () => {
        if (standardsList.length >= 2) calculateCalibrationCurve();
    });

    // Single Parameter Analysis Buttons & Controls
    document.getElementById('btn-add-sample-row').addEventListener('click', addSampleRow);
    document.getElementById('btn-import-samples').addEventListener('click', () => openBatchImportModal('samples'));
    document.getElementById('btn-calculate-batch').addEventListener('click', calculateSampleBatch);
    document.getElementById('btn-save-run').addEventListener('click', saveSampleRun);
    document.getElementById('btn-export-csv').addEventListener('click', exportRunToCSV);
    document.getElementById('btn-generate-coa').addEventListener('click', () => {
        calculateSampleBatch();
        generateSingleAnalyteCertificateOfAnalysis(null);
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

    // Initial render
    renderParameterTabs();
    populateAnalytePicker();
    renderCalibrationsLibrary();
    updateUIForParameter();
    renderMultiParamWorkstation();

    // Default view: Multi-Analyte Testing Workstation
    switchView('multiparam');
    showToast("ChemLab Pro: Multi-Analyte Workstation Ready", "success", 3000);
});

// ==========================================================================
// View Router
// ==========================================================================

function switchView(viewName) {
    currentView = viewName;
    
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    document.querySelectorAll('.view-pane').forEach(pane => pane.classList.add('hidden'));

    const activeNavId = `nav-${viewName}`;
    const activePaneId = `${viewName}-view`;
    
    if (document.getElementById(activeNavId)) document.getElementById(activeNavId).classList.add('active');
    if (document.getElementById(activePaneId)) document.getElementById(activePaneId).classList.remove('hidden');

    const formattedTitle = viewName === 'multiparam' ? 'MULTI-ANALYTE TESTING' : viewName.toUpperCase().replace('-', ' ');
    const titleLabel = document.getElementById('page-title-label');
    if (titleLabel) titleLabel.textContent = formattedTitle;

    if (viewName === 'multiparam') {
        renderMultiParamWorkstation();
    } else if (viewName === 'calibration') {
        populateAnalytePicker();
        renderCalibrationsLibrary();
    } else if (viewName === 'dashboard') {
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
// Multi-Parameter Sample Quantitation Workstation
// ==========================================================================

function renderMultiParamWorkstation() {
    const tbody = document.getElementById('mp-matrix-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    // Get all parameters that have an active calibration model
    const activeCals = (db.calibrations || []).filter(c => c.active === true);
    
    const countBadge = document.getElementById('mp-active-cals-count');
    if (countBadge) {
        countBadge.textContent = `${activeCals.length} Calibrated Parameters Ready`;
    }

    if (activeCals.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 20px; color: var(--text-muted);">
            No active calibration models found. Please create or activate calibration curves first.
        </td></tr>`;
        updateSampleOverallVerdict();
        return;
    }

    activeCals.forEach((cal) => {
        const param = cal.parameter;
        const unit = cal.unit || PARAM_UNITS[param] || 'mg/L';
        const limits = (db.settings.waterLimits && db.settings.waterLimits[param]) ? db.settings.waterLimits[param] : { min: 0.0, max: 999.0 };

        const tr = document.createElement('tr');
        tr.id = `mp-row-${param}`;
        tr.innerHTML = `
            <td>
                <div style="font-weight: 700; color: var(--accent-dark-header); font-size: 0.88rem;">${param}</div>
                <div style="font-size: 0.7rem; color: var(--text-muted);">${unit}</div>
            </td>
            <td>
                <div style="font-size: 0.78rem; font-weight: 600; color: var(--accent-blue);">${cal.name}</div>
                <div style="font-size: 0.68rem; color: var(--text-muted);">Abs = ${cal.slope.toFixed(5)} · Conc + ${cal.intercept.toFixed(5)} (R² ${cal.r2.toFixed(4)})</div>
            </td>
            <td>
                <span class="status-indicator waiting" style="font-size: 0.75rem;">${limits.min.toFixed(2)} - ${limits.max.toFixed(2)} ${unit}</span>
            </td>
            <td class="abs-input-cell">
                <input type="number" step="any" placeholder="0.000" id="mp-abs-${param}" class="mp-abs-input" data-param="${param}">
            </td>
            <td style="width: 80px;">
                <input type="number" step="0.1" value="1.0" min="0.1" id="mp-dil-${param}" class="table-cell-input mp-dil-input" data-param="${param}" style="text-align: center;">
            </td>
            <td class="conc-output-cell" id="mp-conc-cell-${param}">
                <span id="mp-conc-val-${param}">-</span> <span style="font-size: 0.72rem; color: var(--text-muted);">${unit}</span>
            </td>
            <td id="mp-status-cell-${param}">
                <span class="status-indicator waiting" id="mp-status-${param}">Awaiting Abs</span>
            </td>
            <td>
                <button class="btn btn-secondary" onclick="clearParamAbs('${param}')" style="padding: 2px 6px; font-size: 0.75rem;" title="Reset Absorbance">🧹</button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    // Attach reactive calculation listeners to all inputs
    document.querySelectorAll('.mp-abs-input').forEach(input => {
        input.addEventListener('input', () => calculateSingleParamInMatrix(input.getAttribute('data-param')));
    });

    document.querySelectorAll('.mp-dil-input').forEach(input => {
        input.addEventListener('input', () => calculateSingleParamInMatrix(input.getAttribute('data-param')));
    });

    updateSampleOverallVerdict();
}

function calculateSingleParamInMatrix(param) {
    const absInput = document.getElementById(`mp-abs-${param}`);
    const dilInput = document.getElementById(`mp-dil-${param}`);
    const concVal = document.getElementById(`mp-conc-val-${param}`);
    const statusEl = document.getElementById(`mp-status-${param}`);
    const concCell = document.getElementById(`mp-conc-cell-${param}`);

    if (!absInput || !concVal || !statusEl) return;

    const rawAbs = absInput.value.trim();
    if (rawAbs === '') {
        concVal.textContent = '-';
        statusEl.className = 'status-indicator waiting';
        statusEl.textContent = 'Awaiting Abs';
        if (concCell) concCell.className = 'conc-output-cell';
        updateSampleOverallVerdict();
        return;
    }

    const abs = parseFloat(rawAbs);
    const dilution = parseFloat(dilInput.value) || 1.0;

    const cal = (db.calibrations || []).find(c => c.parameter === param && c.active === true);
    if (!cal) return;

    const limits = (db.settings.waterLimits && db.settings.waterLimits[param]) ? db.settings.waterLimits[param] : { min: 0.0, max: 999.0 };

    let conc = ((abs - cal.intercept) / cal.slope) * dilution;
    if (conc < 0) conc = 0.0;

    concVal.textContent = conc.toFixed(2);

    if (conc >= limits.min && conc <= limits.max) {
        statusEl.className = 'status-indicator safe';
        statusEl.textContent = 'PASSED (Safe)';
        if (concCell) concCell.className = 'conc-output-cell safe';
    } else {
        statusEl.className = 'status-indicator danger';
        statusEl.textContent = 'EXCEEDED';
        if (concCell) concCell.className = 'conc-output-cell exceeded';
    }

    updateSampleOverallVerdict();
}

function updateSampleOverallVerdict() {
    const activeCals = (db.calibrations || []).filter(c => c.active === true);
    let measuredCount = 0;
    let exceededParams = [];

    activeCals.forEach(cal => {
        const absInput = document.getElementById(`mp-abs-${cal.parameter}`);
        if (absInput && absInput.value.trim() !== '') {
            measuredCount++;
            const concVal = parseFloat(document.getElementById(`mp-conc-val-${cal.parameter}`).textContent) || 0.0;
            const limits = (db.settings.waterLimits && db.settings.waterLimits[cal.parameter]) ? db.settings.waterLimits[cal.parameter] : { min: 0.0, max: 999.0 };
            if (concVal < limits.min || concVal > limits.max) {
                exceededParams.push(`${cal.parameter} (${concVal.toFixed(2)} ${cal.unit})`);
            }
        }
    });

    const banner = document.getElementById('mp-verdict-banner');
    const icon = document.getElementById('mp-verdict-icon');
    const text = document.getElementById('mp-verdict-text');
    const sub = document.getElementById('mp-verdict-sub');
    const badge = document.getElementById('mp-verdict-badge');

    if (!banner) return;

    if (measuredCount === 0) {
        banner.className = 'verdict-banner pending';
        icon.textContent = '⏳';
        text.textContent = 'Awaiting Absorbance Measurements';
        sub.textContent = `Enter measured absorbances for any parameter above. Total active calibrations available: ${activeCals.length}.`;
        badge.textContent = 'INCOMPLETE';
    } else if (exceededParams.length > 0) {
        banner.className = 'verdict-banner exceeded';
        icon.textContent = '⚠️';
        text.textContent = `WATER QUALITY ALERT: Non-Compliant (${exceededParams.length} Exceeded)`;
        sub.textContent = `Exceeded allowable drinking water limits for: ${exceededParams.join(', ')}. Action/remediation required.`;
        badge.textContent = 'EXCEEDED LIMITS';
    } else {
        banner.className = 'verdict-banner safe';
        icon.textContent = '✅';
        text.textContent = 'ALL MEASURED PARAMETERS CONFORM TO WHO POTABLE WATER STANDARDS';
        sub.textContent = `Tested ${measuredCount} of ${activeCals.length} calibrated analytes. Water is chemically safe for human consumption.`;
        badge.textContent = 'PASSED / SAFE';
    }
}

function clearParamAbs(param) {
    const absInput = document.getElementById(`mp-abs-${param}`);
    if (absInput) {
        absInput.value = '';
        calculateSingleParamInMatrix(param);
    }
}

function clearMultiParamAbsorbances() {
    document.querySelectorAll('.mp-abs-input').forEach(input => input.value = '');
    const activeCals = (db.calibrations || []).filter(c => c.active === true);
    activeCals.forEach(c => calculateSingleParamInMatrix(c.parameter));
    showToast("Cleared all absorbance inputs", "info", 2000);
}

function fillMultiParamDemo() {
    const demoData = {
        "Phosphate": 0.165,
        "Nitrate": 0.250,
        "Iron": 0.104,
        "Fluoride": 0.106,
        "pH": 0.680,
        "Lead": 0.045,
        "Copper": 0.120,
        "Ammonia": 0.090,
        "Turbidity": 0.150
    };

    Object.entries(demoData).forEach(([param, abs]) => {
        const input = document.getElementById(`mp-abs-${param}`);
        if (input) {
            input.value = abs;
            calculateSingleParamInMatrix(param);
        }
    });

    showToast("Loaded realistic demo sample absorbances!", "success", 2500);
}

function resetMultiParamSample() {
    clearMultiParamAbsorbances();
    const runDateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const runTimeStr = new Date().toLocaleTimeString('en-US', { hour12: false }).replace(/:/g, "").slice(0, 4);
    
    document.getElementById('mp-sample-name').value = `Drinking Water Sample - #${Math.floor(100 + Math.random() * 900)}`;
    document.getElementById('mp-sample-id').value = `SMP-${runDateStr}-${runTimeStr}`;
    showToast("Fresh sample batch initialized", "info", 2000);
}

async function saveMultiParamSampleRun() {
    const sampleName = document.getElementById('mp-sample-name').value.trim() || "Water Sample";
    const sampleId = document.getElementById('mp-sample-id').value;
    const sampleSource = document.getElementById('mp-sample-source').value;
    const op = document.getElementById('operator-name-input').value;

    const activeCals = (db.calibrations || []).filter(c => c.active === true);
    const measuredResults = [];

    activeCals.forEach(cal => {
        const absInput = document.getElementById(`mp-abs-${cal.parameter}`);
        const dilInput = document.getElementById(`mp-dil-${cal.parameter}`);
        if (absInput && absInput.value.trim() !== '') {
            const abs = parseFloat(absInput.value) || 0.0;
            const dil = parseFloat(dilInput.value) || 1.0;
            const conc = parseFloat(document.getElementById(`mp-conc-val-${cal.parameter}`).textContent) || 0.0;
            const status = document.getElementById(`mp-status-${cal.parameter}`).textContent.includes('PASSED') ? 'Safe' : 'Exceeded';

            measuredResults.push({
                parameter: cal.parameter,
                unit: cal.unit,
                absorbance: abs,
                dilution: dil,
                concentration: conc.toFixed(2),
                status: status,
                calibration_name: cal.name
            });
        }
    });

    if (measuredResults.length === 0) {
        dialogError("Save Error", "Please enter absorbance readings for at least one parameter before saving.");
        return;
    }

    const anyExceeded = measuredResults.some(r => r.status === 'Exceeded');

    const newRun = {
        run_id: sampleId,
        sample_name: sampleName,
        source: sampleSource,
        parameter: "Multi-Analyte",
        operator: op,
        created_at: new Date().toISOString(),
        overall_status: anyExceeded ? "Exceeded" : "Safe",
        results: measuredResults,
        samples: measuredResults.map(r => ({
            id: r.parameter,
            absorbance: r.absorbance,
            dilution: r.dilution,
            concentration: r.concentration,
            status: r.status
        }))
    };

    db.sample_runs.unshift(newRun);
    const success = await saveDatabase(db);
    if (success) {
        showToast(`Saved complete test run for '${sampleName}'!`, "success", 3500);
        setStatusText(`Saved run: ${sampleId} (${sampleName})`);
    } else {
        dialogError("Storage Error", "Failed to persist analytical sample run.");
    }
}

function exportMultiParamToCSV() {
    const sampleName = document.getElementById('mp-sample-name').value.trim() || "Water Sample";
    const sampleId = document.getElementById('mp-sample-id').value;
    const sampleSource = document.getElementById('mp-sample-source').value;
    const op = document.getElementById('operator-name-input').value;

    const activeCals = (db.calibrations || []).filter(c => c.active === true);
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += `Sample Name,"${sampleName}",Sample ID,"${sampleId}",Source,"${sampleSource}",Operator,"${op}",Date,"${new Date().toLocaleString()}"\n\n`;
    csvContent += "Analyte Parameter,Unit,Measured Absorbance,Dilution Factor,Calculated Concentration,WHO Permissible Range,Compliance Status,Calibration Model\n";

    activeCals.forEach(cal => {
        const absInput = document.getElementById(`mp-abs-${cal.parameter}`);
        const dilInput = document.getElementById(`mp-dil-${cal.parameter}`);
        const limits = (db.settings.waterLimits && db.settings.waterLimits[cal.parameter]) ? db.settings.waterLimits[cal.parameter] : { min: 0.0, max: 999.0 };

        if (absInput && absInput.value.trim() !== '') {
            const abs = parseFloat(absInput.value) || 0.0;
            const dil = parseFloat(dilInput.value) || 1.0;
            const conc = document.getElementById(`mp-conc-val-${cal.parameter}`).textContent;
            const status = document.getElementById(`mp-status-${cal.parameter}`).textContent.includes('PASSED') ? 'Safe' : 'Exceeded';

            csvContent += `"${cal.parameter}","${cal.unit}",${abs},${dil},${conc},"${limits.min}-${limits.max}","${status}","${cal.name}"\n`;
        }
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${sampleName.replace(/\s+/g, '_')}_Water_Analysis.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showToast("Exported multi-parameter results to CSV", "success", 2500);
}

// ==========================================================================
// Comprehensive Final Report & Certificate of Analysis (Printable)
// ==========================================================================

function generateMultiParamReport() {
    const sampleName = document.getElementById('mp-sample-name').value.trim() || "Water Sample";
    const sampleId = document.getElementById('mp-sample-id').value;
    const sampleSource = document.getElementById('mp-sample-source').value || "Drinking Water Supply";
    const op = document.getElementById('operator-name-input').value;

    const activeCals = (db.calibrations || []).filter(c => c.active === true);
    const measuredResults = [];

    activeCals.forEach(cal => {
        const absInput = document.getElementById(`mp-abs-${cal.parameter}`);
        const dilInput = document.getElementById(`mp-dil-${cal.parameter}`);
        const limits = (db.settings.waterLimits && db.settings.waterLimits[cal.parameter]) ? db.settings.waterLimits[cal.parameter] : { min: 0.0, max: 999.0 };

        if (absInput && absInput.value.trim() !== '') {
            const abs = parseFloat(absInput.value) || 0.0;
            const dil = parseFloat(dilInput.value) || 1.0;
            const conc = parseFloat(document.getElementById(`mp-conc-val-${cal.parameter}`).textContent) || 0.0;
            const isSafe = conc >= limits.min && conc <= limits.max;

            measuredResults.push({
                parameter: cal.parameter,
                unit: cal.unit,
                absorbance: abs,
                dilution: dil,
                concentration: conc.toFixed(2),
                limits: `${limits.min.toFixed(2)} - ${limits.max.toFixed(2)} ${cal.unit}`,
                status: isSafe ? 'PASSED' : 'EXCEEDED',
                isSafe: isSafe,
                cal_equation: `Abs = ${cal.slope.toFixed(5)} · Conc + ${cal.intercept.toFixed(5)}`
            });
        }
    });

    if (measuredResults.length === 0) {
        dialogError("Report Error", "Please enter absorbance readings for at least one parameter before printing report.");
        return;
    }

    const anyExceeded = measuredResults.some(r => !r.isSafe);

    // Populate Report Metadata
    document.getElementById('coa-report-id').textContent = `COA-${sampleId.replace('SMP-', '')}`;
    document.getElementById('coa-issue-date').textContent = new Date().toLocaleDateString();
    document.getElementById('coa-meta-sample-name').textContent = sampleName;
    document.getElementById('coa-meta-sample-id').textContent = sampleId;
    document.getElementById('coa-meta-source').textContent = sampleSource;
    document.getElementById('coa-meta-operator').textContent = op;
    document.getElementById('coa-meta-time').textContent = new Date().toLocaleString();
    document.getElementById('coa-meta-standards').textContent = "WHO Guidelines for Drinking-water Quality (4th Ed.)";
    document.getElementById('coa-sig-analyst').textContent = op;

    // Report Verdict Card
    const verdictCard = document.getElementById('coa-verdict-card');
    const verdictTitle = document.getElementById('coa-verdict-title');
    const verdictBadge = document.getElementById('coa-verdict-badge');

    if (anyExceeded) {
        verdictCard.className = 'verdict-banner exceeded';
        verdictTitle.textContent = "VERDICT: SAMPLE EXCEEDS SAFE PERMISSIBLE DRINKING LIMITS";
        verdictBadge.textContent = "EXCEEDED LIMITS";
    } else {
        verdictCard.className = 'verdict-banner safe';
        verdictTitle.textContent = "VERDICT: WATER CONFORMS TO ALL WHO POTABLE GUIDELINES";
        verdictBadge.textContent = "PASSED / POTABLE";
    }

    // Populate Table
    const tbody = document.getElementById('coa-samples-tbody');
    tbody.innerHTML = '';

    measuredResults.forEach(r => {
        const tr = document.createElement('tr');
        const badgeClass = r.isSafe ? 'safe' : 'danger';
        tr.innerHTML = `
            <td><strong>${r.parameter}</strong></td>
            <td>${r.absorbance.toFixed(3)}</td>
            <td>${r.dilution.toFixed(1)}x</td>
            <td><strong>${r.concentration} ${r.unit}</strong></td>
            <td>${r.limits}</td>
            <td><span class="status-indicator ${badgeClass}">${r.status}</span></td>
            <td style="font-size: 0.72rem; color: var(--text-muted);">${r.cal_equation}</td>
        `;
        tbody.appendChild(tr);
    });

    openModal('coa-modal');
    showToast("Official Certificate of Analysis Generated!", "success", 2500);
}

// Single Analyte fallback for traditional single view
function generateSingleAnalyteCertificateOfAnalysis(customRun) {
    const runData = customRun || {
        run_id: document.getElementById('analysis-run-id-input').value,
        parameter: activeParameter,
        operator: document.getElementById('operator-name-input').value,
        created_at: new Date().toISOString(),
        samples: samplesList
    };

    const unit = PARAM_UNITS[runData.parameter] || 'mg/L';
    const limits = (db.settings.waterLimits && db.settings.waterLimits[runData.parameter]) ? db.settings.waterLimits[runData.parameter] : { min: 0.0, max: 999.0 };

    document.getElementById('coa-report-id').textContent = `COA-${runData.run_id.replace('RUN-', '')}`;
    document.getElementById('coa-issue-date').textContent = new Date(runData.created_at).toLocaleDateString();
    document.getElementById('coa-meta-sample-name').textContent = `${runData.parameter} Batch Run`;
    document.getElementById('coa-meta-sample-id').textContent = runData.run_id;
    document.getElementById('coa-meta-source').textContent = "Analytical Batch Samples";
    document.getElementById('coa-meta-operator').textContent = runData.operator;
    document.getElementById('coa-meta-time').textContent = new Date(runData.created_at).toLocaleString();
    document.getElementById('coa-sig-analyst').textContent = runData.operator;

    const tbody = document.getElementById('coa-samples-tbody');
    tbody.innerHTML = '';

    (runData.samples || []).forEach(sample => {
        const tr = document.createElement('tr');
        const isSafe = sample.status === 'Safe';
        const badgeClass = isSafe ? 'safe' : 'danger';
        tr.innerHTML = `
            <td><strong>${sample.id}</strong></td>
            <td>${parseFloat(sample.absorbance).toFixed(3)}</td>
            <td>${parseFloat(sample.dilution).toFixed(1)}x</td>
            <td><strong>${sample.concentration} ${unit}</strong></td>
            <td>${limits.min} - ${limits.max} ${unit}</td>
            <td><span class="status-indicator ${badgeClass}">${sample.status}</span></td>
            <td style="font-size: 0.72rem; color: var(--text-muted);">${activeCalModel ? activeCalModel.name : 'Standard Curve'}</td>
        `;
        tbody.appendChild(tr);
    });

    openModal('coa-modal');
}

// ==========================================================================
// Calibration Curves Builder & Unlimited Parameters Creation
// ==========================================================================

function populateAnalytePicker() {
    const picker = document.getElementById('cal-analyte-picker');
    if (!picker) return;

    picker.innerHTML = '';
    const params = Object.keys(db.settings.waterLimits);

    params.forEach(param => {
        const opt = document.createElement('option');
        opt.value = param;
        opt.textContent = `${param} (${PARAM_UNITS[param] || 'mg/L'})`;
        if (param === activeParameter) opt.selected = true;
        picker.appendChild(opt);
    });
}

function renderCalibrationsLibrary() {
    const tbody = document.getElementById('cal-library-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const cals = db.calibrations || [];
    if (cals.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; color: var(--text-muted);">No calibration models found. Click 'Create New Parameter Curve' to start.</td></tr>`;
        return;
    }

    cals.forEach(cal => {
        const tr = document.createElement('tr');
        const activeText = cal.active 
            ? `<span class="status-indicator safe">ACTIVE</span>` 
            : `<span class="status-indicator waiting">INACTIVE</span>`;

        const actionButtons = cal.active
            ? `<button class="btn btn-secondary" onclick="loadAnalyteIntoBuilder('${cal.parameter}')" style="padding: 2px 7px; font-size: 0.75rem;">Edit Curve</button>`
            : `<button class="btn btn-secondary" onclick="activateCalibrationModel('${cal.id}')" style="padding: 2px 7px; font-size: 0.75rem;">Activate</button>
               <button class="btn btn-secondary" onclick="deleteCalibrationModel('${cal.id}')" style="padding: 2px 6px; color: var(--status-danger); font-size: 0.75rem;">🗑️</button>`;

        tr.innerHTML = `
            <td><strong>${cal.parameter}</strong></td>
            <td>${cal.unit || PARAM_UNITS[cal.parameter] || 'mg/L'}</td>
            <td>${cal.name}</td>
            <td>${cal.slope.toFixed(6)}</td>
            <td>${cal.intercept.toFixed(6)}</td>
            <td><strong>${cal.r2.toFixed(5)}</strong></td>
            <td>${cal.lod !== undefined && cal.lod !== null ? parseFloat(cal.lod).toFixed(3) : '-'}</td>
            <td>${cal.loq !== undefined && cal.loq !== null ? parseFloat(cal.loq).toFixed(3) : '-'}</td>
            <td>${activeText}</td>
            <td>${actionButtons}</td>
        `;
        tbody.appendChild(tr);
    });
}

function loadAnalyteIntoBuilder(param) {
    activeParameter = param;
    const picker = document.getElementById('cal-analyte-picker');
    if (picker) picker.value = param;
    updateUIForParameter();
    switchView('calibration');
    showToast(`Loaded calibration curve for: ${param}`, "info", 2000);
}

async function submitCreateCustomParam() {
    const nameInput = document.getElementById('cp-param-name');
    const unitInput = document.getElementById('cp-param-unit');
    const minInput = document.getElementById('cp-param-min');
    const maxInput = document.getElementById('cp-param-max');

    const name = nameInput.value.trim();
    const unit = unitInput.value.trim() || 'mg/L';
    const min = parseFloat(minInput.value) || 0.0;
    const max = parseFloat(maxInput.value) || 1.0;

    if (!name) {
        dialogError("Validation Error", "Please provide a chemical parameter name.");
        return;
    }

    // Add to waterLimits
    db.settings.waterLimits[name] = { min, max };
    PARAM_UNITS[name] = unit;

    // Create a default initial calibration curve for this parameter so it immediately has a working curve
    const defaultCal = {
        id: `cal-${Date.now()}`,
        name: `${name} Standard Model ${new Date().getFullYear()}`,
        parameter: name,
        unit: unit,
        slope: 0.01000,
        intercept: 0.00100,
        r2: 0.9990,
        syx: 0.002,
        sm: 0.0001,
        lod: 0.66,
        loq: 2.00,
        standards: [
            { id: "STD-1", concentration: 0.0, absorbance: 0.001 },
            { id: "STD-2", concentration: 10.0, absorbance: 0.101 },
            { id: "STD-3", concentration: 20.0, absorbance: 0.201 },
            { id: "STD-4", concentration: 50.0, absorbance: 0.501 }
        ],
        active: true,
        created_at: new Date().toISOString()
    };

    // Deactivate others of same param
    db.calibrations.forEach(c => {
        if (c.parameter === name) c.active = false;
    });

    db.calibrations.unshift(defaultCal);
    await saveDatabase(db);

    closeModal('create-param-modal');
    nameInput.value = '';

    // Switch to this parameter
    activeParameter = name;
    renderParameterTabs();
    populateAnalytePicker();
    renderCalibrationsLibrary();
    updateUIForParameter();
    renderMultiParamWorkstation();

    switchView('calibration');
    showToast(`Created analyte '${name}'! Customize your calibration standards below.`, 'success', 3500);
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
    const sm = (!forceZero && ssXX > 0) ? (syx / Math.sqrt(ssXX)) : (sumX2 > 0 ? syx / Math.sqrt(sumX2) : 0.0);
    const lod = slope > 0 ? (3.3 * syx) / slope : 0.0;
    const loq = slope > 0 ? (10.0 * syx) / slope : 0.0;

    return { slope, intercept, r2, syx, sm, lod, loq, residuals, forceZero };
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
        showToast(`Model '${newModel.name}' stored & activated globally!`, 'success', 3500);
        renderCalibrationsLibrary();
        renderMultiParamWorkstation();
    } else {
        dialogError("Storage Error", "Failed to write calibration database.");
    }
}

// ==========================================================================
// Standards Table UI
// ==========================================================================

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
        if (r2Badge) {
            r2Badge.textContent = activeCalModel.r2.toFixed(6);
            r2Badge.className = 'val status-indicator ' + (activeCalModel.r2 >= 0.995 ? 'safe' : 'waiting');
        }

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

        const statusLabel = document.getElementById('cal-analyte-active-status');
        if (statusLabel) {
            statusLabel.textContent = `Active: ${activeCalModel.name} (R² ${activeCalModel.r2.toFixed(4)})`;
            statusLabel.className = 'status-indicator safe';
        }
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

        const statusLabel = document.getElementById('cal-analyte-active-status');
        if (statusLabel) {
            statusLabel.textContent = "No Active Model (Uncalibrated)";
            statusLabel.className = 'status-indicator waiting';
        }
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
        calibrationChart.options.scales.y.title.text = 'Residual Error (ei = y - ŷ)';
        calibrationChart.options.scales.x.title.text = `Standard Concentration (${unit})`;

        const resData = (activeCalModel && activeCalModel.residuals) 
            ? activeCalModel.residuals.map(r => ({ x: r.x, y: r.residual }))
            : standardsList.map(s => ({ x: s.concentration, y: 0.0 }));

        calibrationChart.data.datasets[0].label = 'Residuals (ei)';
        calibrationChart.data.datasets[0].backgroundColor = '#7c3aed';
        calibrationChart.data.datasets[0].borderColor = '#5b21b6';
        calibrationChart.data.datasets[0].data = resData;

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
// Single Parameter Workspace Logic
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

    const picker = document.getElementById('cal-analyte-picker');
    if (picker) picker.value = activeParameter;

    loadDefaultStandardsForParameter();
    loadActiveCalibrationForParameter();
    resetSampleBatch();

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
    } else if (activeParameter === 'Copper') {
        convals = [0.0, 0.5, 1.0, 2.0, 4.0];
        absvals = [0.003, 0.095, 0.188, 0.375, 0.742];
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
    const activeCal = (db.calibrations || []).find(c => c.parameter === activeParameter && c.active === true);
    
    if (activeCal) {
        activeCalModel = {
            slope: activeCal.slope,
            intercept: activeCal.intercept,
            r2: activeCal.r2,
            name: activeCal.name,
            lod: activeCal.lod !== undefined ? activeCal.lod : null,
            loq: activeCal.loq !== undefined ? activeCal.loq : null,
            syx: activeCal.syx !== undefined ? activeCal.syx : null,
            sm: activeCal.sm !== undefined ? activeCal.sm : null,
            forceZero: activeCal.forceZero || false
        };
        
        if (activeCal.standards && activeCal.standards.length > 0) {
            standardsList = JSON.parse(JSON.stringify(activeCal.standards));
        }

        const forceZeroBox = document.getElementById('cal-force-zero');
        if (forceZeroBox) forceZeroBox.checked = !!activeCal.forceZero;

        const calNameInput = document.getElementById('cal-model-name-input');
        if (calNameInput) calNameInput.value = activeCal.name;
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

    const limits = (db.settings.waterLimits && db.settings.waterLimits[activeParameter]) ? db.settings.waterLimits[activeParameter] : { min: 0.0, max: 999.0 };

    samplesList.forEach(sample => {
        try {
            let conc = ((sample.absorbance - activeCalModel.intercept) / activeCalModel.slope) * sample.dilution;
            if (conc < 0) conc = 0.0;

            sample.concentration = conc.toFixed(2);
            
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
        calibration_id: (db.calibrations || []).find(c => c.parameter === activeParameter && c.active === true)?.id || "unknown",
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
    const RSI = 2.0 * pHs - ph;
    const pHeq = 1.465 * Math.log10(Math.max(1, Alk)) + 4.54;
    const PSI = 2.0 * pHs - pHeq;

    document.getElementById('lsi-score-output').textContent = LSI.toFixed(2);
    document.getElementById('rsi-score-output').textContent = RSI.toFixed(2);
    document.getElementById('psi-score-output').textContent = PSI.toFixed(2);

    document.getElementById('lsi-val-phs').textContent = pHs.toFixed(2);
    document.getElementById('lsi-val-tf').textContent = B.toFixed(2);
    document.getElementById('lsi-val-cf').textContent = C.toFixed(2);
    document.getElementById('lsi-val-af').textContent = D.toFixed(2);
    document.getElementById('lsi-val-const').textContent = A.toFixed(2);

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

    const psiTag = document.getElementById('psi-tag');
    if (PSI < 6.0) {
        psiTag.className = 'verdict-tag warning';
        psiTag.textContent = 'Scaling Risk';
    } else {
        psiTag.className = 'verdict-tag safe';
        psiTag.textContent = 'Corrosion Safe';
    }

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
// History & Reporting Database
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
        ? runs.filter(r => (r.run_id && r.run_id.toLowerCase().includes(searchFilter)) || 
                           (r.sample_name && r.sample_name.toLowerCase().includes(searchFilter)) ||
                           (r.parameter && r.parameter.toLowerCase().includes(searchFilter)) || 
                           (r.operator && r.operator.toLowerCase().includes(searchFilter)))
        : runs;

    if (filtered.length === 0) {
        runTbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted);">No analytical runs found.</td></tr>`;
        return;
    }

    filtered.forEach((run) => {
        const tr = document.createElement('tr');
        const samplesCount = run.results ? run.results.length : (run.samples ? run.samples.length : 0);
        const displayName = run.sample_name ? `${run.sample_name} (${run.run_id})` : run.run_id;
        const statusBadge = run.overall_status === 'Exceeded' 
            ? `<span class="status-indicator danger">EXCEEDED</span>` 
            : `<span class="status-indicator safe">SAFE</span>`;

        tr.innerHTML = `
            <td><strong>${displayName}</strong></td>
            <td><span class="status-indicator safe">${run.parameter}</span></td>
            <td>${run.calibration_name || 'Multi-Parameter Suite'}</td>
            <td>${run.operator}</td>
            <td>${samplesCount} Analytes</td>
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

    document.getElementById('modal-run-id-title').textContent = run.sample_name ? `${run.sample_name} [${run.run_id}]` : run.run_id;
    document.getElementById('modal-run-param').textContent = run.parameter;
    document.getElementById('modal-run-op').textContent = run.operator;
    document.getElementById('modal-run-cal').textContent = run.calibration_name || "Multi-Parameter Calibrations";
    document.getElementById('modal-run-time').textContent = new Date(run.created_at).toLocaleString();

    const tbody = document.getElementById('modal-run-samples-tbody');
    tbody.innerHTML = '';

    const items = run.results || run.samples || [];

    items.forEach(sample => {
        const tr = document.createElement('tr');
        const badgeClass = (sample.status === 'Safe' || sample.status === 'PASSED') ? 'safe' : 'danger';
        const unit = sample.unit || PARAM_UNITS[sample.parameter || sample.id] || 'mg/L';
        tr.innerHTML = `
            <td><strong>${sample.parameter || sample.id}</strong></td>
            <td>${parseFloat(sample.absorbance).toFixed(3)}</td>
            <td>${parseFloat(sample.dilution).toFixed(1)}x</td>
            <td><strong>${sample.concentration} ${unit}</strong></td>
            <td><span class="status-indicator ${badgeClass}">${sample.status}</span></td>
        `;
        tbody.appendChild(tr);
    });

    document.getElementById('modal-btn-export-csv').onclick = () => exportSpecificRunToCSV(run.run_id);
    document.getElementById('modal-btn-print-coa').onclick = () => {
        closeModal('run-details-modal');
        if (run.results) {
            // Multi-parameter report
            openMultiParamReportFromHistorical(run);
        } else {
            generateSingleAnalyteCertificateOfAnalysis(run);
        }
    };

    openModal('run-details-modal');
}

function openMultiParamReportFromHistorical(run) {
    document.getElementById('coa-report-id').textContent = `COA-${run.run_id.replace('SMP-', '')}`;
    document.getElementById('coa-issue-date').textContent = new Date(run.created_at).toLocaleDateString();
    document.getElementById('coa-meta-sample-name').textContent = run.sample_name || "Historical Water Sample";
    document.getElementById('coa-meta-sample-id').textContent = run.run_id;
    document.getElementById('coa-meta-source').textContent = run.source || "Laboratory Archive";
    document.getElementById('coa-meta-operator').textContent = run.operator;
    document.getElementById('coa-meta-time').textContent = new Date(run.created_at).toLocaleString();
    document.getElementById('coa-sig-analyst').textContent = run.operator;

    const verdictCard = document.getElementById('coa-verdict-card');
    const verdictTitle = document.getElementById('coa-verdict-title');
    const verdictBadge = document.getElementById('coa-verdict-badge');

    if (run.overall_status === 'Exceeded') {
        verdictCard.className = 'verdict-banner exceeded';
        verdictTitle.textContent = "VERDICT: SAMPLE EXCEEDS SAFE PERMISSIBLE DRINKING LIMITS";
        verdictBadge.textContent = "EXCEEDED LIMITS";
    } else {
        verdictCard.className = 'verdict-banner safe';
        verdictTitle.textContent = "VERDICT: WATER CONFORMS TO ALL WHO POTABLE GUIDELINES";
        verdictBadge.textContent = "PASSED / POTABLE";
    }

    const tbody = document.getElementById('coa-samples-tbody');
    tbody.innerHTML = '';

    (run.results || []).forEach(r => {
        const tr = document.createElement('tr');
        const badgeClass = r.status === 'Safe' ? 'safe' : 'danger';
        tr.innerHTML = `
            <td><strong>${r.parameter}</strong></td>
            <td>${r.absorbance.toFixed(3)}</td>
            <td>${r.dilution.toFixed(1)}x</td>
            <td><strong>${r.concentration} ${r.unit}</strong></td>
            <td>Standard Limit</td>
            <td><span class="status-indicator ${badgeClass}">${r.status}</span></td>
            <td style="font-size: 0.72rem; color: var(--text-muted);">${r.calibration_name || 'Standard Model'}</td>
        `;
        tbody.appendChild(tr);
    });

    openModal('coa-modal');
}

function exportSpecificRunToCSV(runId) {
    const run = (db.sample_runs || []).find(r => r.run_id === runId);
    if (!run) return;

    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += `Analytical Run ID: ${run.run_id}, Sample Name: "${run.sample_name || ''}", Parameter: ${run.parameter}, Operator: ${run.operator}\n`;
    csvContent += "Analyte / Sample,Absorbance,Dilution Factor,Calculated Concentration,Status\n";

    const items = run.results || run.samples || [];
    items.forEach(s => {
        csvContent += `"${s.parameter || s.id}",${s.absorbance},${s.dilution},${s.concentration},"${s.status}"\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${run.run_id}_export.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showToast(`Exported ${run.run_id} to CSV`, 'success', 2500);
}

async function activateCalibrationModel(calId) {
    const cal = (db.calibrations || []).find(c => c.id === calId);
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
        renderCalibrationsLibrary();
        renderHistory();
        renderMultiParamWorkstation();
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
        renderCalibrationsLibrary();
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
        populateAnalytePicker();
        updateUIForParameter();
        renderMultiParamWorkstation();
        showToast("Analyte limits & parameters updated globally!", 'success', 3000);
    } else {
        dialogError("Storage Error", "Failed to write parameter settings.");
    }
}

// Fallback JSON template with rich multi-parameter suite
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
