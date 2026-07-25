# ChemLab Pro LIMS v2.0 🧪
> **Qualitative & Quantitative Laboratory Information Management System**

ChemLab Pro is a high-tech, premium desktop application built with Electron, HTML5, CSS3, and JavaScript designed as an advanced alternative to LabSolutions software for water quality analytical testing.

---

## 🌟 Key Upgrades & Features in v2.0

- **💎 Extra Ordinary Glassmorphism Theme**
  - Futuristic dark glass theme with purple and cyan neon highlights.
  - White-frosted glass splash screen featuring a rotating neon loader spinner.

- **📈 Interactive Calibration Plot**
  - Custom HTML5 Canvas plotting engine requiring zero offline dependencies.
  - Interactive crosshairs and hover tooltip to view exact coordinates.
  - Supports canvas zooming (using the mouse scroll wheel).
  - Standard curve calculations (Slope, Intercept, and R² Linearity index).

- **💧 Water Quality WHO Limit Checks**
  - Real-time concentration calculator factoring in dilution corrections.
  - Automatic comparison against World Health Organization (WHO) and EPA standards.
  - Highlights out-of-bounds readings with visual color-coded alert badges (Safe vs. Exceeded).

- **⚙️ Langelier Saturation Index (LSI) Calculator**
  - Predictive chemical model for water corrosion and scale-forming index.
  - Input Water Temperature, pH, Calcium Hardness, Total Alkalinity, and TDS.
  - Returns sat pH ($pH_s$) along with a chemical verdict (Corrosive, Balanced, or Scale-Forming).

- **📥 Batch CSV Data Exports**
  - Export sample run data and concentration calculations directly to standard CSV formats.

---

## 🛠️ Development & Installation

### Prerequisites
Make sure you have [Node.js](https://nodejs.org/) installed.

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
3. Launch the application:
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

## 👤 Author
- **Pankaj Sharma** (Developer)
- Repository: [punitsharma16042003/CHEMLAB-PRO](https://github.com/punitsharma16042003/CHEMLAB-PRO)
