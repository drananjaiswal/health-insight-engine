// API Endpoint: POST /api/extract
// Extracts biomarker data from uploaded PDF or image files
// Optimized for Vercel Serverless Functions

const pdfParse = require('pdf-parse');

// Biomarker patterns for extraction - comprehensive regex patterns
const BIOMARKER_PATTERNS = {
  hemoglobin: {
    patterns: [
      /hemoglobin[:\s]+(\d+\.?\d*)\s*(g\/dL|g dl|g\/L)/i,
      /hemoglobin\s*\(?\s*hb\s*\)?[:\s]+(\d+\.?\d*)/i,
      /\bhgb?\b[:\s]+(\d+\.?\d*)/i,
      /hemoglobin.*?result[:\s]+(\d+\.?\d*)/i
    ],
    id: 'hemoglobin',
    name: 'Hemoglobin',
    unit: 'g/dL'
  },
  glucose: {
    patterns: [
      /glucose\s*(?:\(fasting\)|fasting)?[:\s]+(\d+)\s*(mg\/dL|mg dl)/i,
      /blood\s+sugar[:\s]+(\d+)\s*(mg\/dL|mg dl)/i,
      /glucose.*?result[:\s]+(\d+)/i
    ],
    id: 'glucose',
    name: 'Glucose (Fasting)',
    unit: 'mg/dL'
  },
  cholesterol_total: {
    patterns: [
      /total\s+cholesterol[:\s]+(\d+)\s*(mg\/dL|mg dl)/i,
      /cholesterol[,\s]*total[:\s]+(\d+)/i,
      /cholesterol[:\s]+(\d+)\s*(?:mg\/dL|mg dl).*total/i
    ],
    id: 'cholesterol_total',
    name: 'Total Cholesterol',
    unit: 'mg/dL'
  },
  hdl: {
    patterns: [
      /hdl[:\s]+(\d+)\s*(mg\/dL|mg dl)/i,
      /hdl\s*cholesterol[:\s]+(\d+)/i,
      /high[\s-]*density[:\s]+(\d+)/i
    ],
    id: 'hdl',
    name: 'HDL Cholesterol',
    unit: 'mg/dL'
  },
  ldl: {
    patterns: [
      /ldl[:\s]+(\d+)\s*(mg\/dL|mg dl)/i,
      /ldl\s*cholesterol[:\s]+(\d+)/i,
      /low[\s-]*density[:\s]+(\d+)/i
    ],
    id: 'ldl',
    name: 'LDL Cholesterol',
    unit: 'mg/dL'
  },
  triglycerides: {
    patterns: [
      /triglycerides?[:\s]+(\d+)\s*(mg\/dL|mg dl)/i
    ],
    id: 'triglycerides',
    name: 'Triglycerides',
    unit: 'mg/dL'
  },
  wbc: {
    patterns: [
      /wbc[:\s]+(\d+\.?\d*)\s*(K\/?μ?L|thousand|x10\^3)/i,
      /white\s*blood\s*(?:cell|count)[:\s]+(\d+\.?\d*)/i,
      /leukocytes?[:\s]+(\d+\.?\d*)/i
    ],
    id: 'wbc',
    name: 'White Blood Cells',
    unit: 'K/μL'
  },
  rbc: {
    patterns: [
      /rbc[:\s]+(\d+\.?\d*)\s*(M\/?μ?L|million|x10\^6)/i,
      /red\s*blood\s*(?:cell|count)[:\s]+(\d+\.?\d*)/i,
      /erythrocytes?[:\s]+(\d+\.?\d*)/i
    ],
    id: 'rbc',
    name: 'Red Blood Cells',
    unit: 'M/μL'
  },
  platelets: {
    patterns: [
      /platelets?[:\s]+(\d+)\s*(K\/?μ?L|thousand)/i,
      /plt[:\s]+(\d+)/i,
      /thrombocytes?[:\s]+(\d+)/i
    ],
    id: 'platelets',
    name: 'Platelet Count',
    unit: 'K/μL'
  },
  creatinine: {
    patterns: [
      /creatinine[:\s]+(\d+\.?\d*)\s*(mg\/dL|mg dl)/i
    ],
    id: 'creatinine',
    name: 'Creatinine',
    unit: 'mg/dL'
  },
  alt: {
    patterns: [
      /alt[:\s]+(\d+)\s*(U\/L|u\/l|units)/i,
      /alanine\s*aminotransferase[:\s]+(\d+)/i,
      /sgpt[:\s]+(\d+)/i
    ],
    id: 'alt',
    name: 'ALT (SGPT)',
    unit: 'U/L'
  },
  ast: {
    patterns: [
      /ast[:\s]+(\d+)\s*(U\/L|u\/l|units)/i,
      /aspartate\s*aminotransferase[:\s]+(\d+)/i,
      /sgot[:\s]+(\d+)/i
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
      const match = text.match(pattern);
      if (match) {
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
    }
  }
  
  return extracted;
}

// Clean up extracted text
function cleanText(text) {
  if (!text) return '';
  return text
    .replace(/\s+/g, ' ')
    .replace(/[^\x20-\x7E\n\r]/g, ' ') // Replace non-printable with space
    .trim();
}

// Parse multipart form data manually for Vercel compatibility
function parseMultipartFormData(buffer, boundary) {
  const parts = [];
  const boundaryBuffer = Buffer.from(`--${boundary}`);
  let start = buffer.indexOf(boundaryBuffer);
  
  while (start !== -1) {
    let end = buffer.indexOf(boundaryBuffer, start + boundaryBuffer.length);
    if (end === -1) break;
    
    const part = buffer.slice(start + boundaryBuffer.length, end);
    const headerEnd = part.indexOf('\r\n\r\n');
    
    if (headerEnd !== -1) {
      const headers = part.slice(0, headerEnd).toString();
      const content = part.slice(headerEnd + 4, part.length - 2); // Remove trailing \r\n
      
      const nameMatch = headers.match(/name="([^"]+)"/);
      const filenameMatch = headers.match(/filename="([^"]+)"/);
      const contentTypeMatch = headers.match(/Content-Type:\s*([^\r\n]+)/i);
      
      if (nameMatch) {
        parts.push({
          name: nameMatch[1],
          filename: filenameMatch ? filenameMatch[1] : null,
          contentType: contentTypeMatch ? contentTypeMatch[1].trim() : null,
          data: content
        });
      }
    }
    
    start = end;
  }
  
  return parts;
}

module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Content-Length');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  
  try {
    console.log('Extract API called');
    
    // Get content type and boundary
    const contentType = req.headers['content-type'] || '';
    console.log('Content-Type:', contentType);
    
    if (!contentType.includes('multipart/form-data')) {
      return res.status(400).json({ 
        error: 'Invalid content type. Expected multipart/form-data' 
      });
    }
    
    // Extract boundary
    const boundaryMatch = contentType.match(/boundary=([^;]+)/);
    if (!boundaryMatch) {
      return res.status(400).json({ error: 'No boundary found in content-type' });
    }
    const boundary = boundaryMatch[1].trim().replace(/['"]/g, '');
    console.log('Boundary:', boundary);
    
    // Collect raw body data
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);
    console.log('Received buffer size:', buffer.length);
    
    if (buffer.length === 0) {
      return res.status(400).json({ error: 'No file data received' });
    }
    
    // Parse multipart form
    const parts = parseMultipartFormData(buffer, boundary);
    console.log('Parsed parts:', parts.length);
    
    // Find file part
    const filePart = parts.find(p => p.filename && p.data.length > 0);
    if (!filePart) {
      return res.status(400).json({ error: 'No file found in upload' });
    }
    
    console.log('File found:', filePart.filename, 'Type:', filePart.contentType);
    
    let extractedText = '';
    let biomarkers = [];
    let ocrUsed = false;
    
    // Handle PDF files
    const isPDF = filePart.filename.toLowerCase().endsWith('.pdf') || 
                  filePart.contentType === 'application/pdf';
    
    const isImage = filePart.contentType?.startsWith('image/') ||
                    /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(filePart.filename);
    
    if (isPDF) {
      console.log('Processing PDF...');
      try {
        const pdfData = await pdfParse(filePart.data);
        extractedText = cleanText(pdfData.text);
        console.log('PDF text extracted, length:', extractedText.length);
      } catch (pdfError) {
        console.error('PDF parsing error:', pdfError.message);
        return res.status(500).json({
          error: 'Failed to parse PDF',
          message: pdfError.message
        });
      }
    } else if (isImage) {
      console.log('Image uploaded, OCR not available in this deployment');
      ocrUsed = true;
      return res.status(200).json({
        success: true,
        partial: true,
        message: 'Image uploaded. OCR processing is not available in serverless environment. Please use PDF format or enter values manually.',
        filename: filePart.filename,
        mimeType: filePart.contentType,
        biomarkers: [],
        extractedInfo: {}
      });
    } else {
      return res.status(400).json({
        error: 'Unsupported file type',
        message: 'Please upload PDF or image (JPG, PNG)'
      });
    }
    
    // Extract biomarkers from text
    biomarkers = extractBiomarkersFromText(extractedText);
    console.log('Biomarkers found:', biomarkers.length);
    
    // Extract patient info
    const ageMatch = extractedText.match(/age[:\s]+(\d+)/i) || 
                     extractedText.match(/(\d+)\s*(?:years?|yrs?)/i);
    const genderMatch = extractedText.match(/gender[:\s]+(male|female)/i) ||
                        extractedText.match(/\b(male|female)\b/i);
    
    const response = {
      success: true,
      filename: filePart.filename,
      mimeType: filePart.contentType,
      ocrUsed: ocrUsed,
      extractedInfo: {
        age: ageMatch ? parseInt(ageMatch[1]) : null,
        gender: genderMatch ? genderMatch[1].toLowerCase() : null
      },
      biomarkersFound: biomarkers.length,
      biomarkers: biomarkers,
      textPreview: extractedText.substring(0, 500) + (extractedText.length > 500 ? '...' : ''),
      confidence: biomarkers.length > 0 ? 'high' : 'low'
    };
    
    console.log('Sending response with', biomarkers.length, 'biomarkers');
    res.status(200).json(response);
    
  } catch (error) {
    console.error('Extraction error:', error);
    res.status(500).json({ 
      error: 'Extraction failed', 
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};