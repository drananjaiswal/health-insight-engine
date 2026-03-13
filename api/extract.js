// /api/extract.js - Fixed OCR.space API integration
const pdfParse = require('pdf-parse');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Parse multipart form data manually for Vercel
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
  
  console.log(`Total request size: ${buffer.length} bytes`);

  const boundaryBuffer = Buffer.from(`--${boundary}`);
  const endBoundaryBuffer = Buffer.from(`--${boundary}--`);
  
  let parts = [];
  let start = 0;
  
  while (true) {
    const boundaryIndex = buffer.indexOf(boundaryBuffer, start);
    if (boundaryIndex === -1) break;
    
    const nextBoundary = buffer.indexOf(boundaryBuffer, boundaryIndex + boundaryBuffer.length);
    const endIndex = nextBoundary !== -1 ? nextBoundary : buffer.indexOf(endBoundaryBuffer, boundaryIndex);
    
    if (endIndex === -1) break;
    
    const part = buffer.slice(boundaryIndex + boundaryBuffer.length, endIndex);
    parts.push(part);
    start = endIndex;
  }

  let fileBuffer = null;
  let fileName = null;
  let fileType = null;

  for (const part of parts) {
    const headerEnd = part.indexOf('\r\n\r\n');
    if (headerEnd === -1) continue;
    
    const header = part.slice(0, headerEnd).toString();
    const content = part.slice(headerEnd + 4);
    const cleanContent = content.slice(0, content.length - 2);
    
    if (header.includes('filename=')) {
      const nameMatch = header.match(/filename="([^"]+)"/);
      fileName = nameMatch ? nameMatch[1] : 'unknown';
      fileBuffer = cleanContent;
      
      if (cleanContent.slice(0, 4).toString() === '%PDF') {
        fileType = 'application/pdf';
      } else if (cleanContent.slice(0, 8).toString().includes('PNG')) {
        fileType = 'image/png';
      } else if (cleanContent.slice(0, 3).toString() === 'GIF') {
        fileType = 'image/gif';
      } else if (cleanContent.slice(0, 2).toString() === 'BM') {
        fileType = 'image/bmp';
      } else if (cleanContent[0] === 0xFF && cleanContent[1] === 0xD8) {
        fileType = 'image/jpeg';
      } else {
        fileType = 'application/octet-stream';
      }
      
      console.log(`Found file: ${fileName}, type: ${fileType}, size: ${fileBuffer.length} bytes`);
    }
  }

  if (!fileBuffer) {
    throw new Error('No file found in request');
  }

  return { fileBuffer, fileName, fileType };
}

// Extract text using OCR.space API
async function extractWithOCRSpace(fileBuffer, fileType) {
  console.log('Using OCR.space API for extraction...');
  
  try {
    // Create form data using FormData API
    const FormData = require('form-data');
    const form = new FormData();
    
    // Add the file
    const isPdf = fileType === 'application/pdf';
    const filename = isPdf ? 'document.pdf' : 'image.jpg';
    
    form.append('file', fileBuffer, {
      filename: filename,
      contentType: isPdf ? 'application/pdf' : 'image/jpeg',
    });
    
    // Add other parameters
    form.append('language', 'eng');
    form.append('isCreateSearchablePdf', 'false');
    form.append('isSearchablePdfHideTextLayer', 'false');
    form.append('scale', 'true');
    form.append('detectOrientation', 'true');
    form.append('OCREngine', '2');
    
    console.log('Sending request to OCR.space API...');
    
    const https = require('https');
    
    return new Promise((resolve, reject) => {
      const requestOptions = {
        hostname: 'api.ocr.space',
        path: '/parse/image',
        method: 'POST',
        headers: {
          ...form.getHeaders(),
        },
      };
      
      const request = https.request(requestOptions, (response) => {
        let data = '';
        
        response.on('data', (chunk) => {
          data += chunk;
        });
        
        response.on('end', () => {
          try {
            console.log('OCR.space raw response:', data.substring(0, 500));
            
            // Check if response is HTML (error page)
            if (data.trim().startsWith('<') || data.trim().startsWith('<!')) {
              reject(new Error('OCR.space returned HTML error page'));
              return;
            }
            
            const result = JSON.parse(data);
            console.log('OCR.space parsed response:', JSON.stringify(result, null, 2));
            
            if (result.IsErroredOnProcessing) {
              reject(new Error(`OCR Error: ${result.ErrorMessage || 'Unknown error'}`));
              return;
            }
            
            if (!result.ParsedResults || result.ParsedResults.length === 0) {
              reject(new Error('No text found in document'));
              return;
            }
            
            let extractedText = '';
            for (const parsedResult of result.ParsedResults) {
              extractedText += parsedResult.ParsedText + '\n';
            }
            
            console.log('OCR.space extracted text length:', extractedText.length);
            resolve(extractedText);
            
          } catch (parseError) {
            reject(new Error(`Failed to parse OCR response: ${parseError.message}`));
          }
        });
      });
      
      request.on('error', (error) => {
        reject(new Error(`OCR.space request failed: ${error.message}`));
      });
      
      // Pipe form data to request
      form.pipe(request);
    });
    
  } catch (error) {
    console.error('OCR.space API error:', error);
    throw error;
  }
}

// Fallback to local PDF parsing
async function extractWithLocalPDF(fileBuffer) {
  console.log('Using local PDF parsing...');
  
  const tempDir = os.tmpdir();
  const tempFile = path.join(tempDir, `upload-${Date.now()}.pdf`);
  
  try {
    fs.writeFileSync(tempFile, fileBuffer);
    console.log(`Saved PDF to ${tempFile}`);
    
    const dataBuffer = fs.readFileSync(tempFile);
    const pdfData = await pdfParse(dataBuffer);
    
    console.log('PDF parsed successfully, text length:', pdfData.text.length);
    return pdfData.text;
    
  } catch (error) {
    console.error('PDF parsing error:', error);
    throw error;
    
  } finally {
    try {
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
        console.log(`Cleaned up ${tempFile}`);
      }
    } catch (e) {
      console.error('Cleanup error:', e);
    }
  }
}

// Enhanced biomarker extraction
function extractBiomarkersFromText(text) {
  console.log('\n=== Starting biomarker extraction ===');
  console.log('Text preview:', text.substring(0, 500));
  
  const biomarkers = [];
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  
  const patterns = [
    {
      id: 'hemoglobin',
      names: ['hemoglobin', 'hb', 'hgb', 'haemoglobin'],
      unit: 'g/dL',
      category: 'Blood',
      patterns: [
        /hemoglobin[\s:)*]*(\d+\.?\d*)\s*(g\/dL|gm\/dL|g%|g\/dl)/i,
        /hb[\s:)*]*(\d+\.?\d*)\s*(g\/dL|gm\/dL|g%|g\/dl)/i,
        /(\d+\.?\d*)\s*(g\/dL|gm\/dL|g%|g\/dl).*hemoglobin/i,
      ]
    },
    {
      id: 'glucose',
      names: ['glucose', 'sugar', 'fasting glucose', 'blood sugar'],
      unit: 'mg/dL',
      category: 'Metabolic',
      patterns: [
        /glucose[\s:fasting)*]*(\d+\.?\d*)\s*(mg\/dL|mg\/dl|mg%)/i,
        /sugar[\s:fastingblood)*]*(\d+\.?\d*)\s*(mg\/dL|mg\/dl|mg%)/i,
        /(\d+\.?\d*)\s*(mg\/dL|mg\/dl|mg%).*glucose/i,
      ]
    },
    {
      id: 'total_cholesterol',
      names: ['total cholesterol', 'cholesterol total', 'cholesterol'],
      unit: 'mg/dL',
      category: 'Lipid',
      patterns: [
        /total[\s]*cholesterol[\s:)*]*(\d+\.?\d*)\s*(mg\/dL|mg\/dl|mg%)/i,
        /cholesterol[\s:)*]*(\d+\.?\d*)\s*(mg\/dL|mg\/dl|mg%)/i,
        /(\d+\.?\d*)\s*(mg\/dL|mg\/dl|mg%).*cholesterol/i,
      ]
    },
    {
      id: 'hdl',
      names: ['hdl', 'hdl cholesterol', 'good cholesterol'],
      unit: 'mg/dL',
      category: 'Lipid',
      patterns: [
        /hdl[\s:)*]*(\d+\.?\d*)\s*(mg\/dL|mg\/dl|mg%)/i,
        /(\d+\.?\d*)\s*(mg\/dL|mg\/dl|mg%).*hdl/i,
      ]
    },
    {
      id: 'ldl',
      names: ['ldl', 'ldl cholesterol', 'bad cholesterol'],
      unit: 'mg/dL',
      category: 'Lipid',
      patterns: [
        /ldl[\s:)*]*(\d+\.?\d*)\s*(mg\/dL|mg\/dl|mg%)/i,
        /(\d+\.?\d*)\s*(mg\/dL|mg\/dl|mg%).*ldl/i,
      ]
    },
    {
      id: 'triglycerides',
      names: ['triglycerides', 'triglyceride'],
      unit: 'mg/dL',
      category: 'Lipid',
      patterns: [
        /triglycerides?[\s:)*]*(\d+\.?\d*)\s*(mg\/dL|mg\/dl|mg%)/i,
        /(\d+\.?\d*)\s*(mg\/dL|mg\/dl|mg%).*triglycerides?/i,
      ]
    },
    {
      id: 'wbc',
      names: ['wbc', 'white blood cell', 'leukocyte', 'total leucocyte count'],
      unit: '×10³/µL',
      category: 'Blood',
      patterns: [
        /wbc[\s:)*]*(\d+\.?\d*)\s*(10\^3|x10\^3|×10³|\/µL|\/ul)/i,
        /white[\s]*blood[\s]*cell[\s:)*]*(\d+\.?\d*)/i,
        /leucocyte[\s:)*]*(\d+\.?\d*)/i,
        /tlc[\s:)*]*(\d+\.?\d*)/i,
      ]
    },
    {
      id: 'rbc',
      names: ['rbc', 'red blood cell', 'erythrocyte'],
      unit: '×10⁶/µL',
      category: 'Blood',
      patterns: [
        /rbc[\s:)*]*(\d+\.?\d*)\s*(10\^6|x10\^6|×10⁶|\/µL|\/ul)/i,
        /red[\s]*blood[\s]*cell[\s:)*]*(\d+\.?\d*)/i,
        /erythrocyte[\s:)*]*(\d+\.?\d*)/i,
      ]
    },
    {
      id: 'platelets',
      names: ['platelet', 'platelets', 'plt', 'thrombocyte'],
      unit: '×10³/µL',
      category: 'Blood',
      patterns: [
        /platelets?[\s:)*]*(\d+\.?\d*)\s*(10\^3|x10\^3|×10³|\/µL|\/ul)/i,
        /plt[\s:)*]*(\d+\.?\d*)/i,
      ]
    },
    {
      id: 'creatinine',
      names: ['creatinine', 'creat', 's creatinine'],
      unit: 'mg/dL',
      category: 'Kidney',
      patterns: [
        /creatinine[\s:)*]*(\d+\.?\d*)\s*(mg\/dL|mg\/dl)/i,
        /s\.?\s*creatinine[\s:)*]*(\d+\.?\d*)/i,
      ]
    },
    {
      id: 'alt',
      names: ['alt', 'alanine aminotransferase', 'sgpt'],
      unit: 'U/L',
      category: 'Liver',
      patterns: [
        /alt[\s:)*]*(\d+\.?\d*)\s*(U\/L|u\/l|IU\/L)/i,
        /sgpt[\s:)*]*(\d+\.?\d*)/i,
      ]
    },
    {
      id: 'ast',
      names: ['ast', 'aspartate aminotransferase', 'sgot'],
      unit: 'U/L',
      category: 'Liver',
      patterns: [
        /ast[\s:)*]*(\d+\.?\d*)\s*(U\/L|u\/l|IU\/L)/i,
        /sgot[\s:)*]*(\d+\.?\d*)/i,
      ]
    },
  ];
  
  // Method 1: Direct regex matching
  console.log('\n--- Trying direct regex matching ---');
  for (const pattern of patterns) {
    for (const regex of pattern.patterns) {
      const match = text.match(regex);
      if (match) {
        const value = parseFloat(match[1]);
        if (value > 0 && value < 10000) {
          // Check if not already found
          if (!biomarkers.find(b => b.id === pattern.id)) {
            biomarkers.push({
              id: pattern.id,
              name: pattern.names[0].charAt(0).toUpperCase() + pattern.names[0].slice(1),
              value: value,
              unit: pattern.unit,
              category: pattern.category
            });
            console.log(`✓ Extracted: ${pattern.id} = ${value} ${pattern.unit}`);
          }
        }
      }
    }
  }
  
  // Method 2: Line-by-line extraction
  console.log('\n--- Trying line-by-line extraction ---');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].toLowerCase();
    
    for (const pattern of patterns) {
      // Skip if already found
      if (biomarkers.find(b => b.id === pattern.id)) continue;
      
      const hasName = pattern.names.some(name => line.includes(name.toLowerCase()));
      
      if (hasName) {
        // Look for number in this line or next 2 lines
        for (let j = i; j < Math.min(i + 3, lines.length); j++) {
          const searchLine = lines[j];
          const numberMatch = searchLine.match(/(\d+\.?\d*)/);
          
          if (numberMatch) {
            const value = parseFloat(numberMatch[1]);
            
            if (value > 0 && value < 10000) {
              biomarkers.push({
                id: pattern.id,
                name: pattern.names[0].charAt(0).toUpperCase() + pattern.names[0].slice(1),
                value: value,
                unit: pattern.unit,
                category: pattern.category
              });
              console.log(`✓ Extracted (nearby): ${pattern.id} = ${value} ${pattern.unit}`);
              break;
            }
          }
        }
      }
    }
  }
  
  // Deduplicate
  const uniqueBiomarkers = [];
  const seen = new Set();
  for (const b of biomarkers) {
    if (!seen.has(b.id)) {
      seen.add(b.id);
      uniqueBiomarkers.push(b);
    }
  }
  
  console.log(`\n=== Extraction complete: ${uniqueBiomarkers.length} biomarkers found ===`);
  return uniqueBiomarkers;
}

// Extract patient info
function extractPatientInfo(text) {
  const info = { age: null, gender: null, region: null };
  
  console.log('\n=== Extracting patient info ===');
  
  const agePatterns = [
    /age\s*[:\/\s]*\s*(\d+)\s*(years?|yrs?|y)?/i,
    /(\d+)\s*(years?|yrs?|y)\s*(old)?/i,
    /age\s*[:\/\s]*\s*(\d+)/i,
    /(\d+)\s*y\/o/i,
  ];
  
  for (const pattern of agePatterns) {
    const match = text.match(pattern);
    if (match) {
      info.age = parseInt(match[1]);
      console.log('✓ Found age:', info.age);
      break;
    }
  }
  
  const genderPatterns = [
    { pattern: /\bmale\b/i, value: 'male' },
    { pattern: /\bfemale\b/i, value: 'female' },
    { pattern: /gender\s*[:\/\s]*\s*(male|female)/i, value: null },
    { pattern: /sex\s*[:\/\s]*\s*(male|female)/i, value: null },
    { pattern: /\bmrs?\.?\b/i, value: 'male' },
    { pattern: /\bmiss\b/i, value: 'female' },
    { pattern: /\bms\.?\b/i, value: 'female' },
    { pattern: /\bmrs\.?\b/i, value: 'female' },
  ];
  
  for (const { pattern, value } of genderPatterns) {
    const match = text.match(pattern);
    if (match) {
      if (value) {
        info.gender = value;
      } else if (match[1]) {
        info.gender = match[1].toLowerCase();
      }
      console.log('✓ Found gender:', info.gender);
      break;
    }
  }
  
  return info;
}

// Main handler
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
    console.log('\n========================================');
    console.log('Starting extraction request...');
    console.log('========================================\n');
    
    const { fileBuffer, fileName, fileType } = await parseMultipartFormData(req);
    
    console.log(`Processing file: ${fileName} (${fileType})`);
    
    let extractedText = '';
    
    if (fileType === 'application/pdf') {
      // Try OCR.space first, fallback to local
      try {
        extractedText = await extractWithOCRSpace(fileBuffer, fileType);
      } catch (ocrError) {
        console.log('OCR.space failed, falling back to local PDF parser:', ocrError.message);
        extractedText = await extractWithLocalPDF(fileBuffer);
      }
    } else if (fileType.startsWith('image/')) {
      extractedText = await extractWithOCRSpace(fileBuffer, fileType);
    } else {
      throw new Error('Unsupported file type. Please upload a PDF or image file.');
    }
    
    if (!extractedText || extractedText.trim().length === 0) {
      throw new Error('No text could be extracted from the file.');
    }
    
    console.log(`\nExtracted ${extractedText.length} characters of text`);
    
    const profile = extractPatientInfo(extractedText);
    const biomarkers = extractBiomarkersFromText(extractedText);
    
    const response = {
      success: biomarkers.length > 0,
      biomarkers: biomarkers,
      profile: profile,
      extractedText: biomarkers.length === 0 ? extractedText.substring(0, 2000) : undefined,
      message: biomarkers.length > 0 
        ? `Successfully extracted ${biomarkers.length} biomarkers` 
        : 'No biomarkers found in the file. Please enter values manually.',
    };
    
    console.log('\n========================================');
    console.log('Extraction response:', JSON.stringify(response, null, 2));
    console.log('========================================\n');
    
    res.status(200).json(response);
    
  } catch (error) {
    console.error('Extraction error:', error);
    res.status(500).json({ 
      error: 'Extraction failed', 
      details: error.message,
    });
  }
};