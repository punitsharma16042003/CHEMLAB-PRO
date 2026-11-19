// ChemLab Pro LIMS - Verification & Metrology Test Suite
const assert = require('assert');

// 1. Test Ordinary Least Squares Linear Regression
function linearRegressionMetrology(points, forceZero = false) {
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
        slope = sumXY / sumX2;
        intercept = 0.0;
    } else {
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

// 2. Test LSI / RSI / PSI Calculations
function calculateIndices(temp, ph, Ca, Alk, tds) {
    const A = (Math.log10(Math.max(1, tds)) - 1.0) / 10.0;
    const B = -13.12 * Math.log10(temp + 273.15) + 34.55;
    const C = Math.log10(Math.max(1, Ca)) - 0.4;
    const D = Math.log10(Math.max(1, Alk));

    const pHs = (9.3 + A + B) - (C + D);
    const LSI = ph - pHs;
    const RSI = 2.0 * pHs - ph;
    const pHeq = 1.465 * Math.log10(Math.max(1, Alk)) + 4.54;
    const PSI = 2.0 * pHs - pHeq;

    return { pHs, LSI, RSI, PSI };
}

// 3. Test BOD & TSS
function computeBOD(d1, d2, sampleVol, bottleVol, isSeeded, b1, b2, seedVolInBottle) {
    const P = sampleVol / bottleVol;
    if (isSeeded) {
        const f = seedVolInBottle / bottleVol;
        return ((d1 - d2) - (b1 - b2) * f) / P;
    }
    return (d1 - d2) / P;
}

function computeTSS(emptyWeight, dirtyWeight, sampleVol) {
    return ((dirtyWeight - emptyWeight) * 1000000) / sampleVol;
}

console.log("=== RUNNING CHEMLAB PRO ANALYTICAL VERIFICATION ===");

// 1. Regression tests
const testStandards = [
    [0.0, 0.002],
    [10.0, 0.084],
    [20.0, 0.165],
    [50.0, 0.412],
    [100.0, 0.822]
];

const resNormal = linearRegressionMetrology(testStandards, false);
console.log("Normal OLS Regression:", {
    slope: resNormal.slope.toFixed(6),
    intercept: resNormal.intercept.toFixed(6),
    r2: resNormal.r2.toFixed(6),
    lod: resNormal.lod.toFixed(4),
    loq: resNormal.loq.toFixed(4),
    syx: resNormal.syx.toFixed(6)
});

assert(resNormal.slope > 0.008, "Slope must be approx 0.0082");
assert(resNormal.r2 > 0.999, "R2 must be > 0.999");
assert(resNormal.lod > 0, "LOD must be positive");
assert(resNormal.loq > resNormal.lod, "LOQ must be greater than LOD");

// Forced zero regression
const resZero = linearRegressionMetrology(testStandards, true);
console.log("Forced Zero Regression (y = mx):", {
    slope: resZero.slope.toFixed(6),
    intercept: resZero.intercept,
    r2: resZero.r2.toFixed(6),
    lod: resZero.lod.toFixed(4)
});
assert.strictEqual(resZero.intercept, 0, "Intercept must be exactly 0");
assert(resZero.r2 > 0.998, "Forced zero R2 must be high");

// 2. Indices tests
const ind = calculateIndices(25.0, 7.8, 120.0, 100.0, 320.0);
console.log("Water Stability Indices:", {
    pHs: ind.pHs.toFixed(2),
    LSI: ind.LSI.toFixed(2),
    RSI: ind.RSI.toFixed(2),
    PSI: ind.PSI.toFixed(2)
});
assert(ind.pHs > 7.0 && ind.pHs < 8.5, "pHs must be within realistic range");
assert(ind.LSI > -1.0 && ind.LSI < 1.0, "LSI must be around near-equilibrium");
assert(ind.RSI > 6.0 && ind.RSI < 8.5, "RSI must be in expected range");

// 3. BOD tests
const bodUnseeded = computeBOD(8.5, 4.2, 10, 300, false);
console.log("BOD5 (Unseeded):", bodUnseeded.toFixed(2), "mg/L");
assert.strictEqual(Math.round(bodUnseeded * 100) / 100, 129.00, "BOD unseeded check");

const bodSeeded = computeBOD(8.5, 4.2, 10, 300, true, 8.4, 8.0, 2.0);
console.log("BOD5 (Seeded):", bodSeeded.toFixed(2), "mg/L");
assert(bodSeeded > 120 && bodSeeded < 130, "BOD seeded check");

// 4. TSS tests
const tssVal = computeTSS(1.2405, 1.2482, 250);
console.log("TSS Concentration:", tssVal.toFixed(1), "mg/L");
assert.strictEqual(Math.round(tssVal * 10) / 10, 30.8, "TSS gravimetric check");

// 5. Multi-Parameter Sample Quantitation Engine Test
console.log("\n--- Testing Multi-Parameter Sample Quantitation Engine ---");
const calibrationsDb = {
    Phosphate: {
        analyte: "Phosphate",
        unit: "mg/L",
        slope: 0.0082,
        intercept: 0.002,
        r2: 0.9998,
        whoLimitMin: null,
        whoLimitMax: 5.0,
        standards: [[0, 0], [10, 0.082], [50, 0.412]]
    },
    Nitrate: {
        analyte: "Nitrate",
        unit: "mg/L",
        slope: 0.0150,
        intercept: 0.001,
        r2: 0.9995,
        whoLimitMin: null,
        whoLimitMax: 50.0,
        standards: [[0, 0], [20, 0.300], [50, 0.751]]
    },
    Lead: {
        analyte: "Lead",
        unit: "mg/L",
        slope: 0.0450,
        intercept: 0.0005,
        r2: 0.9991,
        whoLimitMin: null,
        whoLimitMax: 0.01,
        standards: [[0, 0], [0.01, 0.00095], [0.05, 0.0023]]
    }
};

function quantitateSampleMultiParam(sampleName, inputAbsorbances) {
    const results = [];
    let hasViolation = false;

    for (const [param, absVal] of Object.entries(inputAbsorbances)) {
        const cal = calibrationsDb[param];
        if (!cal) continue;

        let conc = 0;
        if (cal.slope && cal.slope > 0) {
            conc = (absVal - (cal.intercept || 0)) / cal.slope;
            if (conc < 0) conc = 0;
        }

        let status = 'OPTIMAL';
        let isCompliant = true;
        if (cal.whoLimitMax !== null && conc > cal.whoLimitMax) {
            status = 'EXCEEDS LIMIT';
            isCompliant = false;
            hasViolation = true;
        }

        results.push({
            parameter: param,
            unit: cal.unit,
            abs: absVal,
            concentration: conc,
            whoLimit: cal.whoLimitMax,
            status: status,
            compliant: isCompliant
        });
    }

    const overallVerdict = hasViolation ? 'CONTAMINATED / NON-COMPLIANT' : 'SAFE / COMPLIANT';
    return {
        sampleName,
        sampleId: 'SMP-' + Date.now().toString(36).toUpperCase(),
        timestamp: new Date().toISOString(),
        overallVerdict,
        results
    };
}

// Test Sample 1: Safe Drinking Water
const sampleSafe = quantitateSampleMultiParam("Municipal Water Well #1", {
    Phosphate: 0.016, // conc ~ 1.7 mg/L (< 5.0)
    Nitrate: 0.151,   // conc ~ 10.0 mg/L (< 50.0)
    Lead: 0.0006      // conc ~ 0.002 mg/L (< 0.010)
});

console.log("Safe Sample Test:", {
    name: sampleSafe.sampleName,
    verdict: sampleSafe.overallVerdict,
    paramsCount: sampleSafe.results.length
});
assert.strictEqual(sampleSafe.overallVerdict, 'SAFE / COMPLIANT');
assert.strictEqual(sampleSafe.results[0].status, 'OPTIMAL');
assert.strictEqual(sampleSafe.results[1].status, 'OPTIMAL');
assert.strictEqual(sampleSafe.results[2].status, 'OPTIMAL');

// Test Sample 2: Contaminated with Lead
const sampleContaminated = quantitateSampleMultiParam("Industrial Effluent Pond B", {
    Phosphate: 0.016,
    Nitrate: 0.151,
    Lead: 0.0050      // conc ~ 0.10 mg/L (> 0.010 limit!)
});

console.log("Contaminated Sample Test:", {
    name: sampleContaminated.sampleName,
    verdict: sampleContaminated.overallVerdict,
    leadConc: sampleContaminated.results.find(r => r.parameter === 'Lead').concentration.toFixed(4)
});
assert.strictEqual(sampleContaminated.overallVerdict, 'CONTAMINATED / NON-COMPLIANT');
const leadResult = sampleContaminated.results.find(r => r.parameter === 'Lead');
assert.strictEqual(leadResult.status, 'EXCEEDS LIMIT');
assert.strictEqual(leadResult.compliant, false);

console.log(">>> ALL ANALYTICAL ENGINE METROLOGY & MULTI-PARAM TESTS PASSED! <<<");
