// API endpoint to extract biomarkers from uploaded files using OCR.space or local fallback
const FormData = require('form-data');
const pdfParse = require('pdf-parse');

// OCR.space API endpoint (free tier)
const OCR_SPACE_API_URL = 'https://api.ocr.space/parse/image';
const OCR_SPACE_API_KEY = process.env.OCR_SPACE_API_KEY || 'helloworld';

// Biomarker patterns for matching
const BIOMARKER_PATTERNS = [
  {
    id: 'hemoglobin',
    names: ['hemoglobin', 'hb', 'hgb'],
    unit: 'g/dL',
    regex: /hemoglobin[:\s]*(\d+\.?\d*)/gi
  },
  {
    id: 'glucose',
    names: ['glucose', 'blood sugar', 'fasting glucose', 'sugar'],
    unit: 'mg/dL',
    regex: /glucose[:\s]*(\d+\.?\d*)/gi
  },
  {
    id: 'cholesterol_total',
    names: ['total cholesterol', 'cholesterol total', 'cholesterol'],
    unit: 'mg/dL',
    regex: /(?:total\s+)?cholesterol[:\s]*(\d+\.?\d*)/gi
  },
  {
    id: 'hdl',
    names: ['hdl', 'hdl cholesterol', 'high density'],
    unit: 'mg/dL',
    regex: /hdl[:\s]*(\d+\.?\d*)/gi
  },
  {
    id: 'ldl',
    names: ['ldl', 'ldl cholesterol', 'low density'],
    unit: 'mg/dL',
    regex: /ldl[:\s]*(\d+\.?\d*)/gi
  },
  {
    id: 'triglycerides',
    names: ['triglycerides', 'triglyceride'],
    unit: 'mg/dL',
    regex: /triglycerides[:\s]*(\d+\.?\d*)/gi
  },
  {
    id: 'wbc',
    names: ['wbc', 'white blood cell', 'leukocyte', 'total leucocyte count', 'tlc'],
    unit: 'K/µL',
    regex: /(?:wbc|white\s+blood|leukocyte|leucocyte|tlc)[:\s]*(\d+\.?\d*)/gi
  },
  {
    id: 'rbc',
    names: ['rbc', 'red blood cell', 'erythrocyte'],
    unit: 'M/µL',
    regex: /(?:rbc|red\s+blood|erythrocyte)[:\s]*(\d+\.?\d*)/gi
  },
  {
    id: 'platelets',
    names: ['platelet', 'plt', 'thrombocyte', 'platelet count'],
    unit: 'K/µL',
    regex: /platelet[:\s]*(\d+\.?\d*)/gi
  },
  {
    id: 'creatinine',
    names: ['creatinine', 'creat', 'scr'],
    unit: 'mg/dL',
    regex: /creatinine[:\s]*(\d+\.?\d*)/gi
  },
  {
    id: 'alt',
    names: ['alt', 'alanine', 'sgpt', 'alanine aminotransferase'],
    unit: 'U/L',
    regex: /\balt\b[:\s]*(\d+\.?\d*)/gi
  },
  {
    id: 'ast',
    names: ['ast', 'aspartate', 'sgot', 'aspartate aminotransferase'],
    unit: 'U/L',
    regex: /\bast\b[:\s]*(\d+\.?\d*)/gi
  }
];

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    const { fileBuffer, fileType, fileName } = await parseMultipartFormData(req);
    
    console.log('File extracted:', fileName, 'Type:', fileType, 'Size:', fileBuffer.length);
    
    if (!fileBuffer || fileBuffer.length === 0) {
      return res.status(400).json({ error: 'No file content found' });
    }

    // Check file size (OCR.space free tier limit is ~1MB)
    const MAX_FILE_SIZE = 1024 * 1024; // 1MB
    if (fileBuffer.length > MAX_FILE_SIZE) {
      console.log('File too large for OCR.space, using local fallback');
    }
    
    let extractedText = '';
    let ocrError = null;
    
    // Try OCR.space first for images, or for small PDFs
    if (fileType !== 'application/pdf' || fileBuffer.length <= MAX_FILE_SIZE) {
      try {
        extractedText = await extractWithOCRSpace(fileBuffer, fileType);
        console.log('OCR.space extraction successful, text length:', extractedText.length);
      } catch (error) {
        console.error('OCR.space failed:', error.message);
        ocrError = error.message;
      }
    }
    
    // Fallback to local PDF parsing for PDFs
    if (!extractedText && fileType === 'application/pdf') {
      try {
        console.log('Trying local PDF parsing...');
        extractedText = await extractFromPDF(fileBuffer);
        console.log('Local PDF extraction successful, text length:', extractedText.length);
      } catch (error) {
        console.error('Local PDF parsing failed:', error.message);
        if (!ocrError) ocrError = error.message;
      }
    }
    
    if (!extractedText || extractedText.length < 10) {
      return res.status(400).json({
        error: `Could not extract text from file. ${ocrError || 'Try a clearer image or PDF.'}`,
        extractedText: extractedText || 'No text extracted',
        suggestions: [
          'Use a clearer, high-resolution image',
          'Ensure text is not blurry or rotated',
          'For PDFs, try converting to image first',
          'File may be password protected or corrupted'
        ]
      });
    }
    
    // Extract profile info and biomarkers
    const profile = extractProfile(extractedText);
    const biomarkers = extractBiomarkers(extractedText);
    
    console.log('Extracted biomarkers:', biomarkers.length);
    console.log('Profile:', profile);
    
    return res.json({
      success: true,
      biomarkers: biomarkers,
      biomarkersFound: biomarkers.length,
      extractedInfo: profile,
      extractedText: extractedText.substring(0, 2000),
      extractionMethod: ocrError ? 'local-fallback' : 'ocr-space'
    });
    
  } catch (error) {
    console.error('Extraction error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
};

async function parseMultipartFormData(req) {
  const contentType = req.headers['content-type'];
  if (!contentType || !contentType.includes('multipart/form-data')) {
    throw new Error('Invalid content type. Expected multipart/form-data');
  }

  const boundary = contentType.split('boundary=')[1];
  if (!boundary) {
    throw new Error('Boundary not found in content-type');
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const buffer = Buffer.concat(chunks);
  
  const boundaryBuffer = Buffer.from('--' + boundary);
  const endBoundaryBuffer = Buffer.from('--' + boundary + '--');
  
  let fileBuffer = null;
  let fileType = '';
  let fileName = 'unknown';
  
  let start = buffer.indexOf(boundaryBuffer);
  while (start !== -1) {
    const nextStart = buffer.indexOf(boundaryBuffer, start + boundaryBuffer.length);
    const end = nextStart !== -1 ? nextStart : buffer.indexOf(endBoundaryBuffer, start);
    
    if (end === -1) break;
    
    const part = buffer.slice(start + boundaryBuffer.length, end);
    const headerEnd = part.indexOf('\r\n\r\n');
    
    if (headerEnd !== -1) {
      const header = part.slice(0, headerEnd).toString();
      const content = part.slice(headerEnd + 4);
      // Remove trailing \r\n
      const cleanContent = content.slice(0, -2);
      
      if (header.includes('filename=')) {
        const nameMatch = header.match(/filename="([^"]+)"/);
        fileName = nameMatch ? nameMatch[1] : 'unknown';
        fileBuffer = cleanContent;
        
        // Detect file type by magic bytes
        if (cleanContent.length > 4) {
          // PDF: %PDF
          if (cleanContent[0] === 0x25 && cleanContent[1] === 0x50 && 
              cleanContent[2] === 0x44 && cleanContent[3] === 0x46) {
            fileType = 'application/pdf';
          }
          // PNG: 0x89 0x50 0x4E 0x47
          else if (cleanContent[0] === 0x89 && cleanContent[1] === 0x50) {
            fileType = 'image/png';
          }
          // JPEG: 0xFF 0xD8
          else if (cleanContent[0] === 0xFF && cleanContent[1] === 0xD8) {
            fileType = 'image/jpeg';
          }
          // GIF: GIF
          else if (cleanContent[0] === 0x47 && cleanContent[1] === 0x49 && cleanContent[2] === 0x46) {
            fileType = 'image/gif';
          }
          // BMP: BM
          else if (cleanContent[0] === 0x42 && cleanContent[1] === 0x4D) {
            fileType = 'image/bmp';
          }
        }
        
        console.log('Detected file type:', fileType, 'from magic bytes');
        break;
      }
    }
    
    start = nextStart;
  }
  
  if (!fileBuffer) {
    throw new Error('No file found in request');
  }
  
  return { fileBuffer, fileType, fileName };
}

async function extractWithOCRSpace(fileBuffer, fileType) {
  const form = new FormData();
  
  // Add API key (required for free tier)
  form.append('apikey', OCR_SPACE_API_KEY);
  
  // Add file
  const isPdf = fileType === 'application/pdf';
  const filename = isPdf ? 'document.pdf' : 'image.jpg';
  form.append('file', fileBuffer, filename);
  
  // OCR settings
  form.append('language', 'eng');
  form.append('isTable', 'true');
  form.append('OCREngine', '2');
  
  console.log('Sending request to OCR.space...');
  
  const response = await fetch(OCR_SPACE_API_URL, {
    method: 'POST',
    body: form,
    timeout: 30000 // 30 second timeout
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error('OCR.space HTTP error:', response.status, errorText);
    
    if (response.status === 403) {
      throw new Error('OCR.space rate limit exceeded or API key invalid. Using local fallback.');
    }
    if (response.status === 429) {
      throw new Error('OCR.space rate limit exceeded. Please try again later.');
    }
    if (response.status === 413) {
      throw new Error('File too large for OCR.space. Using local PDF parsing.');
    }
    
    throw new Error(`OCR.space API error: ${response.status}`);
  }
  
  const data = await response.json();
  console.log('OCR.space response:', JSON.stringify(data).substring(0, 300));
  
  if (data.OCRExitCode !== 1) {
    const errorMsg = data.ErrorMessage?.join(', ') || 'Unknown OCR error';
    console.error('OCR.space error:', errorMsg);
    throw new Error(`OCR failed: ${errorMsg}`);
  }
  
  if (data.ParsedResults && data.ParsedResults.length > 0) {
    return data.ParsedResults[0].ParsedText || '';
  }
  
  return '';
}

async function extractFromPDF(fileBuffer) {
  try {
    // pdf-parse needs the buffer directly
    const data = await pdfParse(fileBuffer);
    return data.text || '';
  } catch (error) {
    console.error('PDF parse error:', error);
    throw new Error(`PDF parsing failed: ${error.message}`);
  }
}

function extractProfile(text) {
  const profile = {};
  
  // Age extraction - various formats
  const agePatterns = [
    /(\d+)\s*(?:years?|yrs?|y\.?o\.?)/i,
    /age[:\s]*(\d+)/i,
    /(\d+)\s*\/\s*(?:male|female|m|f)/i
  ];
  
  for (const pattern of agePatterns) {
    const match = text.match(pattern);
    if (match) {
      profile.age = parseInt(match[1]);
      break;
    }
  }
  
  // Gender extraction
  const genderMatch = text.match(/\b(male|female|man|woman|m\b|f\b)/i);
  if (genderMatch) {
    const g = genderMatch[1].toLowerCase();
    profile.gender = ['male', 'man', 'm'].includes(g) ? 'male' : 'female';
  }
  
  // Check for Mr/Mrs/Ms/Miss titles
  if (text.match(/\bmrs\.?\b|\bmiss\b|\bms\.?\b/i)) {
    profile.gender = 'female';
  } else if (text.match(/\bmr\.?\b/i)) {
    profile.gender = 'male';
  }
  
  return profile;
}

function extractBiomarkers(text) {
  const biomarkers = [];
  const found = new Set();
  const lines = text.split('\n');
  
  // Method 1: Pattern matching on full text
  for (const pattern of BIOMARKER_PATTERNS) {
    if (found.has(pattern.id)) continue;
    
    // Reset lastIndex for global regex
    pattern.regex.lastIndex = 0;
    
    const match = pattern.regex.exec(text);
    if (match && match[1]) {
      const value = parseFloat(match[1]);
      if (!isNaN(value) && value > 0 && value < 10000) {
        biomarkers.push({
          id: pattern.id,
          name: pattern.names[0],
          value: value,
          unit: pattern.unit
        });
        found.add(pattern.id);
      }
    }
  }
  
  // Method 2: Line-by-line parsing for table formats
  for (const line of lines) {
    const cleanLine = line.toLowerCase().trim();
    
    for (const pattern of BIOMARKER_PATTERNS) {
      if (found.has(pattern.id)) continue;
      
      // Check if line contains biomarker name
      const nameMatch = pattern.names.some(name => 
        cleanLine.includes(name.toLowerCase())
      );
      
      if (nameMatch) {
        // Look for number in the same line
        const numMatch = line.match(/(\d+\.?\d*)/);
        if (numMatch) {
          const value = parseFloat(numMatch[1]);
          if (!isNaN(value) && value > 0 && value < 10000) {
            biomarkers.push({
              id: pattern.id,
              name: pattern.names[0],
              value: value,
              unit: pattern.unit
            });
            found.add(pattern.id);
            break;
          }
        }
      }
    }
  }
  
  return biomarkers;
}
