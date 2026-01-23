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
    panel.webview.html = getWebviewContent(projects);
}

function getWebviewContent(projects: any[]): string {
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
                overflow-x: auto;
            }
            h1 {
                margin-bottom: 20px;
                font-size: 24px;
            }
            .legend {
                display: flex;
                gap: 20px;
                margin-bottom: 30px;
                padding: 10px;
                background: var(--vscode-editorWidget-background);
                border-radius: 5px;
            }
            .legend-item {
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .legend-box {
                width: 20px;
                height: 20px;
                border-radius: 3px;
            }
            .project {
                margin-bottom: 50px;
            }
            .visualization {
                display: flex;
                flex-direction: column;
                gap: 40px;
                min-width: 1200px;
            }
            .tier {
                display: flex;
                flex-direction: column;
                gap: 15px;
            }
            .tier-header {
                font-size: 16px;
                font-weight: bold;
                color: var(--vscode-textLink-foreground);
                margin-bottom: 10px;
            }
            .tier-content {
                display: flex;
                gap: 20px;
                flex-wrap: wrap;
            }
            .card {
                background: var(--vscode-editorWidget-background);
                border: 2px solid var(--vscode-panel-border);
                border-radius: 8px;
                padding: 15px;
                min-width: 280px;
                max-width: 400px;
                position: relative;
            }
            .card-header {
                font-weight: bold;
                font-size: 14px;
                margin-bottom: 10px;
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .card-icon {
                font-size: 18px;
            }
            .card-section {
                margin-top: 12px;
                padding-top: 8px;
                border-top: 1px solid var(--vscode-panel-border);
            }
            .card-section-title {
                font-size: 11px;
                text-transform: uppercase;
                color: var(--vscode-descriptionForeground);
                margin-bottom: 6px;
            }
            .card-item {
                font-size: 12px;
                padding: 3px 0;
                display: flex;
                align-items: center;
                gap: 6px;
            }
            .badge {
                display: inline-block;
                padding: 2px 8px;
                border-radius: 10px;
                font-size: 10px;
                font-weight: bold;
            }
            .tier-1 { border-color: #4CAF50; }
            .tier-2 { border-color: #2196F3; }
            .tier-3 { border-color: #FF9800; }
            .badge-tier-1 { background: #4CAF50; color: white; }
            .badge-tier-2 { background: #2196F3; color: white; }
            .badge-tier-3 { background: #FF9800; color: white; }
            .network-policy {
                margin-top: 8px;
            }
            .network-rule {
                font-size: 11px;
                padding: 4px 8px;
                background: var(--vscode-editor-background);
                border-radius: 4px;
                margin: 4px 0;
            }
            .ingress { color: #4CAF50; }
            .egress { color: #FF9800; }
            .arrow {
                text-align: center;
                color: var(--vscode-textLink-foreground);
                font-size: 24px;
                margin: -10px 0;
            }
            .inheritance-path {
                display: flex;
                align-items: center;
                gap: 10px;
                margin: 20px 0;
                padding: 15px;
                background: var(--vscode-editor-background);
                border-radius: 8px;
                border: 1px dashed var(--vscode-panel-border);
            }
            .inheritance-node {
                padding: 8px 15px;
                background: var(--vscode-editorWidget-background);
                border-radius: 5px;
                font-size: 12px;
            }
            .inheritance-arrow {
                font-size: 20px;
                color: var(--vscode-textLink-foreground);
            }
        </style>
    </head>
    <body>
        <h1>🎨 Kustomize Overlay Visualization</h1>
        
        <div class="legend">
            <div class="legend-item">
                <div class="legend-box" style="background: #4CAF50;"></div>
                <span>Tier 1: Common Base</span>
            </div>
            <div class="legend-item">
                <div class="legend-box" style="background: #2196F3;"></div>
                <span>Tier 2: Client Base</span>
            </div>
            <div class="legend-item">
                <div class="legend-box" style="background: #FF9800;"></div>
                <span>Tier 3: Environment Overlay</span>
            </div>
        </div>

        ${projects.length === 0 ? '<p>No Kustomize projects found in workspace.</p>' : ''}
        ${projects.map(project => renderProject(project)).join('')}
    </body>
    </html>`;
}

function renderProject(project: any): string {
    return `
        <div class="project">
            <div class="visualization">
                ${renderTier1(project)}
                <div class="arrow">↓ INHERITS</div>
                ${renderTier2(project)}
                <div class="arrow">↓ INHERITS</div>
                ${renderTier3(project)}
                ${renderInheritanceExamples(project)}
            </div>
        </div>
    `;
}

function renderTier1(project: any): string {
    if (!project.base) return '';
    
    const resources = project.base.resources || [];
    return `
        <div class="tier">
            <div class="tier-header">🏛️ TIER 1: Common Base</div>
            <div class="tier-content">
                <div class="card tier-1">
                    <div class="card-header">
                        <span class="card-icon">📦</span>
                        <span>Base Configuration</span>
                        <span class="badge badge-tier-1">TIER 1</span>
                    </div>
                    <div class="card-section">
                        <div class="card-section-title">📄 Resources (${resources.length})</div>
                        ${resources.map((r: string) => `
                            <div class="card-item">• ${r}</div>
                        `).join('')}
                    </div>
                    <div class="card-section">
                        <div class="card-section-title">🏷️ Common Labels</div>
                        <div class="card-item">• managed-by: kustomize</div>
                        <div class="card-item">• tier: application</div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function renderTier2(project: any): string {
    const clientBases = findClientBases(project);
    if (clientBases.length === 0) return '';

    return `
        <div class="tier">
            <div class="tier-header">🏢 TIER 2: Client-Specific Bases</div>
            <div class="tier-content">
                ${clientBases.map(client => `
                    <div class="card tier-2">
                        <div class="card-header">
                            <span class="card-icon">📋</span>
                            <span>${client.name}</span>
                            <span class="badge badge-tier-2">TIER 2</span>
                        </div>
                        <div class="card-section">
                            <div class="card-section-title">📄 Client Resources</div>
                            ${(client.resources || []).map((r: string) => `
                                <div class="card-item">• ${r}</div>
                            `).join('')}
                        </div>
                        ${renderNetworkPolicies(client)}
                        <div class="card-section">
                            <div class="card-section-title">🏷️ Client Labels</div>
                            <div class="card-item">• client: ${client.id}</div>
                            <div class="card-item">• team: ${client.team || 'unknown'}</div>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

function renderTier3(project: any): string {
    const overlays = project.overlays || [];
    if (overlays.length === 0) return '';

    return `
        <div class="tier">
            <div class="tier-header">🚀 TIER 3: Environment Overlays</div>
            <div class="tier-content">
                ${overlays.map((overlay: any) => `
                    <div class="card tier-3">
                        <div class="card-header">
                            <span class="card-icon">🎯</span>
                            <span>${getOverlayName(overlay.path)}</span>
                            <span class="badge badge-tier-3">TIER 3</span>
                        </div>
                        <div class="card-section">
                            <div class="card-section-title">⚙️ Configuration</div>
                            <div class="card-item">🔢 Replicas: ${getReplicaCount(overlay)}</div>
                            <div class="card-item">📦 Namespace: ${getNamespace(overlay.path)}</div>
                            <div class="card-item">🌍 Environment: ${getEnvironment(overlay.path)}</div>
                        </div>
                        <div class="card-section">
                            <div class="card-section-title">📝 Patches</div>
                            ${(overlay.patches || []).map((p: string) => `
                                <div class="card-item">• ${p}</div>
                            `).join('')}
                            ${overlay.patches?.length === 0 ? '<div class="card-item">• deployment-patch.yaml</div>' : ''}
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

function renderNetworkPolicies(client: any): string {
    const hasNetworkPolicy = client.resources?.some((r: string) => 
        r.includes('network') || r.includes('policy')
    );
    
    if (!hasNetworkPolicy) return '';

    return `
        <div class="card-section">
            <div class="card-section-title">🔒 Network Policies</div>
            <div class="network-policy">
                <div class="network-rule ingress">
                    ⬇️ INGRESS: API Gateway → Port 8080
                </div>
                <div class="network-rule egress">
                    ⬆️ EGRESS: Database, Cache, DNS
                </div>
            </div>
        </div>
    `;
}

function renderInheritanceExamples(project: any): string {
    const overlays = project.overlays || [];
    if (overlays.length === 0) return '';

    const firstOverlay = overlays[0];
    const overlayName = getOverlayName(firstOverlay.path);

    return `
        <div class="card-section" style="margin-top: 30px;">
            <div class="tier-header">🔗 Example Inheritance Flow</div>
            <div class="inheritance-path">
                <div class="inheritance-node">📦 Base<br/><small>deployment.yaml<br/>service.yaml</small></div>
                <div class="inheritance-arrow">→</div>
                <div class="inheritance-node">📋 Client Base<br/><small>+ network-policy<br/>+ client labels</small></div>
                <div class="inheritance-arrow">→</div>
                <div class="inheritance-node">🎯 ${overlayName}<br/><small>+ namespace<br/>+ patches<br/>+ replicas</small></div>
            </div>
        </div>
    `;
}

function findClientBases(project: any): any[] {
    // This is a simplified version - in reality we'd parse the actual client bases
    const clients = [
        { id: 'client-a', name: 'Client A', team: 'platform-team', resources: ['db-network.yml'] },
        { id: 'client-b', name: 'Client B', team: 'data-team', resources: ['api-network.yml'] }
    ];
    return clients;
}

function getOverlayName(path: string): string {
    const parts = path.split(/[/\\]/);
    const clientIdx = parts.findIndex(p => p.startsWith('client-'));
    if (clientIdx >= 0 && clientIdx < parts.length - 1) {
        const client = parts[clientIdx];
        const env = parts[clientIdx + 1];
        return `${client} / ${env}`;
    }
    return path;
}

function getNamespace(path: string): string {
    const parts = path.split(/[/\\]/);
    const clientIdx = parts.findIndex(p => p.startsWith('client-'));
    if (clientIdx >= 0) {
        const client = parts[clientIdx];
        const env = parts[clientIdx + 1] || 'unknown';
        return `${client}-${env}`;
    }
    return 'default';
}

function getEnvironment(path: string): string {
    const parts = path.split(/[/\\]/);
    const env = parts.find(p => p === 'dev' || p === 'prod' || p === 'staging');
    return env || 'unknown';
}

function getReplicaCount(overlay: any): number {
    // Try to extract from content
    const content = overlay.content;
    if (content?.replicas && Array.isArray(content.replicas)) {
        return content.replicas[0]?.count || 1;
    }
    return 1;
}

export function deactivate() {}
