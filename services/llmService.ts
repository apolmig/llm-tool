
import { AppConfig, FormatType, JudgeCriteria, ModelProvider } from "../types";
import { retryWithBackoff } from "../src/utils/requestQueue";


// Initial Gemini client - REMOVED or kept as legacy if needed? 
// The user requested "generic openai compatible api", so we will focus on that.
// We will use standard fetch for everything to be "generic".

/**
 * Build a prompt for summarization based on user configuration
 * @param text Source text to summarize
 * @param config Application configuration
 * @returns Formatted prompt string
 */
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

/**
 * Validate inputs before making API request
 */
function validateSummaryInputs(text: string, config: AppConfig): { valid: boolean; error?: string } {
    if (!text?.trim()) {
        return { valid: false, error: 'Input text is required and cannot be empty' };
    }

    if (text.length > 1000000) {
        return { valid: false, error: 'Input text is too long (max 1M characters)' };
    }

    if (config.provider === 'cloud') {
        if (!config.cloudEndpoint?.trim()) {
            return { valid: false, error: 'Cloud endpoint is required for cloud provider' };
        }
        if (!config.cloudApiKey?.trim()) {
            return { valid: false, error: 'API key is required for cloud provider' };
        }
    }

    if (config.provider === 'local' && !config.localEndpoint?.trim()) {
        return { valid: false, error: 'Local endpoint is required for local provider' };
    }

    return { valid: true };
}

/**
 * Generate a summary using the configured LLM
 * @param text Source text to summarize
 * @param config Application configuration
 * @param modelOverride Optional model to use instead of config default
 * @returns Generated summary text
 * @throws Error if validation fails or API request fails
 */
export const generateSummary = async (
    text: string,
    config: AppConfig,
    modelOverride?: string
): Promise<string> => {
    // Validate inputs
    const validation = validateSummaryInputs(text, config);
    if (!validation.valid) {
        throw new Error(validation.error);
    }

    const prompt = buildPrompt(text, config);

    // Use the override if provided, otherwise fallback to the first active model
    const baseModelToUse = modelOverride || config.activeModels[0];
    const modelToUse = baseModelToUse; // Simplified, version logic can be handled by user inputing full model name

    if (!modelToUse) {
        throw new Error('No model selected. Please select at least one model.');
    }

    if (config.provider === 'local') {
        return generateGenericOpenAIRequest(
            prompt,
            config,
            modelToUse,
            config.localEndpoint,
            '' // No API key for local usually
        );
    } else if (config.provider === 'cloud') {
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
            config.cloudApiKey || import.meta.env.VITE_GEMINI_API_KEY || ''
        );
    }
};

/**
 * Normalize endpoint URL to ensure it ends with /chat/completions
 */
function normalizeEndpointUrl(endpoint: string): string {
    const urlStr = endpoint.trim();

    try {
        // Parse URL to handle query parameters correctly
        const urlObj = new URL(urlStr);
        const pathname = urlObj.pathname;

        // If path ends with specific endpoints, return original full URL
        if (pathname.endsWith('/chat/completions') || pathname.endsWith('/generateContent')) {
            return urlStr;
        }

        // If ends with /v1, append /chat/completions
        if (pathname.endsWith('/v1')) {
            urlObj.pathname = pathname + '/chat/completions';
            return urlObj.toString();
        }

        // If ends with /models, replace with /chat/completions
        if (pathname.endsWith('/models')) {
            urlObj.pathname = pathname.replace(/\/models$/, '/chat/completions');
            return urlObj.toString();
        }

        // Default: append /chat/completions
        // Ensure we don't double slash
        urlObj.pathname = pathname.replace(/\/+$/, '') + '/chat/completions';
        return urlObj.toString();

    } catch (e) {
        // Fallback for invalid URLs or relative paths (though unlikely for API endpoints)
        let base = urlStr;
        const queryIndex = urlStr.indexOf('?');
        let query = '';

        if (queryIndex !== -1) {
            base = urlStr.substring(0, queryIndex);
            query = urlStr.substring(queryIndex);
        }

        if (base.endsWith('/')) {
            base = base.slice(0, -1);
        }

        if (base.endsWith('/chat/completions') || base.endsWith('/generateContent')) {
            return urlStr;
        }

        if (base.endsWith('/v1')) {
            return `${base}/chat/completions${query}`;
        }

        if (base.endsWith('/models')) {
            return base.replace('/models', '/chat/completions') + query;
        }

        return `${base}/chat/completions${query}`;
    }
}


/**
 * Make a generic OpenAI-compatible API request with retry logic
 * @param prompt User prompt
 * @param config Application configuration
 * @param model Model identifier
 * @param endpoint API endpoint URL
 * @param apiKey API key (optional for local)
 * @returns Generated text response
 */
const generateGenericOpenAIRequest = async (
    prompt: string,
    config: AppConfig,
    model: string,
    endpoint: string,
    apiKey: string
): Promise<string> => {
    // Wrap the actual request in retry logic
    return retryWithBackoff(async () => {
        try {
            const url = normalizeEndpointUrl(endpoint);

            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
            };

            if (apiKey) {
                // Azure OpenAI requires 'api-key' header
                if (url.includes('openai.azure.com') || url.includes('api-version=')) {
                    headers['api-key'] = apiKey;
                } else {
                    headers['Authorization'] = `Bearer ${apiKey}`;
                }
            }

            const body: any = {
                model: model,
                messages: [
                    { role: 'system', content: config.systemInstruction },
                    { role: 'user', content: prompt }
                ],
                temperature: config.temperature,
                top_p: config.topP,
                stream: false
            };

            // Newer models (o1, gpt-5) and some Azure versions require max_completion_tokens
            if (model.includes('o1-') || model.includes('gpt-5') || url.includes('api-version=2025-')) {
                body.max_completion_tokens = config.maxOutputTokens;
                // Reasoning models enforce temperature=1 and often do not support top_p
                body.temperature = 1;
                delete body.top_p;
            } else {
                body.max_tokens = config.maxOutputTokens;
            }

            const response = await fetch(url, {
                method: 'POST',
                headers,
                body: JSON.stringify(body),
            });

            if (!response.ok) {
                const errText = await response.text();

                // Provide more specific error messages
                if (response.status === 401) {
                    throw new Error(`Authentication failed: Invalid API key`);
                } else if (response.status === 429) {
                    throw new Error(`Rate limit exceeded. Please try again later.`);
                } else if (response.status === 404) {
                    throw new Error(`Model "${model}" not found or endpoint incorrect`);
                } else if (response.status >= 500) {
                    throw new Error(`Server error (${response.status}). The API may be temporarily unavailable.`);
                } else {
                    throw new Error(`API Error (${response.status}): ${errText}`);
                }
            }

            const data = await response.json();
            const content = data.choices?.[0]?.message?.content;

            if (!content) {
                // Return detailed error to help debug response structure or safety filters
                const debugInfo = JSON.stringify(data, null, 2);
                console.error("API Response Data:", data);
                if (data.choices?.[0]?.finish_reason === 'content_filter') {
                    throw new Error('Azure OpenAI Content Filter triggered. Please modify your prompt.');
                }
                throw new Error(`No content in API response. Response: ${debugInfo}`);
            }

            return content;

        } catch (error) {
            // Re-throw with more context if it's a network error
            if (error instanceof TypeError && error.message.includes('fetch')) {
                throw new Error(`Network error: Unable to connect to ${endpoint}. Please check your connection and endpoint URL.`);
            }
            throw error;
        }
    }, 3, 1000); // 3 retries with 1s base delay
};


export interface EvaluationResult {
    score: number;
    note: string;
    criteriaScores?: Record<string, number>;
    comparedToReference?: boolean;
}

/**
 * Evaluate a generated summary using an LLM as a judge
 * @param originalText Source text
 * @param generatedSummary Summary to evaluate
 * @param criteria Evaluation criteria with weights
 * @param provider Provider type (cloud/local)
 * @param model Model identifier
 * @param endpoint API endpoint
 * @param apiKey API key (optional for local)
 * @param referenceSummary Optional reference summary for comparison
 * @returns Evaluation result with score and notes
 */
export const evaluateSummary = async (
    originalText: string,
    generatedSummary: string,
    criteria: JudgeCriteria[],
    provider: ModelProvider,
    model: string,
    endpoint: string,
    apiKey: string,
    referenceSummary?: string
): Promise<EvaluationResult> => {

    // Validate inputs
    if (!originalText?.trim() || !generatedSummary?.trim()) {
        return {
            score: 0,
            note: 'Evaluation failed: Missing original text or generated summary',
            comparedToReference: false
        };
    }

    if (!model?.trim() || !endpoint?.trim()) {
        return {
            score: 0,
            note: 'Evaluation failed: Judge model or endpoint not configured',
            comparedToReference: false
        };
    }

    if (!criteria || criteria.length === 0) {
        return {
            score: 0,
            note: 'Evaluation failed: No criteria defined',
            comparedToReference: false
        };
    }

    const hasReference = !!(referenceSummary && referenceSummary.trim().length > 0);

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

        // Use the generic request for judging too (with retry logic)
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
            return {
                score: 0,
                note: `Error parsing evaluator response: ${e instanceof Error ? e.message : 'Invalid JSON'}`,
                comparedToReference: hasReference
            };
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
