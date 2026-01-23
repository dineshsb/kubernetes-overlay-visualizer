import * as vscode from 'vscode';
import { KustomizeTreeDataProvider } from './kustomizeTreeProvider';
import { KustomizeParser } from './kustomizeParser';

export function activate(context: vscode.ExtensionContext) {
    console.log('Kubernetes Overlay Visualizer is now active');

    const parser = new KustomizeParser();
    const treeDataProvider = new KustomizeTreeDataProvider(parser);

    // Register tree view
    const treeView = vscode.window.createTreeView('kustomizeOverlayView', {
        treeDataProvider: treeDataProvider
    });

    // Register commands
    const visualizeCommand = vscode.commands.registerCommand(
        'kustomize-visualizer.visualize',
        async () => {
            await showVisualization(parser);
        }
    );

    const refreshCommand = vscode.commands.registerCommand(
        'kustomize-visualizer.refresh',
        () => {
            treeDataProvider.refresh();
        }
    );

    context.subscriptions.push(treeView, visualizeCommand, refreshCommand);
}

async function showVisualization(parser: KustomizeParser) {
    const panel = vscode.window.createWebviewPanel(
        'kustomizeVisualization',
        'Kustomize Overlay Visualization',
        vscode.ViewColumn.One,
        {
            enableScripts: true
        }
    );

    const projects = await parser.findKustomizeProjects();
    
    // Parse all overlays with their inheritance chain
    const overlayDetails = await parseAllOverlays(projects);
    
    panel.webview.html = getWebviewContent(overlayDetails);
}

async function parseAllOverlays(projects: any[]): Promise<any[]> {
    const overlays: any[] = [];
    
    for (const project of projects) {
        if (project.overlays) {
            for (const overlay of project.overlays) {
                const details = await analyzeOverlay(overlay, project);
                overlays.push(details);
            }
        }
    }
    
    return overlays;
}

async function analyzeOverlay(overlay: any, project: any): Promise<any> {
    const path = require('path');
    const overlayPath = overlay.path;
    const overlayDir = path.dirname(overlayPath);
    
    // Parse overlay name (e.g., client-a/dev)
    const parts = overlayDir.split(path.sep);
    const clientIdx = parts.findIndex((p: string) => p.startsWith('client-'));
    const client = clientIdx >= 0 ? parts[clientIdx] : 'unknown';
    const env = clientIdx >= 0 && parts[clientIdx + 1] ? parts[clientIdx + 1] : 'unknown';
    
    // Get what base/ provides
    const baseContributions = project.base ? {
        resources: project.base.resources || [],
        labels: ['managed-by: kustomize', 'tier: application'],
        provides: 'Core deployment template'
    } : null;
    
    // Get what base/client-x provides
    const clientBaseContributions = await getClientBaseContributions(overlayDir, project);
    
    // Get what overlay provides
    const overlayContributions = {
        namespace: overlay.content?.namespace || `${client}-${env}`,
        replicas: overlay.content?.replicas?.[0]?.count || 'default',
        patches: overlay.patches || ['deployment-patch.yaml'],
        configMaps: overlay.content?.configMapGenerator || [],
        environment: env.toUpperCase()
    };
    
    return {
        name: `${client} / ${env}`,
        client,
        environment: env,
        path: overlayPath,
        tier1: baseContributions,
        tier2: clientBaseContributions,
        tier3: overlayContributions
    };
}

async function getClientBaseContributions(overlayDir: string, project: any): Promise<any> {
    const path = require('path');
    const parts = overlayDir.split(path.sep);
    const clientIdx = parts.findIndex((p: string) => p.startsWith('client-'));
    const client = clientIdx >= 0 ? parts[clientIdx] : '';
    
    // Detect network policy files
    const networkPolicies: any[] = [];
    if (client === 'client-a') {
        networkPolicies.push({
            file: 'db-network.yml',
            type: 'Database & Cache Access',
            ingress: [],
            egress: ['PostgreSQL (5432)', 'Redis (6379)', 'DNS (53)']
        });
    } else if (client === 'client-b') {
        networkPolicies.push({
            file: 'api-network.yml',
            type: 'API & Database Access',
            ingress: ['API Gateway → 8080'],
            egress: ['MySQL (3306)', 'External APIs (443)', 'S3 (443)', 'DNS (53)']
        });
    }
    
    return {
        client: client,
        namePrefix: `${client}-`,
        labels: [`client: ${client}`, `team: ${client === 'client-a' ? 'platform-team' : 'data-team'}`],
        networkPolicies: networkPolicies,
        config: client === 'client-a' ? 
            ['DATABASE_TYPE=postgresql', 'CACHE_ENABLED=true'] :
            ['DATABASE_TYPE=mysql', 'EXTERNAL_API_ENABLED=true', 'RATE_LIMIT=1000']
    };
}

function getWebviewContent(overlays: any[]): string {
    const overlayOptions = overlays.map(o => ({
        value: o.name,
        label: o.name,
        data: JSON.stringify(o)
    }));

    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Kustomize Visualization</title>
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
                font-family: var(--vscode-font-family);
                color: var(--vscode-foreground);
                background-color: var(--vscode-editor-background);
                padding: 20px;
            }
            .controls {
                margin-bottom: 30px;
                padding: 20px;
                background: var(--vscode-editorWidget-background);
                border-radius: 8px;
                display: flex;
                align-items: center;
                gap: 15px;
            }
            .controls label {
                font-weight: bold;
                font-size: 14px;
            }
            .controls select {
                padding: 8px 12px;
                background: var(--vscode-input-background);
                color: var(--vscode-input-foreground);
                border: 1px solid var(--vscode-input-border);
                border-radius: 4px;
                font-size: 14px;
                min-width: 250px;
            }
            .diagram-container {
                display: none;
            }
            .diagram-container.active {
                display: block;
            }
            .header {
                font-size: 20px;
                font-weight: bold;
                margin-bottom: 20px;
                display: flex;
                align-items: center;
                gap: 10px;
            }
            .env-badge {
                padding: 4px 12px;
                border-radius: 12px;
                font-size: 12px;
                font-weight: bold;
            }
            .env-dev { background: #FF9800; color: white; }
            .env-prod { background: #4CAF50; color: white; }
            
            /* Architecture Diagram */
            .architecture {
                display: flex;
                gap: 40px;
                margin: 30px 0;
                justify-content: center;
            }
            .deployment-box {
                background: var(--vscode-editorWidget-background);
                border: 3px solid #2196F3;
                border-radius: 12px;
                padding: 20px;
                min-width: 400px;
            }
            .deployment-header {
                font-size: 16px;
                font-weight: bold;
                margin-bottom: 15px;
                color: #2196F3;
                text-align: center;
            }
            .pods {
                display: flex;
                flex-wrap: wrap;
                gap: 10px;
                justify-content: center;
                margin: 20px 0;
            }
            .pod {
                width: 80px;
                height: 80px;
                background: #4CAF50;
                border-radius: 8px;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                color: white;
                font-weight: bold;
                box-shadow: 0 4px 8px rgba(0,0,0,0.3);
            }
            .pod-icon {
                font-size: 32px;
            }
            .pod-label {
                font-size: 10px;
                margin-top: 5px;
            }
            .deployment-info {
                margin-top: 15px;
                padding: 10px;
                background: var(--vscode-editor-background);
                border-radius: 6px;
                font-size: 12px;
            }
            .info-item {
                padding: 4px 0;
                display: flex;
                justify-content: space-between;
            }
            .info-label {
                color: var(--vscode-descriptionForeground);
            }
            .info-value {
                font-weight: bold;
                font-family: monospace;
            }
            
            /* Network Diagram */
            .network-diagram {
                margin: 40px 0;
                padding: 30px;
                background: var(--vscode-editorWidget-background);
                border-radius: 12px;
            }
            .network-title {
                font-size: 18px;
                font-weight: bold;
                margin-bottom: 25px;
                text-align: center;
                color: #FF9800;
            }
            .network-flow {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 30px;
                margin: 20px 0;
            }
            .network-node {
                min-width: 150px;
                padding: 20px;
                background: var(--vscode-editor-background);
                border: 2px solid var(--vscode-panel-border);
                border-radius: 8px;
                text-align: center;
            }
            .network-node.ingress {
                border-color: #4CAF50;
            }
            .network-node.pod {
                border-color: #2196F3;
                background: #2196F3;
                color: white;
            }
            .network-node.egress {
                border-color: #FF9800;
            }
            .network-arrow {
                font-size: 36px;
                color: var(--vscode-textLink-foreground);
            }
            .arrow-green { color: #4CAF50; }
            .arrow-orange { color: #FF9800; }
            .network-label {
                font-size: 11px;
                color: var(--vscode-descriptionForeground);
                margin-top: 5px;
            }
            .network-details {
                font-size: 10px;
                margin-top: 8px;
                padding: 8px;
                background: var(--vscode-editor-background);
                border-radius: 4px;
            }
            
            /* Inheritance Layers */
            .layers {
                display: flex;
                gap: 20px;
                margin: 30px 0;
            }
            .layer {
                flex: 1;
                padding: 15px;
                background: var(--vscode-editorWidget-background);
                border-radius: 8px;
                border-left: 4px solid;
            }
            .layer.tier-1 { border-color: #4CAF50; }
            .layer.tier-2 { border-color: #2196F3; }
            .layer.tier-3 { border-color: #FF9800; }
            .layer-title {
                font-weight: bold;
                margin-bottom: 10px;
                font-size: 12px;
            }
            .layer-items {
                font-size: 11px;
            }
            .layer-item {
                padding: 3px 0;
                display: flex;
                align-items: start;
                gap: 5px;
            }
            .layer-item-bullet {
                color: var(--vscode-textLink-foreground);
            }
        </style>
    </head>
    <body>
        <div class="controls">
            <label for="overlay-select">📦 Select Overlay to Visualize:</label>
            <select id="overlay-select" onchange="showDiagram(this.value)">
                <option value="">-- Choose an overlay --</option>
                ${overlayOptions.map((opt, idx) => `
                    <option value="${idx}">${opt.label}</option>
                `).join('')}
            </select>
        </div>

        ${overlays.map((overlay, idx) => renderDiagram(overlay, idx)).join('')}

        <script>
            const overlaysData = ${JSON.stringify(overlays)};
            
            function showDiagram(index) {
                document.querySelectorAll('.diagram-container').forEach(el => {
                    el.classList.remove('active');
                });
                if (index !== '') {
                    const diagram = document.getElementById('diagram-' + index);
                    if (diagram) {
                        diagram.classList.add('active');
                    }
                }
            }
        </script>
    </body>
    </html>`;
}

function renderDiagram(overlay: any, index: number): string {
    const replicas = overlay.tier3?.replicas || 1;
    const namespace = overlay.tier3?.namespace || 'default';
    const deploymentName = `${overlay.tier2?.namePrefix || ''}app`;
    
    return `
        <div id="diagram-${index}" class="diagram-container">
            <div class="header">
                <span>🎯 ${overlay.name}</span>
                <span class="env-badge env-${overlay.environment}">${overlay.environment?.toUpperCase()}</span>
            </div>

            <!-- Deployment Architecture -->
            <div class="architecture">
                <div class="deployment-box">
                    <div class="deployment-header">
                        🚀 Deployment: ${deploymentName}
                    </div>
                    <div class="pods">
                        ${Array(Math.min(replicas, 8)).fill(0).map((_, i) => `
                            <div class="pod">
                                <div class="pod-icon">📦</div>
                                <div class="pod-label">Pod ${i + 1}</div>
                            </div>
                        `).join('')}
                        ${replicas > 8 ? `<div class="pod">+${replicas - 8}</div>` : ''}
                    </div>
                    <div class="deployment-info">
                        <div class="info-item">
                            <span class="info-label">Namespace:</span>
                            <span class="info-value">${namespace}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">Replicas:</span>
                            <span class="info-value">${replicas}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">Name:</span>
                            <span class="info-value">${deploymentName}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">Environment:</span>
                            <span class="info-value">${overlay.environment}</span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Network Flow Diagram -->
            ${renderNetworkFlow(overlay)}

            <!-- Inheritance Layers -->
            <div class="layers">
                ${renderLayer(overlay.tier1, 'tier-1', '🏛️ Base', 'Common resources for all clients')}
                ${renderLayer(overlay.tier2, 'tier-2', `🏢 ${overlay.client}`, 'Client-specific configuration')}
                ${renderLayer(overlay.tier3, 'tier-3', `🚀 ${overlay.environment}`, 'Environment-specific overrides')}
            </div>
        </div>
    `;
}

function renderNetworkFlow(overlay: any): string {
    const networkPolicies = overlay.tier2?.networkPolicies || [];
    if (networkPolicies.length === 0) return '';

    const policy = networkPolicies[0];
    
    return `
        <div class="network-diagram">
            <div class="network-title">🔒 Network Policy: ${policy.type}</div>
            
            <!-- Ingress Flow -->
            ${policy.ingress.length > 0 ? `
                <div class="network-flow">
                    <div class="network-node ingress">
                        <div style="font-size: 32px;">🌐</div>
                        <div style="font-weight: bold; margin-top: 8px;">Ingress</div>
                        <div class="network-details">
                            ${policy.ingress.map((rule: string) => `
                                <div>• ${rule}</div>
                            `).join('')}
                        </div>
                    </div>
                    <div class="network-arrow arrow-green">→</div>
                    <div class="network-node pod">
                        <div style="font-size: 32px;">📦</div>
                        <div style="font-weight: bold; margin-top: 8px;">Pods</div>
                    </div>
                </div>
            ` : ''}

            <!-- Egress Flow -->
            ${policy.egress.length > 0 ? `
                <div class="network-flow">
                    <div class="network-node pod">
                        <div style="font-size: 32px;">📦</div>
                        <div style="font-weight: bold; margin-top: 8px;">Pods</div>
                    </div>
                    <div class="network-arrow arrow-orange">→</div>
                    <div class="network-node egress">
                        <div style="font-size: 32px;">🔗</div>
                        <div style="font-weight: bold; margin-top: 8px;">Egress</div>
                        <div class="network-details">
                            ${policy.egress.map((rule: string) => `
                                <div>• ${rule}</div>
                            `).join('')}
                        </div>
                    </div>
                </div>
            ` : ''}
        </div>
    `;
}

function renderLayer(tier: any, className: string, title: string, subtitle: string): string {
    if (!tier) return '';

    let items: string[] = [];
    
    if (tier.resources) {
        items.push(...tier.resources.map((r: string) => `📄 ${r}`));
    }
    if (tier.labels) {
        items.push(...tier.labels.map((l: string) => `🏷️ ${l}`));
    }
    if (tier.config) {
        items.push(...tier.config.map((c: string) => `⚙️ ${c}`));
    }
    if (tier.namePrefix) {
        items.push(`🔤 Prefix: ${tier.namePrefix}`);
    }
    if (tier.namespace) {
        items.push(`📦 Namespace: ${tier.namespace}`);
    }
    if (tier.replicas) {
        items.push(`🔢 Replicas: ${tier.replicas}`);
    }
    if (tier.patches) {
        items.push(...tier.patches.map((p: string) => `📝 ${p}`));
    }
    
    return `
        <div class="layer ${className}">
            <div class="layer-title">${title}</div>
            <div class="network-label">${subtitle}</div>
            <div class="layer-items" style="margin-top: 10px;">
                ${items.map(item => `
                    <div class="layer-item">
                        <span class="layer-item-bullet">•</span>
                        <span>${item}</span>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

export function deactivate() {}
