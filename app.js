const JS_VERSION = "v2.0";

document.addEventListener('DOMContentLoaded', () => {
    displayVersions();

    // Register extensions
    try {
        if (typeof cytoscapeDagre !== 'undefined') cytoscape.use(cytoscapeDagre);
    } catch (e) { console.warn(e); }

    let cy = cytoscape({
        container: document.getElementById('cy'),
        boxSelectionEnabled: false,
        autounselectify: true,
        style: [
            // --- NODE STYLE (Card Look) ---
            {
                selector: 'node',
                style: {
                    'shape': 'round-rectangle',
                    'width': 220,
                    'height': 80,
                    'background-color': '#ffffff',
                    'border-width': 1,
                    'border-color': '#b0b0b0',
                    'border-opacity': 1,
                    'label': 'data(label)',
                    'color': '#333333',
                    'font-size': '10px',
                    'font-family': 'Helvetica, Arial, sans-serif',
                    'text-valign': 'center',
                    'text-halign': 'center',
                    'text-wrap': 'wrap',
                    'text-max-width': 200,
                    'text-justification': 'left',
                    'shadow-blur': 4,
                    'shadow-color': '#000',
                    'shadow-opacity': 0.1,
                    'shadow-offset-y': 2
                }
            },
            // Color headers based on Type
            { selector: 'node[type="start"]', style: { 'border-left-width': 6, 'border-left-color': '#28a745' } }, // Green
            { selector: 'node[type="disconnect-contact"]', style: { 'border-left-width': 6, 'border-left-color': '#dc3545' } }, // Red
            { selector: 'node[type="play-message"]', style: { 'border-left-width': 6, 'border-left-color': '#007bff' } }, // Blue
            { selector: 'node[type="ivr-menu"]', style: { 'border-left-width': 6, 'border-left-color': '#fd7e14' } }, // Orange
            { selector: 'node[type="set-variable"]', style: { 'border-left-width': 6, 'border-left-color': '#6f42c1' } }, // Purple
            { selector: 'node[type="action"]', style: { 'border-left-width': 6, 'border-left-color': '#17a2b8' } }, // Teal

            // --- EDGE STYLE (Connectors) ---
            {
                selector: 'edge',
                style: {
                    'width': 2,
                    'curve-style': 'bezier', // Smooth curves
                    'line-color': '#a0a0a0',
                    'target-arrow-color': '#a0a0a0',
                    'target-arrow-shape': 'triangle',
                    'arrow-scale': 1.2,
                    'label': 'data(label)',
                    'font-size': '9px',
                    'text-background-color': '#f4f4f4',
                    'text-background-opacity': 1,
                    'text-background-padding': 3,
                    'color': '#555'
                }
            }
        ],
        layout: { name: 'preset' }
    });

    const fileInput = document.getElementById('fileInput');
    const btnProcess = document.getElementById('btnProcess');
    const btnFit = document.getElementById('btnFit');
    const loadingOverlay = document.getElementById('loadingOverlay');
    let selectedFile = null;

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            selectedFile = e.target.files[0];
            btnProcess.disabled = false;
        }
    });

    btnProcess.addEventListener('click', () => {
        if (!selectedFile) return;
        loadingOverlay.classList.remove('d-none');

        setTimeout(() => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const json = JSON.parse(e.target.result);
                    const elements = parseFlowBuilderJson(json);
                    
                    if (elements.length === 0) throw new Error("Parsed 0 nodes.");

                    cy.elements().remove();
                    cy.add(elements);

                    // Use 'preset' layout to respect your x/y coordinates
                    cy.layout({ 
                        name: 'preset',
                        fit: true,
                        padding: 50
                    }).run();

                    document.getElementById('flowInfo').classList.remove('d-none');
                    document.getElementById('flowName').innerText = json.name || selectedFile.name;
                    btnFit.disabled = false;

                } catch (err) {
                    alert("Error: " + err.message);
                    console.error(err);
                } finally {
                    loadingOverlay.classList.add('d-none');
                }
            };
            reader.readAsText(selectedFile);
        }, 50);
    });

    // Fit Button
    btnFit.addEventListener('click', () => {
        cy.fit(50);
    });

    // Smart PDF Export (Fits graph before print)
    document.getElementById('btnPdf').addEventListener('click', () => {
        cy.fit(20); // Fit graph to screen
        setTimeout(() => {
            window.print();
        }, 500);
    });

    // --- PARSER V2 (With Coordinates & Details) ---
    function parseFlowBuilderJson(json) {
        let nodes = [];
        let edges = [];

        if (!json.process || !json.process.activities || !json.process.links) return [];

        const activities = json.process.activities; 
        const links = json.process.links;
        const widgets = json.diagram && json.diagram.widgets ? json.diagram.widgets : {};

        // 1. Parse Nodes
        Object.values(activities).forEach(act => {
            let nodeLabel = act.name || "Unknown";
            let nodeType = act.activityName || "action";
            let details = "";

            // Get Details based on type
            if (nodeType === 'play-message') {
                // Try to find the message value
                if(act.properties && act.properties.prompts) {
                    details = "\nPlay: " + (act.properties.prompts[0]?.value || "Audio File");
                }
            } else if (nodeType === 'set-variable') {
                 if(act.properties && act.properties.updates) {
                     details = "\nSet: " + Object.keys(act.properties.updates).join(", ");
                 }
            } else if (nodeType === 'ivr-menu') {
                if(act.properties && act.properties.links) {
                     details = "\nOptions: " + Object.keys(act.properties.links).join(", ");
                }
            }

            // Get Coordinate (x,y) from the 'diagram' block
            let posX = 0, posY = 0;
            if (widgets[act.id] && widgets[act.id].point) {
                posX = widgets[act.id].point.x;
                posY = widgets[act.id].point.y;
            }

            nodes.push({
                data: { 
                    id: act.id, 
                    label: `${nodeLabel}${details}`, // Name + Details
                    type: nodeType 
                },
                position: { x: posX, y: posY } // Manual Layout
            });
        });

        // 2. Parse Edges
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

    function displayVersions() {
        const div = document.createElement('div');
        div.className = 'version-tag';
        div.innerHTML = `JS: <span style="color:green">${JS_VERSION}</span>`;
        document.body.appendChild(div);
    }
});
