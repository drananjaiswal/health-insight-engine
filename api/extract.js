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
  const patterns = {
    hemoglobin: {
      patterns: [/hemoglobin[\s:]+(\d+\.?\d*)/i, /\bhgb?[\s:]+(\d+\.?\d*)/i],
      unit: 'g/dL'
    },
    glucose: {
      patterns: [/glucose[\s:]+(\d+\.?\d*)/i, /blood sugar[\s:]+(\d+\.?\d*)/i, /fasting glucose[\s:]+(\d+\.?\d*)/i],
      unit: 'mg/dL'
    },
    totalCholesterol: {
      patterns: [/total cholesterol[\s:]+(\d+\.?\d*)/i, /cholesterol[\s:]+(\d+\.?\d*)/i],
      unit: 'mg/dL'
    },
    hdl: {
      patterns: [/hdl[\s:]+(\d+\.?\d*)/i, /hdl cholesterol[\s:]+(\d+\.?\d*)/i],
      unit: 'mg/dL'
    },
    ldl: {
      patterns: [/ldl[\s:]+(\d+\.?\d*)/i, /ldl cholesterol[\s:]+(\d+\.?\d*)/i],
      unit: 'mg/dL'
    },
    triglycerides: {
      patterns: [/triglycerides?[\s:]+(\d+\.?\d*)/i],
      unit: 'mg/dL'
    },
    wbc: {
      patterns: [/wbc[\s:]+(\d+\.?\d*)/i, /white blood cell[\s:]+(\d+\.?\d*)/i, /leukocyte[\s:]+(\d+\.?\d*)/i],
      unit: 'K/µL'
    },
    rbc: {
      patterns: [/rbc[\s:]+(\d+\.?\d*)/i, /red blood cell[\s:]+(\d+\.?\d*)/i, /erythrocyte[\s:]+(\d+\.?\d*)/i],
      unit: 'M/µL'
    },
    platelets: {
      patterns: [/platelet[\s:]+(\d+\.?\d*)/i, /plt[\s:]+(\d+\.?\d*)/i, /thrombocyte[\s:]+(\d+\.?\d*)/i],
      unit: 'K/µL'
    },
    creatinine: {
      patterns: [/creatinine[\s:]+(\d+\.?\d*)/i, /creat[\s:]+(\d+\.?\d*)/i],
      unit: 'mg/dL'
    },
    alt: {
      patterns: [/alt[\s:]+(\d+\.?\d*)/i, /alanine[\s:]+(\d+\.?\d*)/i, /sgpt[\s:]+(\d+\.?\d*)/i],
      unit: 'U/L'
    },
    ast: {
      patterns: [/ast[\s:]+(\d+\.?\d*)/i, /aspartate[\s:]+(\d+\.?\d*)/i, /sgot[\s:]+(\d+\.?\d*)/i],
      unit: 'U/L'
    }
  };

  let totalConfidence = 0;

  for (const [id, config] of Object.entries(patterns)) {
    for (const pattern of config.patterns) {
      const match = text.match(pattern);
      if (match) {
        const value = parseFloat(match[1]);
        if (!isNaN(value) && value > 0) {
          biomarkers.push({
            id,
            value,
            unit: config.unit,
            confidence: 0.85
          });
          totalConfidence += 0.85;
          break;
        }
      }
    }
  }

  const avgConfidence = biomarkers.length > 0 ? totalConfidence / biomarkers.length : 0;

  return {
    biomarkers,
    confidence: avgConfidence,
    extractedText: text.substring(0, 1000)
  };
}

// Extract patient profile from text
function extractProfile(text) {
  const profile = {};
  
  const ageMatch = text.match(/age[:\s]+(\d+)/i) || text.match(/(\d+)\s*years?\s*old/i);
  if (ageMatch) profile.age = parseInt(ageMatch[1]);
  
  const genderMatch = text.match(/gender[:\s]+(male|female)/i) || text.match(/(male|female)/i);
  if (genderMatch) profile.gender = genderMatch[1].toLowerCase();
  
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

    console.log('Extracting biomarkers from text...');
    const profile = extractProfile(text);
    const biomarkerResult = extractBiomarkers(text);

    console.log('Found biomarkers:', biomarkerResult.biomarkers.length);
    console.log('Profile:', profile);

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