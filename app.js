document.addEventListener('DOMContentLoaded', () => {
    let cy = cytoscape({
        container: document.getElementById('cy'),
        style: [
            {
                selector: 'node',
                style: {
                    'background-color': '#0d6efd', // Blue
                    'label': 'data(label)',
                    'color': '#fff',
                    'text-valign': 'center',
                    'text-halign': 'center',
                    'shape': 'round-rectangle',
                    'width': 'label',
                    'padding': '12px',
                    'font-size': '11px',
                    'text-wrap': 'wrap',
                    'text-max-width': '120px'
                }
            },
            {
                selector: 'node[type="start"]', // Specific style for Start node
                style: { 'background-color': '#198754', 'shape': 'ellipse' } // Green
            },
            {
                selector: 'node[type="disconnect-contact"]', // Specific style for End/Disconnect
                style: { 'background-color': '#dc3545' } // Red
            },
            {
                selector: 'edge',
                style: {
                    'width': 1.5,
                    'line-color': '#adb5bd',
                    'target-arrow-color': '#adb5bd',
                    'target-arrow-shape': 'triangle',
                    'curve-style': 'bezier',
                    'label': 'data(label)',
                    'font-size': '9px',
                    'text-background-color': '#ffffff',
                    'text-background-opacity': 1,
                    'text-background-padding': '2px',
                    'text-rotation': 'autorotate'
                }
            }
        ],
        layout: { 
            name: 'dagre', 
            rankDir: 'LR', 
            spacingFactor: 1.1 
        }
    });

    const fileInput = document.getElementById('fileInput');
    const flowInfo = document.getElementById('flowInfo');
    const flowNameDisplay = document.getElementById('flowName');
    const errorMsg = document.getElementById('errorMsg');

    fileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const json = JSON.parse(e.target.result);
                console.log("JSON Loaded:", json); // Debug info
                
                errorMsg.classList.add('d-none');
                
                // --- PARSING LOGIC SPECIFIC TO YOUR FILE ---
                const elements = parseFlowBuilderJson(json);
                
                if (elements.length === 0) {
                    throw new Error("Parsed 0 nodes. Check Console for structure details.");
                }

                // Load into Cytoscape
                cy.elements().remove();
                cy.add(elements);
                cy.layout({ 
                    name: 'dagre', 
                    rankDir: 'LR', 
                    nodeSep: 50, 
                    rankSep: 100 
                }).run();

                // UI Updates
                flowInfo.classList.remove('d-none');
                flowNameDisplay.innerText = json.name || file.name;

            } catch (err) {
                console.error(err);
                errorMsg.innerText = "Error: " + err.message;
                errorMsg.classList.remove('d-none');
            }
        };
        reader.readAsText(file);
    });

    // PDF / Print Handler
    document.getElementById('btnPdf').addEventListener('click', () => {
        window.print();
    });

    // --- PARSER FOR YOUR SPECIFIC JSON FORMAT ---
    function parseFlowBuilderJson(json) {
        let nodes = [];
        let edges = [];

        // 1. Locate the process object
        // Your file has json.process.activities (Object) and json.process.links (Array)
        if (!json.process || !json.process.activities || !json.process.links) {
            console.warn("Standard structure not found. Checking alternate locations...");
            return []; 
        }

        const activities = json.process.activities; // Object key=ID, val=Data
        const links = json.process.links;           // Array

        // 2. Parse Nodes (Activities)
        // Convert Object keys to Array
        Object.values(activities).forEach(act => {
            let nodeLabel = act.name || "Unknown";
            let nodeType = act.activityName || "action";

            // Clean up labels for specific types
            if (nodeType === 'play-message') nodeLabel = "Play: " + act.name;
            if (nodeType === 'menu') nodeLabel = "Menu: " + act.name;

            nodes.push({
                data: { 
                    id: act.id, 
                    label: nodeLabel,
                    type: nodeType // Used for styling colors
                }
            });
        });

        // 3. Parse Edges (Links)
        links.forEach(link => {
            // Your JSON uses 'conditionExpr' for the line label (e.g. "1", "timeout")
            let edgeLabel = link.conditionExpr || "";
            
            // Sometimes it is 'properties.value'
            if (!edgeLabel && link.properties && link.properties.value) {
                edgeLabel = link.properties.value;
            }

            if (link.sourceActivityId && link.targetActivityId) {
                edges.push({
                    data: {
                        source: link.sourceActivityId,
                        target: link.targetActivityId,
                        label: edgeLabel
                    }
                });
            }
        });

        console.log(`Parsed ${nodes.length} nodes and ${edges.length} edges.`);
        return [...nodes, ...edges];
    }
});
