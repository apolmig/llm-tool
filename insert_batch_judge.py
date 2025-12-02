import sys

# Read the file
file_path = r'c:\Users\MGManchon\OneDrive - Presidencia del Gobierno\CODE\CiudadanIA\app-test\components\BatchResults.tsx'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# The batch judge function to insert
batch_judge_function = '''
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
        
        alert(`Batch judging complete!\\n✓ Success: ${successCount}\\n✗ Failed: ${failureCount}`);
        console.log(`Batch judge complete: ${successCount} success, ${failureCount} failures`);
    };
'''

# Find the insertion point (after judgeWithLLM function ends, before exportJSONL)
# Look for the pattern where judgeWithLLM ends and exportJSONL starts
search_pattern = '    };\n\n    const exportJSONL = () => {'
replacement = '    };' + batch_judge_function + '\n    const exportJSONL = () => {'

if search_pattern in content:
    new_content = content.replace(search_pattern, replacement, 1)
    
    # Write back to file
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(new_content)
    
    print("✓ Successfully inserted batch judge function")
    sys.exit(0)
else:
    print("✗ Could not find insertion point")
    print(f"Looking for pattern: {repr(search_pattern)}")
    sys.exit(1)
