// ── Keiro Unified JS Driver ──

const KEIRO = (() => {
    const CREDS_KEY = 'keiro_creds';

    function getCreds() {
        try {
            return JSON.parse(localStorage.getItem(CREDS_KEY) || '{}');
        } catch { return {}; }
    }

    function saveCreds(secret, namespace) {
        localStorage.setItem(CREDS_KEY, JSON.stringify({ secret, namespace }));
        // Dispatch custom event to notify UI
        window.dispatchEvent(new Event('keiro-creds-updated'));
    }

    function getHeaders(overrideNamespace) {
        const { secret, namespace } = getCreds();
        return {
            'Content-Type': 'application/json',
            'X-Secret': secret || '',
            'X-Namespace': overrideNamespace || namespace || '',
        };
    }

    function getMultipartHeaders(overrideNamespace) {
        const { secret, namespace } = getCreds();
        return {
            'X-Secret': secret || '',
            'X-Namespace': overrideNamespace || namespace || '',
        };
    }

    // API endpoints
    async function query(queryText, namespace) {
        const res = await fetch('/v1/query', {
            method: 'POST',
            headers: getHeaders(namespace),
            body: JSON.stringify({ query: queryText }),
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({ Error: res.statusText }));
            throw new Error(err.Error || `HTTP ${res.status}`);
        }
        return res.json();
    }

    async function ingest(formData, namespace) {
        const res = await fetch('/v1/ingest', {
            method: 'POST',
            headers: getMultipartHeaders(namespace),
            body: formData,
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({ Error: res.statusText }));
            throw new Error(err.Error || `HTTP ${res.status}`);
        }
        return res.json();
    }

    async function jobStatus(jobId, namespace) {
        const res = await fetch(`/v1/jobs/${jobId}`, {
            method: 'GET',
            headers: {
                'X-Secret': getCreds().secret || '',
                'X-Namespace': namespace || getCreds().namespace || '',
            },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
    }

    async function health() {
        const res = await fetch('/health');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
    }

    function escapeHTML(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    return {
        getCreds, saveCreds,
        query, ingest, jobStatus, health,
        escapeHTML
    };
})();

// ── UI Integration Script (For Dashboard) ──
document.addEventListener('DOMContentLoaded', () => {
    // Only execute if on the dashboard page (/query)
    const isDashboard = document.getElementById('dashboard-view-trigger');
    if (!isDashboard) return;

    const secretInput = document.getElementById('setting-secret');
    const nsInput     = document.getElementById('setting-namespace');
    const saveSettingsBtn = document.getElementById('save-settings-btn');
    const settingsOverlay = document.getElementById('settings-modal');
    const gearIcon = document.getElementById('gear-icon');
    const closeSettingsBtn = document.getElementById('close-settings-btn');
    
    const activeNamespaceDisplay = document.getElementById('active-namespace');

    // 1. Settings / Credentials Logic
    function loadSettingsToInputs() {
        const { secret, namespace } = KEIRO.getCreds();
        if (secretInput) secretInput.value = secret || '';
        if (nsInput) nsInput.value = namespace || '';
        if (activeNamespaceDisplay) activeNamespaceDisplay.textContent = namespace || 'not-set';
    }

    loadSettingsToInputs();

    if (gearIcon && settingsOverlay) {
        gearIcon.addEventListener('click', () => {
            loadSettingsToInputs();
            settingsOverlay.classList.add('visible');
        });
    }

    if (closeSettingsBtn) {
        closeSettingsBtn.addEventListener('click', () => {
            settingsOverlay.classList.remove('visible');
        });
    }

    if (saveSettingsBtn) {
        saveSettingsBtn.addEventListener('click', () => {
            const secret = secretInput.value.trim();
            const namespace = nsInput.value.trim();
            KEIRO.saveCreds(secret, namespace);
            settingsOverlay.classList.remove('visible');
        });
    }

    window.addEventListener('keiro-creds-updated', () => {
        const { namespace } = KEIRO.getCreds();
        if (activeNamespaceDisplay) activeNamespaceDisplay.textContent = namespace || 'not-set';
    });

    // 2. Health Monitoring Background Polling
    async function updateSystemHealth() {
        const gwDot = document.getElementById('gw-dot');
        const gwLat = document.getElementById('gw-latency');
        const intDot = document.getElementById('intel-dot');
        const intLat = document.getElementById('intel-latency');
        const chrDot = document.getElementById('chroma-dot');
        const chrLat = document.getElementById('chroma-latency');

        try {
            const data = await KEIRO.health();
            
            if (gwDot && gwLat) {
                gwDot.className = 'status-dot ' + (data.gateway_up ? 'up' : 'down');
                gwLat.textContent = data.gateway_latency || '< 1ms';
            }
            if (intDot && intLat) {
                intDot.className = 'status-dot ' + (data.intelligence_up ? 'up' : 'down');
                intLat.textContent = data.intelligence_latency || '—';
            }
            if (chrDot && chrLat) {
                chrDot.className = 'status-dot ' + (data.chromadb_up ? 'up' : 'down');
                chrLat.textContent = data.chromadb_latency || '—';
            }
        } catch {
            // Server offline or network issue
            if (gwDot) gwDot.className = 'status-dot down';
            if (intDot) intDot.className = 'status-dot down';
            if (chrDot) chrDot.className = 'status-dot down';
        }
    }

    updateSystemHealth();
    setInterval(updateSystemHealth, 8000);

    // 3. Document Ingestion Logic
    const fileInput = document.getElementById('file-input');
    const dropZone = document.getElementById('drop-zone');
    const fileChosenBanner = document.getElementById('file-chosen-banner');
    const fileNameDisplay = document.getElementById('file-name-display');
    const startIngestBtn = document.getElementById('start-ingest-btn');
    const ingestLoading = document.getElementById('ingest-loading');
    
    const jobStatusPanel = document.getElementById('job-status-panel');
    const jobIdDisplay = document.getElementById('job-id-val');
    const jobStateDisplay = document.getElementById('job-state-val');
    const jobDot = document.getElementById('job-status-dot');
    const jobElapsedDisplay = document.getElementById('job-elapsed-val');

    let pollInterval = null;
    let jobStartTime = 0;
    let jobElapsedTimer = null;

    if (dropZone && fileInput) {
        dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.style.borderColor = 'var(--border-accent)'; });
        dropZone.addEventListener('dragleave', () => dropZone.style.borderColor = '');
        dropZone.addEventListener('drop', e => {
            e.preventDefault();
            dropZone.style.borderColor = '';
            fileInput.files = e.dataTransfer.files;
            handleFileSelect();
        });
        fileInput.addEventListener('change', handleFileSelect);
    }

    function handleFileSelect() {
        if (fileInput.files && fileInput.files[0]) {
            const file = fileInput.files[0];
            fileNameDisplay.textContent = `${file.name} (${(file.size / (1024 * 1024)).toFixed(1)} MB)`;
            fileChosenBanner.style.display = 'flex';
        } else {
            fileChosenBanner.style.display = 'none';
        }
    }

    if (startIngestBtn) {
        startIngestBtn.addEventListener('click', async () => {
            const { secret, namespace } = KEIRO.getCreds();
            if (!secret || !namespace) {
                alert('Please configure Namespace and Secret in settings (gear icon) first.');
                settingsOverlay.classList.add('visible');
                return;
            }
            if (!fileInput.files || !fileInput.files[0]) {
                alert('Please select or drag a file to ingest.');
                return;
            }

            const strategy = document.getElementById('chunk-strategy').value;
            const formData = new FormData();
            formData.append('file', fileInput.files[0]);
            formData.append('chunking_strategy', strategy);

            startIngestBtn.disabled = true;
            ingestLoading.classList.add('visible');
            stopPolling();

            try {
                const data = await KEIRO.ingest(formData, namespace);
                if (data.job_id) {
                    displayJobDetails(data.job_id, 'PENDING');
                    startPolling(data.job_id, namespace);
                }
            } catch (err) {
                displayJobDetails('INGESTION ERROR', err.message, true);
            } finally {
                startIngestBtn.disabled = false;
                ingestLoading.classList.remove('visible');
            }
        });
    }

    function startPolling(jobId, namespace) {
        stopPolling();
        jobStartTime = Date.now();
        
        jobElapsedTimer = setInterval(() => {
            const elapsed = Math.round((Date.now() - jobStartTime) / 1000);
            if (jobElapsedDisplay) jobElapsedDisplay.textContent = `${elapsed}s ago`;
        }, 1000);

        pollInterval = setInterval(async () => {
            try {
                const data = await KEIRO.jobStatus(jobId, namespace);
                // Status mapping (0: pending, 1: processing, 2: complete, 3: failed)
                const statusMap = { '0': 'PENDING', '1': 'PROCESSING', '2': 'COMPLETED', '3': 'FAILED' };
                const rawStatus = String(data.JobStatus);
                const statusStr = statusMap[rawStatus] || String(data.JobStatus).toUpperCase();

                displayJobDetails(jobId, statusStr, rawStatus === '3');

                if (statusStr === 'COMPLETED' || statusStr === 'FAILED' || rawStatus === '2' || rawStatus === '3') {
                    stopPolling();
                }
            } catch {
                stopPolling();
                displayJobDetails(jobId, 'POLLING ERROR', true);
            }
        }, 2000);
    }

    function stopPolling() {
        if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
        if (jobElapsedTimer) { clearInterval(jobElapsedTimer); jobElapsedTimer = null; }
    }

    function displayJobDetails(jobId, status, isError = false) {
        if (jobStatusPanel) jobStatusPanel.style.display = 'flex';
        if (jobIdDisplay) jobIdDisplay.textContent = jobId;
        if (jobStateDisplay) jobStateDisplay.textContent = status;

        if (jobDot) {
            jobDot.className = 'status-dot';
            if (status === 'COMPLETED') jobDot.classList.add('up');
            else if (status === 'FAILED' || isError) jobDot.classList.add('down');
            else jobDot.classList.add('warning'); // processing / pending
        }
    }

    // 4. Query Submission Logic
    const queryInput = document.getElementById('query-input');
    const runQueryBtn = document.getElementById('run-query-btn');
    const queryLoading = document.getElementById('query-loading');
    
    const responseContainer = document.getElementById('response-container');
    const tierDisplay = document.getElementById('meta-tier');
    const cacheDisplay = document.getElementById('meta-cache');
    const latencyDisplay = document.getElementById('meta-latency');

    // Telemetry display panels
    const telemetryPanel = document.getElementById('telemetry-panel');
    const telemetryModel = document.getElementById('telemetry-model');
    const telemetryPrompt = document.getElementById('telemetry-prompt-tokens');
    const telemetryCompletion = document.getElementById('telemetry-completion-tokens');
    const telemetryTotal = document.getElementById('telemetry-total-tokens');
    const telemetryRetrievalSection = document.getElementById('telemetry-retrieval-section');
    const telemetryTopK = document.getElementById('telemetry-top-k');
    const telemetryRerank = document.getElementById('telemetry-rerank');
    const telemetryDecompose = document.getElementById('telemetry-decompose');

    if (runQueryBtn && queryInput) {
        runQueryBtn.addEventListener('click', async () => {
            const { secret, namespace } = KEIRO.getCreds();
            if (!secret || !namespace) {
                alert('Please configure Namespace and Secret in settings (gear icon) first.');
                settingsOverlay.classList.add('visible');
                return;
            }

            const queryText = queryInput.value.trim();
            if (!queryText) {
                alert('Please type a query first.');
                return;
            }

            runQueryBtn.disabled = true;
            queryLoading.classList.add('visible');
            responseContainer.textContent = 'Awaiting strategy classification & retrieval...';

            // Reset previous displays
            if (tierDisplay) tierDisplay.textContent = '—';
            if (cacheDisplay) cacheDisplay.textContent = '—';
            if (latencyDisplay) latencyDisplay.textContent = '—';
            if (telemetryPanel) telemetryPanel.style.display = 'none';

            const startTime = Date.now();

            try {
                const data = await KEIRO.query(queryText, namespace);
                
                // Render text response
                responseContainer.textContent = data.response || 'Empty response received.';
                
                // Render response metadata
                const isCached = !!data.cache_hit;
                const tierRaw = data.retrieval_details?.retrieval_type || (isCached ? 'cached' : '—');
                
                // Format Tier Label
                let tierLabel = 'HYBRID';
                if (String(tierRaw).toLowerCase().includes('multi_vector') || String(tierRaw).toLowerCase().includes('multivector')) {
                    tierLabel = 'MULTI_VECTOR';
                } else if (String(tierRaw).toLowerCase().includes('self_query') || String(tierRaw).toLowerCase().includes('selfquery')) {
                    tierLabel = 'SELF_QUERYING';
                } else if (isCached) {
                    tierLabel = 'CACHED';
                }

                if (tierDisplay) tierDisplay.textContent = tierLabel;
                if (cacheDisplay) cacheDisplay.textContent = isCached ? 'HIT' : 'MISS';
                
                const responseLatency = Date.now() - startTime;
                if (latencyDisplay) latencyDisplay.textContent = `${responseLatency}ms`;

                // Update Telemetry Panel
                if (telemetryPanel) {
                    telemetryPanel.style.display = 'flex';
                    
                    if (isCached) {
                        if (telemetryModel) telemetryModel.textContent = 'semantic-cache (local)';
                        if (telemetryPrompt) telemetryPrompt.textContent = '0';
                        if (telemetryCompletion) telemetryCompletion.textContent = '0';
                        if (telemetryTotal) telemetryTotal.textContent = '0';
                        if (telemetryRetrievalSection) telemetryRetrievalSection.style.display = 'none';
                    } else {
                        const modelName = data.response_model || '—';
                        const promptTokens = data.prompt_tokens ?? 0;
                        const completionTokens = data.completion_token ?? 0;
                        const totalTokens = promptTokens + completionTokens;

                        if (telemetryModel) telemetryModel.textContent = modelName;
                        if (telemetryPrompt) telemetryPrompt.textContent = promptTokens;
                        if (telemetryCompletion) telemetryCompletion.textContent = completionTokens;
                        if (telemetryTotal) telemetryTotal.textContent = totalTokens;

                        if (telemetryRetrievalSection) {
                            telemetryRetrievalSection.style.display = 'block';
                            
                            const topK = data.retrieval_details?.top_k ?? data.retrieval_details?.topK ?? '—';
                            const isRerank = data.retrieval_details?.rerank;
                            const isDecompose = data.retrieval_details?.decompose;

                            if (telemetryTopK) telemetryTopK.textContent = topK;
                            
                            if (telemetryRerank) {
                                telemetryRerank.textContent = isRerank !== undefined 
                                    ? (isRerank ? 'ENABLED (CROSS-ENCODER)' : 'DISABLED') 
                                    : '—';
                            }
                            
                            if (telemetryDecompose) {
                                telemetryDecompose.textContent = isDecompose !== undefined 
                                    ? (isDecompose ? 'ENABLED (MULTI-HOP)' : 'DISABLED') 
                                    : '—';
                            }
                        }
                    }
                }

            } catch (err) {
                responseContainer.textContent = `CRITICAL QUERY ERROR:\n${err.message}`;
                if (tierDisplay) tierDisplay.textContent = 'ERROR';
                if (cacheDisplay) cacheDisplay.textContent = 'ERR';
                if (latencyDisplay) latencyDisplay.textContent = 'N/A';
            } finally {
                runQueryBtn.disabled = false;
                queryLoading.classList.remove('visible');
            }
        });

        // Trigger on Ctrl+Enter
        queryInput.addEventListener('keydown', e => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                runQueryBtn.click();
            }
        });
    }
});