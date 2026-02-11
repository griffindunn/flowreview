const JS_VERSION = "v4.0";

document.addEventListener('DOMContentLoaded', () => {
    displayVersions();

    // 1. Extensions
    try {
        if (typeof cytoscapeDagre !== 'undefined') cytoscape.use(cytoscapeDagre);
    } catch (e) { console.warn(e); }

    // 2. Cytoscape Config
    let cy = cytoscape({
        container: document.getElementById('cy'),
        boxSelectionEnabled: false,
        autounselectify: true,
        style: [
            // GHOST NODE (The HTML overlay sits on top of this)
            {
                selector: 'node',
                style: {
                    'width': 220,
                    'height': 60, // approximate height
                    'background-opacity': 0, // Invisible
                    'border-width': 0
                }
            },
            // EDGES - Trying to mimic the horizontal "flow"
            {
                selector: 'edge',
                style: {
                    'width': 1.5,
                    'curve-style': 'bezier', // Or 'taxi' for right-angles
                    'line-color': '#999',
                    'target-arrow-color': '#999',
                    'target-arrow-shape': 'triangle',
                    'arrow-scale': 1,
                    'source-distance-from-node': 2,
                    'target-distance-from-node': 2,
                    // Label styling
                    'label': 'data(label)',
                    'font-size': '9px',
                    'color': '#555',
                    'text-background-color': '#f8f9fa',
                    'text-background-opacity': 1,
                    'text-background-padding': 2,
                    'text-rotation': 'autorotate'
                }
            },
            // ERROR EDGES (Red)
            {
                selector: 'edge[isError="true"]',
                style: {
                    'line-color': '#d63939', // WxCC Red
                    'target-arrow-color': '#d63939',
                    'width': 2
                }
            }
        ],
        layout: { name: 'preset' } // CRITICAL: Use 'preset' to respect X/Y from JSON
    });

    // 3. Configure HTML Labels (The visual cards)
    cy.nodeHtmlLabel([{
        query: 'node',
        valign: "center",
        halign: "center",
        valignBox: "center",
        halignBox: "center",
        tpl: function(data) {
            return generateWxCard(data);
        }
    }]);

    // 4. Click Handler (Details Panel)
    cy.on('tap', 'node', function(evt){
        const nodeData = evt.target.data();
        const rawJson = nodeData.raw || {};
        
        // Pretty print JSON
        document.getElementById('detailsContent').textContent = JSON.stringify(rawJson, null, 2);
        
        // Open Bootstrap Offcanvas
        const offcanvasEl = document.getElementById('detailsPanel');
        const bsOffcanvas = new bootstrap.Offcanvas(offcanvasEl);
        bsOffcanvas.show();
    });

    // 5. UI Logic (Upload, Fit, Print)
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
                    
                    // Run layout (preset uses the manual coordinates)
                    cy.layout({ name: 'preset' }).run();
                    
                    // Fit after a brief delay to ensure rendering
                    setTimeout(() => cy.fit(50), 100);

                    document.getElementById('flowInfo').classList.remove('d-none');
                    document.getElementById('flowName').innerText = json.name || selectedFile.name;
                    btnFit.disabled = false;
                    document.getElementById('errorMsg').classList.add('d-none');

                } catch (err) {
                    console.error(err);
                    const el = document.getElementById('errorMsg');
                    el.innerText = "Error: " + err.message;
                    el.classList.remove('d-none');
                } finally {
                    loadingOverlay.classList.add('d-none');
                }
            };
            reader.readAsText(selectedFile);
        }, 100);
    });

    btnFit.addEventListener('click', () => cy.fit(50));
    
    document.getElementById('btnPdf').addEventListener('click', () => {
        cy.fit(20); 
        setTimeout(() => window.print(), 500);
    });

    // ---------------------------------------------------------
    // CORE PARSER - The Logic Engine
    // ---------------------------------------------------------
    function parseWxCCFlow(json) {
        let nodes = [];
        let edges = [];

        if (!json.process || !json.process.activities || !json.process.links) return [];

        const activities = json.process.activities; 
        const links = json.process.links;
        // WxCC stores coordinates in 'diagram.widgets', keyed by activity ID
        const widgets = json.diagram && json.diagram.widgets ? json.diagram.widgets : {};

        // Parse Nodes
        Object.values(activities).forEach(act => {
            const style = getWxNodeStyle(act);
            
            // Coordinates
            let posX = 0, posY = 0;
            if (widgets[act.id] && widgets[act.id].point) {
                posX = widgets[act.id].point.x;
                posY = widgets[act.id].point.y;
            }

            nodes.push({
                data: { 
                    id: act.id, 
                    title: act.name || "Unknown",
                    subtitle: style.subtitle,
                    icon: style.icon,
                    colorClass: style.bgClass,
                    rows: style.dataRows, // Specific details like vars or cases
                    raw: act
                },
                position: { x: posX, y: posY }
            });
        });

        // Parse Edges
        links.forEach(link => {
            let label = link.conditionExpr || "";
            // Clean up common labels
            if(label === 'true') label = '';
            if(label === 'false') label = 'Else';
            
            // Error Detection
            const lowerLabel = label.toLowerCase();
            const isError = lowerLabel.includes('error') || lowerLabel.includes('timeout') || link.type === 'error';

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

    // ---------------------------------------------------------
    // STYLE HELPER - Maps WxCC Types to Visuals
    // ---------------------------------------------------------
    function getWxNodeStyle(act) {
        const type = act.activityName;
        const props = act.properties || {};
        
        let s = { 
            icon: 'fa-gear', 
            bgClass: 'bg-gray', 
            subtitle: type, 
            dataRows: [] 
        };

        // 1. START / EVENT
        if(type === 'start' || type === 'event' || type === 'NewPhoneContact') {
            s.icon = 'fa-play';
            s.bgClass = 'bg-green';
            s.subtitle = 'Start Flow';
            if(props.event) s.dataRows.push({k:'Event', v:props.event});
        }
        // 2. PARSE / SET VAR (Purple)
        else if(type === 'set-variable' || type === 'parse-activity') {
            s.icon = 'fa-code';
            s.bgClass = 'bg-purple';
            if(props.updates) {
                // Show first 2 variables
                const keys = Object.keys(props.updates);
                if(keys[0]) s.dataRows.push({k:'Set', v:keys[0]});
                if(keys[1]) s.dataRows.push({k:'Set', v:keys[1]});
            }
        }
        // 3. CASE / SWITCH (Orange)
        else if(type === 'case-statement' || type === 'enum-gateway') {
            s.icon = 'fa-share-nodes';
            s.bgClass = 'bg-orange';
            s.subtitle = 'Decision';
            // List cases
            if(props.cases) {
                const caseKeys = Object.keys(props.cases).slice(0,3); // Max 3
                s.dataRows.push({k:'Cases', v: caseKeys.join(', ')});
            }
            if(props.menuLinks) {
                 const linkKeys = Object.keys(props.menuLinks).slice(0,3);
                 s.dataRows.push({k:'Opts', v: linkKeys.join(', ')});
            }
        }
        // 4. PLAY / QUEUE (Blue)
        else if(type === 'play-message' || type === 'queue-contact') {
            s.icon = 'fa-volume-high';
            s.bgClass = 'bg-blue';
            if(type === 'queue-contact') s.icon = 'fa-users';
            
            // Show prompt name if available
            if(props.prompts && props.prompts[0]) {
                let prompt = props.prompts[0].value || "Audio";
                if(prompt.length > 20) prompt = prompt.substring(0,18) + "..";
                s.dataRows.push({k:'Msg', v: prompt});
            }
        }
        // 5. END (Red)
        else if(type === 'disconnect-contact') {
            s.icon = 'fa-phone-slash';
            s.bgClass = 'bg-gray'; // WxCC often uses gray for end, or red.
        }

        return s;
    }

    // ---------------------------------------------------------
    // HTML GENERATOR - Creates the DOM elements for nodes
    // ---------------------------------------------------------
    function generateWxCard(data) {
        // Build Data Rows HTML
        const rowsHtml = data.rows.map(r => 
            `<div class="wx-data-row"><span class="wx-key">${r.k}:</span><span class="wx-val">${r.v}</span></div>`
        ).join('');

        return `
            <div class="wx-card">
                <div class="wx-icon-col ${data.colorClass}">
                    <i class="fa-solid ${data.icon}"></i>
                </div>
                <div class="wx-content-col">
                    <div class="wx-title" title="${data.title}">${data.title}</div>
                    <div class="wx-subtitle">${data.subtitle}</div>
                    <div class="wx-body">
                        ${rowsHtml}
                    </div>
                </div>
            </div>
        `;
    }

    function displayVersions() {
        // Optional debug tag
    }
});
