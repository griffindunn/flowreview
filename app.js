const JS_VERSION = "v5.0";

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
            // GHOST NODE: Invisible background, HTML sits on top
            {
                selector: 'node',
                style: {
                    'width': 240, 
                    'height': 70, 
                    'background-opacity': 0, // Make Cytoscape node invisible
                    'border-width': 0
                }
            },
            // EDGES
            {
                selector: 'edge',
                style: {
                    'width': 1.5,
                    'curve-style': 'bezier',
                    'line-color': '#999',
                    'target-arrow-color': '#999',
                    'target-arrow-shape': 'triangle',
                    'arrow-scale': 1,
                    'label': 'data(label)',
                    'font-size': '9px',
                    'color': '#555',
                    'text-background-color': '#f0f0f0',
                    'text-background-opacity': 1,
                    'text-background-padding': 2,
                    'text-rotation': 'autorotate'
                }
            },
            // ERROR EDGES (Red)
            {
                selector: 'edge[isError="true"]',
                style: {
                    'line-color': '#d63939', 
                    'target-arrow-color': '#d63939',
                    'width': 2
                }
            }
        ],
        layout: { name: 'preset' } // CRITICAL: 'preset' uses your manual coordinates
    });

    // 3. Configure HTML Labels (The visual cards)
    // This extension is what creates the "Split Card" DOM elements
    if(cy.nodeHtmlLabel) {
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
    } else {
        console.error("HTML Label Extension not loaded!");
        alert("Critical Error: HTML Label extension failed to load. Try hard refreshing.");
    }

    // 4. Click Handler (Details Panel)
    cy.on('tap', 'node', function(evt){
        const nodeData = evt.target.data();
        const rawJson = nodeData.raw || {};
        document.getElementById('detailsContent').textContent = JSON.stringify(rawJson, null, 2);
        const bsOffcanvas = new bootstrap.Offcanvas(document.getElementById('detailsPanel'));
        bsOffcanvas.show();
    });

    // 5. UI Logic
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
                    
                    // Render layout
                    cy.layout({ name: 'preset' }).run();
                    setTimeout(() => cy.fit(50), 200);

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
    // CORE PARSER
    // ---------------------------------------------------------
    function parseWxCCFlow(json) {
        let nodes = [];
        let edges = [];

        if (!json.process || !json.process.activities || !json.process.links) return [];

        const activities = json.process.activities; 
        const links = json.process.links;
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
                    rows: style.dataRows,
                    raw: act
                },
                position: { x: posX, y: posY }
            });
        });

        // Parse Edges
        links.forEach(link => {
            let label = link.conditionExpr || "";
            if(label === 'true') label = '';
            if(label === 'false') label = 'Else';
            
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
    // STYLE HELPER
    // ---------------------------------------------------------
    function getWxNodeStyle(act) {
        const type = act.activityName;
        const props = act.properties || {};
        
        let s = { icon: 'fa-gear', bgClass: 'bg-gray', subtitle: type, dataRows: [] };

        // Mappings based on WxCC logic
        switch (type) {
            case 'start':
            case 'event':
            case 'NewPhoneContact':
                s.icon = 'fa-play'; s.bgClass = 'bg-green'; s.subtitle = 'Start Flow';
                if(props.event) s.dataRows.push({k:'Event', v:props.event});
                break;
            
            case 'disconnect-contact':
                s.icon = 'fa-phone-slash'; s.bgClass = 'bg-gray'; // Often Gray/Red
                s.subtitle = 'End Flow';
                break;

            case 'set-variable':
            case 'parse-activity':
                s.icon = 'fa-code'; s.bgClass = 'bg-purple'; s.subtitle = 'Calculation';
                if(props.updates) {
                    const keys = Object.keys(props.updates);
                    if(keys[0]) s.dataRows.push({k:'Set', v:keys[0]});
                }
                break;

            case 'ivr-menu':
            case 'case-statement':
            case 'enum-gateway':
            case 'condition-activity':
                s.icon = 'fa-share-nodes'; s.bgClass = 'bg-orange'; s.subtitle = 'Decision';
                if(props.cases) s.dataRows.push({k:'Cases', v: Object.keys(props.cases).length});
                if(props.menuLinks) s.dataRows.push({k:'Opts', v: Object.keys(props.menuLinks).length + " Links"});
                if(props.expression) s.dataRows.push({k:'Expr', v: props.expression});
                break;

            case 'play-message':
                s.icon = 'fa-volume-high'; s.bgClass = 'bg-blue'; s.subtitle = 'Play Audio';
                if(props.prompts && props.prompts[0]) {
                    let p = props.prompts[0].value || "Variable";
                    if(p.length > 20) p = p.substring(0,18) + "..";
                    s.dataRows.push({k:'Msg', v: p});
                }
                break;

            case 'queue-contact':
                s.icon = 'fa-users'; s.bgClass = 'bg-blue'; s.subtitle = 'Queue';
                break;
            
            case 'feedback':
            case 'Feedback-V2':
                s.icon = 'fa-comment-dots'; s.bgClass = 'bg-blue'; s.subtitle = 'Survey';
                break;

            case 'run-script':
                s.icon = 'fa-scroll'; s.bgClass = 'bg-purple'; s.subtitle = 'Script';
                break;
        }
        return s;
    }

    // HTML Generator
    function generateWxCard(data) {
        const rowsHtml = data.rows.map(r => 
            `<div class="wx-data-row"><span class="wx-key">${r.k}:</span><span class="wx-val" title="${r.v}">${r.v}</span></div>`
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
        const div = document.createElement('div');
        div.style.position='fixed'; div.style.bottom='10px'; div.style.left='10px';
        div.style.fontSize='10px'; div.style.color='#999';
        div.innerText = `JS: ${JS_VERSION}`;
        document.body.appendChild(div);
    }
});
