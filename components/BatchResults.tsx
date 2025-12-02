
import React, { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { BatchItem, AppConfig } from '../types';
import ReactMarkdown from 'react-markdown';
import { Star, Download, ChevronDown, ChevronRight, MessageSquare, FileJson, Check, Search, X, Target, ArrowUpDown, Settings, FileSpreadsheet } from 'lucide-react';

interface BatchResultsProps {
    items: BatchItem[];
    activeModels: string[]; // Legacy, kept for type compatibility but unused in new logic
    config: AppConfig;
    onUpdateEvaluation: (itemId: string, model: string, field: 'score' | 'note' | 'isGroundTruth', value: any) => void;
}

const BatchResults: React.FC<BatchResultsProps> = ({ items, activeModels, config, onUpdateEvaluation }) => {
    const [expandedRow, setExpandedRow] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [sortCriteria, setSortCriteria] = useState<'default' | 'consistency'>('default');

    // Layout State
    const [visibleColumns, setVisibleColumns] = useState<string[]>([]);
    const [isMaximized, setIsMaximized] = useState(false);
    const [judgingItemId, setJudgingItemId] = useState<string | null>(null);

    // Batch Judge State
    const [isBatchJudging, setIsBatchJudging] = useState(false);
    const [batchJudgeProgress, setBatchJudgeProgress] = useState({ current: 0, total: 0 });

    // Initialize visible columns with all active run configs on mount/change
    React.useEffect(() => {
        setVisibleColumns(config.activeRunConfigs);
    }, [config.activeRunConfigs]);

    // Validate and clamp score between 1 and 10
    const validateScore = (value: number): number => {
        const num = parseInt(String(value));
        if (isNaN(num)) return 1;
        return Math.max(1, Math.min(10, num));
    };

    const toggleColumn = (id: string) => {
        setVisibleColumns(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]);
    };

    // LLM as a Judge
    const judgeWithLLM = async (itemId: string, configId: string) => {
        const item = items.find(i => i.id === itemId);
        const runConfig = config.runConfigurations.find(c => c.id === configId);

        if (!item || !runConfig) return;

        const output = item.results[configId];
        if (!output) {
            alert('No output to judge. Run the batch first.');
            return;
        }

        setJudgingItemId(itemId + '-' + configId);

        try {
            // Improved judge prompt with stricter scoring guidance
            const criteriaText = config.judgeCriteria.map((c, idx) =>
                `${idx + 1}. ${c.name} (${c.weight}%) - ${c.description}`
            ).join('\n');

            const judgePrompt = `You are an expert evaluator of text summaries. Evaluate the following summary using these criteria:

${criteriaText}

Original Text:
${item.sourceText}

Summary to Evaluate:
${output}

Target Length: ${runConfig.maxWords} words
Actual Length: ${output.trim().split(/\s+/).filter(Boolean).length} words

Provide a score from 1-10 where:
- 1-3: Poor (major issues)
- 4-5: Below average (several issues)
- 6-7: Good (minor issues)
- 8-9: Excellent (minimal issues)
- 10: Perfect (no issues)

You MUST respond in this exact format:
Score: [single number 1-10]
Explanation: [brief 2-3 sentence explanation]`;

            // Determine which model to use for judging
            let judgeProvider: 'local' | 'gemini';
            let judgeModel: string;

            if (config.useMainModelAsJudge) {
                // Use the main configuration
                judgeProvider = config.provider;
                judgeModel = config.activeModels[0] || 'gemini-2.5-flash';
            } else {
                // Use dedicated judge configuration
                judgeProvider = config.judgeProvider;
                judgeModel = config.judgeModel || (judgeProvider === 'local' ? '' : 'gemini-2.5-flash');
            }

            const endpoint = judgeProvider === 'local'
                ? config.localEndpoint
                : `https://generativelanguage.googleapis.com/v1beta/models/${judgeModel}:generateContent`;

            let response;
            let judgeOutput = '';

            if (judgeProvider === 'local') {
                // Local LLM (LM Studio)
                response = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model: judgeModel || runConfig.model,
                        messages: [
                            { role: 'system', content: 'You are a strict, objective evaluator of text summaries. Always provide scores between 1-10.' },
                            { role: 'user', content: judgePrompt }
                        ],
                        temperature: 0.2, // Lower temperature for more consistent judging
                        max_tokens: 500
                    })
                });

                if (!response.ok) {
                    throw new Error(`Judge model error: ${response.statusText}`);
                }

                const data = await response.json();
                judgeOutput = data.choices?.[0]?.message?.content || '';
            } else {
                // Gemini API
                const apiKey = (window as any).GEMINI_API_KEY || import.meta.env.VITE_GEMINI_API_KEY;
                response = await fetch(`${endpoint}?key=${apiKey}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: judgePrompt }] }],
                        generationConfig: {
                            temperature: 0.2,
                            maxOutputTokens: 500
                        }
                    })
                });

                if (!response.ok) {
                    throw new Error(`Gemini API error: ${response.statusText}`);
                }

                const data = await response.json();
                judgeOutput = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
            }

            if (!judgeOutput) {
                throw new Error('No response from judge model');
            }

            // Parse score from LLM output - enforce 1-10 range strictly
            const scoreMatch = judgeOutput.match(/Score:\s*(\d+)/i);
            const rawScore = scoreMatch ? parseInt(scoreMatch[1]) : 7;
            const score = validateScore(rawScore); // Clamp to 1-10

            // Extract explanation
            const explanationMatch = judgeOutput.match(/Explanation:\s*(.+)/is);
            const explanation = explanationMatch ? explanationMatch[1].trim() : judgeOutput;

            // Update evaluation
            onUpdateEvaluation(itemId, configId, 'score', score);
            onUpdateEvaluation(itemId, configId, 'note', `🤖 LLM Judge (${judgeProvider === 'local' ? judgeModel || 'local' : judgeModel}): ${explanation}`);

            console.log(`✓ LLM Judge completed for ${item.title || itemId}:`, {
                judgeProvider,
                judgeModel,
                score,
                rawScore,
                explanation: explanation.substring(0, 100)
            });

            return true; // Success
        } catch (error: any) {
            console.error('LLM Judge error:', error);
            const errorMsg = error.message || 'Unknown error';
            onUpdateEvaluation(itemId, configId, 'note', `⚠️ Judge failed: ${errorMsg}`);
            if (!isBatchJudging) {
                alert(`Failed to get LLM judgment: ${errorMsg}`);
            }
            return false; // Failure
        } finally {
            setJudgingItemId(null);
        }
    };
    // Batch Judge - Judge all items with results
    const judgeAllItems = async () => {
        if (isBatchJudging) return;

        const itemsToJudge: Array<{ itemId: string; configId: string }> = [];
        items.forEach(item => {
            config.activeRunConfigs.forEach(configId => {
                const output = item.results[configId];
                if (output && !output.startsWith('Error:')) {
                    itemsToJudge.push({ itemId: item.id, configId });
                }
            });
        });

        if (itemsToJudge.length === 0) {
            alert('No results to judge. Please run the batch process first.');
            return;
        }

        const confirmed = confirm(`Judge all ${itemsToJudge.length} results? This will take some time.`);
        if (!confirmed) return;

        setIsBatchJudging(true);
        setBatchJudgeProgress({ current: 0, total: itemsToJudge.length });

        let successCount = 0;
        let failureCount = 0;

        for (let i = 0; i < itemsToJudge.length; i++) {
            const { itemId, configId } = itemsToJudge[i];
            setBatchJudgeProgress({ current: i + 1, total: itemsToJudge.length });

            const success = await judgeWithLLM(itemId, configId);
            if (success) successCount++;
            else failureCount++;

            await new Promise(resolve => setTimeout(resolve, 500));
        }

        setIsBatchJudging(false);
        setBatchJudgeProgress({ current: 0, total: 0 });

        alert(`Batch judging complete!\n✓ Success: ${successCount}\n✗ Failed: ${failureCount}`);
        console.log(`Batch judge complete: ${successCount} success, ${failureCount} failures`);
    };

    const exportJSONL = () => {
        try {
            // Prepare JSONL format for Gemini Fine-tuning
            const dataset = items.map(item => {
                // Find ground truth model or default to first/best available
                const gtModel = Object.keys(item.evaluations).find(m => item.evaluations[m].isGroundTruth);
                const output = gtModel ? item.results[gtModel] : null;

                if (!output) return null;

                return {
                    messages: [
                        { role: "system", content: config.systemInstruction },
                        { role: "user", content: item.sourceText },
                        { role: "model", content: output }
                    ]
                };
            }).filter(Boolean);

            if (dataset.length === 0) {
                alert('No ground truth data to export. Please mark at least one response as ground truth.');
                return;
            }

            const jsonlContent = dataset.map(d => JSON.stringify(d)).join('\n');
            const blob = new Blob([jsonlContent], { type: 'application/jsonl' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `gemini_ft_dataset_${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`;
            document.body.appendChild(a);
            a.click();

            // Delay cleanup to ensure download starts
            setTimeout(() => {
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }, 100);

            console.log(`Exported ${dataset.length} items to JSONL`);
        } catch (error) {
            console.error('Error exporting JSONL:', error);
            alert('Failed to export JSONL file. Check console for details.');
        }
    };

    const exportExcel = () => {
        try {
            // Prepare data for Excel
            const data: any[] = [];

            items.forEach((item, idx) => {
                const row: any = {
                    'ID': idx + 1,
                    'Title': item.title || '',
                    'Source Text': item.sourceText
                };

                config.activeRunConfigs.forEach(configId => {
                    const runConfig = config.runConfigurations.find(c => c.id === configId);
                    if (runConfig) {
                        const output = item.results[configId] || '';
                        const evaluation = item.evaluations[configId] || { score: '', note: '', isGroundTruth: false };

                        row[`${runConfig.name} - Output`] = output;
                        row[`${runConfig.name} - Score`] = evaluation.score || '';
                        row[`${runConfig.name} - Ground Truth`] = evaluation.isGroundTruth ? 'Yes' : 'No';
                        row[`${runConfig.name} - Notes`] = evaluation.note || '';
                    }
                });

                data.push(row);
            });

            // Create workbook and worksheet
            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.json_to_sheet(data);

            // Auto-width for columns (heuristic)
            const colWidths = [
                { wch: 5 },  // ID
                { wch: 20 }, // Title
                { wch: 50 }, // Source Text
            ];

            // Add widths for config columns
            config.activeRunConfigs.forEach(() => {
                colWidths.push({ wch: 50 }); // Output
                colWidths.push({ wch: 8 });  // Score
                colWidths.push({ wch: 12 }); // GT
                colWidths.push({ wch: 20 }); // Notes
            });

            ws['!cols'] = colWidths;

            XLSX.utils.book_append_sheet(wb, ws, "Batch Results");

            // Write file
            XLSX.writeFile(wb, `batch_results_${new Date().toISOString().replace(/[:.]/g, '-')}.xlsx`);

            console.log(`Exported ${items.length} items to Excel`);
        } catch (error) {
            console.error('Error exporting Excel:', error);
            alert('Failed to export Excel file. Check console for details.');
        }
    };

    const exportCSV = () => {
        try {
            // Prepare CSV with comprehensive data
            const headers = ['ID', 'Title', 'Source Text'];

            // Add column for each active configuration
            config.activeRunConfigs.forEach(configId => {
                const runConfig = config.runConfigurations.find(c => c.id === configId);
                if (runConfig) {
                    headers.push(`${runConfig.name} - Output`);
                    headers.push(`${runConfig.name} - Score`);
                    headers.push(`${runConfig.name} - Ground Truth`);
                    headers.push(`${runConfig.name} - Notes`);
                }
            });

            // Escape CSV field
            const escapeCSV = (field: any): string => {
                if (field === null || field === undefined) return '';
                const str = String(field);
                if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                    return `"${str.replace(/"/g, '""')}"`;
                }
                return str;
            };

            // Build rows
            const rows = [headers.map(escapeCSV).join(',')];

            items.forEach((item, idx) => {
                const row = [
                    idx + 1,
                    escapeCSV(item.title || ''),
                    escapeCSV(item.sourceText)
                ];

                config.activeRunConfigs.forEach(configId => {
                    const output = item.results[configId] || '';
                    const evaluation = item.evaluations[configId] || { score: '', note: '', isGroundTruth: false };

                    row.push(escapeCSV(output));
                    row.push(escapeCSV(evaluation.score || ''));
                    row.push(escapeCSV(evaluation.isGroundTruth ? 'Yes' : 'No'));
                    row.push(escapeCSV(evaluation.note || ''));
                });

                rows.push(row.join(','));
            });

            const csvContent = rows.join('\n');
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `batch_results_${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
            document.body.appendChild(a);
            a.click();

            // Delay cleanup to ensure download starts
            setTimeout(() => {
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }, 100);

            console.log(`Exported ${items.length} items to CSV`);
        } catch (error) {
            console.error('Error exporting CSV:', error);
            alert('Failed to export CSV file. Check console for details.');
        }
    };

    // Filter items based on search term
    const filteredItems = useMemo(() => items.filter(item => {
        if (!searchTerm.trim()) return true;
        const term = searchTerm.toLowerCase().trim();
        const matchesSource = item.sourceText.toLowerCase().includes(term);
        const matchesTitle = item.title?.toLowerCase().includes(term);
        const matchesResults = Object.values(item.results).some(r => r.toLowerCase().includes(term));
        return matchesSource || matchesResults || matchesTitle;
    }), [items, searchTerm]);

    // Analyze Model consistency
    const modelStats = useMemo(() => {
        const stats: Record<string, { avgWords: number; adherence: number; isConsistent: boolean }> = {};
        const target = config.maxWords;
        // Tolerance: +/- 15% of target


        // Calculate stats for all active configs
        config.activeRunConfigs.forEach(configId => {
            const runConfig = config.runConfigurations.find(c => c.id === configId);
            if (!runConfig) return;

            let totalWords = 0;
            let count = 0;
            let onTargetCount = 0;

            items.forEach(item => {
                const result = item.results[configId];
                if (result && !result.startsWith('Error:')) {
                    const wordCount = result.trim().split(/\s+/).filter(Boolean).length;
                    totalWords += wordCount;
                    count++;

                    if (Math.abs(wordCount - runConfig.maxWords) <= (runConfig.maxWords * 0.15)) {
                        onTargetCount++;
                    }
                }
            });

            const avgWords = count > 0 ? Math.round(totalWords / count) : 0;
            const adherence = count > 0 ? (onTargetCount / count) : 0;

            // Mark consistent if > 50% of items are within tolerance range
            const isConsistent = count > 0 && adherence >= 0.5;

            stats[configId] = { avgWords, adherence, isConsistent };
        });
        return stats;
    }, [items, config.activeRunConfigs, config.runConfigurations]);

    const sortedConfigs = useMemo(() => {
        const activeConfigs = config.runConfigurations.filter(c => config.activeRunConfigs.includes(c.id));

        if (sortCriteria === 'default') return activeConfigs;

        return [...activeConfigs].sort((a, b) => {
            // Use ID for stats lookup
            const statsA = modelStats[a.id];
            const statsB = modelStats[b.id];
            return (statsB?.adherence || 0) - (statsA?.adherence || 0);
        });
    }, [config.runConfigurations, config.activeRunConfigs, modelStats, sortCriteria]);

    if (items.length === 0) {
        return (
            <div className="flex flex-col h-full p-6 items-center justify-center text-slate-600">
                <div className="w-16 h-16 bg-slate-900 rounded-full flex items-center justify-center mb-4">
                    <MessageSquare size={32} className="opacity-50" />
                </div>
                <p className="text-sm font-medium">Batch Results Workbench</p>
                <p className="text-xs mt-2 text-slate-700 text-center max-w-sm">
                    Run a batch to populate this table. You can then grade models, add notes, and export a fine-tuning dataset.
                </p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-slate-950">
            {/* Header */}
            <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center bg-slate-950">
                <div>
                    <h2 className="text-lg font-semibold text-slate-100">Evaluation Workbench</h2>
                    <p className="text-xs text-slate-500">
                        {filteredItems.length !== items.length ? (
                            <span className="text-indigo-400 font-medium">{filteredItems.length} matching</span>
                        ) : (
                            <span>{items.length} Test Cases</span>
                        )}
                        {' '}• {config.activeRunConfigs.length} Configs Active
                    </p>
                </div>

                <div className="flex items-center gap-3 w-full sm:w-auto">
                    {/* Column Visibility Toggle */}
                    <div className="relative group">
                        <button className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-700 transition-colors">
                            <Settings size={14} />
                            <span className="hidden sm:inline">Columns</span>
                        </button>
                        <div className="absolute right-0 top-full mt-2 w-48 bg-slate-900 border border-slate-800 rounded-lg shadow-xl p-2 hidden group-hover:block z-50">
                            <div className="text-[10px] uppercase font-bold text-slate-500 mb-2 px-1">Toggle Visibility</div>
                            {config.runConfigurations.filter(c => config.activeRunConfigs.includes(c.id)).map(c => (
                                <button
                                    key={c.id}
                                    onClick={() => toggleColumn(c.id)}
                                    className="w-full text-left px-2 py-1.5 text-xs text-slate-300 hover:bg-slate-800 rounded flex items-center justify-between"
                                >
                                    <span className="truncate">{c.name}</span>
                                    {visibleColumns.includes(c.id) && <Check size={12} className="text-emerald-400" />}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="relative group flex-1 sm:flex-none">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-indigo-400 transition-colors" size={14} />
                        <input
                            type="text"
                            placeholder="Search tasks..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full sm:w-48 focus:w-full sm:focus:w-64 bg-slate-900 border border-slate-800 text-slate-200 text-xs rounded-lg pl-8 pr-8 py-2 focus:ring-1 focus:ring-indigo-500 outline-none transition-all placeholder-slate-600"
                        />
                        {searchTerm && (
                            <button
                                onClick={() => setSearchTerm('')}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 p-1"
                            >
                                <X size={12} />
                            </button>
                        )}
                    </div>

                    <button
                        onClick={() => setSortCriteria(prev => prev === 'default' ? 'consistency' : 'default')}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors border ${sortCriteria === 'consistency'
                            ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
                            : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'
                            }`}
                        title="Sort columns by adherence to word count target"
                    >
                        <ArrowUpDown size={14} />
                        <span className="hidden sm:inline">{sortCriteria === 'consistency' ? 'Best Adherence' : 'Default Order'}</span>
                    </button>

                    <div className="flex items-center gap-2">
                        {/* Batch Judge Button */}
                        <button
                            onClick={judgeAllItems}
                            disabled={isBatchJudging || items.length === 0}
                            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors border whitespace-nowrap ${isBatchJudging
                                ? 'bg-purple-500/20 text-purple-300 border-purple-500/30 cursor-wait'
                                : 'bg-slate-800 hover:bg-slate-700 text-purple-300 border-slate-700'
                                }`}
                            title="Use LLM to judge all results automatically"
                        >
                            {isBatchJudging ? (
                                <>
                                    <div className="w-3.5 h-3.5 border-2 border-purple-400/30 border-t-purple-400 rounded-full animate-spin" />
                                    <span className="hidden sm:inline">
                                        Judging {batchJudgeProgress.current}/{batchJudgeProgress.total}
                                    </span>
                                </>
                            ) : (
                                <>
                                    <Target size={14} />
                                    <span className="hidden sm:inline">Judge All</span>
                                </>
                            )}
                        </button>

                        <button
                            onClick={exportJSONL}
                            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-indigo-300 px-3 py-2 rounded-lg text-xs font-medium transition-colors border border-slate-700 whitespace-nowrap"
                            title="Export as JSONL for fine-tuning (ground truth only)"
                        >
                            <FileJson size={14} />
                            <span className="hidden sm:inline">JSONL</span>
                        </button>
                        <button
                            onClick={exportExcel}
                            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-green-300 px-3 py-2 rounded-lg text-xs font-medium transition-colors border border-slate-700 whitespace-nowrap"
                            title="Export all data as Excel spreadsheet"
                        >
                            <FileSpreadsheet size={14} />
                            <span className="hidden sm:inline">Excel</span>
                        </button>
                        <button
                            onClick={exportCSV}
                            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-emerald-300 px-3 py-2 rounded-lg text-xs font-medium transition-colors border border-slate-700 whitespace-nowrap"
                            title="Export all data as CSV spreadsheet"
                        >
                            <Download size={14} />
                            <span className="hidden sm:inline">CSV</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Table Container */}
            <div className="flex-1 overflow-auto custom-scrollbar p-4">
                <div className="min-w-full inline-block align-middle">
                    <div className="border border-slate-800 rounded-lg overflow-hidden">
                        <table className="min-w-full divide-y divide-slate-800">
                            <thead className="bg-slate-900">
                                <tr>
                                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider w-10">#</th>
                                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider w-64">Task / Source</th>
                                    {sortedConfigs.filter(c => visibleColumns.includes(c.id)).map(conf => {
                                        const stats = modelStats[conf.id];
                                        return (
                                            <th key={conf.id} scope="col" className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider min-w-[300px]">
                                                <div className="flex flex-col gap-1">
                                                    <div className="flex items-center gap-2">
                                                        <span className={stats?.isConsistent ? "text-indigo-300" : ""}>{conf.name}</span>
                                                        {stats?.isConsistent && (
                                                            <div className="group relative">
                                                                <Target size={14} className="text-emerald-400 cursor-help" />
                                                                <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block bg-slate-800 text-xs text-white px-2 py-1 rounded border border-slate-700 shadow-xl whitespace-nowrap z-50 pointer-events-none">
                                                                    Consistently close to {conf.maxWords} words
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-2 text-[10px] normal-case tracking-normal font-mono text-slate-500">
                                                        <span>{conf.model}</span>
                                                        <span className="opacity-30">|</span>
                                                        <span>Avg: {stats?.avgWords || 0}w</span>
                                                    </div>
                                                </div>
                                            </th>
                                        );
                                    })}
                                </tr>
                            </thead>
                            <tbody className="bg-slate-950 divide-y divide-slate-800">
                                {filteredItems.length > 0 ? (
                                    filteredItems.map((item, idx) => (
                                        <React.Fragment key={item.id}>
                                            {/* Summary Row */}
                                            <tr className={`hover:bg-slate-900/50 transition-colors ${expandedRow === item.id ? 'bg-slate-900/30' : ''}`}>
                                                <td className="px-4 py-4 whitespace-nowrap text-xs text-slate-500 font-mono">
                                                    <button onClick={() => setExpandedRow(expandedRow === item.id ? null : item.id)}>
                                                        {expandedRow === item.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                                    </button>
                                                </td>
                                                <td className="px-4 py-4 text-sm text-slate-300 align-top cursor-pointer" onClick={() => setExpandedRow(expandedRow === item.id ? null : item.id)}>
                                                    {item.title && (
                                                        <div className="font-bold text-slate-200 text-xs mb-1">{item.title}</div>
                                                    )}
                                                    <div className="line-clamp-3 font-mono text-xs text-slate-400">
                                                        {item.sourceText}
                                                    </div>
                                                    <div className={`mt-2 text-[10px] uppercase font-bold ${item.status === 'done' ? 'text-emerald-500' : 'text-amber-500'}`}>
                                                        {item.status}
                                                    </div>
                                                </td>
                                                {sortedConfigs.filter(c => visibleColumns.includes(c.id)).map(conf => {
                                                    const output = item.results[conf.id];
                                                    const evalData = item.evaluations[conf.id] || { score: 0, note: '', isGroundTruth: false };

                                                    return (
                                                        <td key={conf.id} className="px-4 py-4 align-top border-l border-slate-800/50">
                                                            {output ? (
                                                                <div className="flex flex-col gap-2 h-full">
                                                                    <div className="text-xs text-slate-300 line-clamp-4 mb-2 prose prose-invert prose-xs max-w-none">
                                                                        {output.startsWith('Error:') ? <span className="text-red-400">{output}</span> : output}
                                                                    </div>

                                                                    {/* Grading Controls Mini */}
                                                                    <div className="mt-auto flex items-center justify-between bg-slate-900/50 p-1.5 rounded border border-slate-800">
                                                                        <div className="flex items-center gap-1">
                                                                            <span className="text-[10px] text-slate-500 uppercase font-bold">Grade:</span>
                                                                            <input
                                                                                type="number"
                                                                                min="1" max="10"
                                                                                value={evalData.score || ''}
                                                                                onChange={(e) => onUpdateEvaluation(item.id, conf.id, 'score', validateScore(parseInt(e.target.value)))}
                                                                                className="w-10 bg-slate-800 border border-slate-700 text-center text-xs rounded focus:ring-1 focus:ring-indigo-500"
                                                                            />
                                                                        </div>
                                                                        <div className="flex items-center gap-1">
                                                                            <button
                                                                                onClick={() => judgeWithLLM(item.id, conf.id)}
                                                                                disabled={judgingItemId === item.id + '-' + conf.id}
                                                                                className="p-1 rounded transition-colors text-purple-400 hover:text-purple-300 hover:bg-purple-500/10 disabled:opacity-50"
                                                                                title="Use LLM Judge"
                                                                            >
                                                                                {judgingItemId === item.id + '-' + conf.id ? (
                                                                                    <div className="w-3.5 h-3.5 border-2 border-purple-400/30 border-t-purple-400 rounded-full animate-spin" />
                                                                                ) : (
                                                                                    <Target size={14} />
                                                                                )}
                                                                            </button>
                                                                            <button
                                                                                onClick={() => onUpdateEvaluation(item.id, conf.id, 'isGroundTruth', !evalData.isGroundTruth)}
                                                                                className={`p-1 rounded transition-colors ${evalData.isGroundTruth ? 'text-yellow-400 bg-yellow-400/10' : 'text-slate-600 hover:text-slate-400'}`}
                                                                                title="Mark as Ground Truth (Best Response)"
                                                                            >
                                                                                <Star size={14} fill={evalData.isGroundTruth ? "currentColor" : "none"} />
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            ) : (
                                                                <div className="h-full flex items-center justify-center">
                                                                    <span className="w-2 h-2 bg-slate-700 rounded-full animate-pulse"></span>
                                                                </div>
                                                            )}
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                            {/* Expanded Detail Row */}
                                            {
                                                expandedRow === item.id && (
                                                    <tr className="bg-slate-900/20">
                                                        <td colSpan={2 + sortedConfigs.filter(c => visibleColumns.includes(c.id)).length} className="px-4 py-4">
                                                            <div className="bg-slate-950 border border-slate-800 rounded-lg p-4">
                                                                <div className="mb-4">
                                                                    <h4 className="text-xs font-bold text-slate-500 uppercase mb-2">Full Source Text</h4>
                                                                    {item.title && <h5 className="text-sm font-bold text-slate-300 mb-1">{item.title}</h5>}
                                                                    <div className="bg-slate-900 p-3 rounded text-sm text-slate-300 font-mono whitespace-pre-wrap border border-slate-800">
                                                                        {item.sourceText}
                                                                    </div>
                                                                </div>

                                                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                                                    {sortedConfigs.filter(c => visibleColumns.includes(c.id)).map(conf => {
                                                                        const evalData = item.evaluations[conf.id] || { score: 0, note: '', isGroundTruth: false };
                                                                        return (
                                                                            <div key={conf.id} className={`border rounded-lg p-4 ${evalData.isGroundTruth ? 'border-yellow-500/30 bg-yellow-500/5' : 'border-slate-800 bg-slate-900/50'}`}>
                                                                                <div className="flex justify-between items-center mb-3 border-b border-slate-800 pb-2">
                                                                                    <div>
                                                                                        <span className="text-sm font-bold text-indigo-300 block">{conf.name}</span>
                                                                                        <span className="text-[10px] text-slate-500 font-mono">{conf.model}</span>
                                                                                    </div>
                                                                                    <div className="flex items-center gap-2">
                                                                                        {evalData.isGroundTruth && <span className="text-[10px] bg-yellow-500/20 text-yellow-300 px-2 py-0.5 rounded border border-yellow-500/30">GROUND TRUTH</span>}
                                                                                        <button
                                                                                            onClick={() => onUpdateEvaluation(item.id, conf.id, 'isGroundTruth', !evalData.isGroundTruth)}
                                                                                            className={`p-1 rounded transition-colors ${evalData.isGroundTruth ? 'text-yellow-400 bg-yellow-400/10' : 'text-slate-600 hover:text-slate-400'}`}
                                                                                            title={evalData.isGroundTruth ? "Unmark Ground Truth" : "Mark as Ground Truth"}
                                                                                        >
                                                                                            <Star size={16} fill={evalData.isGroundTruth ? "currentColor" : "none"} />
                                                                                        </button>
                                                                                    </div>
                                                                                </div>
                                                                                <div className="prose prose-invert prose-sm max-w-none mb-4">
                                                                                    <ReactMarkdown>{item.results[conf.id] || ''}</ReactMarkdown>
                                                                                </div>

                                                                                <div className="space-y-2 pt-3 border-t border-slate-800/50">
                                                                                    <div className="flex gap-4">
                                                                                        <div className="flex-1">
                                                                                            <label className="block text-[10px] text-slate-500 uppercase font-bold mb-1">Evaluator Score (1-10)</label>
                                                                                            <input
                                                                                                type="range" min="1" max="10"
                                                                                                value={evalData.score || 1}
                                                                                                onChange={(e) => onUpdateEvaluation(item.id, conf.id, 'score', validateScore(parseInt(e.target.value)))}
                                                                                                className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                                                                                            />
                                                                                            <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                                                                                                <span>1</span>
                                                                                                <span className="text-indigo-300 font-bold text-sm">{evalData.score || '-'}</span>
                                                                                                <span>10</span>
                                                                                            </div>
                                                                                        </div>
                                                                                    </div>
                                                                                    <div>
                                                                                        <label className="block text-[10px] text-slate-500 uppercase font-bold mb-1">Notes / Corrections</label>
                                                                                        <textarea
                                                                                            value={evalData.note || ''}
                                                                                            onChange={(e) => onUpdateEvaluation(item.id, conf.id, 'note', e.target.value)}
                                                                                            placeholder="Add comments or improved phrasing..."
                                                                                            className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-xs text-slate-300 focus:ring-1 focus:ring-indigo-500 min-h-[60px]"
                                                                                        />
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )
                                            }
                                        </React.Fragment>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan={2 + config.activeRunConfigs.length} className="px-4 py-12 text-center text-slate-500">
                                            <div className="flex flex-col items-center gap-2">
                                                <Search size={24} className="opacity-20" />
                                                <p className="text-sm">No items found matching "{searchTerm}"</p>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div >
        </div >
    );
};

export default BatchResults;
