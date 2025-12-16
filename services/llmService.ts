
import { AppConfig, FormatType, JudgeCriteria, ModelProvider } from "../types";


// Initial Gemini client - REMOVED or kept as legacy if needed? 
// The user requested "generic openai compatible api", so we will focus on that.
// We will use standard fetch for everything to be "generic".

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
    const modelToUse = baseModelToUse; // Simplified, version logic can be handled by user inputing full model name

    if (config.provider === 'local') {
        return generateGenericOpenAIRequest(
            prompt,
            config,
            modelToUse,
            config.localEndpoint,
            '' // No API key for local usually
        );
    } else if (config.provider === 'cloud') {
        if (!config.cloudEndpoint || !config.cloudApiKey) {
            throw new Error("Cloud provider requires an Endpoint and API Key.");
        }
        return generateGenericOpenAIRequest(
            prompt,
            config,
            modelToUse,
            config.cloudEndpoint,
            config.cloudApiKey
        );
    } else {
        // Legacy Gemini fallback or Error
        return generateGenericOpenAIRequest(
            prompt,
            config,
            modelToUse,
            config.cloudEndpoint || 'https://generativelanguage.googleapis.com/v1beta/openai/', // Fallback/Test
            config.cloudApiKey || process.env.GEMINI_API_KEY || ''
        );
    }
};

const generateGenericOpenAIRequest = async (
    prompt: string,
    config: AppConfig,
    model: string,
    endpoint: string,
    apiKey: string
): Promise<string> => {
    try {
        // Clean endpoint: remove trailing slash
        let url = endpoint.endsWith('/') ? endpoint.slice(0, -1) : endpoint;

        // Ensure it ends with /chat/completions if not already (and not just base url)
        // Common pattern: User enters "https://openrouter.ai/api/v1" -> we append "/chat/completions"
        // If they enter full path, we respect it.
        if (!url.endsWith('/chat/completions') && !url.endsWith('/generateContent')) {
            url = `${url}/chat/completions`;
        }

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };
        if (apiKey) {
            headers['Authorization'] = `Bearer ${apiKey}`;
        }

        const body = {
            model: model,
            messages: [
                { role: 'system', content: config.systemInstruction },
                { role: 'user', content: prompt }
            ],
            temperature: config.temperature,
            max_tokens: config.maxOutputTokens,
            top_p: config.topP,
            stream: false
        };

        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`API Error (${response.status}): ${errText}`);
        }

        const data = await response.json();
        return data.choices?.[0]?.message?.content || "No summary generated.";

    } catch (error) {
        console.error(`LLM API Error (${model}):`, error);
        throw new Error(`Failed to generate summary with ${model}. Check console for details.`);
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
    endpoint: string,
    apiKey: string, // Changed from localEndpoint only
    referenceSummary?: string
): Promise<EvaluationResult> => {

    const hasReference = referenceSummary && referenceSummary.trim().length > 0;

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
        const config: any = {
            systemInstruction: "You are a strict and precise evaluator. Output only valid JSON. No markdown formatting.",
            temperature: 0.1,
            maxOutputTokens: 1000,
            topP: 0.95
        };
        // Use the generic request for judging too
        responseText = await generateGenericOpenAIRequest(prompt, config, model, endpoint, apiKey);

        // Parse JSON
        try {
            const jsonStr = responseText.replace(/```json\n?|\n?```/g, '').trim();
            const result = JSON.parse(jsonStr);

            const evaluationResult: EvaluationResult = {
                score: typeof result.score === 'number' ? Math.min(10, Math.max(0, result.score)) : 0,
                note: result.note || "No explanation provided.",
                comparedToReference: hasReference
            };

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
