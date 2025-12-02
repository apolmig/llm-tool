
import React, { useState, useEffect } from 'react';
import { AppConfig, ModelType, ToneType, FormatType, HistoryItem, ViewMode } from '../types';
import HistoryPanel from './HistoryPanel';
import RunConfigPanel from './RunConfigPanel';
import { Settings2, Sliders, MessageSquare, Cpu, Server, Globe, History, Plus, X, Check, Tag, AlertCircle, FlaskConical, Layers, RefreshCw, ChevronDown, Target } from 'lucide-react';

interface SidebarProps {
  config: AppConfig;
  setConfig: React.Dispatch<React.SetStateAction<AppConfig>>;
  history: HistoryItem[];
  onRestoreHistory: (item: HistoryItem) => void;
  onClearHistory: () => void;
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  buildPrompt: (text: string, config: AppConfig) => string;
  inputText: string; // Passed down for preview
}

const Sidebar: React.FC<SidebarProps> = ({
  config,
  setConfig,
  history,
  onRestoreHistory,
  onClearHistory,
  viewMode,
  setViewMode,
  buildPrompt,
  inputText
}) => {
  const [activeTab, setActiveTab] = useState<'settings' | 'history'>('settings');
  const [localModelInput, setLocalModelInput] = useState('');
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [fetchedModels, setFetchedModels] = useState<string[]>([]);

  const handleChange = <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  const toggleModel = (model: string) => {
    setConfig(prev => {
      const current = prev.activeModels;
      if (current.includes(model)) {
        if (current.length === 1) return prev;
        return { ...prev, activeModels: current.filter(m => m !== model) };
      } else {
        return { ...prev, activeModels: [...current, model] };
      }
    });
  };

  const addLocalModel = () => {
    if (localModelInput.trim() && !config.activeModels.includes(localModelInput.trim())) {
      setConfig(prev => ({
        ...prev,
        activeModels: [...prev.activeModels, localModelInput.trim()]
      }));
      setLocalModelInput('');
    }
  };

  const isEndpointValid = () => {
    try {
      new URL(config.localEndpoint);
      return true;
    } catch {
      return false;
    }
  };

  const checkConnection = async (isAuto = false) => {
    if (!isAuto) {
      setConnectionStatus('idle');
      setFetchedModels([]);
    }

    try {
      // Intelligent endpoint derivation
      let urlStr = config.localEndpoint;
      try {
        // Remove trailing slash
        if (urlStr.endsWith('/')) urlStr = urlStr.slice(0, -1);

        // Convert chat completions endpoint to models endpoint
        if (urlStr.endsWith('/chat/completions')) {
          urlStr = urlStr.replace('/chat/completions', '/models');
        } else if (urlStr.endsWith('/v1')) {
          urlStr = urlStr + '/models';
        } else if (!urlStr.endsWith('/models')) {
          // Try standard v1 path if just a base host is provided
          urlStr = urlStr + '/v1/models';
        }
      } catch (e) {
        urlStr = config.localEndpoint + '/models';
      }

      const res = await fetch(urlStr);
      if (res.ok) {
        const data = await res.json();
        setConnectionStatus('success');

        // Parse standard OpenAI/Ollama model list format
        if (data && data.data && Array.isArray(data.data)) {
          const modelIds = data.data.map((m: any) => m.id).sort();
          setFetchedModels(modelIds);
        }

        setTimeout(() => setConnectionStatus('idle'), 3000);
      } else {
        if (!isAuto) setConnectionStatus('error');
      }
    } catch (e) {
      if (!isAuto) setConnectionStatus('error');
    }
  };

  useEffect(() => {
    if (config.provider === 'local') {
      checkConnection(true);
    }
  }, [config.provider]);

  const endpointValid = isEndpointValid();

  // Dynamic prompt preview based on current input or placeholder
  const previewSource = inputText.trim() || "[Your source text will appear here]";
  const fullPromptPreview = buildPrompt(previewSource, config);

  return (
    <div className="w-full bg-slate-900 border-r border-slate-800 h-screen flex flex-col">
      {/* Workflow Mode Switcher */}
      <div className="p-3 border-b border-slate-800 bg-slate-950">
        <div className="flex bg-slate-900 p-1 rounded-lg border border-slate-800">
          <button
            onClick={() => setViewMode('playground')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-xs font-bold transition-all ${viewMode === 'playground'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'text-slate-500 hover:text-slate-300'
              }`}
          >
            <FlaskConical size={14} />
            Playground
          </button>
          <button
            onClick={() => setViewMode('batch')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-xs font-bold transition-all ${viewMode === 'batch'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'text-slate-500 hover:text-slate-300'
              }`}
          >
            <Layers size={14} />
            Workbench
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-800 flex-shrink-0">
        <button
          onClick={() => setActiveTab('settings')}
          className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors ${activeTab === 'settings' ? 'bg-slate-800 text-indigo-400 border-b-2 border-indigo-500' : 'text-slate-500 hover:text-slate-300'
            }`}
        >
          <Settings2 size={14} /> Settings
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors ${activeTab === 'history' ? 'bg-slate-800 text-indigo-400 border-b-2 border-indigo-500' : 'text-slate-500 hover:text-slate-300'
            }`}
        >
          <History size={14} /> History
        </button>
      </div>

      {viewMode === 'batch' ? (
        <RunConfigPanel config={config} setConfig={setConfig} fetchedModels={fetchedModels} />
      ) : (
        <>
          {activeTab === 'history' ? (
            <HistoryPanel
              history={history}
              onRestore={(item) => {
                onRestoreHistory(item);
                setActiveTab('settings');
                setViewMode('playground'); // Switch back to playground on restore
              }}
              onClear={onClearHistory}
            />
          ) : (
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-6">

              {/* Provider Selection */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-slate-300 mb-1">
                  <Globe size={16} />
                  <label className="text-sm font-medium">Provider</label>
                </div>
                <div className="flex bg-slate-800 p-1 rounded-lg">
                  <button
                    onClick={() => {
                      handleChange('provider', 'gemini');
                      handleChange('activeModels', [ModelType.FLASH]);
                    }}
                    className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${config.provider === 'gemini' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
                  >
                    Gemini API
                  </button>
                  <button
                    onClick={() => {
                      handleChange('provider', 'local');
                      // Keep current local models if already set, else default
                      if (!config.activeModels.some(m => !m.startsWith('gemini-'))) {
                        handleChange('activeModels', ['llama3']);
                      }
                    }}
                    className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${config.provider === 'local' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
                  >
                    Local LLM
                  </button>
                </div>
              </div>

              {/* Model Selection */}
              <div className="space-y-3">
                <div className="flex items-center justify-between text-slate-300 mb-1">
                  <div className="flex items-center gap-2">
                    <Cpu size={16} />
                    <label className="text-sm font-medium">Active Models</label>
                  </div>
                  <span className="text-[10px] text-slate-500">
                    {config.activeModels.length} Selected
                  </span>
                </div>

                {config.provider === 'gemini' ? (
                  <div className="space-y-2 bg-slate-800/50 p-2 rounded-lg border border-slate-800">
                    {Object.values(ModelType).map((model) => (
                      <button
                        key={model}
                        onClick={() => toggleModel(model)}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-xs font-medium transition-all border ${config.activeModels.includes(model)
                          ? 'bg-indigo-600 text-white border-indigo-500 shadow-lg shadow-indigo-900/20'
                          : 'bg-slate-800 text-slate-400 border-transparent hover:bg-slate-700 hover:text-slate-200'
                          }`}
                      >
                        {model.replace('gemini-', '').replace('-latest', '').replace('-preview', '')}
                        {config.activeModels.includes(model) && <Check size={12} className="text-indigo-100" />}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* Fetched Models List */}
                    {fetchedModels.length > 0 && (
                      <div className="space-y-2 bg-slate-800/50 p-2 rounded-lg border border-slate-800">
                        <div className="flex justify-between items-center px-1 mb-1">
                          <span className="text-[10px] text-slate-500 uppercase font-bold">Available</span>
                          <span className="text-[10px] text-emerald-400 font-mono">{fetchedModels.length} found</span>
                        </div>
                        <div className="max-h-48 overflow-y-auto custom-scrollbar space-y-1">
                          {fetchedModels.map(model => (
                            <button
                              key={model}
                              onClick={() => toggleModel(model)}
                              className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-xs font-medium transition-all border ${config.activeModels.includes(model)
                                ? 'bg-emerald-600 text-white border-emerald-500 shadow-sm'
                                : 'bg-slate-800 text-slate-400 border-transparent hover:bg-slate-700 hover:text-slate-200'
                                }`}
                            >
                              <span className="truncate mr-2">{model}</span>
                              {config.activeModels.includes(model) && <Check size={12} className="text-emerald-100 flex-shrink-0" />}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Manual Input */}
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="text-[10px] text-slate-500 uppercase font-bold">
                          {fetchedModels.length > 0 ? "Add Custom" : "Add Model Manually"}
                        </label>
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={localModelInput}
                          onChange={(e) => setLocalModelInput(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && addLocalModel()}
                          placeholder="e.g. mistral"
                          className="flex-1 bg-slate-800 border border-slate-700 text-slate-200 rounded-md px-3 py-2 focus:ring-2 focus:ring-emerald-500 outline-none text-sm placeholder-slate-600"
                        />
                        <button
                          onClick={addLocalModel}
                          className="bg-slate-700 hover:bg-slate-600 text-slate-200 px-3 rounded-md border border-slate-600 hover:border-slate-500 transition-colors"
                          title="Add to active list"
                        >
                          <Plus size={16} />
                        </button>
                      </div>
                    </div>

                    {/* Active Tags (Only show if not in fetched list OR if fetched list is empty to show confirmation) */}
                    {(fetchedModels.length === 0 || config.activeModels.some(m => !fetchedModels.includes(m))) && (
                      <div className="flex flex-wrap gap-2">
                        {config.activeModels.filter(m => fetchedModels.length === 0 || !fetchedModels.includes(m)).map(model => (
                          <div key={model} className="bg-emerald-600 text-white shadow-md shadow-emerald-900/20 text-xs px-2 py-1 rounded-md flex items-center gap-1">
                            <span>{model}</span>
                            {config.activeModels.length > 1 && (
                              <button
                                onClick={() => toggleModel(model)}
                                className="hover:text-emerald-200"
                              >
                                <X size={12} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="space-y-1 mt-3 pt-3 border-t border-slate-800">
                      <div className="flex items-center justify-between text-slate-400">
                        <div className="flex items-center gap-1">
                          <Server size={12} />
                          <span className="text-[10px] uppercase font-bold">Endpoint</span>
                        </div>
                        <div className="flex items-center gap-1">
                          {connectionStatus === 'success' && <span className="text-[10px] text-emerald-400 font-bold">Connected</span>}
                          {connectionStatus === 'error' && <span className="text-[10px] text-red-400 font-bold">Failed</span>}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <input
                          type="text"
                          value={config.localEndpoint}
                          onChange={(e) => handleChange('localEndpoint', e.target.value)}
                          placeholder="http://localhost:1234/v1/chat/completions"
                          className={`flex-1 bg-slate-800 border ${endpointValid
                            ? 'border-slate-700 focus:ring-emerald-500'
                            : 'border-red-500/50 focus:ring-red-500 text-red-300'
                            } text-slate-200 rounded-md px-3 py-2 focus:ring-2 outline-none text-xs font-mono placeholder-slate-600 transition-colors`}
                        />
                        <button
                          onClick={() => checkConnection(false)}
                          disabled={!endpointValid}
                          className={`px-2 rounded-md transition-colors ${connectionStatus === 'success' ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-600/30' : 'bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-400'}`}
                          title="Test Connection & Fetch Models"
                        >
                          {connectionStatus === 'success' ? <Check size={14} /> : <RefreshCw size={14} className={connectionStatus === 'idle' ? '' : 'animate-spin'} />}
                        </button>
                      </div>
                      {!endpointValid && (
                        <div className="flex items-center gap-1 text-red-400 mt-1">
                          <AlertCircle size={10} />
                          <span className="text-[10px]">Invalid URL format</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Model Version / Tag */}
                <div className="space-y-1 pt-2">
                  <div className="flex items-center gap-2 text-slate-400">
                    <Tag size={14} />
                    <label className="text-xs font-medium">Version / Tag <span className="text-slate-600 font-normal">(Optional)</span></label>
                  </div>
                  <input
                    type="text"
                    value={config.modelVersion || ''}
                    onChange={(e) => handleChange('modelVersion', e.target.value)}
                    placeholder={config.provider === 'gemini' ? "e.g. 001" : "e.g. latest"}
                    className="w-full bg-slate-800 border border-slate-700 text-slate-200 rounded-md px-3 py-2 focus:ring-2 focus:ring-indigo-500 outline-none text-sm placeholder-slate-600"
                  />
                </div>
              </div>

              {/* Structure & Tone */}
              <div className="space-y-4 border-t border-slate-800 pt-4">
                <h3 className="text-xs uppercase text-slate-500 font-bold tracking-wider">Output Style</h3>

                <div>
                  <label className="block text-sm text-slate-400 mb-1">Format</label>
                  <select
                    value={config.format}
                    onChange={(e) => handleChange('format', e.target.value as FormatType)}
                    className="w-full bg-slate-800 border border-slate-700 text-slate-200 rounded-md px-3 py-2 text-sm"
                  >
                    {Object.values(FormatType).map((fmt) => (
                      <option key={fmt} value={fmt}>{fmt}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm text-slate-400 mb-1">Tone</label>
                  <select
                    value={config.tone}
                    onChange={(e) => handleChange('tone', e.target.value as ToneType)}
                    className="w-full bg-slate-800 border border-slate-700 text-slate-200 rounded-md px-3 py-2 text-sm"
                  >
                    {Object.values(ToneType).map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm text-slate-400 mb-1">Focus Areas</label>
                  <input
                    type="text"
                    value={config.customFocus}
                    onChange={(e) => handleChange('customFocus', e.target.value)}
                    placeholder="e.g., dates, names, financial figures"
                    className="w-full bg-slate-800 border border-slate-700 text-slate-200 rounded-md px-3 py-2 text-sm placeholder-slate-600"
                  />
                </div>
              </div>

              {/* Parameters */}
              <div className="space-y-5 border-t border-slate-800 pt-4">
                <div className="flex items-center gap-2 text-slate-300">
                  <Sliders size={16} />
                  <h3 className="text-xs uppercase text-slate-500 font-bold tracking-wider">Parameters</h3>
                </div>

                <div>
                  <div className="flex justify-between items-center text-xs text-slate-400 mb-2">
                    <span className="font-medium">Max Words</span>
                    <input
                      type="number"
                      min="10"
                      max="1000"
                      step="10"
                      value={config.maxWords}
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                        if (!isNaN(val)) handleChange('maxWords', val);
                      }}
                      className="w-16 bg-slate-800 border border-slate-700 text-slate-200 rounded px-2 py-0.5 text-xs text-right focus:ring-1 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="1000"
                    step="10"
                    value={config.maxWords}
                    onChange={(e) => handleChange('maxWords', parseInt(e.target.value))}
                    className={`w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer ${config.provider === 'local' ? 'accent-emerald-500' : 'accent-indigo-500'}`}
                  />
                  <div className="flex justify-between text-[10px] text-slate-600 mt-1 font-mono">
                    <span>10</span>
                    <span>1000</span>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs text-slate-400 mb-1">
                    <span>Temperature</span>
                    <span>{config.temperature}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="2"
                    step="0.1"
                    value={config.temperature}
                    onChange={(e) => handleChange('temperature', parseFloat(e.target.value))}
                    className={`w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer ${config.provider === 'local' ? 'accent-emerald-500' : 'accent-indigo-500'}`}
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs text-slate-400 mb-1">
                    <span>Top K</span>
                    <span>{config.topK}</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="40"
                    step="1"
                    value={config.topK}
                    onChange={(e) => handleChange('topK', parseInt(e.target.value))}
                    className={`w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer ${config.provider === 'local' ? 'accent-emerald-500' : 'accent-indigo-500'}`}
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs text-slate-400 mb-1">
                    <span>Max Output Tokens</span>
                    <span>{config.maxOutputTokens}</span>
                  </div>
                  <input
                    type="range"
                    min="100"
                    max="8192"
                    step="100"
                    value={config.maxOutputTokens}
                    onChange={(e) => handleChange('maxOutputTokens', parseInt(e.target.value))}
                    className={`w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer ${config.provider === 'local' ? 'accent-emerald-500' : 'accent-indigo-500'}`}
                  />
                </div>
              </div>

              {/* System Prompt */}
              <div className="border-t border-slate-800 pt-4 pb-6">
                <div className="flex items-center gap-2 text-slate-300 mb-2">
                  <MessageSquare size={16} />
                  <label className="text-sm font-medium">System Instruction</label>
                </div>
                <textarea
                  value={config.systemInstruction}
                  onChange={(e) => handleChange('systemInstruction', e.target.value)}
                  className="w-full h-32 bg-slate-800 border border-slate-700 text-slate-200 rounded-md px-3 py-2 text-xs resize-none focus:ring-1 focus:ring-indigo-500 mb-4"
                  placeholder="Define how the model should behave..."
                />

                {/* Prompt Preview Collapsible */}
                <div className="border border-slate-700 rounded-md overflow-hidden">
                  <button
                    onClick={() => setIsPreviewOpen(!isPreviewOpen)}
                    className="w-full flex items-center justify-between px-3 py-2 bg-slate-800 hover:bg-slate-700 transition-colors text-xs font-medium text-slate-300"
                  >
                    <span>Prompt Preview</span>
                    <span className={`transition-transform ${isPreviewOpen ? 'rotate-180' : ''}`}>▼</span>
                  </button>

                  {isPreviewOpen && (
                    <div className="p-3 bg-slate-900 text-xs font-mono text-slate-400 space-y-3">
                      <div>
                        <span className="text-indigo-400 font-bold uppercase block mb-1">System</span>
                        <div className="bg-slate-950 p-2 rounded border border-slate-800/50">
                          {config.systemInstruction || <span className="italic opacity-50">No system instruction set</span>}
                        </div>
                      </div>
                      <div>
                        <span className="text-emerald-400 font-bold uppercase block mb-1">User</span>
                        <div className="bg-slate-950 p-2 rounded border border-slate-800/50 whitespace-pre-wrap">
                          {fullPromptPreview}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* LLM Judge Settings */}
              <div className="border-t border-slate-800 pt-4 pb-6">
                <div className="flex items-center gap-2 text-slate-300 mb-3">
                  <Target size={16} />
                  <label className="text-sm font-medium">LLM Judge Settings</label>
                </div>
                <div className="space-y-3">
                  {/* Use Main Model Toggle */}
                  <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                    <div className="flex-1">
                      <div className="text-xs font-medium text-slate-200">Use Main Config for Judging</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">Judge will use the same provider and model as generation</div>
                    </div>
                    <button
                      onClick={() => handleChange('useMainModelAsJudge', !config.useMainModelAsJudge)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${config.useMainModelAsJudge ? 'bg-indigo-600' : 'bg-slate-700'
                        }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${config.useMainModelAsJudge ? 'translate-x-6' : 'translate-x-1'
                          }`}
                      />
                    </button>
                  </div>

                  {/* Dedicated Judge Configuration (shown when toggle is off) */}
                  {!config.useMainModelAsJudge && (
                    <div className="space-y-3 p-3 bg-purple-500/5 border border-purple-500/20 rounded-lg">
                      <div className="text-[10px] uppercase font-bold text-purple-300 flex items-center gap-1">
                        <Target size={12} />
                        Dedicated Judge Model
                      </div>

                      {/* Judge Provider Selection */}
                      <div>
                        <label className="block text-[10px] text-slate-500 uppercase font-bold mb-1">Provider</label>
                        <div className="flex bg-slate-800 p-1 rounded-lg">
                          <button
                            onClick={() => handleChange('judgeProvider', 'gemini')}
                            className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${config.judgeProvider === 'gemini'
                              ? 'bg-indigo-600 text-white shadow-sm'
                              : 'text-slate-400 hover:text-slate-200'
                              }`}
                          >
                            Gemini
                          </button>
                          <button
                            onClick={() => handleChange('judgeProvider', 'local')}
                            className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${config.judgeProvider === 'local'
                              ? 'bg-emerald-600 text-white shadow-sm'
                              : 'text-slate-400 hover:text-slate-200'
                              }`}
                          >
                            Local
                          </button>
                        </div>
                      </div>

                      {/* Judge Model Selection */}
                      <div>
                        <label className="block text-[10px] text-slate-500 uppercase font-bold mb-1">Model</label>
                        {config.judgeProvider === 'gemini' ? (
                          <select
                            value={config.judgeModel || ModelType.FLASH}
                            onChange={(e) => handleChange('judgeModel', e.target.value)}
                            className="w-full bg-slate-800 border border-slate-700 text-slate-200 rounded-md px-3 py-2 text-xs"
                          >
                            {Object.values(ModelType).map((model) => (
                              <option key={model} value={model}>
                                {model.replace('gemini-', '')}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type="text"
                            value={config.judgeModel}
                            onChange={(e) => handleChange('judgeModel', e.target.value)}
                            placeholder="e.g., llama3, mistral"
                            className="w-full bg-slate-800 border border-slate-700 text-slate-200 rounded-md px-3 py-2 text-xs placeholder-slate-600"
                          />
                        )}
                        <p className="text-[9px] text-slate-600 mt-1">
                          Dedicated model for evaluating batch results
                        </p>
                      </div>
                    </div>
                  )}


                  {/* Judge Criteria Editor */}
                  <div className="space-y-3 p-3 bg-slate-800/30 border border-slate-700 rounded-lg mt-3">
                    <div className="flex items-center justify-between">
                      <div className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1">
                        <Sliders size={12} />
                        Evaluation Criteria
                      </div>
                      <button
                        onClick={() => {
                          const newId = crypto.randomUUID();
                          setConfig(prev => ({
                            ...prev,
                            judgeCriteria: [
                              ...prev.judgeCriteria,
                              { id: newId, name: 'NEW CRITERIA', weight: 10, description: 'Description...' }
                            ]
                          }));
                        }}
                        className="text-[10px] bg-indigo-600 hover:bg-indigo-500 text-white px-2 py-0.5 rounded transition-colors"
                      >
                        + Add
                      </button>
                    </div>

                    <div className="space-y-2">
                      {config.judgeCriteria.map((criterion) => (
                        <div key={criterion.id} className="bg-slate-900 p-2 rounded border border-slate-800 group">
                          <div className="flex items-center gap-2 mb-1">
                            <input
                              type="text"
                              value={criterion.name}
                              onChange={(e) => {
                                setConfig(prev => ({
                                  ...prev,
                                  judgeCriteria: prev.judgeCriteria.map(c =>
                                    c.id === criterion.id ? { ...c, name: e.target.value } : c
                                  )
                                }));
                              }}
                              className="flex-1 bg-transparent text-xs font-bold text-slate-300 outline-none border-b border-transparent focus:border-indigo-500"
                              placeholder="CRITERIA NAME"
                            />
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                value={criterion.weight}
                                onChange={(e) => {
                                  setConfig(prev => ({
                                    ...prev,
                                    judgeCriteria: prev.judgeCriteria.map(c =>
                                      c.id === criterion.id ? { ...c, weight: parseInt(e.target.value) || 0 } : c
                                    )
                                  }));
                                }}
                                className="w-8 bg-slate-800 text-[10px] text-right text-indigo-300 rounded px-1 outline-none focus:ring-1 focus:ring-indigo-500"
                              />
                              <span className="text-[10px] text-slate-500">%</span>
                            </div>
                            <button
                              onClick={() => {
                                setConfig(prev => ({
                                  ...prev,
                                  judgeCriteria: prev.judgeCriteria.filter(c => c.id !== criterion.id)
                                }));
                              }}
                              className="text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <X size={12} />
                            </button>
                          </div>
                          <input
                            type="text"
                            value={criterion.description}
                            onChange={(e) => {
                              setConfig(prev => ({
                                ...prev,
                                judgeCriteria: prev.judgeCriteria.map(c =>
                                  c.id === criterion.id ? { ...c, description: e.target.value } : c
                                )
                              }));
                            }}
                            className="w-full bg-transparent text-[10px] text-slate-500 outline-none border-b border-transparent focus:border-slate-600 placeholder-slate-700"
                            placeholder="Description of what to evaluate..."
                          />
                        </div>
                      ))}
                    </div>

                    {/* Total Weight Indicator */}
                    <div className="flex justify-between items-center px-1">
                      <span className="text-[10px] text-slate-500">Total Weight</span>
                      <span className={`text-[10px] font-bold ${config.judgeCriteria.reduce((sum, c) => sum + c.weight, 0) === 100
                        ? 'text-emerald-400'
                        : 'text-amber-400'
                        }`}>
                        {config.judgeCriteria.reduce((sum, c) => sum + c.weight, 0)}%
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default Sidebar;
