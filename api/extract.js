const pdfParse = require('pdf-parse');
const fs = require('fs');

// Configuration for biomarkers with multiple pattern variations
const BIOMARKER_CONFIG = [
  { 
    id: 'hemoglobin', 
    name: 'Hemoglobin', 
    unit: 'g/dL', 
    category: 'Blood',
    patterns: [
      /hemoglobin[\s\w\/]*([\d.,]+)\s*(?:g[\s\/]*dL|g[\s\/]*dL|gm[\s\/]*dL|g%|gm%|g\s*%|g\s*\/\s*dL)/i,
      /hb[^a-zA-Z]*([\d.,]+)\s*(?:g[\s\/]*dL|gm[\s\/]*dL)/i,
      /hgb[^a-zA-Z]*([\d.,]+)\s*(?:g[\s\/]*dL|gm[\s\/]*dL)/i
    ]
  },
  { 
    id: 'glucose', 
    name: 'Glucose', 
    unit: 'mg/dL', 
    category: 'Metabolic',
    patterns: [
      /(?:fasting\s+)?glucose[^\d]*([\d.,]+)\s*(?:mg[\s\/]*dL|mg)/i,
      /blood\s+sugar[^\d]*([\d.,]+)\s*(?:mg[\s\/]*dL|mg)/i,
      /fbs[^a-zA-Z]*([\d.,]+)\s*(?:mg[\s\/]*dL|mg)/i
    ]
  },
  { 
    id: 'totalCholesterol', 
    name: 'Total Cholesterol', 
    unit: 'mg/dL', 
    category: 'Lipid',
    patterns: [
      /total\s+cholesterol[^\d]*([\d.,]+)\s*(?:mg[\s\/]*dL|mg)/i,
      /cholesterol[^\d]*([\d.,]+)\s*(?:mg[\s\/]*dL|mg)/i
    ]
  },
  { 
    id: 'hdl', 
    name: 'HDL Cholesterol', 
    unit: 'mg/dL', 
    category: 'Lipid',
    patterns: [
      /hdl\s*(?:cholesterol)?[^\d]*([\d.,]+)\s*(?:mg[\s\/]*dL|mg)/i,
      /hdl[^a-zA-Z]*([\d.,]+)\s*(?:mg[\s\/]*dL|mg)/i,
      /high[-\s]?density[^\d]*([\d.,]+)\s*(?:mg[\s\/]*dL|mg)/i
    ]
  },
  { 
    id: 'ldl', 
    name: 'LDL Cholesterol', 
    unit: 'mg/dL', 
    category: 'Lipid',
    patterns: [
      /ldl\s*(?:cholesterol)?[^\d]*([\d.,]+)\s*(?:mg[\s\/]*dL|mg)/i,
      /ldl[^a-zA-Z]*([\d.,]+)\s*(?:mg[\s\/]*dL|mg)/i,
      /low[-\s]?density[^\d]*([\d.,]+)\s*(?:mg[\s\/]*dL|mg)/i
    ]
  },
  { 
    id: 'triglycerides', 
    name: 'Triglycerides', 
    unit: 'mg/dL', 
    category: 'Lipid',
    patterns: [
      /triglycerides?[^\d]*([\d.,]+)\s*(?:mg[\s\/]*dL|mg)/i,
      /tg[^a-zA-Z]*([\d.,]+)\s*(?:mg[\s\/]*dL|mg)/i
    ]
  },
  { 
    id: 'wbc', 
    name: 'WBC Count', 
    unit: '×10³/µL', 
    category: 'Blood',
    patterns: [
      /wbc[^\d]*([\d.,]+)\s*(?:×10[³³]?[\/\\]?\s*[µu]L|10[³³]?[\/\\]?\s*[µu]L|\/\s*[µu]L|\s*thousand|cells?)/i,
      /white\s+blood\s+cell[^\d]*([\d.,]+)/i,
      /leukocyte[^\d]*([\d.,]+)/i
    ]
  },
  { 
    id: 'rbc', 
    name: 'RBC Count', 
    unit: '×10⁶/µL', 
    category: 'Blood',
    patterns: [
      /rbc[^\d]*([\d.,]+)\s*(?:×10[⁶⁶]?[\/\\]?\s*[µu]L|10[⁶⁶]?[\/\\]?\s*[µu]L|\/\s*[µu]L|\s*million|cells?)/i,
      /red\s+blood\s+cell[^\d]*([\d.,]+)/i,
      /erythrocyte[^\d]*([\d.,]+)/i
    ]
  },
  { 
    id: 'platelets', 
    name: 'Platelets', 
    unit: '×10³/µL', 
    category: 'Blood',
    patterns: [
      /platelet[^\d]*([\d.,]+)\s*(?:×10[³³]?[\/\\]?\s*[µu]L|10[³³]?[\/\\]?\s*[µu]L|\s*thousand|\s*lakhs?)/i,
      /plt[^a-zA-Z]*([\d.,]+)\s*(?:×10[³³]?[\/\\]?\s*[µu]L|10[³³]?[\/\\]?\s*[µu]L|\/\s*[µu]L)/i,
      /thrombocyte[^\d]*([\d.,]+)/i
    ]
  },
  { 
    id: 'creatinine', 
    name: 'Creatinine', 
    unit: 'mg/dL', 
    category: 'Kidney',
    patterns: [
      /creatinine[^\d]*([\d.,]+)\s*(?:mg[\s\/]*dL|mg)/i,
      /creat[^a-zA-Z]*([\d.,]+)\s*(?:mg[\s\/]*dL|mg)/i,
      /s[.]?\s*creatinine[^\d]*([\d.,]+)/i
    ]
  },
  { 
    id: 'alt', 
    name: 'ALT (SGPT)', 
    unit: 'U/L', 
    category: 'Liver',
    patterns: [
      /alt[^\d]*([\d.,]+)\s*(?:U[\s\/]?L|units?)/i,
      /sgpt[^\d]*([\d.,]+)\s*(?:U[\s\/]?L|units?)/i,
      /alanine[^\d]*([\d.,]+)/i
    ]
  },
  { 
    id: 'ast', 
    name: 'AST (SGOT)', 
    unit: 'U/L', 
    category: 'Liver',
    patterns: [
      /ast[^\d]*([\d.,]+)\s*(?:U[\s\/]?L|units?)/i,
      /sgot[^\d]*([\d.,]+)\s*(?:U[\s\/]?L|units?)/i,
      /aspartate[^\d]*([\d.,]+)/i
    ]
  }
];

// Extract profile information
function extractProfile(text) {
  const profile = {};
  
  // Age extraction - improved patterns
  const agePatterns = [
    /age\s*[\/\s]\s*gender[^\d]*([\d]+)\s*(?:years?|yrs?|y)/i,
    /age\s*[:\-]?\s*([\d]+)\s*(?:years?|yrs?|y)?/i,
    /([\d]+)\s*(?:years?|yrs?)\s*(?:old|of age)/i,
    /age\/sex[^\d]*([\d]+)/i,
    /aged?\s*[:\-]?\s*([\d]+)\s*(?:years?|yrs?)?/i
  ];
  
  for (const pattern of agePatterns) {
    const match = text.match(pattern);
    if (match) {
      profile.age = parseInt(match[1]);
      break;
    }
  }
  
  // Gender extraction - improved patterns
  const genderPatterns = [
    /gender\s*[\/\s]\s*[^\/]*\/\s*(female|male|f|m)/i,
    /gender\s*[:\-]?\s*(female|male|f|m)/i,
    /sex\s*[:\-]?\s*(female|male|f|m)/i,
    /\/(female|male|f|m)\//i,
    /(female|male)\s*(?:patient|subject)/i,
    /\b(female|male)\b/i
  ];
  
  for (const pattern of genderPatterns) {
    const match = text.match(pattern);
    if (match) {
      const g = match[1].toLowerCase();
      if (g === 'f' || g === 'female') profile.gender = 'female';
      else if (g === 'm' || g === 'male') profile.gender = 'male';
      if (profile.gender) break;
    }
  }
  
  // Title-based detection as fallback
  if (!profile.gender) {
    if (text.match(/\bmrs\b|\bms\b|\bmiss\b/i)) {
      profile.gender = 'female';
    } else if (text.match(/\bmr\b(?!s)/i)) {
      profile.gender = 'male';
    }
  }
  
  return profile;
}

// Extract biomarkers from table format (common in Indian lab reports)
function extractFromTable(lines) {
  const biomarkers = [];
  const foundIds = new Set();
  
  for (const line of lines) {
    const upperLine = line.toUpperCase();
    
    for (const config of BIOMARKER_CONFIG) {
      if (foundIds.has(config.id)) continue;
      
      // Check if this line contains the biomarker name
      const nameMatch = config.patterns.some(p => {
        const patternStr = p.source;
        // Extract the biomarker name part from the regex
        const namePart = patternStr.split('[')[0].replace(/\\/g, '').replace(/\?/g, '').toUpperCase();
        return upperLine.includes(namePart.replace(/[^A-Z]/g, '')) ||
               upperLine.includes(config.name.toUpperCase().replace(/\s+/g, '')) ||
               upperLine.includes(config.name.split(' ')[0].toUpperCase());
      });
      
      if (!nameMatch) continue;
      
      // Look for numbers in this line - try different positions
      // Pattern: Name | Unit | Value or Name | Value | Unit or Name Value Unit
      const parts = line.split(/[|\t,;]+/).map(p => p.trim()).filter(p => p);
      
      for (const part of parts) {
        // Try to find a number
        const numMatch = part.match(/([\d.,]+)/);
        if (numMatch) {
          const valueStr = numMatch[1].replace(',', '.');
          const value = parseFloat(valueStr);
          
          if (!isNaN(value) && value > 0 && value < 10000) {
            // Validate it's not a reference range value
            if (part.match(/reference|range|normal|ref[.]?\s*interval/i)) {
              continue;
            }
            
            biomarkers.push({
              id: config.id,
              name: config.name,
              value: value,
              unit: config.unit,
              category: config.category
            });
            foundIds.add(config.id);
            console.log(`Table extraction: ${config.name} = ${value} ${config.unit}`);
            break;
          }
        }
      }
      
      if (foundIds.has(config.id)) break;
    }
  }
  
  return biomarkers;
}

// Extract biomarkers using regex patterns
function extractWithPatterns(text) {
  const biomarkers = [];
  const foundIds = new Set();
  
  // Normalize text for better matching
  const normalizedText = text
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/=/g, ' ')
    .replace(/:/g, ' ');
  
  for (const config of BIOMARKER_CONFIG) {
    if (foundIds.has(config.id)) continue;
    
    for (const pattern of config.patterns) {
      const match = normalizedText.match(pattern);
      if (match && match[1]) {
        const valueStr = match[1].replace(',', '.');
        const value = parseFloat(valueStr);
        
        if (!isNaN(value) && value > 0 && value < 10000) {
          biomarkers.push({
            id: config.id,
            name: config.name,
            value: value,
            unit: config.unit,
            category: config.category
          });
          foundIds.add(config.id);
          console.log(`Pattern extraction: ${config.name} = ${value} ${config.unit}`);
          break;
        }
      }
    }
  }
  
  return biomarkers;
}

// Line-by-line extraction with proximity matching
function extractLineByLine(lines) {
  const biomarkers = [];
  const foundIds = new Set();
  
  // Create a map of biomarker keywords
  const keywordMap = {};
  for (const config of BIOMARKER_CONFIG) {
    const keywords = [config.name.toLowerCase()];
    if (config.id === 'hemoglobin') keywords.push('hb', 'hgb');
    if (config.id === 'glucose') keywords.push('sugar', 'fbs');
    if (config.id === 'wbc') keywords.push('wbc', 'white blood');
    if (config.id === 'rbc') keywords.push('rbc', 'red blood');
    if (config.id === 'alt') keywords.push('alt', 'sgpt');
    if (config.id === 'ast') keywords.push('ast', 'sgot');
    if (config.id === 'hdl') keywords.push('hdl');
    if (config.id === 'ldl') keywords.push('ldl');
    if (config.id === 'platelets') keywords.push('platelet', 'plt');
    if (config.id === 'creatinine') keywords.push('creatinine', 'creat');
    if (config.id === 'triglycerides') keywords.push('triglyceride', 'tg');
    
    keywordMap[config.id] = { keywords, config };
  }
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].toLowerCase();
    
    for (const [id, { keywords, config }] of Object.entries(keywordMap)) {
      if (foundIds.has(id)) continue;
      
      // Check if any keyword is in this line
      const hasKeyword = keywords.some(kw => line.includes(kw.toLowerCase()));
      if (!hasKeyword) continue;
      
      // Look for numbers in current line and nearby lines
      const searchLines = [
        lines[i],
        lines[i + 1] || '',
        lines[i - 1] || ''
      ];
      
      for (const searchLine of searchLines) {
        if (!searchLine) continue;
        
        // Find all numbers in the line
        const numMatches = searchLine.match(/([\d.,]+)/g);
        if (!numMatches) continue;
        
        for (const numStr of numMatches) {
          const valueStr = numStr.replace(',', '.');
          const value = parseFloat(valueStr);
          
          // Skip if it's likely a reference range or invalid
          if (isNaN(value) || value <= 0 || value >= 10000) continue;
          
          // Check context - avoid reference ranges
          const context = searchLine.toLowerCase();
          if (context.includes('reference') || context.includes('range') || 
              context.includes('normal') || context.includes('interval')) {
            continue;
          }
          
          biomarkers.push({
            id: config.id,
            name: config.name,
            value: value,
            unit: config.unit,
            category: config.category
          });
          foundIds.add(id);
          console.log(`Line extraction: ${config.name} = ${value} ${config.unit}`);
          break;
        }
        
        if (foundIds.has(id)) break;
      }
    }
  }
  
  return biomarkers;
}

// Main extraction function combining all methods
function extractBiomarkers(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  console.log(`Processing ${lines.length} lines of text`);
  
  // Try multiple extraction methods
  const method1 = extractFromTable(lines);
  console.log(`Table extraction found: ${method1.length} biomarkers`);
  
  const method2 = extractWithPatterns(text);
  console.log(`Pattern extraction found: ${method2.length} biomarkers`);
  
  const method3 = extractLineByLine(lines);
  console.log(`Line-by-line extraction found: ${method3.length} biomarkers`);
  
  // Merge results, preferring method1 (table), then method2 (patterns), then method3
  const allResults = [...method1, ...method2, ...method3];
  const merged = {};
  
  for (const b of allResults) {
    if (!merged[b.id]) {
      merged[b.id] = b;
    }
  }
  
  return Object.values(merged);
}

// Clean up extracted text for debugging
function cleanText(text) {
  return text
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

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
    // Parse multipart form data manually
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);
    
    console.log('Received buffer size:', buffer.length);
    
    // Find the content-type header to get boundary
    const contentType = req.headers['content-type'] || '';
    const boundaryMatch = contentType.match(/boundary=([^;]+)/);
    
    if (!boundaryMatch) {
      console.log('No boundary found in content-type:', contentType);
      return res.status(400).json({ 
        error: 'Invalid content type - must be multipart/form-data',
        received: contentType
      });
    }
    
    const boundary = boundaryMatch[1].trim();
    console.log('Boundary:', boundary);
    
    // Find file content in the multipart body
    const boundaryBuffer = Buffer.from('--' + boundary);
    let fileBuffer = null;
    let fileType = '';
    
    // Find the file part
    let startIdx = buffer.indexOf(boundaryBuffer);
    while (startIdx !== -1) {
      const nextBoundaryIdx = buffer.indexOf(boundaryBuffer, startIdx + boundaryBuffer.length);
      const part = buffer.slice(startIdx, nextBoundaryIdx === -1 ? undefined : nextBoundaryIdx);
      
      // Check if this part contains a file
      const contentDispositionIdx = part.indexOf('Content-Disposition:');
      if (contentDispositionIdx !== -1) {
        const dispositionStr = part.slice(contentDispositionIdx, part.indexOf('\r\n', contentDispositionIdx)).toString();
        if (dispositionStr.includes('filename=')) {
          // This is the file part - extract the file content
          const headerEndIdx = part.indexOf('\r\n\r\n');
          if (headerEndIdx !== -1) {
            fileBuffer = part.slice(headerEndIdx + 4);
            // Remove trailing \r\n before boundary
            while (fileBuffer.length > 0 && 
                   (fileBuffer[fileBuffer.length - 1] === 0x0D || 
                    fileBuffer[fileBuffer.length - 1] === 0x0A)) {
              fileBuffer = fileBuffer.slice(0, -1);
            }
            
            // Detect file type
            if (dispositionStr.toLowerCase().includes('.pdf')) {
              fileType = 'pdf';
            } else if (dispositionStr.match(/\.(jpg|jpeg|png|gif|bmp|webp)/i)) {
              fileType = 'image';
            }
            
            console.log('Found file part, size:', fileBuffer.length, 'type:', fileType);
            break;
          }
        }
      }
      
      startIdx = nextBoundaryIdx;
    }
    
    if (!fileBuffer || fileBuffer.length === 0) {
      console.log('No file content found in multipart data');
      return res.status(400).json({ error: 'No file uploaded or file is empty' });
    }
    
    // Validate file type by magic bytes
    const isPDF = fileBuffer.slice(0, 4).toString() === '%PDF';
    const isImage = fileBuffer.slice(0, 2).toString('hex') === 'ffd8' || // JPEG
                    fileBuffer.slice(0, 4).toString('hex') === '89504e47' || // PNG
                    fileBuffer.slice(0, 3).toString('hex') === '474946'; // GIF
    
    console.log('File validation - isPDF:', isPDF, 'isImage:', isImage);
    
    let text = '';
    let biomarkers = [];
    let extractedInfo = {};
    
    if (isPDF || fileType === 'pdf') {
      // Process PDF
      console.log('Processing PDF file...');
      try {
        const pdfData = await pdfParse(fileBuffer);
        text = pdfData.text || '';
        console.log('PDF text extracted, length:', text.length);
        console.log('PDF text preview (first 1000 chars):', text.substring(0, 1000));
      } catch (pdfError) {
        console.error('PDF parsing error:', pdfError);
        return res.status(400).json({ 
          error: 'Failed to parse PDF: ' + pdfError.message,
          extractedText: ''
        });
      }
    } else if (isImage || fileType === 'image') {
      // For images, return helpful error since OCR is complex
      return res.status(400).json({
        error: 'Image processing requires OCR setup. Please enter biomarker values manually.',
        extractedText: '[Image file uploaded - OCR not configured]'
      });
    } else {
      // Try to extract text anyway
      text = fileBuffer.toString('utf-8');
      console.log('Treating as text file, length:', text.length);
    }
    
    if (!text || text.trim().length === 0) {
      return res.status(400).json({
        error: 'Could not extract text from the uploaded file. The file may be scanned/image-based or corrupted.',
        extractedText: ''
      });
    }
    
    // Clean and log the extracted text
    const cleanedText = cleanText(text);
    console.log('Cleaned text preview (first 1000 chars):', cleanedText.substring(0, 1000));
    
    // Extract profile information
    extractedInfo = extractProfile(cleanedText);
    console.log('Extracted profile:', extractedInfo);
    
    // Extract biomarkers using all methods
    biomarkers = extractBiomarkers(cleanedText);
    console.log('Final extracted biomarkers:', biomarkers);
    
    return res.json({
      success: true,
      biomarkers: biomarkers,
      biomarkersFound: biomarkers.length,
      extractedInfo: extractedInfo,
      extractedText: cleanedText.substring(0, 2000) // Return first 2000 chars for debugging
    });
    
  } catch (error) {
    console.error('Extraction error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error: ' + error.message,
      extractedText: ''
    });
  }
};
