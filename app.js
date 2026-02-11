document.addEventListener('DOMContentLoaded', () => {
    // Grab the file input from the HTML
    const fileInput = document.getElementById('fileInput');
    
    // Create a debug display area at the bottom of the page
    const debugArea = document.createElement('div');
    debugArea.style.padding = "20px";
    debugArea.style.marginTop = "20px";
    debugArea.style.backgroundColor = "#f8f9fa";
    debugArea.style.borderTop = "2px solid #333";
    debugArea.style.fontFamily = "monospace";
    debugArea.style.whiteSpace = "pre-wrap"; // Preserves formatting
    document.body.appendChild(debugArea);

    fileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) return;

        debugArea.innerHTML = `<strong>Analyzing file:</strong> ${file.name}\n`;

        const reader = new FileReader();
        
        // 1. If this fails, the file is not text (e.g., it's a binary zip)
        reader.onload = (e) => {
            try {
                const rawText = e.target.result;
                debugArea.innerHTML += `✅ File read successfully (${rawText.length} bytes).\n`;
                
                // 2. Try to parse JSON
                const json = JSON.parse(rawText);
                debugArea.innerHTML += `✅ JSON Parsed successfully.\n`;
                debugArea.innerHTML += `------------------------------------------------\n`;
                
                // 3. Print the Root Keys (This tells us the structure)
                const keys = Object.keys(json);
                debugArea.innerHTML += `<strong>Root Keys Found:</strong> [ ${keys.join(', ')} ]\n\n`;

                // 4. Check for common WxCC patterns
                if (json.steps) debugArea.innerHTML += `Found 'steps' array with ${json.steps.length} items.\n`;
                if (json.nodes) debugArea.innerHTML += `Found 'nodes' array with ${json.nodes.length} items.\n`;
                if (json.graph) debugArea.innerHTML += `Found 'graph' object. Keys: [${Object.keys(json.graph).join(', ')}]\n`;
                
                debugArea.innerHTML += `\n<strong>Preview of first 200 characters:</strong>\n`;
                debugArea.innerHTML += JSON.stringify(json, null, 2).substring(0, 200) + "...";

            } catch (err) {
                debugArea.innerHTML += `\n❌ <strong>CRITICAL ERROR:</strong>\n${err.message}\n`;
                debugArea.innerHTML += `\nPossible Cause: The file might be a ZIP file, or contain invalid characters.`;
            }
        };

        reader.readAsText(file);
    });
});
