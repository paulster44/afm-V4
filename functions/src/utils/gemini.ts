import { GoogleGenAI, Type } from '@google/genai';

const prompt = `You are parsing a musician's union document into a JSON configuration object for a contract management app.

## DOCUMENT TYPES
The document may be one of:
1. **Contract form** (e.g. L-1, LS-1, B-7) — has fillable fields like purchaser name, date, venue. Extract all fields, wage scales, and rules.
2. **Wage scale / rate schedule** — lists pay rates, cartage fees, travel rates, premiums. Extract wage scales, rules, and additional fees. ALSO generate the full standard set of contract fields (see STANDARD FIELDS below) so the contract type is ready to use immediately. Use calculationModel "live_engagement".
3. **Bylaws / policy document** — extract relevant rules and legal text. Set "fields" to an empty array.

For wage scale documents: extract ALL wage scales found (casual, concert, by class). For cartage fees, use id prefix "ws_cartage_" (e.g. "ws_cartage_harp"). Summarize conditions/definitions briefly in legalText if relevant.

## STANDARD FIELDS (always include for wage scale documents)
When parsing a wage scale / rate schedule, generate these standard contract fields so the output is a complete, usable contract type:
- "purchaserName" (text, required, group: "Purchaser (Employer) Details")
- "purchaserAddress" (textarea, required, group: "Purchaser (Employer) Details")
- "purchaserPhone" (text, group: "Purchaser (Employer) Details")
- "engagementDate" (date, required, group: "Engagement Details")
- "engagementType" (select, required, dataSource: "wageScales", group: "Engagement Details")
- "engagementDuration" (number, required, group: "Engagement Details", description: "Total hours of engagement", min: 0)
- "venueName" (text, required, group: "Engagement Details")
- "venueAddress" (textarea, group: "Engagement Details")
- "startTime" (time, group: "Engagement Details")
- "rehearsalHours" (number, group: "Compensation", min: 0, defaultValue: 0)
- "rehearsalRate" (currency, group: "Compensation", min: 0)
- "overtimeHours" (number, group: "Compensation", min: 0, defaultValue: 0)
- "additionalTerms" (textarea, group: "Agreement Terms")
You may add additional fields if the document specifies them, but always include at least these.

## TOP-LEVEL FIELDS
- "id": snake_case unique ID (e.g. "local_live_engagement", "media_report_b7")
- "name": descriptive name (e.g. "Local Live Engagement")
- "formIdentifier": short code for PDFs (e.g. "AFM_L1_Engagement_47")
- "calculationModel": MUST be one of: "live_engagement", "media_report", "contribution_only"
- "signatureType": MUST be one of: "engagement", "media_report", "member", "petitioner"
- "jurisdiction": if specified (e.g. "Canada (Ontario)"), otherwise omit
- "currency": { "symbol": "$", "code": "USD" } — assume USD unless document specifies otherwise
- "summary": MUST be an empty array []

## FIELDS (form inputs, each becomes a UI field grouped into accordion sections)
Each field MUST have:
- "id": camelCase identifier (e.g. "purchaserName", "engagementDate")
- "label": human-readable label
- "type": MUST be exactly one of: "text", "date", "time", "currency", "number", "textarea", "select"
  - Use "currency" for dollar/money amounts, "number" for hours/counts, "date" for dates, "time" for times
  - Use "textarea" for multi-line text (addresses, notes), "text" for single-line
  - Use "select" for fields with predefined choices
- "required": boolean
- "group": accordion section name. Use these standard names where applicable:
  "Agreement Terms", "Purchaser (Employer) Details", "Engagement Details", "Session Details", "Compensation", "Project Details", "Personnel"

For select fields, use EITHER:
- "options": ["Choice A", "Choice B"] for static choices, OR
- "dataSource": "wageScales" to populate from the wageScales array (for engagement type / rate selection)
Never use both options and dataSource on the same field.

Optional field properties: "placeholder", "description" (tooltip), "min" (for number/currency), "minLength" (for text), "defaultValue"

## WAGE SCALES
Array of pay rates. EVERY wage scale entry MUST have ALL four of these fields — no exceptions:
- "id": snake_case (e.g. "casual_2_5_hour", "concert_single_2_5_hour", "ws_cartage_harp")
- "name": display name INCLUDING duration in parentheses (e.g. "Casual: Single Service (2.5 hours)")
- "rate": number — the dollar amount
- "duration": number — the number of hours for this rate. NEVER omit this. Use the hours stated in the document. For cartage/equipment fees that are per-event (not hourly), set duration to 0.

Cartage fees: use id prefix "ws_cartage_" (e.g. "ws_cartage_harp", "ws_cartage_drums"). These are equipment transport fees and should have duration: 0.

## RULES (financial calculation rules — extract ALL that appear in the document)
You MUST extract every financial rule mentioned. Common ones include:
- "overtimeRate": multiplier (e.g. 1.5 for time-and-a-half)
- "pensionContribution": { "rate": percentage number (e.g. 8.72 for 8.72%), "basedOn": [...], "description": "..." }
- "healthContribution": { "ratePerMusicianPerService": flat dollar amount, "description": "..." }
- "workDues": { "rate": percentage, "basedOn": [...], "description": "..." }
- "leaderPremium": { "rate": multiplier (e.g. 2.0 for double scale), "description": "..." }
- "doublingPremium": { "rate": multiplier for first double (e.g. 0.15 for 15%), "description": "include all doubling tiers if listed" }

Look for: pension/retirement %, health/welfare $, work dues %, leader/contractor pay, doubling premiums, holiday premiums, overtime rates, rehearsal rates, travel rates.
Valid "basedOn" values: "totalScaleWages", "overtimePay", "scaleWages", "sessionWages"

## LEGAL TEXT
Extract clauses into "legalText" with logical keys (e.g. "preamble", "clause_governingLaw", "clause_arbitration", "clause_termination").
IMPORTANT: Keep each clause to 1-2 sentences summarizing the key point. Do NOT copy full legal paragraphs — brevity is critical to avoid output truncation.

## ADDITIONAL FEES
Extract travel rates, music preparation rates, equipment rental fees, and other per-service or per-musician fees into the "additionalFees" array. Each entry MUST have:
- "id": snake_case unique ID (e.g. "travel_mileage", "music_prep_copying")
- "name": display name (e.g. "Mileage Reimbursement", "Music Copying Fee")
- "rate": dollar amount per unit
- "category": grouping label — use standard names: "Travel", "Music Preparation", "Equipment"
- "perMusician": true if the fee applies per musician (e.g. mileage, per diem), false if it is a flat fee

Do NOT put travel, music preparation, or equipment rental rates into wageScales. Those belong in additionalFees.
Cartage fees for instrument transport still go in wageScales with "ws_cartage_" prefix as before.

## CRITICAL INSTRUCTIONS
- Extract EVERY fillable field from the document — typical contracts have 8-20+ fields across multiple groups
- Extract EVERY wage scale with its rate AND duration — never omit duration
- Extract ALL financial rules: pension %, health $, work dues %, leader premium, doubling premium, overtime rate, holiday premiums
- Do NOT limit yourself to the example below — it is only a structural reference showing the correct format
- Thoroughly scan every page and section of the document

## EXAMPLE (format reference only — your output should have MORE fields and ALL rules from the document)
{ "id": "local_live_engagement", "name": "Local Live Engagement", "formIdentifier": "AFM_L1_Engagement_47", "calculationModel": "live_engagement", "signatureType": "engagement", "summary": [],
  "wageScales": [
    { "id": "casual_single_2_5_hour", "name": "Casual: Single Service (2.5 hours)", "rate": 175, "duration": 2.5 },
    { "id": "ws_cartage_harp", "name": "Cartage: Harp", "rate": 60, "duration": 0 },
    { "id": "ws_cartage_drums", "name": "Cartage: Drums/Timpani", "rate": 45, "duration": 0 }
  ],
  "fields": [
    { "id": "purchaserName", "label": "Purchaser Name", "type": "text", "required": true, "group": "Purchaser (Employer) Details" },
    { "id": "engagementDate", "label": "Date of Engagement", "type": "date", "required": true, "group": "Engagement Details" },
    { "id": "engagementType", "label": "Type of Engagement", "type": "select", "required": true, "dataSource": "wageScales", "group": "Engagement Details" }
  ],
  "rules": { "overtimeRate": 1.5, "pensionContribution": { "rate": 8.72, "basedOn": ["totalScaleWages", "overtimePay"], "description": "8.72% of gross wages" }, "leaderPremium": { "rate": 2.0, "description": "Leader receives double scale" }, "doublingPremium": { "rate": 0.15, "description": "15% for first double, 10% for each additional" } }
}

Now analyze the attached document exhaustively and produce a complete JSON object with ALL fields, wage scales, and rules found.`;

const responseSchema = {
    type: Type.OBJECT,
    required: ['id', 'name', 'formIdentifier', 'calculationModel', 'signatureType', 'wageScales', 'rules', 'summary', 'additionalFees'],
    properties: {
        id: { type: Type.STRING },
        name: { type: Type.STRING },
        formIdentifier: { type: Type.STRING },
        calculationModel: { type: Type.STRING, enum: ['live_engagement', 'media_report', 'contribution_only'] },
        signatureType: { type: Type.STRING, enum: ['engagement', 'media_report', 'member', 'petitioner'] },
        jurisdiction: { type: Type.STRING },
        currency: { type: Type.OBJECT, properties: { symbol: { type: Type.STRING }, code: { type: Type.STRING } } },
        fields: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: {
            id: { type: Type.STRING },
            label: { type: Type.STRING },
            type: { type: Type.STRING, enum: ['text', 'date', 'time', 'currency', 'number', 'textarea', 'select'] },
            required: { type: Type.BOOLEAN },
            group: { type: Type.STRING },
            placeholder: { type: Type.STRING },
            description: { type: Type.STRING },
            options: { type: Type.ARRAY, items: { type: Type.STRING } },
            dataSource: { type: Type.STRING, enum: ['wageScales'] },
            min: { type: Type.NUMBER },
            minLength: { type: Type.NUMBER },
            defaultValue: { type: Type.STRING },
        } } },
        wageScales: { type: Type.ARRAY, items: { type: Type.OBJECT, required: ['id', 'name', 'rate', 'duration'], properties: {
            id: { type: Type.STRING },
            name: { type: Type.STRING },
            rate: { type: Type.NUMBER },
            duration: { type: Type.NUMBER },
            description: { type: Type.STRING },
        } } },
        rules: { type: Type.OBJECT, properties: {
            overtimeRate: { type: Type.NUMBER },
            leaderPremium: { type: Type.OBJECT, properties: { rate: { type: Type.NUMBER }, description: { type: Type.STRING } } },
            doublingPremium: { type: Type.OBJECT, properties: { rate: { type: Type.NUMBER }, description: { type: Type.STRING } } },
            pensionContribution: { type: Type.OBJECT, properties: { rate: { type: Type.NUMBER }, description: { type: Type.STRING }, basedOn: { type: Type.ARRAY, items: { type: Type.STRING } } } },
            healthContribution: { type: Type.OBJECT, properties: { ratePerMusicianPerService: { type: Type.NUMBER }, description: { type: Type.STRING } } },
            workDues: { type: Type.OBJECT, properties: { rate: { type: Type.NUMBER }, description: { type: Type.STRING }, basedOn: { type: Type.ARRAY, items: { type: Type.STRING } } } },
        } },
        additionalFees: { type: Type.ARRAY, items: { type: Type.OBJECT, required: ['id', 'name', 'rate', 'category', 'perMusician'], properties: {
            id: { type: Type.STRING },
            name: { type: Type.STRING },
            rate: { type: Type.NUMBER },
            category: { type: Type.STRING },
            perMusician: { type: Type.BOOLEAN },
        } } },
        summary: { type: Type.ARRAY, items: {} },
        legalText: { type: Type.OBJECT, properties: {
            preamble: { type: Type.STRING },
            clause_governingLaw: { type: Type.STRING },
            clause_disputes: { type: Type.STRING },
        } },
    }
};

/** Attempt to repair truncated JSON from LLM output */
function repairTruncatedJson(text: string): object | null {
    // Try parsing as-is first
    try { return JSON.parse(text); } catch { /* continue */ }

    // Remove any trailing incomplete string value (cut mid-string)
    let repaired = text.replace(/,\s*"[^"]*$/, '');          // trailing key without value
    repaired = repaired.replace(/:\s*"[^"]*$/, ': ""');       // value cut mid-string
    repaired = repaired.replace(/,\s*$/, '');                 // trailing comma

    // Close any open brackets/braces
    const opens = { '{': 0, '[': 0 };
    let inString = false;
    let escape = false;
    for (const ch of repaired) {
        if (escape) { escape = false; continue; }
        if (ch === '\\') { escape = true; continue; }
        if (ch === '"') { inString = !inString; continue; }
        if (inString) continue;
        if (ch === '{') opens['{']++;
        if (ch === '}') opens['{']--;
        if (ch === '[') opens['[']++;
        if (ch === ']') opens['[']--;
    }

    // Close unclosed structures
    for (let i = 0; i < opens['[']; i++) repaired += ']';
    for (let i = 0; i < opens['{']; i++) repaired += '}';

    try { return JSON.parse(repaired); } catch { return null; }
}

export async function scanContractDocument(fileBuffer: Buffer, mimeType: string): Promise<{ success: boolean; data?: object; error?: string }> {
    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
        return { success: false, error: 'GEMINI_API_KEY is not configured on the server.' };
    }

    try {
        const ai = new GoogleGenAI({ apiKey: geminiApiKey });
        const base64Data = fileBuffer.toString('base64');

        const response = await ai.models.generateContent({
            model: 'gemini-3.1-flash-lite-preview',
            contents: { parts: [
                { inlineData: { mimeType, data: base64Data } },
                { text: prompt }
            ] },
            config: {
                responseMimeType: 'application/json',
                responseSchema,
                maxOutputTokens: 32768,
            }
        });

        console.log(`[scanContractDocument] model=${response.modelVersion}, finishReason=${response.candidates?.[0]?.finishReason}, outputLength=${response.text?.length}`);
        const jsonText = response.text || '{}';
        let parsedJson: object;
        try {
            parsedJson = JSON.parse(jsonText);
        } catch {
            // Gemini output was likely truncated at token limit — attempt repair
            const repaired = repairTruncatedJson(jsonText);
            if (!repaired) {
                return { success: false, error: 'AI response was truncated and could not be repaired' };
            }
            parsedJson = repaired;
        }
        return { success: true, data: parsedJson };
    } catch (err) {
        const message = err instanceof Error ? err.message : 'AI scan failed';
        console.error('[scanContractDocument]', err);
        return { success: false, error: message };
    }
}
