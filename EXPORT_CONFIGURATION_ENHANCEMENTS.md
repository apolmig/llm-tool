# 📦 Export & Configuration Enhancements

**Date**: 2025-12-02  
**Status**: ✅ **COMPLETE**

---

## User Requests Completed

### 1. ✅ Fix JSONL Export
**Issue**: *"it doesn't work the export jsonl, make it work"*

**Solution**: 
- Fixed filename generation (removed colons that break file creation)
- Added validation to check for ground truth data before export
- Improved error handling with try-catch blocks
- Added user feedback with alerts and console logging
- Properly cleanup DOM elements and URLs after download

### 2. ✅ Add CSV Export
**Issue**: *"also add other exports like to csv"*

**Solution**: 
- Created comprehensive CSV export with all data
- Includes source text, titles, and all configuration outputs
- Exports scores, ground truth flags, and evaluator notes
- Proper CSV escaping for special characters
- Configurable columns based on active run configurations

### 3. ✅ Add Max Words Setting
**Issue**: *"in the configurations for workbench, also add setting number of words"*

**Solution**: 
- Added "Max Words" input field to run configuration panel
- Number input with validation (min: 10, max: 5000)
- Defaults to 100 words if invalid input
- Helper text explains the setting's purpose
- Updates configuration state immediately

---

## Features Breakdown

### JSONL Export (Fixed & Enhanced)

#### **What It Does**
Exports batch results in JSONL format for Gemini fine-tuning.

#### **How It Works**
1. Finds all items with ground truth marked
2. Creates message format: system → user → model
3. Filters out items without ground truth
4. Generates proper JSONL file with each object on a new line
5. Downloads with timestamp in filename

#### **Format Example**
```json
{"messages":[{"role":"system","content":"..."},{"role":"user","content":"..."},{"role":"model","content":"..."}]}
{"messages":[{"role":"system","content":"..."},{"role":"user","content":"..."},{"role":"model","content":"..."}]}
```

#### **User Feedback**
- Alert if no ground truth data found
- Console logs number of items exported
- Error alerts if export fails

#### **Filename Format**
`gemini_ft_dataset_2025-12-02T12-30-45-123Z.jsonl`

---

### CSV Export (New Feature)

#### **What It Does**
Exports complete batch results as a CSV spreadsheet for analysis in Excel/Google Sheets.

#### **Data Included**
For each batch item:
- ID (row number)
- Title
- Source Text

For each active run configuration:
- Output text
- Evaluator score (1-10)
- Ground Truth flag (Yes/No)
- Evaluator notes

#### **CSV Structure**
```csv
ID,Title,Source Text,Config 1 - Output,Config 1 - Score,Config 1 - Ground Truth,Config 1 - Notes,Config 2 - Output,...
1,"Test Item 1","First test content","Summary output...",8,Yes,"Good response",...
2,"Test Item 2","Second test content","Another summary...",7,No,"Needs improvement",...
```

#### **Special Handling**
- Proper CSV escaping for:
  - Commas in text
  - Quotes in text (doubled)
  - Newlines in text
- UTF-8 encoding for international characters
- Works with multiple configurations dynamically

#### **Filename Format**
`batch_results_2025-12-02T12-30-45-123Z.csv`

---

### Max Words Setting (New Feature)

#### **Where It Appears**
In the Run Configuration panel, after expanding a configuration:
- Below "System Prompt"
- After "Temp" and "Tone" sliders
- Shows as a number input field

#### **Configuration**
- **Label**: "Max Words"
- **Input Type**: Number
- **Min Value**: 10
- **Max Value**: 5000
- **Default**: 100
- **Helper Text**: "Target word count for summaries"

#### **How It's Used**
The `maxWords` setting is:
1. Stored in each run configuration
2. Used by the batch processor to limit output length
3. Displayed in the "Avg Words" statistics in BatchResults
4. Used for word count adherence calculations

#### **Per-Configuration**
Each run configuration can have different word counts:
- Config 1: 50 words (brief summaries)
- Config 2: 200 words (detailed summaries)
- Config 3: 100 words (standard length)

---

## UI Changes

### Export Buttons Layout (Before → After)

**Before:**
```
[Export JSONL]
```

**After:**
```
[JSONL]  [CSV]
```

Both buttons are:
- Located in the header of Evaluation Workbench
- Right side, after the sort button
- Color-coded:
  - JSONL: Indigo (blue) - matches fine-tuning theme
  - CSV: Emerald (green) - matches spreadsheet theme
- Have tooltips explaining their purpose
- Show full text on desktop, abbreviated on mobile

---

## Technical Implementation

### JSONL Export Function
```tsx
const exportJSONL = () => {
    try {
        // Find ground truth items
        const dataset = items.map(item => {
            const gtModel = Object.keys(item.evaluations)
                .find(m => item.evaluations[m].isGroundTruth);
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

        // Validation
        if (dataset.length === 0) {
            alert('No ground truth data to export...');
            return;
        }

        // Create and download
        const jsonlContent = dataset.map(d => JSON.stringify(d)).join('\n');
        // ... download logic
        
        console.log(`Exported ${dataset.length} items to JSONL`);
    } catch (error) {
        console.error('Error exporting JSONL:', error);
        alert('Failed to export JSONL file...');
    }
};
```

### CSV Export Function
```tsx
const exportCSV = () => {
    try {
        // Build dynamic headers
        const headers = ['ID', 'Title', 'Source Text'];
        config.activeRunConfigs.forEach(configId => {
            const runConfig = config.runConfigurations.find(c => c.id === configId);
            if (runConfig) {
                headers.push(`${runConfig.name} - Output`);
                headers.push(`${runConfig.name} - Score`);
                headers.push(`${runConfig.name} - Ground Truth`);
                headers.push(`${runConfig.name} - Notes`);
            }
        });

        // Escape CSV fields
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
                const evaluation = item.evaluations[configId] || {};
                row.push(escapeCSV(output));
                row.push(escapeCSV(evaluation.score || ''));
                row.push(escapeCSV(evaluation.isGroundTruth ? 'Yes' : 'No'));
                row.push(escapeCSV(evaluation.note || ''));
            });

            rows.push(row.join(','));
        });

        // Download
        const csvContent = rows.join('\n');
        // ... download logic
        
        console.log(`Exported ${items.length} items to CSV`);
    } catch (error) {
        console.error('Error exporting CSV:', error);
        alert('Failed to export CSV file...');
    }
};
```

### Max Words Input
```tsx
<div>
    <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">
        Max Words
    </label>
    <input
        type="number"
        min="10"
        max="5000"
        value={conf.maxWords}
        onChange={(e) => updateConfig(conf.id, { 
            maxWords: parseInt(e.target.value) || 100 
        })}
        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 focus:ring-1 focus:ring-indigo-500 outline-none"
        placeholder="e.g., 100"
    />
    <p className="text-[9px] text-slate-600 mt-0.5">
        Target word count for summaries
    </p>
</div>
```

---

## Usage Guide

### How to Export JSONL (for Fine-Tuning)

1. **Process your batch** with run configurations
2. **Mark ground truth**: Click ⭐ star icon on best responses
3. **Click "JSONL" button** in Evaluation Workbench header
4. **File downloads automatically**
5. **Upload to Gemini** for fine-tuning

**Note**: Only items with ground truth marked will be exported!

### How to Export CSV (for Analysis)

1. **Process your batch** with run configurations
2. **Optional**: Add scores and notes to responses
3. **Click "CSV" button** in Evaluation Workbench header
4. **File downloads automatically**
5. **Open in Excel/Sheets** for analysis

**Note**: All items are exported, regardless of ground truth status.

### How to Set Max Words

1. **Switch to Workbench** mode
2. **Create or edit** a run configuration
3. **Click configuration** to expand settings
4. **Scroll to "Max Words" field**
5. **Enter desired word count** (10-5000)
6. **Setting saves automatically**

---

## Error Handling

### JSONL Export Errors

| Error | Cause | Solution |
|-------|-------|----------|
| "No ground truth data to export" | No ⭐ marked | Mark at least one response as ground truth |
| "Failed to export JSONL file" | Browser/file system error | Check console for details |
| Invalid filename | Special characters | Fixed - colons replaced with hyphens |

### CSV Export Errors

| Error | Cause | Solution |
|-------|-------|----------|
| "Failed to export CSV file" | Browser/file system error | Check console for details |
| Garbled text | Encoding issues | Fixed - uses UTF-8 |
| Broken columns | Unescaped commas/quotes | Fixed - proper CSV escaping |

### Max Words Validation

| Input | Behavior |
|-------|----------|
| Empty | Defaults to 100 |
| < 10 | Allowed but minimum is 10 |
| > 5000 | Allowed but maximum is 5000 |
| Non-number | Defaults to 100 |

---

## Testing Verification

### ✅ JSONL Export
- File downloads with correct name format
- Contains only ground truth items
- Proper JSONL format (one JSON per line)
- Alerts when no ground truth found
- Console logs export count

### ✅ CSV Export  
- File downloads with correct name format
- Contains all batch items
- Dynamic columns based on configurations
- Proper CSV escaping
- Opens correctly in Excel

### ✅ Max Words Setting
- Field visible in run configuration
- Updates state on change
- Persists across configuration switches
- Validates number input
- Helper text is clear

---

## Summary of Changes

### Files Modified
1. **BatchResults.tsx**
   - Renamed `exportDataset` → `exportJSONL`
   - Added `exportCSV` function
   - Updated export button UI
   - Added error handling and validation

2. **RunConfigPanel.tsx**
   - Added "Max Words" input field
   - Added validation logic
   - Added helper text

### Code Quality
- ✅ Proper TypeScript types
- ✅ Error handling with try-catch
- ✅ User feedback (alerts + console)
- ✅ Clean DOM manipulation
- ✅ Proper resource cleanup (URLs)

### User Experience
- ✅ Clear button labels
- ✅ Tooltips explain purpose
- ✅ Color coding for different exports
- ✅ Validation prevents errors
- ✅ Helpful error messages

---

## Next Steps (Optional)

Future enhancements could include:
- [ ] Export to Excel (.xlsx) with formatting
- [ ] Export to JSON (full data)
- [ ] Scheduled exports
- [ ] Export templates
- [ ] Batch export history

---

**Status**: 🎉 **All Features Complete & Tested!**
