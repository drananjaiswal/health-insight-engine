// API endpoint to extract biomarkers from uploaded files using OCR.space
const FormData = require('form-data');
const fs = require('fs');

// OCR.space API endpoint (free tier)
const OCR_SPACE_API_URL = 'https://api.ocr.space/parse/image';
const OCR_SPACE_API_KEY = process.env.OCR_SPACE_API_KEY || 'helloworld';

// Biomarker patterns for matching
const BIOMARKER_PATTERNS = [
  {
    id: 'hemoglobin',
    names: ['hemoglobin', 'hb', 'hgb'],
    unit: 'g/dL',
    regex: /hemoglobin.*?[:=\s]+(\d+\.?\d*)/i
  },
  {
    id: 'glucose',
    names: ['glucose', 'blood sugar', 'fasting glucose', 'sugar'],
    unit: 'mg/dL',
    regex: /glucose.*?[:=\s]+(\d+\.?\d*)/i
  },
  {
    id: 'cholesterol_total',
    names: ['total cholesterol', 'cholesterol total', 'cholesterol'],
    unit: 'mg/dL',
    regex: /(?:total\s+)?cholesterol.*?[:=\s]+(\d+\.?\d*)/i
  },
  {
    id: 'hdl',
    names: ['hdl', 'hdl cholesterol', 'high density'],
    unit: 'mg/dL',
    regex: /hdl.*?[:=\s]+(\d+\.?\d*)/i
  },
  {
    id: 'ldl',
    names: ['ldl', 'ldl cholesterol', 'low density'],
    unit: 'mg/dL',
    regex: /ldl.*?[:=\s]+(\d+\.?\d*)/i
  },
  {
    id: 'triglycerides',
    names: ['triglycerides', 'triglyceride'],
    unit: 'mg/dL',
    regex: /triglycerides.*?[:=\s]+(\d+\.?\d*)/i
  },
  {
    id: 'wbc',
    names: ['wbc', 'white blood cell', 'leukocyte', 'total leucocyte count', 'tlc'],
    unit: 'K/µL',
    regex: /(?:wbc|white\s+blood|leukocyte|leucocyte|tlc).*?[:=\s]+(\d+\.?\d*)/i
  },
  {
    id: 'rbc',
    names: ['rbc', 'red blood cell', 'erythrocyte'],
    unit: 'M/µL',
    regex: /(?:rbc|red\s+blood|erythrocyte).*?[:=\s]+(\d+\.?\d*)/i
  },
  {
    id: 'platelets',
    names: ['platelet', 'plt', 'thrombocyte', 'platelet count'],
    unit: 'K/µL',
    regex: /platelet.*?[:=\s]+(\d+\.?\d*)/i
  },
  {
    id: 'creatinine',
    names: ['creatinine', 'creat', 'scr'],
    unit: 'mg/dL',
    regex: /creatinine.*?[:=\s]+(\d+\.?\d*)/i
  },
  {
    id: 'alt',
    names: ['alt', 'alanine', 'sgpt', 'alanine aminotransferase'],
    unit: 'U/L',
    regex: /\balt\b.*?[:=\s]+(\d+\.?\d*)/i
  },
  {
    id: 'ast',
    names: ['ast', 'aspartate', 'sgot', 'aspartate aminotransferase'],
    unit: 'U/L',
    regex: /\bast\b.*?[:=\s]+(\d+\.?\d*)/i
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
    
    // Use OCR.space API for text extraction
    const extractedText = await extractWithOCRSpace(fileBuffer, fileType);
    console.log('OCR Text length:', extractedText.length);
    
    if (!extractedText || extractedText.length < 10) {
      return res.status(400).json({
        error: 'Could not extract text from file. Try a clearer image or PDF.',
        extractedText: extractedText || 'No text extracted'
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
      extractedText: extractedText.substring(0, 1500)
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
  try {
    const FormData = require('form-data');
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
      body: form
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('OCR.space HTTP error:', response.status, errorText);
      throw new Error(`OCR.space API error: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('OCR.space response:', JSON.stringify(data).substring(0, 200));
    
    if (data.OCRExitCode !== 1) {
      console.error('OCR.space error:', data.ErrorMessage);
      throw new Error(`OCR failed: ${data.ErrorMessage?.join(', ')}`);
    }
    
    if (data.ParsedResults && data.ParsedResults.length > 0) {
      return data.ParsedResults[0].ParsedText || '';
    }
    
    return '';
    
  } catch (error) {
    console.error('OCR extraction error:', error);
    throw error;
  }
}

function extractProfile(text) {
  const profile = {};
  
  // Age extraction
  const ageMatch = text.match(/(\d+)\s*(?:years?|yrs?|y\.?o\.?)/i);
  if (ageMatch) {
    profile.age = parseInt(ageMatch[1]);
  }
  
  // Gender extraction
  const genderMatch = text.match(/\b(male|female|man|woman|m\b|f\b)/i);
  if (genderMatch) {
    const g = genderMatch[1].toLowerCase();
    profile.gender = g === 'male' || g === 'man' || g === 'm' ? 'male' : 'female';
  }
  
  return profile;
}

function extractBiomarkers(text) {
  const biomarkers = [];
  const found = new Set();
  
  for (const pattern of BIOMARKER_PATTERNS) {
    if (found.has(pattern.id)) continue;
    
    const match = text.match(pattern.regex);
    if (match && match[1]) {
      const value = parseFloat(match[1]);
      if (!isNaN(value) && value > 0) {
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
  
  return biomarkers;
}
