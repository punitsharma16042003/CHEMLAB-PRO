# ChemLab Pro LIMS v2.0 🧪
> **Industrial Qualitative & Quantitative Laboratory Information Management System**

ChemLab Pro is a high-precision, desktop LIMS workstation built with Electron, HTML5, CSS3, JavaScript, and Chart.js. Modeled after enterprise chromatography and spectrophotometry consoles (such as Shimadzu LabSolutions and Waters Empower), it serves water quality testing laboratories, environmental testing agencies, and analytical chemistry facilities.

---

## 🏗️ System Architecture

ChemLab Pro employs an isolated multi-process Electron architecture adhering to modern application security best practices:

- **Main Process (`main.js`)**:
  - Manages native desktop window lifecycles (frameless glassmorphic splash loader followed by the 1300x820 analytical workstation).
  - Handles secure local file-based JSON persistence in `%APPDATA%/ChemLabPro/data/database.json`.
  - Exposes asynchronous IPC channels (`load-data`, `save-data`).
- **Preload Bridge (`preload.js`)**:
  - Enforces `contextIsolation: true` and `nodeIntegration: false`.
  - Exposes a minimal, type-safe API to the renderer via `window.chemLabAPI`.
- **Renderer Process (`renderer/`)**:
  - Modular single-page architecture with zero runtime web dependencies (100% offline-ready with local Chart.js bundle).
  - Real-time Ordinary Least Squares (OLS) regression engine, quantitation calculator, stability modeling, and reporting.

---

## 🌟 Key Features & Capabilities

### 1. 📈 Advanced Analytical Metrology & Calibration Curve Engine
- **IUPAC / ISO 11843 Metrology Metrics**: Automatically computes Limit of Detection ($LOD = 3.3 \cdot S_{y/x} / m$), Limit of Quantitation ($LOQ = 10 \cdot S_{y/x} / m$), Standard Error of Estimate ($S_{y/x}$), and Slope Standard Error ($S_m$).
- **Forced Zero Regression**: Toggle between standard linear regression ($y = mx + c$) and forced blank/origin regression ($y = mx$).
- **Residuals Homoscedasticity Diagnostics**: One-click toggle between standard calibration curve and residual error distribution plot ($\Delta y = y_i - \hat{y}_i$).
- **Plot Export**: Save high-resolution calibration curves and residual charts as PNG images.

### 2. 💧 Water Quality Sample Batch Quantitation
- **Real-Time Dilution Correction**: Multiplies interpolated concentrations by dilution factors ($1.0\times$, $2.0\times$, $10.0\times$, etc.).
- **WHO / EPA Potable Water Screening**: Instantaneous color-coded compliance status (`Safe`, `Exceeded`, `Pending`).
- **Batch Export**: Instant CSV export of sample analytical batches.

### 3. 📄 Official Certificate of Analysis (CoA) Generator
- Produces accredited, laboratory-grade test reports meeting ISO/IEC 17025 formatting standards.
- Formats test parameters, calibration equation, $R^2$, $LOD$, $LOQ$, sample tables, compliance verdicts, and analyst signature lines.
- One-click print or save to PDF via dedicated `@media print` styling.

### 4. 📥 High-Throughput Batch Data Importer
- Paste tabular data directly from instrument exports, Excel spreadsheets, or CSVs.
- Automatic delimiter detection (Tabs, Commas, Semicolons) and instant table population for Standards or Samples.

### 5. ⚙️ Comprehensive Water Stability & Scaling Suite
- **Langelier Saturation Index (LSI)**: Predicts corrosive vs. scale-forming thermodynamic tendency ($LSI = pH - pH_s$).
- **Ryznar Stability Index (RSI)**: Computes $RSI = 2 \cdot pH_s - pH$ for cooling towers and high-temperature water networks.
- **Puckorius Scaling Index (PSI)**: Evaluates scaling propensity using equilibrium buffering pH ($PSI = 2 \cdot pH_s - pH_{eq}$).
- **Water Hardness Classification**: Automated classification into Soft, Moderately Hard, Hard, and Very Hard categories based on calcium content.

### 6. 🧪 Titration BOD₅ & Gravimetric TSS Calculators
- **Biochemical Oxygen Demand ($BOD_5$)**: Supports both standard unseeded dilution and seeded dilution with blank seed correction factor ($f$).
- **Total Suspended Solids (TSS)**: Gravimetric determination from filter paper tare weights and sample filtration volume.

### 7. 📂 Interactive History & Analyte Limit Manager
- **Run Inspector Modal**: View full sample details from any historical analytical run, with direct re-export to CSV or CoA generation.
- **Model Registry**: Switch active calibration models or safely remove obsolete curves.
- **Analyte & Limit Configuration**: Customize WHO/EPA permissible limits and add new chemical parameters (e.g. Lead, Arsenic, COD, Ammonia) directly from the UI.

### 8. 🎨 Modern Non-Blocking UX
- Color-coded notification toasts (success, warning, error, info) replacing legacy blocking `alert()` popups.
- Offline `localStorage` caching fallback for standalone and web-preview environments.

---

## 🛠️ Development & Installation

### Prerequisites
- [Node.js](https://nodejs.org/) v18+ (verified on v24.16.0)

### Setup and Running Locally
1. Clone the repository:
   ```bash
   git clone https://github.com/punitsharma16042003/CHEMLAB-PRO.git
   cd CHEMLAB-PRO
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run verification tests:
   ```bash
   node test_analytical_engine.js
   ```
4. Launch the application:
   ```bash
   npm start
   ```

---

## 📦 Building Standalone Installer (.exe)

To bundle the application into a standalone Windows installer setup wizard (`ChemLabPro Setup 2.0.0.exe`):

```bash
npm run build
```
The compiled installer will be saved in the `dist/` directory.

---

## 👤 Author & Maintainer
- **Pankaj Sharma** (Developer)
- Repository: [punitsharma16042003/CHEMLAB-PRO](https://github.com/punitsharma16042003/CHEMLAB-PRO)
