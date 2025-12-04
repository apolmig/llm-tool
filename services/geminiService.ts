
import { GoogleGenAI } from "@google/genai";
import { AppConfig, FormatType, JudgeCriteria, ModelProvider } from "../types";


// Initialize Gemini client
// Note: Only used if provider is 'gemini'
const getAiClient = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

export const buildPrompt = (text: string, config: AppConfig): string => {
  let userPrompt = `Please summarize the following text.\n\nOriginal Text:\n"${text}"\n\nRequirements:`;
  userPrompt += `\n- Tone: ${config.tone}`;
  userPrompt += `\n- Format: ${config.format}`;
  userPrompt += `\n- Maximum Length: ${config.maxWords} words`;
  userPrompt += `\n- LANGUAGE CONSTRAINT: The summary MUST be written in the EXACT SAME LANGUAGE as the Original Text. Do not translate.`;

  if (config.customFocus) {
    userPrompt += `\n- Pay special attention to: ${config.customFocus}`;
  }

  if (config.format === FormatType.JSON) {
    userPrompt += `\n- Return the result as a valid JSON object with a 'summary' key and a 'key_points' array.`;
  }

  return userPrompt;
};

export const generateSummary = async (
  text: string,
  config: AppConfig,
  modelOverride?: string
): Promise<string> => {
  const prompt = buildPrompt(text, config);

  // Use the override if provided, otherwise fallback to the first active model
  const baseModelToUse = modelOverride || config.activeModels[0];

  // Construct Final Model String with Version
  let finalModel = baseModelToUse;
  if (config.modelVersion && config.modelVersion.trim() !== '') {
    if (config.provider === 'gemini') {
      // For Gemini: Append with dash (e.g., gemini-1.5-flash-001)
      finalModel = `${baseModelToUse}-${config.modelVersion.trim()}`;
    } else {
      // For Local: Append with colon if typically used for tags (e.g., llama3:latest) 
      // or dash depending on user preference, but standard ollama/docker style is colon for tags.
      // To be safe and generic, we append with colon for local as it's the standard tag separator.
      finalModel = `${baseModelToUse}:${config.modelVersion.trim()}`;
    }
  }

  if (config.provider === 'local') {
    return generateLocalSummary(prompt, config, finalModel);
  } else {
    return generateGeminiSummary(prompt, config, finalModel);
  }
};

const generateGeminiSummary = async (prompt: string, config: AppConfig, model: string): Promise<string> => {
  try {
    const ai = getAiClient();
    const response = await ai.models.generateContent({
      model: model,
      contents: prompt,
      config: {
        temperature: config.temperature,
        topK: config.topK,
        topP: config.topP,
        maxOutputTokens: config.maxOutputTokens,
        systemInstruction: config.systemInstruction,
        responseMimeType: config.format === FormatType.JSON ? 'application/json' : 'text/plain',
      },
    });

    return response.text || "No summary generated.";
  } catch (error) {
    console.error(`Gemini API Error (${model}):`, error);
    throw new Error(`Failed to generate summary with ${model}.`);
  }
};

const generateLocalSummary = async (prompt: string, config: AppConfig, model: string): Promise<string> => {
  try {
    // Standard OpenAI-compatible format (used by Ollama, LM Studio, LocalAI)
    const response = await fetch(config.localEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: 'system', content: config.systemInstruction },
          { role: 'user', content: prompt }
        ],
        temperature: config.temperature,
        max_tokens: config.maxOutputTokens,
        top_p: config.topP,
        stream: false
      }),
    });

    if (!response.ok) {
      throw new Error(`Local server error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || "No summary generated from local model.";
  } catch (error) {
    console.error(`Local LLM Error (${model}):`, error);
    throw new Error(`Failed to connect to Local LLM (${model}). Ensure your local server is running.`);
  }
};

export interface EvaluationResult {
  score: number;
  note: string;
  criteriaScores?: Record<string, number>;
  comparedToReference?: boolean;
}

export const evaluateSummary = async (
  originalText: string,
  generatedSummary: string,
  criteria: JudgeCriteria[],
  provider: ModelProvider,
  model: string,
  localEndpoint: string,
  referenceSummary?: string
): Promise<EvaluationResult> => {

  const hasReference = referenceSummary && referenceSummary.trim().length > 0;

  // Build Evaluation Prompt - different approach based on whether reference exists
  let prompt = `You are an expert AI evaluator. Your task is to grade the quality of a generated summary.

Original Text:
"""
${originalText}
"""

Generated Summary:
"""
${generatedSummary}
"""
`;

  // Add reference comparison section if available
  if (hasReference) {
    prompt += `
Reference Summary (Gold Standard):
"""
${referenceSummary}
"""

IMPORTANT: Compare the Generated Summary against both the Original Text AND the Reference Summary.
The Reference Summary represents high-quality output - use it as a benchmark for evaluation.
`;
  }

  prompt += `
Evaluation Criteria:
`;

  criteria.forEach(c => {
    prompt += `- ${c.name} (Weight: ${c.weight}%): ${c.description}\n`;
  });

  prompt += `
Instructions:
1. Evaluate the summary against each criterion.
2. Assign a score from 0 to 10 for EACH criterion individually.
3. Calculate the final weighted score (0-10).
4. Provide a brief explanation for the score.
${hasReference ? '5. Note how well the generated summary compares to the reference.' : ''}

OUTPUT FORMAT:
You must return a valid JSON object in the following format:
{
  "score": <number_0_to_10>,
  "note": "<short_explanation>",
  "criteriaScores": {
${criteria.map(c => `    "${c.name}": <number_0_to_10>`).join(',\n')}
  }
}
`;

  let responseText = "";

  try {
    if (provider === 'local') {
      // Re-use local generation logic but with specific prompt
      const config: any = {
        localEndpoint,
        systemInstruction: "You are a strict and precise evaluator. Output only valid JSON. No markdown formatting.",
        temperature: 0.1, // Low temp for consistency
        maxOutputTokens: 800,
        topP: 0.95
      };
      responseText = await generateLocalSummary(prompt, config, model);
    } else {
      // Gemini
      const ai = getAiClient();
      const response = await ai.models.generateContent({
        model: model,
        contents: prompt,
        config: {
          temperature: 0.1,
          responseMimeType: 'application/json',
        },
      });
      responseText = response.text || "{}";
    }

    // Parse JSON
    try {
      // Clean up markdown code blocks if present
      const jsonStr = responseText.replace(/```json\n?|\n?```/g, '').trim();
      const result = JSON.parse(jsonStr);

      // Build result with criteria scores
      const evaluationResult: EvaluationResult = {
        score: typeof result.score === 'number' ? Math.min(10, Math.max(0, result.score)) : 0,
        note: result.note || "No explanation provided.",
        comparedToReference: hasReference
      };

      // Extract per-criterion scores if provided
      if (result.criteriaScores && typeof result.criteriaScores === 'object') {
        evaluationResult.criteriaScores = {};
        for (const [key, value] of Object.entries(result.criteriaScores)) {
          if (typeof value === 'number') {
            evaluationResult.criteriaScores[key] = Math.min(10, Math.max(0, value));
          }
        }
      }

      return evaluationResult;
    } catch (e) {
      console.error("Failed to parse evaluation JSON:", responseText);
      return { score: 0, note: "Error parsing evaluator response.", comparedToReference: hasReference };
    }

  } catch (error) {
    console.error("Evaluation failed:", error);
    return {
      score: 0,
      note: `Evaluation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      comparedToReference: hasReference
    };
  }
};

