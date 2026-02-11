const JS_VERSION = "v3.0";

document.addEventListener('DOMContentLoaded', () => {
    // Bootstrap Modal Instance
    const detailsPanel = new bootstrap.Offcanvas(document.getElementById('detailsPanel'));
    const detailsContent = document.getElementById('detailsContent');

    // Init Cytoscape
    let cy = cytoscape({
        container: document.getElementById('cy'),
        boxSelectionEnabled: false,
        autounselectify: true,
        style: [
            // GHOST NODE (The HTML Label sits on top of this invisible node)
            {
                selector: 'node',
                style: {
                    'width': 200, 
                    'height': 80,
                    'background-opacity': 0, // Invisible background
                    'border-width': 0
                }
            },
            // EDGES
            {
                selector: 'edge',
                style: {
                    'width': 2,
                    'curve-style': 'bezier',
                    'line-color': '#b0b0b0',
                    'target-arrow-color': '#b0b0b0',
                    'target-arrow-shape': 'triangle',
                    'font-size': '10px',
                    'color': '#555',
                    'text-background-color': '#fff',
                    'text-background-opacity': 1,
                    'text-background-padding': 2
                }
            },
            // RED ERROR LINES
            {
                selector: 'edge[label="error"], edge[label="Error"], edge[label="timeout"], edge[isError="true"]',
                style: {
                    'line-color': '#dc3545',
                    'target-arrow-color': '#dc3545',
                    'width': 2
                }
            }
        ],
        layout: { name: 'preset' }
    });

    // Configure HTML Label Extension
    cy.nodeHtmlLabel([{
        query: 'node',
        valign: "center",
        halign: "center",
        valignBox: "center",
        halignBox: "center",
        tpl: function(data) {
            return generateNodeHTML(data);
        }
    }]);

    // Handle Click for Details
    cy.on('tap', 'node', function(evt){
        const nodeData = evt.target.data();
        detailsContent.textContent = JSON.stringify(nodeData.raw, null, 4);
        detailsPanel.show();
    });

    // --- UI LOGIC ---
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
                    const elements = parseWxCCFlow(json);
                    
                    if (elements.length === 0) throw new Error("Parsed 0 nodes.");

                    cy.elements().remove();
                    cy.add(elements);
                    
                    // Respect coordinates
                    cy.layout({ name: 'preset', fit: true, padding: 50 }).run();

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
        }, 100);
    });

    btnFit.addEventListener('click', () => cy.fit(50));
    
    document.getElementById('btnPdf').addEventListener('click', () => {
        cy.fit(50);
        setTimeout(() => window.print(), 500);
    });

    // --- PARSER ---
    function parseWxCCFlow(json) {
        let nodes = [];
        let edges = [];

        if (!json.process || !json.process.activities || !json.process.links) return [];

        const activities = json.process.activities; 
        const links = json.process.links;
        const widgets = json.diagram && json.diagram.widgets ? json.diagram.widgets : {};

        // Parse Nodes
        Object.values(activities).forEach(act => {
            const typeInfo = getNodeTypeInfo(act);
            const posX = widgets[act.id]?.point?.x || 0;
            const posY = widgets[act.id]?.point?.y || 0;

            // Extract rows for the card body
            let rows = [];
            if(act.activityName === 'play-message' && act.properties?.prompts) {
                rows.push({ label: "Prompt", val: act.properties.prompts[0]?.value || "Variable" });
            } 
            else if(act.activityName === 'set-variable' && act.properties?.updates) {
                Object.keys(act.properties.updates).forEach(k => {
                    rows.push({ label: "Set", val: k });
                });
            }
            else if(act.activityName === 'ivr-menu' && act.properties?.links) {
                rows.push({ label: "Opts", val: Object.keys(act.properties.links).length + " Links" });
            }
            else if(act.activityName === 'case-statement' && act.properties?.cases) {
                 rows.push({ label: "Cases", val: Object.keys(act.properties.cases).length });
            }

            // Always add ID or subtype if rows empty
            if(rows.length === 0) rows.push({ label: "Type", val: act.activityName });

            nodes.push({
                data: { 
                    id: act.id, 
                    name: act.name || "Unknown",
                    icon: typeInfo.icon,
                    colorClass: typeInfo.bgClass,
                    rows: rows,
                    raw: act // Store full JSON for details panel
                },
                position: { x: posX, y: posY }
            });
        });

        // Parse Edges
        links.forEach(link => {
            let label = link.conditionExpr || "";
            // Simplify labels
            if(label === 'true') label = '';
            if(label === 'false') label = 'Else';
            
            // Detect error lines
            let isError = false;
            if(label.toLowerCase().includes('error') || label.toLowerCase().includes('timeout') || link.type === 'error') {
                isError = true;
            }

            if (link.sourceActivityId && link.targetActivityId) {
                edges.push({
                    data: {
                        source: link.sourceActivityId,
                        target: link.targetActivityId,
                        label: label,
                        isError: isError.toString()
                    }
                });
            }
        });

        return [...nodes, ...edges];
    }

    // --- HELPERS ---
    function getNodeTypeInfo(act) {
        const type = act.activityName;
        if(type === 'start' || type === 'event') return { icon: 'fa-play', bgClass: 'bg-start' };
        if(type === 'disconnect-contact') return { icon: 'fa-phone-slash', bgClass: 'bg-end' };
        if(type === 'ivr-menu') return { icon: 'fa-list-ol', bgClass: 'bg-menu' };
        if(type === 'play-message') return { icon: 'fa-volume-high', bgClass: 'bg-play' };
        if(type === 'set-variable') return { icon: 'fa-pencil', bgClass: 'bg-set' };
        if(type === 'case-statement') return { icon: 'fa-code-branch', bgClass: 'bg-condition' };
        if(type === 'queue-contact') return { icon: 'fa-users', bgClass: 'bg-action' };
        return { icon: 'fa-gear', bgClass: 'bg-default' };
    }

    // Generate the HTML for the Node Card
    function generateNodeHTML(data) {
        let rowsHtml = data.rows.map(r => `
            <div class="wx-row">
                <span class="wx-label">${r.label}</span>
                <span class="wx-val" title="${r.val}">${r.val}</span>
            </div>
        `).join('');

        return `
            <div class="wx-node">
                <div class="wx-header ${data.colorClass}">
                    <i class="fa-solid ${data.icon}"></i>
                    <span style="text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">${data.name}</span>
                </div>
                <div class="wx-body">
                    ${rowsHtml}
                </div>
            </div>
        `;
    }
});
