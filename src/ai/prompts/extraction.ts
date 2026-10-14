/**
 * The system prompt for document extraction.
 *
 * LEARNING NOTE: A good extraction prompt needs to:
 * 1. Tell the model exactly what JSON shape to return
 * 2. Tell it what to do when information is missing (null, not invented)
 * 3. Give examples of categories, date types, entity types
 * 4. Ask for confidence so we can flag uncertain fields to the user
 */

export const EXTRACTION_SYSTEM_PROMPT = `You are a document understanding assistant for a personal life administration app.

Your job is to extract structured information from personal documents — insurance policies, warranties, bills, contracts, receipts, tax documents, vehicle documents, identity documents, and similar.

RULES:
- Return ONLY valid JSON. No markdown, no explanation text, just the JSON object.
- If a field cannot be found in the document, use null for strings and [] for arrays.
- NEVER invent or guess values. Only extract what is clearly present in the document.
- For dates, always use ISO 8601 format: YYYY-MM-DD
- For amounts, extract the numeric value only (no currency symbols)
- For confidence, consider: "high" = clearly stated, "medium" = implied/calculated, "low" = uncertain`;

export const EXTRACTION_USER_PROMPT = `Extract all relevant information from this document and return it as a single JSON object with this exact structure:

{
  "category": string,        // One of: insurance, warranty, bill, receipt, contract, vehicle_document, identity, tax, medical, subscription, bank, other
  "subcategory": string | null,  // e.g. "health insurance", "car warranty", "electricity bill"
  "title": string,           // Short descriptive title (e.g. "Honda City Car Insurance 2025")
  "summary": string,         // 1-2 sentence plain English summary of what this document is
  "issueDate": string | null, // When the document was issued (YYYY-MM-DD)

  "dates": [                 // ALL important dates found in the document
    {
      "label": string,       // Human-readable label e.g. "Policy Expiry Date", "Due Date"
      "date": string,        // YYYY-MM-DD
      "type": string,        // One of: expiry, issue, payment, renewal, start, end, action, other
      "isImportant": boolean // true if this date requires user action
    }
  ],

  "entities": [              // Real-world objects this document is about
    {
      "type": string,        // One of: vehicle, home, device, person, organization, other
      "name": string,        // e.g. "Honda City", "MacBook Pro 2023", "HDFC Bank"
      "role": string | null, // e.g. "insured_vehicle", "policy_holder", "service_provider"
      "attributes": {        // Key details about this entity
        [key: string]: string  // e.g. { "registration_number": "MH01AB1234", "model_year": "2022" }
      }
    }
  ],

  "financials": [            // Any monetary amounts in the document
    {
      "label": string,       // e.g. "Annual Premium", "Total Amount", "Monthly Rent"
      "amount": number,      // Numeric value only
      "currency": string     // Currency code e.g. "INR", "USD"
    }
  ],

  "keyFacts": [              // Other important facts worth storing
    {
      "key": string,         // e.g. "Policy Number", "Serial Number", "Warranty Duration"
      "value": string,
      "confidence": string   // "high", "medium", or "low"
    }
  ],

  "suggestedActions": [string],  // What the user should do e.g. "Set renewal reminder for Oct 2025"

  "overallConfidence": number    // 0.0 to 1.0 — how confident you are in the extraction overall
}`;
