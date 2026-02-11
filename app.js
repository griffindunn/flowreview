const JS_VERSION = "v5.1";

document.addEventListener('DOMContentLoaded', () => {
    // 1. INJECT STYLES DIRECTLY (Bypasses CSS Cache Issues)
    injectCriticalStyles();
    
    // 2. Display Version Dashboard
    displayVersions();

    // 3. Register Extensions
    try {
        if (typeof cytoscapeDagre !== 'undefined') cytoscape.use(cytoscapeDagre);
    } catch (e) { console.warn(e); }

    // 4. Cytoscape Init
    let cy = cytoscape({
        container: document.getElementById('cy'),
        boxSelectionEnabled: false,
        autounselectify: true,
        style: [
            // GHOST NODE: We make the actual Cytoscape node invisible
            // The HTML Label sits on top of this empty space
            {
                selector: 'node',
                style: {
                    'width': 240, 
                    'height': 80, 
                    'background-opacity': 0, // INVISIBLE
                    'border-width': 0,
                    'label': '' // NO TEXT
                }
            },
            // EDGES
            {
                selector: 'edge',
                style: {
                    'width': 2,
                    'curve-style': 'bezier',
                    'line-color': '#adb5bd',
                    'target-arrow-color': '#adb5bd',
                    'target-arrow-shape': 'triangle',
                    'arrow-scale': 1.2,
                    'label': 'data(label)',
                    'font-size': '10px',
                    'color': '#495057',
                    'text-background-color': '#f8f9fa',
                    'text-background-opacity': 1,
                    'text-background-padding': 3,
                    'text-rotation': 'autorotate'
                }
            },
            // ERROR EDGES
            {
                selector: 'edge[isError="true"]',
                style: {
                    'line-color': '#dc3545', 
                    'target-arrow-color': '#dc3545',
                    'color': '#dc3545'
                }
            }
        ],
        layout: { name: 'preset' }
    });

    // 5. HTML LABEL CONFIGURATION
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
        alert("Critical Error: HTML Label Extension missing. Please refresh.");
    }

    // 6. EVENT HANDLERS
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
        else if(type === 'play-message' || type === 'queue-contact' || type === 'feedback' || type === 'Feedback-V2') {
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

    // --- HTML GENERATOR ---
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
                    <div class="wx-body">${rowsHtml}</div>
                </div>
            </div>
        `;
    }

    // --- FAIL-SAFE: INJECT CSS FROM JS ---
    // This ensures styles load even if styles.css fails
    function injectCriticalStyles() {
        const style = document.createElement('style');
        style.innerHTML = `
            .wx-card { width: 240px; min-height: 50px; background: white; border-radius: 4px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); display: flex; overflow: hidden; font-family: sans-serif; border: 1px solid #dcdcdc; }
            .wx-icon-col { width: 32px; display: flex; align-items: center; justify-content: center; color: white; font-size: 14px; }
            .wx-content-col { flex-grow: 1; padding: 6px 10px; display: flex; flex-direction: column; justify-content: center; overflow: hidden; }
            .wx-title { font-weight: 700; font-size: 11px; color: #222; margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            .wx-subtitle { font-size: 9px; color: #888; margin-bottom: 4px; font-style: italic; }
            .wx-data-row { display: flex; justify-content: space-between; font-size: 10px; color: #444; border-top: 1px solid #f0f0f0; padding-top: 3px; margin-top: 3px; }
            .wx-key { color: #666; margin-right: 6px; }
            .wx-val { font-family: monospace; color: #222; font-weight: 600; }
            
            /* COLORS */
            .bg-green { background: #6cc04a; }
            .bg-purple { background: #a066cb; }
            .bg-orange { background: #ff9d00; }
            .bg-blue { background: #00a0d1; }
            .bg-gray { background: #6c757d; }
        `;
        document.head.appendChild(style);
    }

    function displayVersions() {
        const htmlVer = document.querySelector('meta[name="app-version-html"]')?.content || "Unknown";
        const cssVer = getComputedStyle(document.documentElement).getPropertyValue('--css-version').replace(/['"]/g, '').trim() || "Unknown";
        
        const div = document.createElement('div');
        div.className = 'version-tag';
        div.innerHTML = `
            <strong>Status</strong><br>
            HTML: <span style="${htmlVer === JS_VERSION ? 'color:green' : 'color:red'}">${htmlVer}</span><br>
            JS: <span style="color:green">${JS_VERSION}</span><br>
            CSS: <span style="${cssVer === JS_VERSION ? 'color:green' : 'color:red'}">${cssVer}</span>
        `;
        document.body.appendChild(div);
    }
});
