// API Endpoint: GET /api/biomarkers
// Returns list of supported biomarkers and their reference ranges

const BIOMARKERS = [
  { id: 'hemoglobin', name: 'Hemoglobin', category: 'Blood', unit: 'g/dL' },
  { id: 'glucose', name: 'Glucose (Fasting)', category: 'Metabolic', unit: 'mg/dL' },
  { id: 'cholesterol_total', name: 'Total Cholesterol', category: 'Lipid', unit: 'mg/dL' },
  { id: 'hdl', name: 'HDL Cholesterol', category: 'Lipid', unit: 'mg/dL' },
  { id: 'ldl', name: 'LDL Cholesterol', category: 'Lipid', unit: 'mg/dL' },
  { id: 'triglycerides', name: 'Triglycerides', category: 'Lipid', unit: 'mg/dL' },
  { id: 'wbc', name: 'White Blood Cells', category: 'Blood', unit: 'K/μL' },
  { id: 'rbc', name: 'Red Blood Cells', category: 'Blood', unit: 'M/μL' },
  { id: 'platelets', name: 'Platelet Count', category: 'Blood', unit: 'K/μL' },
  { id: 'creatinine', name: 'Creatinine', category: 'Kidney', unit: 'mg/dL' },
  { id: 'alt', name: 'ALT (SGPT)', category: 'Liver', unit: 'U/L' },
  { id: 'ast', name: 'AST (SGOT)', category: 'Liver', unit: 'U/L' }
];

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  
  res.status(200).json({
    success: true,
    count: BIOMARKERS.length,
    biomarkers: BIOMARKERS
  });
};