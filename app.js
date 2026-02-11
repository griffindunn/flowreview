const JS_VERSION = "v6.0";

document.addEventListener('DOMContentLoaded', () => {
    // 1. Version Dashboard
    displayVersions();

    // 2. Register Extensions
    try {
        if (typeof cytoscapeDagre !== 'undefined') cytoscape.use(cytoscapeDagre);
    } catch (e) { console.warn(e); }

    // 3. Cytoscape Init
    let cy = cytoscape({
        container: document.getElementById('cy'),
        boxSelectionEnabled: false,
        autounselectify: true,
        style: [
            {
                selector: 'node',
                style: {
                    'width': 240, 
                    'height': 80, 
                    'background-opacity': 0, // Invisible backing node
                    'border-width': 0
                }
            },
            {
                selector: 'edge',
                style: {
                    'width': 2,
                    'curve-style': 'bezier',
                    'line-color': '#adb5bd',
                    'target-arrow-color': '#adb5bd',
                    'target-arrow-shape': 'triangle',
                    'arrow-scale': 1.2,
                    'font-size': '10px',
                    'color': '#495057',
                    'text-background-color': '#f8f9fa',
                    'text-background-opacity': 1,
                    'text-background-padding': 3,
                    'text-rotation': 'autorotate'
                }
            },
            {
                selector: 'edge[isError="true"]',
                style: {
                    'line-color': '#dc3545', 
                    'target-arrow-color': '#dc3545',
                    'width': 2
                }
            }
        ],
        layout: { name: 'preset' }
    });

    // 4. HTML LABEL CONFIG (The visual cards)
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
    }

    // 5. Event Handlers
    cy.on('tap', 'node', function(evt){
        const nodeData = evt.target.data();
        document.getElementById('detailsContent').textContent = JSON.stringify(nodeData.raw, null, 2);
        new bootstrap.Offcanvas(document.getElementById('detailsPanel')).show();
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
                    const elements = parseWxCCFlow(json);
                    
                    if (elements.length === 0) throw new Error("Parsed 0 nodes.");

                    cy.elements().remove();
                    cy.add(elements);
                    
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
    document.getElementById('btnPdf').addEventListener('click', () => { cy.fit(20); setTimeout(() => window.print(), 500); });

    // --- GENERATOR: INLINE STYLES FOR RELIABILITY ---
    function generateWxCard(data) {
        // Map color class to hex code
        const colorMap = {
            'bg-green': '#6cc04a',
            'bg-purple': '#a066cb',
            'bg-orange': '#ff9d00',
            'bg-blue': '#00a0d1',
            'bg-gray': '#6c757d',
            'bg-red': '#d63939'
        };
        const barColor = colorMap[data.colorClass] || '#6c757d';

        // Build Rows
        const rowsHtml = data.rows.map(r => `
            <div style="display: flex; justify-content: space-between; border-top: 1px solid #f0f0f0; padding-top: 3px; margin-top: 3px;">
                <span style="color: #666; margin-right: 6px; font-size: 10px;">${r.k}:</span>
                <span style="font-family: monospace; color: #222; font-weight: 600; font-size: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 120px;" title="${r.v}">${r.v}</span>
            </div>
        `).join('');

        // Build Card HTML
        return `
            <div style="
                width: 240px; 
                min-height: 50px; 
                background-color: #ffffff; 
                border-radius: 4px; 
                box-shadow: 0 2px 5px rgba(0,0,0,0.15); 
                display: flex; 
                overflow: hidden; 
                font-family: sans-serif; 
                border: 1px solid #dcdcdc;
                text-align: left;
            ">
                <div style="
                    width: 32px; 
                    background-color: ${barColor}; 
                    display: flex; 
                    align-items: center; 
                    justify-content: center; 
                    color: white; 
                    font-size: 14px;
                ">
                    <i class="fa-solid ${data.icon}"></i>
                </div>
                
                <div style="flex-grow: 1; padding: 6px 10px; display: flex; flex-direction: column; justify-content: center; overflow: hidden;">
                    <div style="font-weight: 700; font-size: 11px; color: #222; margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                        ${data.title}
                    </div>
                    <div style="font-size: 9px; color: #888; margin-bottom: 4px; font-style: italic;">
                        ${data.subtitle}
                    </div>
                    <div>
                        ${rowsHtml}
                    </div>
                </div>
            </div>
        `;
    }

    // --- PARSER ---
    function parseWxCCFlow(json) {
        let nodes = [];
        let edges = [];

        if (!json.process || !json.process.activities || !json.process.links) return [];

        const activities = json.process.activities; 
        const links = json.process.links;
        const widgets = json.diagram && json.diagram.widgets ? json.diagram.widgets : {};

        Object.values(activities).forEach(act => {
            const style = getWxNodeStyle(act);
            let posX = widgets[act.id]?.point?.x || 0;
            let posY = widgets[act.id]?.point?.y || 0;

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

        links.forEach(link => {
            let label = link.conditionExpr || "";
            if(label === 'true') label = '';
            if(label === 'false') label = 'Else';
            
            const isError = label.toLowerCase().includes('error') || label.toLowerCase().includes('timeout') || link.type === 'error';

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

    // --- STYLE LOGIC ---
    function getWxNodeStyle(act) {
        const type = act.activityName;
        const props = act.properties || {};
        let s = { icon: 'fa-gear', bgClass: 'bg-gray', subtitle: type, dataRows: [] };

        if(type === 'start' || type === 'event' || type === 'NewPhoneContact') {
            s.icon = 'fa-play'; s.bgClass = 'bg-green'; s.subtitle = 'Start Flow';
            if(props.event) s.dataRows.push({k:'Event', v:props.event});
        }
        else if(type === 'disconnect-contact') {
            s.icon = 'fa-phone-slash'; s.bgClass = 'bg-gray'; s.subtitle = 'End Flow';
        }
        else if(type === 'set-variable' || type === 'parse-activity') {
            s.icon = 'fa-code'; s.bgClass = 'bg-purple'; s.subtitle = 'Calculation';
            if(props.updates) {
                const keys = Object.keys(props.updates);
                if(keys[0]) s.dataRows.push({k:'Set', v:keys[0]});
            }
        }
        else if(type === 'ivr-menu' || type === 'case-statement' || type === 'enum-gateway') {
            s.icon = 'fa-share-nodes'; s.bgClass = 'bg-orange'; s.subtitle = 'Decision';
            if(props.cases) s.dataRows.push({k:'Cases', v: Object.keys(props.cases).length});
            if(props.menuLinks) s.dataRows.push({k:'Opts', v: Object.keys(props.menuLinks).length});
        }
        else if(type === 'play-message' || type === 'queue-contact' || type.includes('feedback')) {
            s.icon = 'fa-volume-high'; s.bgClass = 'bg-blue'; s.subtitle = 'Action';
            if(type.includes('feedback')) { s.icon = 'fa-comment-dots'; s.subtitle = 'Survey'; }
            if(type.includes('queue')) { s.icon = 'fa-users'; s.subtitle = 'Queue'; }
            
            if(props.prompts && props.prompts[0]) {
                let p = props.prompts[0].value || "Var";
                if(p.length > 18) p = p.substring(0,16) + "..";
                s.dataRows.push({k:'Msg', v: p});
            }
        }
        return s;
    }

    function displayVersions() {
        const div = document.createElement('div');
        div.className = 'version-tag';
        div.innerHTML = `JS: <span style="color:green">${JS_VERSION}</span>`;
        document.body.appendChild(div);
    }
});
