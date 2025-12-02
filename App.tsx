
import React, { useState, useCallback, useEffect, useRef } from 'react';
import Sidebar from './components/Sidebar';
import InputArea from './components/InputArea';
import OutputArea from './components/OutputArea';
import BatchResults from './components/BatchResults';
import { AppConfig, ModelType, ToneType, FormatType, HistoryItem, ViewMode, BatchItem } from './types';
import { generateSummary, buildPrompt } from './services/geminiService';
import { PanelLeftOpen, PanelLeftClose } from 'lucide-react';

const DEFAULT_CONFIG: AppConfig = {
  provider: 'gemini',
  activeModels: [ModelType.FLASH],
  modelVersion: '',
  localEndpoint: 'http://localhost:1234/v1/chat/completions', // LM Studio Default
  temperature: 0.5,
  topK: 40,
  topP: 0.95,
  maxOutputTokens: 1024,
  systemInstruction: "You are a helpful, precise AI assistant specialized in summarizing content.",
  tone: ToneType.PROFESSIONAL,
  format: FormatType.PARAGRAPH,
  customFocus: "",
  maxWords: 250,
  runConfigurations: [],
  activeRunConfigs: [],
  // LLM Judge defaults
  judgeProvider: 'local',
  judgeModel: '',
  useMainModelAsJudge: true,
  judgeCriteria: [
    { id: '1', name: 'ACCURACY', weight: 30, description: 'Does it capture key information without errors?' },
    { id: '2', name: 'CLARITY', weight: 25, description: 'Is it easy to understand and well-structured?' },
    { id: '3', name: 'CONCISENESS', weight: 25, description: 'Is it appropriately concise without unnecessary details?' },
    { id: '4', name: 'COMPLETENESS', weight: 20, description: 'Does it cover all important points?' },
  ]
};

const App: React.FC = () => {
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [inputText, setInputText] = useState<string>("");
  const [results, setResults] = useState<Record<string, string>>({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('playground');

  // Resizable Frame State
  const [splitRatio, setSplitRatio] = useState(50); // Percentage for left panel
  const containerRef = useRef<HTMLDivElement>(null);
  const isResizing = useRef(false);

  // Sidebar Resizing State
  const [sidebarWidth, setSidebarWidth] = useState(320);
  const isResizingSidebar = useRef(false);

  // Batch State
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);

  // History State
  const [history, setHistory] = useState<HistoryItem[]>(() => {
    try {
      const saved = localStorage.getItem('ciudadania_history');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem('ciudadania_history', JSON.stringify(history));
  }, [history]);

  // Reset split ratio when view mode changes for better defaults
  useEffect(() => {
    if (viewMode === 'batch') {
      setSplitRatio(30);
    } else {
      setSplitRatio(50);
    }
  }, [viewMode]);

  // Resize Handlers
  const startResizing = useCallback(() => {
    isResizing.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', stopResizing);
  }, []);

  const stopResizing = useCallback(() => {
    isResizing.current = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('mouseup', stopResizing);
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing.current || !containerRef.current) return;

    const containerRect = containerRef.current.getBoundingClientRect();
    const newRatio = ((e.clientX - containerRect.left) / containerRect.width) * 100;

    // Clamp between 20% and 80%
    setSplitRatio(Math.min(Math.max(newRatio, 20), 80));
  }, []);

  // Sidebar Resize Handlers
  const startResizingSidebar = useCallback(() => {
    isResizingSidebar.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', handleSidebarMouseMove);
    window.addEventListener('mouseup', stopResizingSidebar);
  }, []);

  const stopResizingSidebar = useCallback(() => {
    isResizingSidebar.current = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    window.removeEventListener('mousemove', handleSidebarMouseMove);
    window.removeEventListener('mouseup', stopResizingSidebar);
  }, []);

  const handleSidebarMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizingSidebar.current) return;
    const newWidth = e.clientX;
    // Clamp between 200px and 800px
    setSidebarWidth(Math.min(Math.max(newWidth, 200), 800));
  }, []);

  const handleGenerate = useCallback(async () => {
    if (viewMode === 'batch') {
      handleBatchGenerate();
      return;
    }

    if (!inputText || config.activeModels.length === 0) return;

    setIsGenerating(true);
    setResults({});

    const startTime = Date.now();

    try {
      // Parallel Execution for all active models
      const modelPromises = config.activeModels.map(async (model) => {
        try {
          const result = await generateSummary(inputText, config, model);
          return { model, text: result };
        } catch (e: any) {
          return { model, text: `Error: ${e.message}` };
        }
      });

      const responses = await Promise.all(modelPromises);

      // Convert array to Record map
      const newResults: Record<string, string> = {};
      responses.forEach(r => {
        newResults[r.model] = r.text;
      });

      setResults(newResults);

      // Add to history
      const newItem: HistoryItem = {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        sourceText: inputText,
        results: newResults, // Store the map
        config: { ...config },
        durationMs: Date.now() - startTime
      };

      setHistory(prev => [...prev, newItem]);

    } catch (error: any) {
      console.error("Critical generation error", error);
      setResults({ "System": "Critical Error during generation." });
    } finally {
      setIsGenerating(false);
    }
  }, [inputText, config, viewMode, batchItems]);

  const handleBatchGenerate = async () => {
    if (batchItems.length === 0) return;
    setIsGenerating(true);

    // Process items that are not 'done'
    const pendingItems = batchItems.filter(i => i.status !== 'done');

    for (const item of pendingItems) {
      // Update status to processing
      setBatchItems(prev => prev.map(pi => pi.id === item.id ? { ...pi, status: 'processing' } : pi));

      const itemResults: Record<string, string> = {};

      // Run all active configurations for this item
      await Promise.all(config.activeRunConfigs.map(async (configId) => {
        const runConfig = config.runConfigurations.find(c => c.id === configId);
        if (!runConfig) return;

        // Create a temporary AppConfig based on the RunConfiguration
        const tempConfig: AppConfig = {
          ...config,
          provider: runConfig.provider, // Use the provider from the run config
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
          const result = await generateSummary(item.sourceText, tempConfig, runConfig.model);
          itemResults[configId] = result;
        } catch (e: any) {
          console.error(`Batch generation error for ${runConfig.name} (${runConfig.model}):`, e);
          itemResults[configId] = `Error: ${e.message}`;
        }
      }));

      // Update item with results
      setBatchItems(prev => prev.map(pi => pi.id === item.id ? {
        ...pi,
        status: 'done',
        results: itemResults,
        // Initialize empty evals
        evaluations: config.activeRunConfigs.reduce((acc, cid) => ({ ...acc, [cid]: { score: 0, note: '', isGroundTruth: false } }), {})
      } : pi));
    }

    setIsGenerating(false);
  };

  const handleUpdateEvaluation = (itemId: string, model: string, field: string, value: any) => {
    setBatchItems(prev => prev.map(item => {
      if (item.id !== itemId) return item;
      const currentEval = item.evaluations[model] || { score: 0, note: '', isGroundTruth: false };

      // If marking as Ground Truth, unmark others for this item if you only want one GT
      let updatedEvaluations = { ...item.evaluations };

      if (field === 'isGroundTruth' && value === true) {
        // Reset others
        Object.keys(updatedEvaluations).forEach(k => {
          updatedEvaluations[k] = { ...updatedEvaluations[k], isGroundTruth: false };
        });
      }

      updatedEvaluations[model] = { ...currentEval, [field]: value };

      return { ...item, evaluations: updatedEvaluations };
    }));
  };

  const handleRestoreHistory = (item: HistoryItem) => {
    setConfig(item.config);
    setInputText(item.sourceText);
    setResults(item.results);
  };

  const handleClearHistory = () => {
    if (confirm('Are you sure you want to clear all history?')) {
      setHistory([]);
    }
  };

  return (
    <div className="flex h-screen bg-slate-950 overflow-hidden">
      {/* Sidebar */}
      <div
        style={{ width: isSidebarOpen ? `${sidebarWidth}px` : '0px' }}
        className={`transition-[width] duration-300 ease-in-out border-r border-slate-800 flex-shrink-0 relative group/sidebar`}
      >
        <div className="h-full overflow-hidden" style={{ width: `${sidebarWidth}px` }}>
          <Sidebar
            config={config}
            setConfig={setConfig}
            history={history}
            onRestoreHistory={handleRestoreHistory}
            onClearHistory={handleClearHistory}
            viewMode={viewMode}
            setViewMode={setViewMode}
            buildPrompt={buildPrompt}
            inputText={inputText}
          />
        </div>

        {/* Sidebar Resizer Handle */}
        <div
          className="absolute right-0 top-0 w-1.5 h-full cursor-col-resize hover:bg-indigo-500 transition-colors z-50 translate-x-1/2 bg-transparent hover:delay-75 active:bg-indigo-600"
          onMouseDown={startResizingSidebar}
        >
          {/* Visual Indicator on Hover */}
          <div className="absolute inset-y-0 left-1/2 w-[1px] bg-slate-700 group-hover/sidebar:bg-indigo-500/50 transition-colors" />
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full relative min-w-0">
        {/* Mobile/Toggle Header */}
        <div className="h-14 border-b border-slate-800 flex items-center px-4 justify-between bg-slate-950 z-20 flex-shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(!isSidebarOpen)}
              className="text-slate-400 hover:text-white transition-colors"
            >
              {isSidebarOpen ? <PanelLeftClose size={20} /> : <PanelLeftOpen size={20} />}
            </button>
            <h1 className="text-lg font-bold text-slate-100 tracking-tight flex items-center gap-2">
              Ciudadan<span className={`text-${config.provider === 'local' ? 'emerald' : 'indigo'}-500`}>IA</span>
              {config.provider === 'local' && <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 rounded border border-emerald-500/30">LOCAL</span>}
            </h1>
          </div>
          <div className="text-xs text-slate-500 font-mono hidden sm:block">
            {config.activeModels.length > 1 ? `${config.activeModels.length} Models Active` : config.activeModels[0]}
            {config.modelVersion && <span className="ml-2 opacity-50">({config.modelVersion})</span>}
          </div>
        </div>

        {/* Content Grid with Resizer */}
        <div ref={containerRef} className="flex-1 flex flex-col md:flex-row overflow-hidden relative">

          {/* Input Section */}
          {/* Desktop: Uses splitRatio width */}
          <div
            style={{ width: `${splitRatio}%` }}
            className={`
                    border-b md:border-b-0 md:border-r border-slate-800 min-h-0 transition-[width] duration-0
                    h-1/2 md:h-full w-full md:w-auto
                `}
          >
            <InputArea
              text={inputText}
              setText={setInputText}
              onGenerate={handleGenerate}
              isGenerating={isGenerating}
              viewMode={viewMode}
              batchItems={batchItems}
              setBatchItems={setBatchItems}
            />
          </div>

          {/* Desktop Resizer Handle */}
          <div
            className="hidden md:flex w-3 -ml-1.5 bg-transparent hover:bg-indigo-500/10 cursor-col-resize items-center justify-center z-30 absolute h-full"
            style={{ left: `${splitRatio}%` }}
            onMouseDown={startResizing}
          >
            <div className="h-8 w-1 bg-slate-700 rounded-full hover:bg-indigo-400 transition-colors" />
          </div>

          {/* Output Section */}
          <div
            style={{ width: `${100 - splitRatio}%` }}
            className={`
                    bg-slate-950/50 min-h-0 
                    h-1/2 md:h-full w-full md:w-auto ml-auto
                `}
          >
            {viewMode === 'batch' ? (
              <BatchResults
                items={batchItems}
                activeModels={config.activeModels}
                config={config}
                onUpdateEvaluation={handleUpdateEvaluation}
              />
            ) : (
              <OutputArea results={results} />
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;
