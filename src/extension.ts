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
    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Kustomize Visualization</title>
        <style>
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }
            body {
                font-family: var(--vscode-font-family);
                color: var(--vscode-foreground);
                background-color: var(--vscode-editor-background);
                padding: 20px;
            }
            h1 {
                margin-bottom: 10px;
                font-size: 24px;
            }
            .subtitle {
                color: var(--vscode-descriptionForeground);
                margin-bottom: 30px;
            }
            .overlay-container {
                margin-bottom: 50px;
                border: 2px solid var(--vscode-panel-border);
                border-radius: 10px;
                padding: 20px;
                background: var(--vscode-editorWidget-background);
            }
            .overlay-header {
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
            .tiers {
                display: flex;
                gap: 20px;
                margin-top: 20px;
            }
            .tier {
                flex: 1;
                background: var(--vscode-editor-background);
                border: 2px solid var(--vscode-panel-border);
                border-radius: 8px;
                padding: 15px;
                min-width: 300px;
            }
            .tier-header {
                font-size: 14px;
                font-weight: bold;
                margin-bottom: 15px;
                padding-bottom: 8px;
                border-bottom: 2px solid var(--vscode-panel-border);
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .tier-1 { border-color: #4CAF50; }
            .tier-1 .tier-header { color: #4CAF50; border-color: #4CAF50; }
            .tier-2 { border-color: #2196F3; }
            .tier-2 .tier-header { color: #2196F3; border-color: #2196F3; }
            .tier-3 { border-color: #FF9800; }
            .tier-3 .tier-header { color: #FF9800; border-color: #FF9800; }
            .section {
                margin: 12px 0;
            }
            .section-title {
                font-size: 11px;
                text-transform: uppercase;
                color: var(--vscode-descriptionForeground);
                margin-bottom: 6px;
                font-weight: bold;
            }
            .item {
                font-size: 12px;
                padding: 4px 0;
                display: flex;
                align-items: flex-start;
                gap: 6px;
            }
            .item-icon {
                color: var(--vscode-textLink-foreground);
                min-width: 16px;
            }
            .network-section {
                margin-top: 10px;
                padding: 10px;
                background: var(--vscode-editorWidget-background);
                border-radius: 5px;
            }
            .network-rule {
                font-size: 11px;
                padding: 3px 0;
                display: flex;
                align-items: center;
                gap: 6px;
            }
            .ingress { color: #4CAF50; }
            .egress { color: #FF9800; }
            .code {
                font-family: monospace;
                background: var(--vscode-textCodeBlock-background);
                padding: 2px 6px;
                border-radius: 3px;
                font-size: 11px;
            }
            .arrow-flow {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 15px;
                margin: 20px 0;
                padding: 15px;
                background: var(--vscode-editor-background);
                border-radius: 8px;
            }
            .flow-step {
                text-align: center;
                padding: 10px;
            }
            .flow-arrow {
                font-size: 24px;
                color: var(--vscode-textLink-foreground);
            }
            .result-box {
                margin-top: 20px;
                padding: 15px;
                background: var(--vscode-editorWidget-background);
                border: 2px solid var(--vscode-charts-green);
                border-radius: 8px;
            }
            .result-title {
                font-weight: bold;
                color: var(--vscode-charts-green);
                margin-bottom: 10px;
            }
        </style>
    </head>
    <body>
        <h1>🎯 Kustomize Overlay Build Analysis</h1>
        <div class="subtitle">See what each layer contributes to your final configuration</div>
        
        ${overlays.length === 0 ? '<p>No overlays found. Open a folder with Kustomize configurations.</p>' : ''}
        ${overlays.map(overlay => renderOverlay(overlay)).join('')}
    </body>
    </html>`;
}

function renderOverlay(overlay: any): string {
    return `
        <div class="overlay-container">
            <div class="overlay-header">
                <span>📦 ${overlay.name}</span>
                <span class="env-badge env-${overlay.environment}">${overlay.environment.toUpperCase()}</span>
            </div>
            
            ${renderInheritanceFlow(overlay)}
            
            <div class="tiers">
                ${renderTier1(overlay.tier1)}
                ${renderTier2(overlay.tier2)}
                ${renderTier3(overlay.tier3, overlay.client)}
            </div>
            
            ${renderFinalResult(overlay)}
        </div>
    `;
}

function renderInheritanceFlow(overlay: any): string {
    return `
        <div class="arrow-flow">
            <div class="flow-step">
                <div style="font-size: 32px;">📦</div>
                <div style="font-size: 12px; margin-top: 5px;">base/</div>
            </div>
            <div class="flow-arrow">→</div>
            <div class="flow-step">
                <div style="font-size: 32px;">📋</div>
                <div style="font-size: 12px; margin-top: 5px;">base/${overlay.client}/</div>
            </div>
            <div class="flow-arrow">→</div>
            <div class="flow-step">
                <div style="font-size: 32px;">🎯</div>
                <div style="font-size: 12px; margin-top: 5px;">overlays/${overlay.name}</div>
            </div>
            <div class="flow-arrow">=</div>
            <div class="flow-step">
                <div style="font-size: 32px;">✅</div>
                <div style="font-size: 12px; margin-top: 5px;">Final Config</div>
            </div>
        </div>
    `;
}

function renderTier1(tier1: any): string {
    if (!tier1) return '';
    
    return `
        <div class="tier tier-1">
            <div class="tier-header">
                <span>🏛️</span>
                <span>TIER 1: base/</span>
            </div>
            
            <div class="section">
                <div class="section-title">📄 Provides Resources</div>
                ${tier1.resources.map((r: string) => `
                    <div class="item">
                        <span class="item-icon">•</span>
                        <span class="code">${r}</span>
                    </div>
                `).join('')}
            </div>
            
            <div class="section">
                <div class="section-title">🏷️ Common Labels</div>
                ${tier1.labels.map((l: string) => `
                    <div class="item">
                        <span class="item-icon">•</span>
                        <span>${l}</span>
                    </div>
                `).join('')}
            </div>
            
            <div class="section">
                <div class="section-title">💡 Purpose</div>
                <div class="item">${tier1.provides}</div>
            </div>
        </div>
    `;
}

function renderTier2(tier2: any): string {
    if (!tier2) return '';
    
    return `
        <div class="tier tier-2">
            <div class="tier-header">
                <span>🏢</span>
                <span>TIER 2: base/${tier2.client}/</span>
            </div>
            
            <div class="section">
                <div class="section-title">➕ Adds to Base</div>
                <div class="item">
                    <span class="item-icon">•</span>
                    <span>Name Prefix: <span class="code">${tier2.namePrefix}</span></span>
                </div>
            </div>
            
            <div class="section">
                <div class="section-title">🏷️ Client Labels</div>
                ${tier2.labels.map((l: string) => `
                    <div class="item">
                        <span class="item-icon">•</span>
                        <span>${l}</span>
                    </div>
                `).join('')}
            </div>
            
            <div class="section">
                <div class="section-title">⚙️ Client Configuration</div>
                ${tier2.config.map((c: string) => `
                    <div class="item">
                        <span class="item-icon">•</span>
                        <span class="code">${c}</span>
                    </div>
                `).join('')}
            </div>
            
            ${renderNetworkPolicies(tier2.networkPolicies)}
        </div>
    `;
}

function renderTier3(tier3: any, client: string): string {
    return `
        <div class="tier tier-3">
            <div class="tier-header">
                <span>🚀</span>
                <span>TIER 3: overlays/${client}/${tier3.environment}/</span>
            </div>
            
            <div class="section">
                <div class="section-title">🎯 Environment Settings</div>
                <div class="item">
                    <span class="item-icon">📦</span>
                    <span>Namespace: <span class="code">${tier3.namespace}</span></span>
                </div>
                <div class="item">
                    <span class="item-icon">🔢</span>
                    <span>Replicas: <span class="code">${tier3.replicas}</span></span>
                </div>
                <div class="item">
                    <span class="item-icon">🌍</span>
                    <span>Environment: <span class="code">${tier3.environment}</span></span>
                </div>
            </div>
            
            <div class="section">
                <div class="section-title">📝 Applies Patches</div>
                ${tier3.patches.map((p: string) => `
                    <div class="item">
                        <span class="item-icon">•</span>
                        <span class="code">${p}</span>
                    </div>
                `).join('')}
            </div>
            
            ${tier3.configMaps.length > 0 ? `
                <div class="section">
                    <div class="section-title">📋 Generates ConfigMaps</div>
                    ${tier3.configMaps.map((cm: any) => `
                        <div class="item">
                            <span class="item-icon">•</span>
                            <span>${cm.name || 'env-config'}</span>
                        </div>
                    `).join('')}
                </div>
            ` : ''}
        </div>
    `;
}

function renderNetworkPolicies(policies: any[]): string {
    if (!policies || policies.length === 0) return '';
    
    return policies.map(policy => `
        <div class="section">
            <div class="section-title">🔒 Network Policy: ${policy.type}</div>
            <div class="network-section">
                ${policy.ingress.length > 0 ? `
                    <div style="margin-bottom: 8px;">
                        <strong class="ingress">⬇️ INGRESS</strong>
                        ${policy.ingress.map((rule: string) => `
                            <div class="network-rule ingress">• ${rule}</div>
                        `).join('')}
                    </div>
                ` : ''}
                ${policy.egress.length > 0 ? `
                    <div>
                        <strong class="egress">⬆️ EGRESS</strong>
                        ${policy.egress.map((rule: string) => `
                            <div class="network-rule egress">• ${rule}</div>
                        `).join('')}
                    </div>
                ` : ''}
            </div>
        </div>
    `).join('');
}

function renderFinalResult(overlay: any): string {
    return `
        <div class="result-box">
            <div class="result-title">✅ Final Merged Configuration for ${overlay.name}</div>
            <div class="item">
                <span class="item-icon">📦</span>
                <span>Deployment: <span class="code">${overlay.tier2.namePrefix}app</span> with ${overlay.tier3.replicas} replicas</span>
            </div>
            <div class="item">
                <span class="item-icon">🌐</span>
                <span>Namespace: <span class="code">${overlay.tier3.namespace}</span></span>
            </div>
            <div class="item">
                <span class="item-icon">🔒</span>
                <span>Network: ${overlay.tier2.networkPolicies[0]?.type || 'Default'}</span>
            </div>
            <div class="item">
                <span class="item-icon">⚙️</span>
                <span>Patches: ${overlay.tier3.patches.length} applied</span>
            </div>
        </div>
    `;
}

export function deactivate() {}
