# Health Insight Engine

A Vercel-deployable web application that interprets biomarker values against personalized reference ranges and generates plain-language health insights.

## Features

- **📄 Automatic Extraction**: Upload PDF or image files to automatically extract biomarker values
- **📱 Mobile-First Design**: Responsive UI optimized for all screen sizes
- **📊 Dynamic Biomarker Entry**: Add multiple biomarkers manually or upload reports
- **🔬 Personalized Analysis**: Reference ranges adjusted for age, gender, and demographics
- **📈 Visual Charts**: Interactive Chart.js visualization of results
- **💾 Export Options**: Download results as JSON or PDF
- **🔒 Privacy First**: No persistent storage - all processing happens in-session

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/extract` | POST | Extract biomarkers from PDF/image files |
| `/api/analyze` | POST | Analyze biomarkers against personalized ranges |
| `/api/biomarkers` | GET | Get list of supported biomarkers |

### POST /api/extract

Upload a PDF or image file to automatically extract biomarker values.

**Request:** `multipart/form-data` with file field named `file`

**Supported formats:** PDF, JPG, JPEG, PNG

Response:
```json
{
  "success": true,
  "filename": "lab-report.pdf",
  "biomarkersFound": 5,
  "extractedInfo": {
    "age": 35,
    "gender": "male"
  },
  "biomarkers": [
    {
      "id": "hemoglobin",
      "name": "Hemoglobin",
      "value": 14.2,
      "unit": "g/dL",
      "confidence": "high"
    }
  ]
}
```

### POST /api/analyze

Request body:
```json
{
  "profile": {
    "age": 35,
    "gender": "male",
    "region": "us",
    "lifestyle": "moderate"
  },
  "biomarkers": [
    { "id": "hemoglobin", "value": 14.2 },
    { "id": "glucose", "value": 95 }
  ]
}
```

Response:
```json
{
  "success": true,
  "timestamp": "2025-01-15T10:30:00Z",
  "profile": { ... },
  "summary": {
    "totalBiomarkers": 9,
    "normal": 8,
    "low": 0,
    "high": 1,
    "healthScore": 89
  },
  "byCategory": { ... },
  "biomarkers": [ ... ]
}
```

## Supported Biomarkers

- Hemoglobin (Blood)
- Glucose - Fasting (Metabolic)
- Total Cholesterol (Lipid)
- HDL Cholesterol (Lipid)
- LDL Cholesterol (Lipid)
- Triglycerides (Lipid)
- White Blood Cells (Blood)
- Red Blood Cells (Blood)
- Platelet Count (Blood)
- Creatinine (Kidney)
- ALT/SGPT (Liver)
- AST/SGOT (Liver)

## Deployment

### Prerequisites

- [Vercel CLI](https://vercel.com/download) installed
- Node.js 18+

### Deploy to Vercel

1. **Install Vercel CLI** (if not already installed):
   ```bash
   npm i -g vercel
   ```

2. **Deploy**:
   ```bash
   cd health-engine
   vercel --prod
   ```

3. **Or use Git integration**:
   - Push to GitHub/GitLab
   - Import project in Vercel dashboard
   - Deploy automatically on push

### Local Development

```bash
# Install dependencies
npm install

# Run local dev server
vercel dev
```

## Project Structure

```
health-engine/
├── api/
│   ├── analyze.js      # Main analysis API
│   └── biomarkers.js   # Biomarkers list API
├── public/
│   └── index.html      # Frontend application
├── package.json
├── vercel.json         # Vercel configuration
└── README.md
```

## Customization

### Adding New Biomarkers

Edit `api/analyze.js` and add to `BIOMARKER_DATABASE`:

```javascript
new_biomarker: {
  id: 'new_biomarker',
  category: 'Category',
  name: 'Biomarker Name',
  unit: 'unit',
  baseRanges: {
    male: { min: 10, max: 50 },
    female: { min: 10, max: 50 },
    other: { min: 10, max: 50 }
  },
  interpretations: {
    low: 'Interpretation for low value',
    normal: 'Interpretation for normal value',
    high: 'Interpretation for high value'
  },
  recommendations: {
    low: 'Recommendation for low value',
    normal: 'Recommendation for normal value',
    high: 'Recommendation for high value'
  }
}
```

### Modifying Reference Ranges

Reference ranges can be adjusted in the `BIOMARKER_DATABASE` object in `api/analyze.js`. The system supports:

- Gender-specific base ranges
- Age-based adjustments (child/adult/senior)
- Lifestyle factors (future extensibility)

## ⚠️ Disclaimer

This tool provides health information for **educational purposes only** and is not a substitute for professional medical advice, diagnosis, or treatment. Always seek the advice of your physician or other qualified health provider with any questions you may have regarding a medical condition.

## License

MIT