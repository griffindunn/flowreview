document.addEventListener('DOMContentLoaded', () => {
    
    // --- FIX: REGISTER DAGRE EXTENSION ---
    // This tells Cytoscape to use the Dagre layout library we loaded in index.html
    try {
        if (window.cytoscapeDagre) {
            cytoscape.use(window.cytoscapeDagre);
        }
    } catch (e) {
        console.warn("Dagre registration warning:", e);
    }
    // -------------------------------------

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
                    'padding': '12px',
                    'font-size': '11px',
                    'text-wrap': 'wrap',
                    'text-max-width': '120px'
                }
            },
            {
                selector: 'node[type="start"]',
                style: { 'background-color': '#198754', 'shape': 'ellipse' }
            },
            {
                selector: 'node[type="disconnect-contact"]',
                style: { 'background-color': '#dc3545' }
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
        layout: { name: 'preset' } // Start with no layout
    });

    const fileInput = document.getElementById('fileInput');
    const btnProcess = document.getElementById('btnProcess');
    const flowInfo = document.getElementById('flowInfo');
    const flowNameDisplay = document.getElementById('flowName');
    const errorMsg = document.getElementById('errorMsg');
    const loadingOverlay = document.getElementById('loadingOverlay');

    let selectedFile = null;

    // 1. Handle File Selection
    fileInput.addEventListener('change', (event) => {
        if (event.target.files.length > 0) {
            selectedFile = event.target.files[0];
            btnProcess.disabled = false;
            errorMsg.classList.add('d-none');
        } else {
            btnProcess.disabled = true;
        }
    });

    // 2. Handle "Visualize" Click
    btnProcess.addEventListener('click', () => {
        if (!selectedFile) return;

        // Show loading spinner
        loadingOverlay.classList.remove('d-none');

        // Use setTimeout to let the browser render the spinner before freezing
        setTimeout(() => {
            const reader = new FileReader();
            
            reader.onload = (e) => {
                try {
                    const json = JSON.parse(e.target.result);
                    const elements = parseFlowBuilderJson(json);
                    
                    if (elements.length === 0) {
                        throw new Error("Parsed 0 nodes. Check JSON structure.");
                    }

                    cy.elements().remove();
                    cy.add(elements);

                    // Run the Dagre Layout
                    cy.layout({ 
                        name: 'dagre', 
                        rankDir: 'LR', 
                        nodeSep: 50, 
                        rankSep: 100,
                        animate: false 
                    }).run();

                    flowInfo.classList.remove('d-none');
                    flowNameDisplay.innerText = json.name || selectedFile.name;
                    errorMsg.classList.add('d-none');

                } catch (err) {
                    console.error(err);
                    errorMsg.innerText = "Error: " + err.message;
                    errorMsg.classList.remove('d-none');
                } finally {
                    loadingOverlay.classList.add('d-none');
                }
            };

            reader.readAsText(selectedFile);
        }, 100);
    });

    // PDF Handler
    document.getElementById('btnPdf').addEventListener('click', () => {
        window.print();
    });

    // --- PARSER ---
    function parseFlowBuilderJson(json) {
        let nodes = [];
        let edges = [];

        // Check for Flow Builder structure
        if (!json.process || !json.process.activities || !json.process.links) {
            return []; 
        }

        const activities = json.process.activities; 
        const links = json.process.links;           

        // Parse Nodes
        Object.values(activities).forEach(act => {
            let nodeLabel = act.name || "Unknown";
            let nodeType = act.activityName || "action";

            if (nodeType === 'play-message') nodeLabel = "Play: " + act.name;
            if (nodeType === 'ivr-menu') nodeLabel = "Menu: " + act.name;
            if (nodeType === 'set-variable') nodeLabel = "Set: " + act.name;

            nodes.push({
                data: { 
                    id: act.id, 
                    label: nodeLabel,
                    type: nodeType 
                }
            });
        });

        // Parse Edges
        links.forEach(link => {
            let edgeLabel = link.conditionExpr || "";
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

        return [...nodes, ...edges];
    }
});
