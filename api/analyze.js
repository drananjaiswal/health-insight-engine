// API Endpoint: POST /api/analyze
// Analyzes biomarker data and returns personalized insights

const BIOMARKER_DATABASE = {
  hemoglobin: {
    id: 'hemoglobin',
    category: 'Blood',
    name: 'Hemoglobin',
    unit: 'g/dL',
    baseRanges: {
      male: { min: 13.5, max: 17.5 },
      female: { min: 12.0, max: 15.5 },
      other: { min: 12.0, max: 16.0 }
    },
    ageAdjustments: {
      child: { min: 11.0, max: 16.0 },      // < 12
      adult: { min: 0, max: 0 },            // no change (uses base)
      senior: { min: -0.5, max: -0.5 }      // 60+
    },
    interpretations: {
      low: 'Hemoglobin below normal may indicate anemia, nutritional deficiency, or blood loss.',
      normal: 'Hemoglobin is within the healthy range, indicating good oxygen-carrying capacity.',
      high: 'Elevated hemoglobin may indicate dehydration, lung/heart conditions, or other factors.'
    },
    recommendations: {
      low: 'Increase iron-rich foods (red meat, spinach, lentils). Consider vitamin C with iron meals. Consult doctor if persistent.',
      normal: 'Maintain balanced diet with iron, B12, and folate. Regular exercise supports healthy levels.',
      high: 'Stay well hydrated. If levels remain high, consult doctor to rule out underlying conditions.'
    }
  },
  glucose: {
    id: 'glucose',
    category: 'Metabolic',
    name: 'Glucose (Fasting)',
    unit: 'mg/dL',
    baseRanges: {
      male: { min: 70, max: 100 },
      female: { min: 70, max: 100 },
      other: { min: 70, max: 100 }
    },
    ageAdjustments: {
      child: { min: 0, max: 0 },
      adult: { min: 0, max: 0 },
      senior: { min: 0, max: 10 }  // slightly higher acceptable
    },
    interpretations: {
      low: 'Low blood sugar may cause dizziness, confusion, and weakness.',
      normal: 'Fasting glucose is optimal, indicating healthy blood sugar regulation.',
      high: 'Elevated fasting glucose may indicate prediabetes or diabetes risk.'
    },
    recommendations: {
      low: 'Consume quick-acting carbs (fruit juice, glucose tablets). Eat regular balanced meals.',
      normal: 'Maintain balanced diet with complex carbs and fiber. Regular physical activity helps.',
      high: 'Reduce refined sugars and processed carbs. Increase fiber intake. Consult doctor for follow-up testing.'
    }
  },
  cholesterol_total: {
    id: 'cholesterol_total',
    category: 'Lipid',
    name: 'Total Cholesterol',
    unit: 'mg/dL',
    baseRanges: {
      male: { min: 0, max: 200 },
      female: { min: 0, max: 200 },
      other: { min: 0, max: 200 }
    },
    interpretations: {
      low: 'Very low cholesterol is rare but may indicate other health issues.',
      normal: 'Total cholesterol is within the desirable range.',
      high: 'High total cholesterol increases cardiovascular disease risk.'
    },
    recommendations: {
      low: 'Consult doctor to rule out underlying conditions. Ensure adequate healthy fat intake.',
      normal: 'Maintain heart-healthy diet. Continue regular monitoring.',
      high: 'Reduce saturated/trans fats. Increase soluble fiber (oats, beans). Consider plant sterols.'
    }
  },
  hdl: {
    id: 'hdl',
    category: 'Lipid',
    name: 'HDL Cholesterol',
    unit: 'mg/dL',
    baseRanges: {
      male: { min: 40, max: 60 },
      female: { min: 50, max: 70 },
      other: { min: 45, max: 65 }
    },
    interpretations: {
      low: 'Low HDL (good cholesterol) increases heart disease risk.',
      normal: 'HDL is within the healthy range.',
      high: 'Higher HDL is generally protective for heart health.'
    },
    recommendations: {
      low: 'Increase aerobic exercise. Consume healthy fats (olive oil, nuts, fatty fish). Quit smoking.',
      normal: 'Continue heart-healthy habits. Regular exercise boosts HDL further.',
      high: 'Excellent! Maintain current lifestyle. High HDL is protective.'
    }
  },
  ldl: {
    id: 'ldl',
    category: 'Lipid',
    name: 'LDL Cholesterol',
    unit: 'mg/dL',
    baseRanges: {
      male: { min: 0, max: 130 },
      female: { min: 0, max: 130 },
      other: { min: 0, max: 130 }
    },
    interpretations: {
      low: 'Low LDL is generally good for heart health.',
      normal: 'LDL is within the optimal range.',
      high: 'Elevated LDL increases cardiovascular disease risk.'
    },
    recommendations: {
      low: 'Excellent LDL levels. Maintain heart-healthy diet.',
      normal: 'Good LDL control. Continue diet low in saturated fats.',
      high: 'Reduce saturated fats and trans fats. Increase soluble fiber. Consider plant-based proteins.'
    }
  },
  triglycerides: {
    id: 'triglycerides',
    category: 'Lipid',
    name: 'Triglycerides',
    unit: 'mg/dL',
    baseRanges: {
      male: { min: 0, max: 150 },
      female: { min: 0, max: 150 },
      other: { min: 0, max: 150 }
    },
    interpretations: {
      low: 'Low triglycerides are generally not a concern.',
      normal: 'Triglycerides are within the healthy range.',
      high: 'High triglycerides increase heart disease and pancreatitis risk.'
    },
    recommendations: {
      low: 'Ensure adequate calorie intake. Very low levels are rare.',
      normal: 'Limit alcohol and refined carbs. Omega-3s help maintain healthy levels.',
      high: 'Reduce sugar and refined carbs. Limit alcohol. Increase omega-3s (fish, walnuts).'
    }
  },
  wbc: {
    id: 'wbc',
    category: 'Blood',
    name: 'White Blood Cells',
    unit: 'K/μL',
    baseRanges: {
      male: { min: 4.0, max: 11.0 },
      female: { min: 4.0, max: 11.0 },
      other: { min: 4.0, max: 11.0 }
    },
    interpretations: {
      low: 'Low WBC may indicate weakened immune system or bone marrow issues.',
      normal: 'WBC count indicates a healthy immune system.',
      high: 'High WBC may indicate infection, inflammation, or stress response.'
    },
    recommendations: {
      low: 'Practice good hygiene. Avoid sick contacts. Consult doctor if persistent.',
      normal: 'Maintain good sleep and stress management. Regular exercise supports immunity.',
      high: 'Monitor for signs of infection. If persistent, consult doctor for evaluation.'
    }
  },
  rbc: {
    id: 'rbc',
    category: 'Blood',
    name: 'Red Blood Cells',
    unit: 'M/μL',
    baseRanges: {
      male: { min: 4.3, max: 5.9 },
      female: { min: 3.5, max: 5.0 },
      other: { min: 4.0, max: 5.5 }
    },
    interpretations: {
      low: 'Low RBC may indicate anemia, blood loss, or nutritional deficiency.',
      normal: 'RBC count is within the healthy range.',
      high: 'High RBC may indicate dehydration, lung disease, or other conditions.'
    },
    recommendations: {
      low: 'Increase iron, B12, and folate intake. Consult doctor if persistent fatigue.',
      normal: 'Maintain balanced diet with iron-rich foods. Stay hydrated.',
      high: 'Ensure adequate hydration. If levels remain high, consult doctor.'
    }
  },
  platelets: {
    id: 'platelets',
    category: 'Blood',
    name: 'Platelet Count',
    unit: 'K/μL',
    baseRanges: {
      male: { min: 150, max: 400 },
      female: { min: 150, max: 400 },
      other: { min: 150, max: 400 }
    },
    interpretations: {
      low: 'Low platelets increase bleeding risk and may indicate various conditions.',
      normal: 'Platelet count is optimal for normal blood clotting.',
      high: 'High platelets may increase clotting risk or indicate inflammation.'
    },
    recommendations: {
      low: 'Avoid contact sports. Watch for bleeding/bruising. Consult doctor promptly.',
      normal: 'Maintain vitamin K intake from leafy greens. Avoid excessive alcohol.',
      high: 'Stay hydrated. If levels remain elevated, consult doctor for evaluation.'
    }
  },
  creatinine: {
    id: 'creatinine',
    category: 'Kidney',
    name: 'Creatinine',
    unit: 'mg/dL',
    baseRanges: {
      male: { min: 0.7, max: 1.3 },
      female: { min: 0.6, max: 1.1 },
      other: { min: 0.6, max: 1.2 }
    },
    interpretations: {
      low: 'Low creatinine is usually not concerning.',
      normal: 'Creatinine is within normal range, indicating healthy kidney function.',
      high: 'Elevated creatinine may indicate reduced kidney function.'
    },
    recommendations: {
      low: 'Ensure adequate protein intake. Usually not clinically significant.',
      normal: 'Maintain hydration. Regular exercise naturally elevates creatinine slightly.',
      high: 'Stay well hydrated. Limit excessive protein. Consult doctor for kidney function tests.'
    }
  },
  alt: {
    id: 'alt',
    category: 'Liver',
    name: 'ALT (SGPT)',
    unit: 'U/L',
    baseRanges: {
      male: { min: 7, max: 56 },
      female: { min: 7, max: 45 },
      other: { min: 7, max: 50 }
    },
    interpretations: {
      low: 'Low ALT is not typically clinically significant.',
      normal: 'ALT is within normal range, indicating healthy liver function.',
      high: 'Elevated ALT may indicate liver stress, fatty liver, or other liver conditions.'
    },
    recommendations: {
      low: 'Not typically concerning. Ensure adequate nutrition.',
      normal: 'Limit alcohol. Maintain healthy weight. Vaccinate against hepatitis.',
      high: 'Avoid alcohol. Review medications with doctor. Consider liver ultrasound if persistent.'
    }
  },
  ast: {
    id: 'ast',
    category: 'Liver',
    name: 'AST (SGOT)',
    unit: 'U/L',
    baseRanges: {
      male: { min: 10, max: 40 },
      female: { min: 9, max: 32 },
      other: { min: 9, max: 35 }
    },
    interpretations: {
      low: 'Low AST is not typically clinically significant.',
      normal: 'AST is within normal range.',
      high: 'Elevated AST may indicate liver or muscle damage.'
    },
    recommendations: {
      low: 'Not typically concerning.',
      normal: 'Maintain healthy lifestyle. Regular exercise is beneficial.',
      high: 'Avoid alcohol. If you exercise intensely, retest after rest days. Consult doctor.'
    }
  }
};

function getAgeCategory(age) {
  if (age < 12) return 'child';
  if (age >= 60) return 'senior';
  return 'adult';
}

function calculatePersonalizedRange(biomarker, profile) {
  const { gender = 'other', age = 30 } = profile;
  const def = BIOMARKER_DATABASE[biomarker.id] || biomarker;
  
  // Get base range for gender
  const baseRange = def.baseRanges[gender] || def.baseRanges.other;
  const ageCat = getAgeCategory(age);
  const ageAdj = def.ageAdjustments?.[ageCat] || { min: 0, max: 0 };
  
  // Apply age adjustments
  const adjustedMin = baseRange.min + ageAdj.min;
  const adjustedMax = baseRange.max + ageAdj.max;
  
  return {
    min: Math.max(0, adjustedMin),
    max: Math.max(adjustedMin + 0.1, adjustedMax)
  };
}

function analyzeBiomarker(biomarker, profile) {
  const def = BIOMARKER_DATABASE[biomarker.id];
  if (!def) {
    // Unknown biomarker - use provided ranges
    const status = biomarker.value < biomarker.min ? 'low' : 
                   biomarker.value > biomarker.max ? 'high' : 'normal';
    return {
      ...biomarker,
      status,
      interpretation: `Value is ${status} relative to reference range.`,
      recommendation: 'Consult your healthcare provider for personalized advice.'
    };
  }
  
  const range = calculatePersonalizedRange(def, profile);
  const value = parseFloat(biomarker.value);
  
  // Determine status
  let status;
  if (value < range.min) status = 'low';
  else if (value > range.max) status = 'high';
  else status = 'normal';
  
  return {
    id: def.id,
    category: def.category,
    name: def.name,
    value: value,
    unit: def.unit,
    min: range.min,
    max: range.max,
    status,
    interpretation: def.interpretations[status],
    recommendation: def.recommendations[status]
  };
}

function calculateHealthScore(analyzedBiomarkers) {
  if (analyzedBiomarkers.length === 0) return 0;
  
  const weights = {
    normal: 1,
    low: 0.7,
    high: 0.7
  };
  
  const criticalBiomarkers = ['glucose', 'cholesterol_total', 'hdl', 'ldl', 'creatinine'];
  
  let totalScore = 0;
  let totalWeight = 0;
  
  analyzedBiomarkers.forEach(b => {
    const isCritical = criticalBiomarkers.includes(b.id);
    const weight = isCritical ? 2 : 1;
    totalScore += weights[b.status] * weight * 100;
    totalWeight += weight;
  });
  
  return Math.round(totalScore / totalWeight);
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
  
  try {
    const { profile, biomarkers } = req.body;
    
    if (!profile || !biomarkers || !Array.isArray(biomarkers)) {
      res.status(400).json({ 
        error: 'Invalid request. Required: profile (object) and biomarkers (array)' 
      });
      return;
    }
    
    // Validate profile
    if (!profile.age || !profile.gender) {
      res.status(400).json({ 
        error: 'Profile must include age and gender' 
      });
      return;
    }
    
    // Analyze each biomarker
    const analyzed = biomarkers.map(b => analyzeBiomarker(b, profile));
    
    // Calculate overall health score
    const score = calculateHealthScore(analyzed);
    
    // Group by category
    const byCategory = analyzed.reduce((acc, b) => {
      if (!acc[b.category]) acc[b.category] = [];
      acc[b.category].push(b);
      return acc;
    }, {});
    
    res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      profile,
      summary: {
        totalBiomarkers: analyzed.length,
        normal: analyzed.filter(b => b.status === 'normal').length,
        low: analyzed.filter(b => b.status === 'low').length,
        high: analyzed.filter(b => b.status === 'high').length,
        healthScore: score
      },
      byCategory,
      biomarkers: analyzed
    });
    
  } catch (error) {
    console.error('Analysis error:', error);
    res.status(500).json({ 
      error: 'Analysis failed', 
      message: error.message 
    });
  }
};