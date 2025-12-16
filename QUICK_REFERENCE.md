# 🚀 Quick Reference Guide

## Getting Started

1.  **Run Locally**: `npm run dev`
2.  **Open App**: `http://localhost:3000` (or port shown in terminal)

## ☁️ Cloud API Setup (BYOK)

1.  **Provider**: Select **Cloud API** in the Sidebar.
2.  **Base URL**:
    *   **OpenRouter**: `https://openrouter.ai/api/v1`
    *   **OpenAI**: `https://api.openai.com/v1`
    *   **Groq**: `https://api.groq.com/openai/v1`
    *   **DeepSeek**: `https://api.deepseek.com`
3.  **API Key**: Enter your personal API Key.
4.  **Connect**: Click the **Refresh Icon (🔄)** to load available models.

## 💻 Local LLM Setup (LM Studio)

1.  Start LM Studio Server on port `1234`.
2.  **Provider**: Select **Local LLM** in Sidebar.
3.  **Endpoint**: `http://localhost:1234/v1/chat/completions`

## 🧪 Playground Mode
*   **Quick Test**: Paste text, select a model, click "Generate Summary".
*   **Compare**: Select multiple models in the Sidebar to generate side-by-side.

## 🏭 Workbench Mode (Batch Processing)
*   **Load Data**: Drag & Drop `.csv`, `.xlsx`, `.pdf`, `.docx`.
*   **Configure**: Use **Run Configurations** (Sliders Icon) to define prompts/models.
*   **Process**: Click "Run Batch Process" to generate summaries for all items.
*   **Judge**: Use the "LLM Judge" settings in Sidebar to auto-grade results.

## ⚖️ LLM Judge
*   **Enable**: In Settings > LLM Judge Settings.
*   **Mode**: Use the same model (Self-Correction) or a specific "Judge" model (e.g., GPT-4o judging a smaller model).
*   **Criteria**: Customize grading metrics (Accuracy, Clarity, etc.).
