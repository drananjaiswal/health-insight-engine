// API endpoint for extracting biomarkers from uploaded PDFs and images
const pdfParse = require('pdf-parse');
const { createWorker } = require('tesseract.js');

// Parse multipart form data manually for Vercel serverless
function parseMultipartForm(buffer, contentType) {
  const boundary = contentType.split('boundary=')[1];
  if (!boundary) throw new Error('No boundary in content-type');
  
  const boundaryBuffer = Buffer.from(`--${boundary}`);
  const parts = [];
  let start = buffer.indexOf(boundaryBuffer);
  
  while (start !== -1) {
    let end = buffer.indexOf(boundaryBuffer, start + boundaryBuffer.length);
    if (end === -1) break;
    
    let part = buffer.slice(start + boundaryBuffer.length, end);
    
    // Remove leading \r\n
    if (part[0] === 0x0D && part[1] === 0x0A) {
      part = part.slice(2);
    }
    
    // Find end of headers (double \r\n)
    const headerEnd = part.indexOf('\r\n\r\n');
    if (headerEnd !== -1) {
      const headers = part.slice(0, headerEnd).toString();
      const content = part.slice(headerEnd + 4);
      
      // Remove trailing \r\n--
      let cleanContent = content;
      if (cleanContent.length >= 2 && 
          cleanContent[cleanContent.length - 2] === 0x0D && 
          cleanContent[cleanContent.length - 1] === 0x0A) {
        cleanContent = cleanContent.slice(0, -2);
      }
      
      const nameMatch = headers.match(/name="([^"]+)"/);
      const filenameMatch = headers.match(/filename="([^"]+)"/);
      const contentTypeMatch = headers.match(/Content-Type: ([^\r\n]+)/);
      
      if (nameMatch) {
        parts.push({
          name: nameMatch[1],
          filename: filenameMatch ? filenameMatch[1] : null,
          contentType: contentTypeMatch ? contentTypeMatch[1].trim() : null,
          data: cleanContent
        });
      }
    }
    
    start = end;
  }
  
  return parts;
}

// Extract text from PDF buffer
async function extractFromPDF(buffer) {
  try {
    const data = await pdfParse(buffer);
    return data.text;
  } catch (error) {
    console.error('PDF parsing error:', error);
    throw new Error('Failed to parse PDF: ' + error.message);
  }
}

// Extract text from image using OCR
async function extractFromImage(buffer) {
  const worker = await createWorker('eng');
  try {
    // Convert buffer to base64 for Tesseract
    const base64 = buffer.toString('base64');
    const dataUrl = `data:image/png;base64,${base64}`;
    
    const { data: { text } } = await worker.recognize(dataUrl);
    return text;
  } finally {
    await worker.terminate();
  }
}

// Extract biomarkers from text using regex patterns
function extractBiomarkers(text) {
  const biomarkers = [];
  
  // More flexible patterns - handles various formats
  const patterns = {
    hemoglobin: {
      // Matches: Hemoglobin: 12.5, HGB 12.5, Hb 12.5, Hemoglobin 12.5 g/dL
      patterns: [
        /hemoglobin[:\s]+(\d+[.,]?\d*)\s*(?:g\/dL|g\/dl|gdl)?/i,
        /\bhgb?[:\s]+(\d+[.,]?\d*)\s*(?:g\/dL|g\/dl|gdl)?/i,
        /\bhb[:\s]+(\d+[.,]?\d*)\s*(?:g\/dL|g\/dl|gdl)?/i,
        /(?:^|\n)\s*(?:blood\s+)?hemoglobin\s*(?:\(HGB\))?\s*[:\s]+(\d+[.,]?\d*)/mi
      ],
      unit: 'g/dL',
      category: 'Blood'
    },
    glucose: {
      // Matches: Glucose: 95, Blood Sugar 95 mg/dL, Fasting Glucose 95
      patterns: [
        /(?:fasting\s+)?glucose[:\s]+(\d+[.,]?\d*)\s*(?:mg\/dL|mg\/dl|mg%)?/i,
        /blood\s+sugar[:\s]+(\d+[.,]?\d*)\s*(?:mg\/dL|mg\/dl|mg%)?/i,
        /glucose\s*(?:\(FBS\))?\s*[:\s]+(\d+[.,]?\d*)/i
      ],
      unit: 'mg/dL',
      category: 'Metabolic'
    },
    totalCholesterol: {
      // Matches: Total Cholesterol: 180, Cholesterol 180 mg/dL
      patterns: [
        /total\s+cholesterol[:\s]+(\d+[.,]?\d*)\s*(?:mg\/dL|mg\/dl|mg%)?/i,
        /cholesterol[,:]?\s*total[:\s]+(\d+[.,]?\d*)/i,
        /\bt\.?\s*cholesterol[:\s]+(\d+[.,]?\d*)/i
      ],
      unit: 'mg/dL',
      category: 'Lipid'
    },
    hdl: {
      // Matches: HDL: 45, HDL Cholesterol 45, HDL-C 45
      patterns: [
        /hdl[-\s]?(?:c|cholesterol)?[:\s]+(\d+[.,]?\d*)\s*(?:mg\/dL|mg\/dl|mg%)?/i,
        /hdl\s*[:\s]+(\d+[.,]?\d*)/i
      ],
      unit: 'mg/dL',
      category: 'Lipid'
    },
    ldl: {
      // Matches: LDL: 100, LDL Cholesterol 100, LDL-C 100
      patterns: [
        /ldl[-\s]?(?:c|cholesterol)?[:\s]+(\d+[.,]?\d*)\s*(?:mg\/dL|mg\/dl|mg%)?/i,
        /ldl\s*[:\s]+(\d+[.,]?\d*)/i
      ],
      unit: 'mg/dL',
      category: 'Lipid'
    },
    triglycerides: {
      // Matches: Triglycerides: 150, Triglyceride 150 mg/dL
      patterns: [
        /triglycerides?[:\s]+(\d+[.,]?\d*)\s*(?:mg\/dL|mg\/dl|mg%)?/i,
        /tg[:\s]+(\d+[.,]?\d*)/i
      ],
      unit: 'mg/dL',
      category: 'Lipid'
    },
    wbc: {
      // Matches: WBC: 7500, White Blood Cell 7.5, WBC Count 7500
      patterns: [
        /wbc[:\s]+(\d+[.,]?\d*)\s*(?:K\/µL|k\/ul|cells\/mm3|\/mm3)?/i,
        /white\s+blood\s+cell[:\s]+(\d+[.,]?\d*)/i,
        /leukocyte[:\s]+(\d+[.,]?\d*)/i,
        /(?:total\s+)?wbc\s*count[:\s]+(\d+[.,]?\d*)/i
      ],
      unit: 'K/µL',
      category: 'Blood'
    },
    rbc: {
      // Matches: RBC: 4.5, Red Blood Cell 4.5, RBC Count 4.5
      patterns: [
        /rbc[:\s]+(\d+[.,]?\d*)\s*(?:M\/µL|m\/ul|million\/mm3)?/i,
        /red\s+blood\s+cell[:\s]+(\d+[.,]?\d*)/i,
        /erythrocyte[:\s]+(\d+[.,]?\d*)/i,
        /(?:total\s+)?rbc\s*count[:\s]+(\d+[.,]?\d*)/i
      ],
      unit: 'M/µL',
      category: 'Blood'
    },
    platelets: {
      // Matches: Platelets: 250, Platelet Count 250000, PLT 250
      patterns: [
        /platelets?[:\s]+(\d+[.,]?\d*)\s*(?:K\/µL|k\/ul|\/mm3)?/i,
        /plt[:\s]+(\d+[.,]?\d*)/i,
        /thrombocyte[:\s]+(\d+[.,]?\d*)/i,
        /(?:platelet|plt)\s*count[:\s]+(\d+[.,]?\d*)/i
      ],
      unit: 'K/µL',
      category: 'Blood'
    },
    creatinine: {
      // Matches: Creatinine: 1.1, Creat 1.1 mg/dL
      patterns: [
        /creatinine[:\s]+(\d+[.,]?\d*)\s*(?:mg\/dL|mg\/dl|µmol\/L|umol\/l)?/i,
        /creat\.?[:\s]+(\d+[.,]?\d*)/i
      ],
      unit: 'mg/dL',
      category: 'Kidney'
    },
    alt: {
      // Matches: ALT: 25, Alanine Aminotransferase 25, SGPT 25
      patterns: [
        /alt[:\s]+(\d+[.,]?\d*)\s*(?:U\/L|u\/l)?/i,
        /alanine\s+(?:aminotransferase|transaminase)[:\s]+(\d+[.,]?\d*)/i,
        /sgpt[:\s]+(\d+[.,]?\d*)/i
      ],
      unit: 'U/L',
      category: 'Liver'
    },
    ast: {
      // Matches: AST: 22, Aspartate Aminotransferase 22, SGOT 22
      patterns: [
        /ast[:\s]+(\d+[.,]?\d*)\s*(?:U\/L|u\/l)?/i,
        /aspartate\s+(?:aminotransferase|transaminase)[:\s]+(\d+[.,]?\d*)/i,
        /sgot[:\s]+(\d+[.,]?\d*)/i
      ],
      unit: 'U/L',
      category: 'Liver'
    }
  };

  let totalConfidence = 0;
  const foundIds = new Set();

  // Normalize text - remove extra whitespace, normalize case
  const normalizedText = text
    .replace(/\r\n/g, '\n')
    .replace(/\n+/g, '\n')
    .replace(/\s+/g, ' ')
    .trim();

  for (const [id, config] of Object.entries(patterns)) {
    // Skip if already found this biomarker
    if (foundIds.has(id)) continue;
    
    for (const pattern of config.patterns) {
      const match = normalizedText.match(pattern);
      if (match) {
        // Parse value, handling comma as decimal separator
        let valueStr = match[1].replace(',', '.');
        const value = parseFloat(valueStr);
        
        if (!isNaN(value) && value > 0) {
          biomarkers.push({
            id,
            name: id.charAt(0).toUpperCase() + id.slice(1).replace(/([A-Z])/g, ' $1'),
            value,
            unit: config.unit,
            category: config.category,
            confidence: 0.85
          });
          totalConfidence += 0.85;
          foundIds.add(id);
          break;
        }
      }
    }
  }

  const avgConfidence = biomarkers.length > 0 ? totalConfidence / biomarkers.length : 0;

  return {
    biomarkers,
    confidence: avgConfidence,
    extractedText: normalizedText.substring(0, 2000)
  };
}

// Extract patient profile from text
function extractProfile(text) {
  const profile = {};
  
  // Age patterns
  const agePatterns = [
    /age[:\s]+(\d+)/i,
    /(\d+)\s*(?:years?\s*old|y\/o|yo)/i,
    /age[:\s]+(\d+)\s*y/i,
    /patient.*?(\d+)\s*years/i
  ];
  
  for (const pattern of agePatterns) {
    const match = text.match(pattern);
    if (match) {
      profile.age = parseInt(match[1]);
      break;
    }
  }
  
  // Gender patterns
  const genderPatterns = [
    /gender[:\s]+(male|female)/i,
    /sex[:\s]+(male|female)/i,
    /\b(male|female)\b/i,
    /patient\s+(?:is\s+)?a\s+(male|female)/i
  ];
  
  for (const pattern of genderPatterns) {
    const match = text.match(pattern);
    if (match) {
      profile.gender = match[1].toLowerCase();
      break;
    }
  }
  
  return profile;
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
    console.log('Extract API called');
    console.log('Content-Type:', req.headers['content-type']);
    
    const contentType = req.headers['content-type'];
    if (!contentType || !contentType.includes('multipart/form-data')) {
      return res.status(400).json({ 
        error: 'Invalid content type',
        received: contentType,
        expected: 'multipart/form-data'
      });
    }

    // Get the raw body as buffer
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
    const parts = parseMultipartForm(buffer, contentType);
    console.log('Parsed parts:', parts.length);
    
    const filePart = parts.find(p => p.filename && p.name === 'file');
    if (!filePart) {
      return res.status(400).json({ 
        error: 'No file found in request',
        parts: parts.map(p => ({ name: p.name, filename: p.filename }))
      });
    }

    console.log('File found:', filePart.filename, 'Type:', filePart.contentType);

    // Validate file size (10MB limit)
    if (filePart.data.length > 10 * 1024 * 1024) {
      return res.status(400).json({ error: 'File too large (max 10MB)' });
    }

    let text = '';
    const isPDF = filePart.contentType === 'application/pdf' || 
                  filePart.filename.toLowerCase().endsWith('.pdf');
    const isImage = filePart.contentType?.startsWith('image/') ||
                   /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(filePart.filename);

    console.log('File type:', isPDF ? 'PDF' : (isImage ? 'Image' : 'Unknown'));

    if (isPDF) {
      console.log('Extracting from PDF...');
      text = await extractFromPDF(filePart.data);
      console.log('PDF text extracted, length:', text.length);
    } else if (isImage) {
      console.log('Extracting from image with OCR...');
      text = await extractFromImage(filePart.data);
      console.log('Image text extracted, length:', text.length);
    } else {
      return res.status(400).json({ 
        error: 'Unsupported file type. Please upload PDF or image (JPG, PNG)',
        received: filePart.contentType
      });
    }

    if (!text || text.trim().length === 0) {
      return res.status(400).json({ 
        error: 'No text could be extracted from the file'
      });
    }

    console.log('Sample of extracted text:', text.substring(0, 500));
    
    console.log('Extracting biomarkers from text...');
    const profile = extractProfile(text);
    const biomarkerResult = extractBiomarkers(text);

    console.log('Found biomarkers:', biomarkerResult.biomarkers.length);
    console.log('Profile:', profile);
    console.log('Biomarkers found:', biomarkerResult.biomarkers.map(b => `${b.id}: ${b.value}`).join(', '));

    return res.status(200).json({
      success: true,
      profile: Object.keys(profile).length > 0 ? profile : null,
      biomarkers: biomarkerResult.biomarkers,
      confidence: biomarkerResult.confidence,
      extractedText: biomarkerResult.extractedText,
      filename: filePart.filename
    });

  } catch (error) {
    console.error('Extraction error:', error);
    console.error('Stack:', error.stack);
    
    return res.status(500).json({
      error: 'Extraction failed',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// Vercel config
module.exports.config = {
  api: {
    bodyParser: false,
    responseLimit: '10mb'
  }
};