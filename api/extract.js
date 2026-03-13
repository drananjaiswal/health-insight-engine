// API Endpoint: POST /api/extract
// Extracts biomarker data from uploaded PDF or image files

const pdfParse = require('pdf-parse');
const formidable = require('formidable');
const fs = require('fs');
const path = require('path');

// Biomarker patterns for extraction
const BIOMARKER_PATTERNS = {
  // Blood markers
  hemoglobin: {
    patterns: [
      /hemoglobin[\s\w]*[:\s]+(\d+\.?\d*)\s*(g\/dL|g\/dl|g\/L)/i,
      /hb[\s\w]*[:\s]+(\d+\.?\d*)\s*(g\/dL|g\/dl|g\/L)/i,
      /hgb[\s\w]*[:\s]+(\d+\.?\d*)\s*(g\/dL|g\/dl|g\/L)/i
    ],
    id: 'hemoglobin',
    name: 'Hemoglobin',
    unit: 'g/dL'
  },
  glucose: {
    patterns: [
      /glucose[\s\(fasting\)]*[:\s]+(\d+)\s*(mg\/dL|mg\/dl)/i,
      /blood sugar[\s\w]*[:\s]+(\d+)\s*(mg\/dL|mg\/dl)/i,
      /fasting glucose[\s\w]*[:\s]+(\d+)\s*(mg\/dL|mg\/dl)/i
    ],
    id: 'glucose',
    name: 'Glucose (Fasting)',
    unit: 'mg/dL'
  },
  cholesterol_total: {
    patterns: [
      /total cholesterol[\s\w]*[:\s]+(\d+)\s*(mg\/dL|mg\/dl)/i,
      /cholesterol[\s,]*total[\s\w]*[:\s]+(\d+)\s*(mg\/dL|mg\/dl)/i
    ],
    id: 'cholesterol_total',
    name: 'Total Cholesterol',
    unit: 'mg/dL'
  },
  hdl: {
    patterns: [
      /hdl[\s\w]*[:\s]+(\d+)\s*(mg\/dL|mg\/dl)/i,
      /hdl cholesterol[\s\w]*[:\s]+(\d+)\s*(mg\/dL|mg\/dl)/i,
      /high[\s-]*density[\s\w]*[:\s]+(\d+)\s*(mg\/dL|mg\/dl)/i
    ],
    id: 'hdl',
    name: 'HDL Cholesterol',
    unit: 'mg/dL'
  },
  ldl: {
    patterns: [
      /ldl[\s\w]*[:\s]+(\d+)\s*(mg\/dL|mg\/dl)/i,
      /ldl cholesterol[\s\w]*[:\s]+(\d+)\s*(mg\/dL|mg\/dl)/i,
      /low[\s-]*density[\s\w]*[:\s]+(\d+)\s*(mg\/dL|mg\/dl)/i
    ],
    id: 'ldl',
    name: 'LDL Cholesterol',
    unit: 'mg/dL'
  },
  triglycerides: {
    patterns: [
      /triglycerides[\s\w]*[:\s]+(\d+)\s*(mg\/dL|mg\/dl)/i,
      /triglyceride[\s\w]*[:\s]+(\d+)\s*(mg\/dL|mg\/dl)/i
    ],
    id: 'triglycerides',
    name: 'Triglycerides',
    unit: 'mg/dL'
  },
  wbc: {
    patterns: [
      /wbc[\s\w]*[:\s]+(\d+\.?\d*)\s*(K\/μL|K\/ul|k\/ul|k\/μL|x10\^3)/i,
      /white blood cell[\s\w]*[:\s]+(\d+\.?\d*)\s*(K\/μL|K\/ul|k\/ul|k\/μL)/i,
      /leukocyte[\s\w]*[:\s]+(\d+\.?\d*)\s*(K\/μL|K\/ul|k\/ul|k\/μL)/i
    ],
    id: 'wbc',
    name: 'White Blood Cells',
    unit: 'K/μL'
  },
  rbc: {
    patterns: [
      /rbc[\s\w]*[:\s]+(\d+\.?\d*)\s*(M\/μL|M\/ul|m\/ul|m\/μL|x10\^6)/i,
      /red blood cell[\s\w]*[:\s]+(\d+\.?\d*)\s*(M\/μL|M\/ul|m\/ul|m\/μL)/i,
      /erythrocyte[\s\w]*[:\s]+(\d+\.?\d*)\s*(M\/μL|M\/ul|m\/ul|m\/μL)/i
    ],
    id: 'rbc',
    name: 'Red Blood Cells',
    unit: 'M/μL'
  },
  platelets: {
    patterns: [
      /platelet[\s\w]*[:\s]+(\d+)\s*(K\/μL|K\/ul|k\/ul|k\/μL)/i,
      /plt[\s\w]*[:\s]+(\d+)\s*(K\/μL|K\/ul|k\/ul|k\/μL)/i,
      /thrombocyte[\s\w]*[:\s]+(\d+)\s*(K\/μL|K\/ul|k\/ul|k\/μL)/i
    ],
    id: 'platelets',
    name: 'Platelet Count',
    unit: 'K/μL'
  },
  creatinine: {
    patterns: [
      /creatinine[\s\w]*[:\s]+(\d+\.?\d*)\s*(mg\/dL|mg\/dl)/i,
      /creat[\s\w]*[:\s]+(\d+\.?\d*)\s*(mg\/dL|mg\/dl)/i
    ],
    id: 'creatinine',
    name: 'Creatinine',
    unit: 'mg/dL'
  },
  alt: {
    patterns: [
      /alt[\s\w]*[:\s]+(\d+)\s*(U\/L|u\/l|units\/L)/i,
      /alanine[\s\w]*[:\s]+(\d+)\s*(U\/L|u\/l|units\/L)/i,
      /sgpt[\s\w]*[:\s]+(\d+)\s*(U\/L|u\/l|units\/L)/i
    ],
    id: 'alt',
    name: 'ALT (SGPT)',
    unit: 'U/L'
  },
  ast: {
    patterns: [
      /ast[\s\w]*[:\s]+(\d+)\s*(U\/L|u\/l|units\/L)/i,
      /aspartate[\s\w]*[:\s]+(\d+)\s*(U\/L|u\/l|units\/L)/i,
      /sgot[\s\w]*[:\s]+(\d+)\s*(U\/L|u\/l|units\/L)/i
    ],
    id: 'ast',
    name: 'AST (SGOT)',
    unit: 'U/L'
  }
};

// Extract biomarkers from text using pattern matching
function extractBiomarkersFromText(text) {
  const extracted = [];
  const foundMarkers = new Set();
  
  for (const [key, config] of Object.entries(BIOMARKER_PATTERNS)) {
    for (const pattern of config.patterns) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        const value = parseFloat(match[1]);
        if (!isNaN(value) && !foundMarkers.has(config.id)) {
          extracted.push({
            id: config.id,
            name: config.name,
            value: value,
            unit: config.unit,
            confidence: 'high'
          });
          foundMarkers.add(config.id);
          break; // Only take first match per marker
        }
      }
      if (foundMarkers.has(config.id)) break;
    }
  }
  
  return extracted;
}

// Clean up extracted text
function cleanText(text) {
  return text
    .replace(/\s+/g, ' ')
    .replace(/[^\x20-\x7E\n]/g, '') // Remove non-printable chars
    .trim();
}

module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  
  const tempDir = path.join('/tmp', 'uploads');
  
  try {
    // Ensure temp directory exists
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    // Parse form with file upload
    const form = new formidable.IncomingForm({
      uploadDir: tempDir,
      keepExtensions: true,
      maxFileSize: 10 * 1024 * 1024, // 10MB
      multiples: false
    });
    
    const [fields, files] = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err);
        else resolve([fields, files]);
      });
    });
    
    const file = files.file || files.report;
    
    if (!file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }
    
    const filePath = Array.isArray(file) ? file[0].filepath : file.filepath;
    const originalName = Array.isArray(file) ? file[0].originalFilename : file.originalFilename;
    const mimeType = Array.isArray(file) ? file[0].mimetype : file.mimetype;
    
    let extractedText = '';
    let biomarkers = [];
    let ocrUsed = false;
    
    // Handle different file types
    if (mimeType === 'application/pdf' || originalName?.toLowerCase().endsWith('.pdf')) {
      // Parse PDF
      const pdfBuffer = fs.readFileSync(filePath);
      const pdfData = await pdfParse(pdfBuffer);
      extractedText = cleanText(pdfData.text);
      
    } else if (mimeType?.startsWith('image/') || 
               /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(originalName || '')) {
      // Use OCR for images
      // Note: In production, you'd use tesseract.js here
      // For Vercel serverless, we'll use a simpler approach or return a message
      ocrUsed = true;
      
      // Try to use tesseract if available
      try {
        const { createWorker } = require('tesseract.js');
        const worker = await createWorker('eng');
        const result = await worker.recognize(filePath);
        extractedText = cleanText(result.data.text);
        await worker.terminate();
      } catch (ocrError) {
        // If OCR fails, return partial results
        console.log('OCR not available, returning file info');
        res.status(200).json({
          success: true,
          partial: true,
          message: 'Image uploaded. OCR processing requires additional setup. Please enter values manually or use PDF format.',
          filename: originalName,
          mimeType: mimeType,
          textPreview: ''
        });
        
        // Clean up
        fs.unlinkSync(filePath);
        return;
      }
      
    } else {
      res.status(400).json({ 
        error: 'Unsupported file type. Please upload PDF or image (JPG, PNG)' 
      });
      return;
    }
    
    // Extract biomarkers from text
    biomarkers = extractBiomarkersFromText(extractedText);
    
    // Clean up temp file
    fs.unlinkSync(filePath);
    
    // Also try to extract patient info
    const ageMatch = extractedText.match(/age[:\s]+(\d+)/i) || 
                     extractedText.match(/(\d+)\s*(years?|yrs?)/i);
    const genderMatch = extractedText.match(/gender[:\s]+(male|female)/i) ||
                        extractedText.match(/(male|female)/i);
    
    res.status(200).json({
      success: true,
      filename: originalName,
      mimeType: mimeType,
      ocrUsed: ocrUsed,
      extractedInfo: {
        age: ageMatch ? parseInt(ageMatch[1]) : null,
        gender: genderMatch ? genderMatch[1].toLowerCase() : null
      },
      biomarkersFound: biomarkers.length,
      biomarkers: biomarkers,
      textPreview: extractedText.substring(0, 500) + (extractedText.length > 500 ? '...' : ''),
      confidence: biomarkers.length > 0 ? 'high' : 'low'
    });
    
  } catch (error) {
    console.error('Extraction error:', error);
    res.status(500).json({ 
      error: 'Extraction failed', 
      message: error.message 
    });
    
    // Clean up on error
    try {
      const files = fs.readdirSync(tempDir);
      files.forEach(f => fs.unlinkSync(path.join(tempDir, f)));
    } catch (e) {
      // Ignore cleanup errors
    }
  }
};