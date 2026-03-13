// /api/extract.js - Enhanced with OCR.space API for better extraction
const pdfParse = require('pdf-parse');
const fs = require('fs');
const path = require('path');
const os = require('os');

// OCR.space API endpoint
const OCR_SPACE_API_URL = 'https://api.ocr.space/parse/image';

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

  // Read raw body
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const buffer = Buffer.concat(chunks);
  
  console.log(`Total request size: ${buffer.length} bytes`);

  // Find the file content
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

  console.log(`Found ${parts.length} parts`);
  
  let fileBuffer = null;
  let fileName = null;
  let fileType = null;

  for (const part of parts) {
    const headerEnd = part.indexOf('\r\n\r\n');
    if (headerEnd === -1) continue;
    
    const header = part.slice(0, headerEnd).toString();
    const content = part.slice(headerEnd + 4);
    
    // Remove trailing \r\n
    const cleanContent = content.slice(0, content.length - 2);
    
    if (header.includes('filename=')) {
      const nameMatch = header.match(/filename="([^"]+)"/);
      fileName = nameMatch ? nameMatch[1] : 'unknown';
      fileBuffer = cleanContent;
      
      // Detect file type from content
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

// Use OCR.space API for better text extraction
async function extractWithOCRSpace(fileBuffer, fileType) {
  console.log('Using OCR.space API for extraction...');
  
  try {
    // Convert buffer to base64
    const base64Image = fileBuffer.toString('base64');
    
    // Determine if it's PDF or image
    const isPdf = fileType === 'application/pdf';
    
    // Build form data
    const formData = new URLSearchParams();
    formData.append('base64Image', `data:${isPdf ? 'application/pdf' : 'image/jpeg'};base64,${base64Image}`);
    formData.append('language', 'eng');
    formData.append('isCreateSearchablePdf', 'false');
    formData.append('isSearchablePdfHideTextLayer', 'false');
    formData.append('scale', 'true');
    formData.append('detectOrientation', 'true');
    formData.append('OCREngine', '2'); // Engine 2 is better for tables
    
    console.log('Sending request to OCR.space API...');
    
    const response = await fetch(OCR_SPACE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });
    
    if (!response.ok) {
      throw new Error(`OCR.space API error: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('OCR.space response:', JSON.stringify(data, null, 2));
    
    if (data.IsErroredOnProcessing) {
      throw new Error(`OCR Error: ${data.ErrorMessage || 'Unknown error'}`);
    }
    
    if (!data.ParsedResults || data.ParsedResults.length === 0) {
      throw new Error('No text found in document');
    }
    
    // Combine all parsed results
    let extractedText = '';
    for (const result of data.ParsedResults) {
      extractedText += result.ParsedText + '\n';
    }
    
    console.log('OCR.space extracted text length:', extractedText.length);
    return extractedText;
    
  } catch (error) {
    console.error('OCR.space API error:', error);
    throw error;
  }
}

// Fallback to local PDF parsing
async function extractWithLocalPDF(fileBuffer) {
  console.log('Using local PDF parsing...');
  
  // Write to temp file
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
    // Clean up
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

// Enhanced biomarker extraction with multiple strategies
function extractBiomarkersFromText(text) {
  console.log('\n=== Starting biomarker extraction ===');
  console.log('Text preview:', text.substring(0, 500));
  
  const biomarkers = [];
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  
  // Define biomarker patterns with flexible matching
  const patterns = [
    // Hemoglobin variations
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
    // Glucose variations
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
    // Total Cholesterol
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
    // HDL
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
    // LDL
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
    // Triglycerides
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
    // WBC
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
    // RBC
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
    // Platelets
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
    // Creatinine
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
    // ALT
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
    // AST
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
  
  // Method 1: Table format parsing (lines with 3+ columns separated by | or spaces)
  console.log('\n--- Trying table format parsing ---');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Skip short lines
    if (line.length < 10) continue;
    
    // Try to match each biomarker pattern
    for (const pattern of patterns) {
      // Check if this line contains the biomarker name
      const hasName = pattern.names.some(name => 
        line.toLowerCase().includes(name.toLowerCase())
      );
      
      if (hasName) {
        console.log(`Found potential biomarker in line: "${line}"`);
        
        // Try all regex patterns for this biomarker
        for (const regex of pattern.patterns) {
          const match = line.match(regex);
          if (match) {
            let value = parseFloat(match[1]);
            
            // Validate value is reasonable
            if (value > 0 && value < 10000) {
              biomarkers.push({
                id: pattern.id,
                name: pattern.names[0].charAt(0).toUpperCase() + pattern.names[0].slice(1),
                value: value,
                unit: pattern.unit,
                category: pattern.category
              });
              console.log(`✓ Extracted: ${pattern.id} = ${value} ${pattern.unit}`);
              break; // Found this biomarker, move to next
            }
          }
        }
      }
    }
  }
  
  // Method 2: Look for values in nearby lines
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
            
            // Basic validation
            if (value > 0 && value < 10000 && !biomarkers.find(b => b.id === pattern.id)) {
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

// Extract patient info from text
function extractPatientInfo(text) {
  const info = { age: null, gender: null, region: null };
  
  console.log('\n=== Extracting patient info ===');
  
  // Age patterns
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
  
  // Gender patterns
  const genderPatterns = [
    { pattern: /\bmale\b/i, value: 'male' },
    { pattern: /\bfemale\b/i, value: 'female' },
    { pattern: /gender\s*[:\/\s]*\s*(male|female)/i, value: null },
    { pattern: /sex\s*[:\/\s]*\s*(male|female)/i, value: null },
    { pattern: /\bmrs?\.?\b/i, value: 'male' },
    { pattern: /\bmiss\b/i, value: 'female' },
    { pattern: /\bms\.?\b/i, value: 'female' },
    { pattern: /\bmrs\.?\b/i, value: 'female' },
    { pattern: /male\s*\/\s*female/i, value: null },
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
  // Enable CORS
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
    
    // Parse multipart form data
    const { fileBuffer, fileName, fileType } = await parseMultipartFormData(req);
    
    console.log(`Processing file: ${fileName} (${fileType})`);
    
    // Extract text based on file type
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
      // Use OCR.space for images
      extractedText = await extractWithOCRSpace(fileBuffer, fileType);
    } else {
      throw new Error('Unsupported file type. Please upload a PDF or image file.');
    }
    
    if (!extractedText || extractedText.trim().length === 0) {
      throw new Error('No text could be extracted from the file. The file may be scanned or image-based.');
    }
    
    console.log(`\nExtracted ${extractedText.length} characters of text`);
    
    // Extract patient info
    const profile = extractPatientInfo(extractedText);
    
    // Extract biomarkers
    const biomarkers = extractBiomarkersFromText(extractedText);
    
    // Prepare response
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
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};