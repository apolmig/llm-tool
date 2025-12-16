# ⚖️ LLM Judge Feature Guide

This guide explains how to use the new "LLM as a Judge" feature in the Workbench.

## Overview

The LLM Judge automatically evaluates generated summaries based on configurable criteria. It assigns a score (0-10) and provides a rationale for the score.

## Configuration

1.  Open the **Sidebar** and go to the **Settings** tab.
2.  Scroll down to **LLM Judge Settings**.
3.  **Use Main Config for Judging**:
    *   **Enabled (Default)**: The judge uses the same model and provider that generated the summary. This is useful for self-correction or when you want to test a specific model's ability to evaluate itself.
    *   **Disabled**: Allows you to specify a *different* model for judging. For example, you can use a small local model (e.g., `mistral`) to generate summaries and a powerful cloud model (e.g., `openai/gpt-4o`) to judge them.
4.  **Judge Provider & Model**: (Visible if "Use Main Config" is disabled) Select between Cloud API or Local, and specify the model name.
5.  **Evaluation Criteria**:
    *   You can add, remove, or modify criteria.
    *   Each criterion has a **Weight**. The final score is a weighted average.
    *   Default criteria: Accuracy, Clarity, Conciseness, Completeness.

## How to Use

### Automatic Evaluation (Batch Mode)
1.  Go to the **Workbench** tab.
2.  Load your dataset (CSV, Excel, PDF, etc.).
3.  Click **Run Batch Process**.
4.  The system will:
    *   Generate summaries for each item.
    *   **Automatically evaluate** each summary using the configured Judge.
    *   Display the **Score** and **Notes** in the results table.

### Manual Evaluation
1.  In the **Workbench** results table, locate a specific result.
2.  Click the **Target Icon** (🎯) in the grading controls area.
3.  The configured Judge will evaluate that specific result and update the score and note.

### Batch Re-Evaluation
1.  If you want to re-judge all items (e.g., after changing criteria), click the **Judge All** button in the top toolbar.
2.  This will re-run the evaluation process for all existing results without re-generating the text.

## Technical Details

*   **Scoring Scale**: 0 to 10.
*   **Providers**:
    *   **Cloud API**: Connects to any OpenAI-compatible provider (e.g., OpenRouter, OpenAI, Groq) using the configured Base URL and API Key.
    *   **Local**: Connects to any OpenAI-compatible endpoint (e.g., LM Studio, Ollama) at the URL specified in "Endpoint".
*   **Prompting**: The judge uses a sophisticated prompt that includes the original text, the summary, and the specific criteria descriptions to ensure objective grading.
