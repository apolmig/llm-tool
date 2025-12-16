<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1WrUn2aF_qR7Fsh77R5voKJ3j0vELXN6S


## Run Locally

**Prerequisites:**  Node.js (v18+)

1. Install dependencies:
   `npm install`
2. Run the app:
   `npm run dev`

## Configuration

The application supports **Local LLMs** (via LM Studio) and **Cloud APIs** (OpenAI compatible).

### Cloud API (BYOK)
1. Select "Cloud API" in the sidebar.
2. Enter your Base URL (e.g., `https://openrouter.ai/api/v1` or `https://api.openai.com/v1`).
3. Enter your API Key.
4. Click the Refresh icon to load available models.

### Local LLM
1. Run LM Studio and start the local server.
2. Select "Local LLM" in the app sidebar.
3. Ensure the endpoint matches (default: `http://localhost:1234/v1/chat/completions`).

