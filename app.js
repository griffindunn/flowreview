document.addEventListener('DOMContentLoaded', () => {
    let cy = cytoscape({
        container: document.getElementById('cy'),
        style: [
            {
                selector: 'node',
                style: {
                    'background-color': '#0d6efd',
                    'label': 'data(label)',
                    'color': '#fff',
                    'text-valign': 'center',
                    'text-halign': 'center',
                    'shape': 'round-rectangle',
                    'width': 'label',
                    'padding': '10px',
                    'font-size': '12px'
                }
            },
            {
                selector: 'edge',
                style: {
                    'width': 2,
                    'line-color': '#ccc',
                    'target-arrow-color': '#ccc',
                    'target-arrow-shape': 'triangle',
                    'curve-style': 'bezier',
                    'label': 'data(label)',
                    'font-size': '10px',
                    'text-background-color': '#fff',
                    'text-background-opacity': 1
                }
            }
        ],
        layout: { name: 'dagre', rankDir: 'LR' }
    });

    const fileInput = document.getElementById('fileInput');
    const flowInfo = document.getElementById('flowInfo');
    const flowNameDisplay = document.getElementById('flowName');
    const errorMsg = document.getElementById('errorMsg');

    // 1. Handle Upload
    fileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const json = JSON.parse(e.target.result);
                console.log("Loaded JSON:", json); // Debugging: See what we loaded
                
                // Clear previous errors
                errorMsg.classList.add('d-none');
                
                // Attempt to parse
                const elements = parseWxCCJSON(json);
                
                if (elements.length === 0) {
                    throw new Error("No nodes found. JSON structure might be different.");
                }

                // Render
                cy.elements().remove();
                cy.add(elements);
                cy.layout({ name: 'dagre', rankDir: 'LR', animate: true }).run();

                // Update UI
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

    // 2. Handle PDF Export
    document.getElementById('btnPdf').addEventListener('click', () => {
        // We use the browser's native print, but CSS hides everything except the graph
        window.print(); 
    });

    // 3. ROBUST PARSER
    function parseWxCCJSON(json) {
        let nodes = [];
        let edges = [];

        // STRATEGY: Find the array of steps. WxCC structure changes often.
        // We look for common keys: 'steps', 'nodes', 'activities'
        let steps = json.steps || json.nodes || (json.graph && json.graph.steps);

        // If 'steps' is still undefined, try looking deeper (Analyzer format)
        if (!steps && json.flow) steps = json.flow.steps;
        
        if (!steps || !Array.isArray(steps)) {
            console.error("Could not find a 'steps' or 'nodes' array in this JSON.");
            return [];
        }

        steps.forEach(step => {
            // NODE
            nodes.push({
                data: { 
                    id: step.id, 
                    label: step.name || step.displayName || step.type || "Unknown" 
                }
            });

            // EDGES (Connections)
            // Look for 'links', 'transitions', or 'connections'
            const links = step.links || step.transitions || step.connections || [];
            
            links.forEach(link => {
                // Target ID often under: 'to', 'target', 'targetStepId'
                const target = link.to || link.target || link.targetStepId;
                const label = link.label || link.condition || link.nodeOutput || "";

                if (target) {
                    edges.push({
                        data: { source: step.id, target: target, label: label }
                    });
                }
            });
        });

        return [...nodes, ...edges];
    }
});
