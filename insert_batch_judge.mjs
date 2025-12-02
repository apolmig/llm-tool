import { readFileSync, writeFileSync } from 'fs';

// Read the file
const filePath = 'c:/Users/MGManchon/OneDrive - Presidencia del Gobierno/CODE/CiudadanIA/app-test/components/BatchResults.tsx';
const content = readFileSync(filePath, 'utf8');

// The batch judge function to insert
const batchJudgeFunction = `
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

        const confirmed = confirm(\`Judge all \${itemsToJudge.length} results? This will take some time.\`);
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
        
        alert(\`Batch judging complete!\\n✓ Success: \${successCount}\\n✗ Failed: \${failureCount}\`);
        console.log(\`Batch judge complete: \${successCount} success, \${failureCount} failures\`);
    };
`;

// Find the insertion point
const searchPattern = '    };\n\n    const exportJSONL = () => {';
const replacement = '    };' + batchJudgeFunction + '\n    const exportJSONL = () => {';

if (content.includes(searchPattern)) {
    const newContent = content.replace(searchPattern, replacement);

    // Write back to file
    writeFileSync(filePath, newContent, 'utf8');

    console.log('✓ Successfully inserted batch judge function');
    process.exit(0);
} else {
    console.log('✗ Could not find insertion point');
    console.log('Looking for pattern:', JSON.stringify(searchPattern));

    // Try to find similar patterns
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('const exportJSONL')) {
            console.log(`Found exportJSONL at line ${i + 1}: ${lines[i]}`);
            if (i > 0) console.log(`Previous line ${i}: ${lines[i - 1]}`);
            if (i > 1) console.log(`Two lines before ${i - 1}: ${lines[i - 2]}`);
        }
    }
    process.exit(1);
}
