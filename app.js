document.addEventListener('DOMContentLoaded', () => {
    let allFlows = [];
    let cy = null; // Cytoscape instance

    const fileInput = document.getElementById('fileInput');
    const searchInput = document.getElementById('searchInput');
    const listContainer = document.getElementById('flowList');

    // 1. Handle File Upload
    fileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();

        reader.onload = (e) => {
            try {
                const jsonContent = JSON.parse(e.target.result);
                
                // Handle if the file is a single flow object OR an array of flows
                if (Array.isArray(jsonContent)) {
                    allFlows = jsonContent;
                } else {
                    // It's a single flow object, wrap it in an array
                    // Ensure it has a name property, or fallback to "Untitled Flow"
                    if(!jsonContent.name) jsonContent.name = file.name.replace('.json', '');
                    allFlows = [jsonContent];
                }

                // Enable Search and Render
                searchInput.disabled = false;
                renderFlowList(allFlows);
                
            } catch (err) {
                alert("Error parsing JSON. Please ensure it is a valid Webex Contact Center flow file.");
                console.error(err);
            }
        };

        reader.readAsText(file);
    });

    // 2. Search Functionality
    searchInput.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        const filtered = allFlows.filter(flow => 
            (flow.name || "Untitled").toLowerCase().includes(term)
        );
        renderFlowList(filtered);
    });

    // 3. Render the List
    function renderFlowList(flows) {
        listContainer.innerHTML = '';
        
        if (flows.length === 0) {
            listContainer.innerHTML = '<div class="text-muted p-2">No flows found.</div>';
            return;
        }

        flows.forEach((flow, index) => {
            const item = document.createElement('button'); // Better for accessibility
            item.className = 'list-group-item list-group-item-action flow-item';
            item.innerText = flow.name || `Flow #${index + 1}`;
            item.onclick = () => loadFlow(flow);
            listContainer.appendChild(item);
        });
    }

    // 4. Load and Visualize Flow
    function loadFlow(flow) {
        // Hide placeholder, show actions
        document.getElementById('placeholderText').classList.add('d-none');
        document.getElementById('actionPanel').classList.remove('d-none');
        document.getElementById('currentFlowName').innerText = flow.name || "Selected Flow";

        // Setup Download
        document.getElementById('btnDownload').onclick = () => {
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(flow, null, 2));
            const anchor = document.createElement('a');
            anchor.setAttribute("href", dataStr);
            anchor.setAttribute("download", (flow.name || "flow") + ".json");
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
        };

        // Initialize Cytoscape
        if (cy) cy.destroy();

        const elements = parseFlowToElements(flow);

        cy = cytoscape({
            container: document.getElementById('cy'),
            elements: elements,
            boxSelectionEnabled: false,
            autounselectify: true,
            style: [
                {
                    selector: 'node',
                    style: {
                        'background-color': '#005073',
                        'label': 'data(label)',
                        'color': '#ffffff',
                        'text-valign': 'center',
                        'text-halign': 'center',
                        'text-wrap': 'wrap',
                        'text-max-width': '100px',
                        'shape': 'round-rectangle',
                        'width': '120px',
                        'height': '60px',
                        'font-size': '11px'
                    }
                },
                {
                    selector: 'edge',
                    style: {
                        'width': 2,
                        'line-color': '#9aa0a6',
                        'target-arrow-color': '#9aa0a6',
                        'target-arrow-shape': 'triangle',
                        'curve-style': 'bezier', // Makes lines curved and easier to follow
                        'label': 'data(label)',
                        'font-size': '10px',
                        'text-background-opacity': 1,
                        'text-background-color': '#ffffff',
                        'text-background-padding': '2px'
                    }
                }
            ],
            layout: {
                name: 'dagre',
                rankDir: 'LR',
                spacingFactor: 1.2
            }
        });
    }

    // 5. PARSER (Customize this based on your specific WxCC JSON schema)
    function parseFlowToElements(flow) {
        const elements = [];
        
        // --- ADAPTATION LOGIC ---
        // WxCC flows vary. Let's try to detect the nodes array.
        // It might be 'steps', 'nodes', 'activities', or 'graph.nodes'
        
        let nodes = flow.steps || flow.nodes || (flow.graph && flow.graph.nodes) || [];
        
        // If we still can't find nodes, the structure might be different. 
        // You can inspect your JSON and update this part.

        nodes.forEach(node => {
            // Node Label: Try to find a display name, or fallback to type/id
            const labelText = node.displayName || node.name || node.type || node.id;
            
            elements.push({
                data: { id: node.id, label: labelText }
            });

            // EDGES (Connections)
            // WxCC usually puts connections inside the node object 
            // under "transitions", "links", or "connections"
            const links = node.transitions || node.links || node.connections || [];

            links.forEach(link => {
                // Find target ID. Sometimes it's 'targetStepId', 'target', or 'to'
                const targetId = link.targetStepId || link.target || link.to;
                
                // Label for the line (e.g., "True", "False", "Queue Open")
                const edgeLabel = link.condition || link.label || link.port || '';

                if (targetId) {
                    elements.push({
                        data: { 
                            source: node.id, 
                            target: targetId, 
                            label: edgeLabel 
                        }
                    });
                }
            });
        });

        return elements;
    }
});
