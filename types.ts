
export enum ModelType {
  FLASH = 'gemini-2.5-flash',
  PRO = 'gemini-3-pro-preview',
  FLASH_LITE = 'gemini-flash-lite-latest'
}

export type ModelProvider = 'gemini' | 'local';

export enum ToneType {
  PROFESSIONAL = 'Professional',
  CASUAL = 'Casual',
  ACADEMIC = 'Academic',
  CONCISE = 'Concise',
  WITTY = 'Witty'
}

export enum FormatType {
  PARAGRAPH = 'Paragraph',
  BULLET_POINTS = 'Bullet Points',
  EXECUTIVE_SUMMARY = 'Executive Summary',
  TLDR = 'TL;DR',
  JSON = 'JSON'
}

export interface AppConfig {
  provider: ModelProvider;
  activeModels: string[];
  modelVersion: string;
  localEndpoint: string;
  temperature: number;
  topK: number;
  topP: number;
  maxOutputTokens: number;
  systemInstruction: string;
  tone: ToneType;
  format: FormatType;
  customFocus: string;
  maxWords: number;
  // New: Run Configurations for Batch Mode
  runConfigurations: RunConfiguration[];
  activeRunConfigs: string[]; // IDs of active configurations
  // LLM Judge Configuration
  judgeProvider: ModelProvider;
  judgeModel: string;
  useMainModelAsJudge: boolean;
  judgeCriteria: JudgeCriteria[];
}

export interface JudgeCriteria {
  id: string;
  name: string;
  weight: number; // percentage (0-100)
  description: string;
}

export interface RunConfiguration {
  id: string;
  name: string;
  provider: ModelProvider;
  model: string;
  systemInstruction: string;
  temperature: number;
  topK: number;
  topP: number;
  maxOutputTokens: number;
  tone: ToneType;
  format: FormatType;
  customFocus: string;
  maxWords: number;
}

export interface HistoryItem {
  id: string;
  timestamp: number;
  sourceText: string;
  results: Record<string, string>;
  config: AppConfig;
  durationMs: number;
}

export interface ChatMessage {
  role: 'user' | 'model';
  content: string;
  timestamp: number;
}

// --- New Batch & Evaluation Types ---

export type ViewMode = 'playground' | 'batch';

export interface Evaluation {
  score: number; // 0-10
  note: string;
  isGroundTruth: boolean; // If true, this is the target for fine-tuning
}

export interface BatchItem {
  id: string;
  title?: string;
  sourceText: string;
  status: 'pending' | 'processing' | 'done' | 'error';
  results: Record<string, string>; // model -> generated text
  evaluations: Record<string, Evaluation>; // model -> grading details
  error?: string;
}
