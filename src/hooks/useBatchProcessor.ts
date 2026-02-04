import { useState, useRef, useCallback } from 'react';
import { AppConfig, BatchItem, HistoryItem } from '../../types';
import { generateSummary, evaluateSummary } from '../../services/llmService';

interface UseBatchProcessorProps {
    config: AppConfig;
    batchItems: BatchItem[];
    setBatchItems: React.Dispatch<React.SetStateAction<BatchItem[]>>;
}

export const useBatchProcessor = ({ config, batchItems, setBatchItems }: UseBatchProcessorProps) => {
    const [isGenerating, setIsGenerating] = useState(false);
    const abortControllerRef = useRef<AbortController | null>(null);

    const stopBatch = useCallback(() => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
            setIsGenerating(false);
        }
    }, []);

    const processBatch = useCallback(async () => {
        if (batchItems.length === 0) return;

        setIsGenerating(true);
        abortControllerRef.current = new AbortController();
        const signal = abortControllerRef.current.signal;

        // Process items that are not 'done'
        const pendingItems = batchItems.filter(i => i.status !== 'done');

        try {
            for (const item of pendingItems) {
                if (signal.aborted) break;

                // Update status to processing
                setBatchItems(prev => prev.map(pi => pi.id === item.id ? { ...pi, status: 'processing' } : pi));

                const itemResults: Record<string, string> = {};
                const itemEvaluations: Record<string, any> = {};

                // Run all active configurations for this item
                // Note: internal concurrency for configs is fine, but we might want to check signal inside this loop too
                await Promise.all(config.activeRunConfigs.map(async (configId) => {
                    if (signal.aborted) return;

                    const runConfig = config.runConfigurations.find(c => c.id === configId);
                    if (!runConfig) return;

                    const tempConfig: AppConfig = {
                        ...config,
                        provider: runConfig.provider,
                        activeModels: [runConfig.model],
                        systemInstruction: runConfig.systemInstruction,
                        temperature: runConfig.temperature,
                        topK: runConfig.topK,
                        topP: runConfig.topP,
                        maxOutputTokens: runConfig.maxOutputTokens,
                        tone: runConfig.tone,
                        format: runConfig.format,
                        customFocus: runConfig.customFocus,
                        maxWords: runConfig.maxWords
                    };

                    try {
                        const result = await generateSummary(item.sourceText, tempConfig, runConfig.model); // verify if generateSummary supports signal passes
                        if (signal.aborted) return;

                        itemResults[configId] = result;

                        // --- LLM Judge Evaluation ---
                        try {
                            const judgeProvider = config.useMainModelAsJudge ? runConfig.provider : config.judgeProvider;
                            const judgeModel = config.useMainModelAsJudge ? runConfig.model : config.judgeModel;

                            if (judgeModel) {
                                let currentJudgeEndpoint = config.localEndpoint;
                                let currentJudgeKey = '';

                                if (judgeProvider === 'cloud') {
                                    if (config.useMainModelAsJudge) {
                                        currentJudgeEndpoint = config.cloudEndpoint;
                                        currentJudgeKey = config.cloudApiKey;
                                    } else {
                                        currentJudgeEndpoint = config.judgeEndpoint || config.cloudEndpoint;
                                        currentJudgeKey = config.cloudApiKey;
                                    }
                                } else {
                                    if (config.useMainModelAsJudge) {
                                        currentJudgeEndpoint = config.localEndpoint;
                                    } else {
                                        currentJudgeEndpoint = config.judgeEndpoint || config.localEndpoint;
                                    }
                                }

                                if (signal.aborted) return;

                                const evaluation = await evaluateSummary(
                                    item.sourceText,
                                    result,
                                    config.judgeCriteria,
                                    judgeProvider,
                                    judgeModel,
                                    currentJudgeEndpoint,
                                    currentJudgeKey,
                                    item.referenceSummary
                                );

                                itemEvaluations[configId] = {
                                    score: evaluation.score,
                                    note: evaluation.note,
                                    isGroundTruth: false,
                                    criteriaScores: evaluation.criteriaScores,
                                    comparedToReference: evaluation.comparedToReference
                                };
                            }
                        } catch (evalErr) {
                            console.error("Evaluation error:", evalErr);
                            itemEvaluations[configId] = { score: 0, note: "Evaluation failed", isGroundTruth: false };
                        }

                    } catch (e: any) {
                        console.error(`Batch generation error for ${runConfig.name} (${runConfig.model}):`, e);
                        itemResults[configId] = `Error: ${e.message}`;
                        itemEvaluations[configId] = { score: 0, note: "Generation failed", isGroundTruth: false };
                    }
                }));

                if (signal.aborted) break;

                // Update item with results and evaluations
                setBatchItems(prev => prev.map(pi => pi.id === item.id ? {
                    ...pi,
                    status: 'done',
                    results: itemResults,
                    evaluations: itemEvaluations
                } : pi));
            }
        } finally {
            setIsGenerating(false);
            abortControllerRef.current = null;
        }
    }, [batchItems, config, setBatchItems]);

    return { isGenerating, processBatch, stopBatch };
};
