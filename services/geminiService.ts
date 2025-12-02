
import { GoogleGenAI } from "@google/genai";
import { AppConfig, FormatType } from "../types";

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
