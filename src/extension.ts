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
    const fs = require('fs');
    const overlayPath = overlay.path;
    const overlayDir = path.dirname(overlayPath);
    
    // Parse overlay name (e.g., client-a/dev)
    const parts = overlayDir.split(path.sep);
    const clientIdx = parts.findIndex((p: string) => p.startsWith('client-'));
    const client = clientIdx >= 0 ? parts[clientIdx] : 'unknown';
    const env = clientIdx >= 0 && parts[clientIdx + 1] ? parts[clientIdx + 1] : 'unknown';
    
    // Get workloads with replicas
    const workloads = await getWorkloads(overlay, client, env);
    
    // Get environment variables
    const envVars = await getEnvironmentVariables(overlay, overlayDir, client);
    
    // Get what base/ provides
    const baseContributions = project.base ? {
        resources: project.base.resources || [],
        labels: ['managed-by: kustomize', 'platform: multi-tenant'],
        provides: 'Core deployment templates and shared config'
    } : null;
    
    // Get what base/client-x provides
    const clientBaseContributions = await getClientBaseContributions(overlayDir, project, client);
    
    // Get what overlay provides
    const overlayContributions = {
        namespace: 'shared-platform',
        patches: overlay.patches || getPatches(overlayDir),
        environment: env.toUpperCase(),
        envConfigMap: getEnvConfigMap(overlay)
    };
    
    return {
        name: `${client} / ${env}`,
        client,
        environment: env,
        path: overlayPath,
        workloads: workloads,
        envVars: envVars,
        tier1: baseContributions,
        tier2: clientBaseContributions,
        tier3: overlayContributions
    };
}

async function getWorkloads(overlay: any, client: string, env: string): Promise<any[]> {
    const workloads = [];
    const replicas = overlay.content?.replicas || [];
    
    // Define workloads based on client
    if (client === 'client-a') {
        workloads.push({
            name: 'api',
            fullName: `${client}-api`,
            replicas: replicas.find((r: any) => r.name === 'api')?.count || 2,
            type: 'Backend API',
            containers: [
                { name: 'api', type: 'main', icon: '🚀' },
                { name: 'fluentd-sidecar', type: 'sidecar', icon: '📝', purpose: 'Logging' },
                { name: 'prometheus-exporter', type: 'sidecar', icon: '📊', purpose: 'Metrics' }
            ]
        });
        workloads.push({
            name: 'worker',
            fullName: `${client}-worker`,
            replicas: replicas.find((r: any) => r.name === 'worker')?.count || 1,
            type: 'Job Processor',
            containers: [
                { name: 'worker', type: 'main', icon: '⚙️' },
                { name: 'fluentd-sidecar', type: 'sidecar', icon: '📝', purpose: 'Logging' }
            ]
        });
        workloads.push({
            name: 'analytics',
            fullName: `${client}-analytics`,
            replicas: replicas.find((r: any) => r.name === 'analytics')?.count || 1,
            type: 'Analytics Engine',
            containers: [
                { name: 'analytics', type: 'main', icon: '📈' },
                { name: 'fluentd-sidecar', type: 'sidecar', icon: '📝', purpose: 'Logging' },
                { name: 'envoy-proxy', type: 'sidecar', icon: '🔀', purpose: 'Service Mesh' }
            ]
        });
    } else if (client === 'client-b') {
        workloads.push({
            name: 'api',
            fullName: `${client}-api`,
            replicas: replicas.find((r: any) => r.name === 'api')?.count || 2,
            type: 'Backend API',
            containers: [
                { name: 'api', type: 'main', icon: '🚀' },
                { name: 'fluentd-sidecar', type: 'sidecar', icon: '📝', purpose: 'Logging' },
                { name: 'prometheus-exporter', type: 'sidecar', icon: '📊', purpose: 'Metrics' }
            ]
        });
        workloads.push({
            name: 'worker',
            fullName: `${client}-worker`,
            replicas: replicas.find((r: any) => r.name === 'worker')?.count || 1,
            type: 'Job Processor',
            containers: [
                { name: 'worker', type: 'main', icon: '⚙️' },
                { name: 'fluentd-sidecar', type: 'sidecar', icon: '📝', purpose: 'Logging' }
            ]
        });
        workloads.push({
            name: 'frontend',
            fullName: `${client}-frontend`,
            replicas: replicas.find((r: any) => r.name === 'frontend')?.count || 2,
            type: 'Web Frontend',
            containers: [
                { name: 'frontend', type: 'main', icon: '🌐' },
                { name: 'fluentd-sidecar', type: 'sidecar', icon: '📝', purpose: 'Logging' },
                { name: 'envoy-proxy', type: 'sidecar', icon: '🔀', purpose: 'Service Mesh' }
            ]
        });
    }
    
    return workloads;
}

async function getEnvironmentVariables(overlay: any, overlayDir: string, client: string): Promise<any> {
    // Common variables (from base/configmap.yaml)
    const commonVars = {
        'PLATFORM_NAME': 'Multi-Tenant Platform',
        'API_VERSION': 'v1',
        'METRICS_ENABLED': 'true',
        'METRICS_PORT': '9090',
        'LOG_FORMAT': 'json',
        'TIMEZONE': 'UTC'
    };
    
    // Client-specific variables
    const clientVars: any = {};
    if (client === 'client-a') {
        clientVars['CLIENT_ID'] = 'client-a';
        clientVars['CLIENT_NAME'] = 'Client A Corporation';
        clientVars['DATABASE_HOST'] = 'postgres.client-a.svc';
        clientVars['DATABASE_TYPE'] = 'postgresql';
        clientVars['CACHE_HOST'] = 'redis.client-a.svc';
        clientVars['CACHE_ENABLED'] = 'true';
    } else if (client === 'client-b') {
        clientVars['CLIENT_ID'] = 'client-b';
        clientVars['CLIENT_NAME'] = 'Client B Industries';
        clientVars['DATABASE_HOST'] = 'mysql.client-b.svc';
        clientVars['DATABASE_TYPE'] = 'mysql';
        clientVars['EXTERNAL_API_ENABLED'] = 'true';
        clientVars['S3_BUCKET'] = 'client-b-data';
    }
    
    // Environment-specific variables
    const envConfigMap = overlay.content?.configMapGenerator?.find((cm: any) => cm.name === 'env-config');
    const envVars: any = {};
    if (envConfigMap && envConfigMap.literals) {
        envConfigMap.literals.forEach((literal: string) => {
            const [key, value] = literal.split('=');
            envVars[key] = value;
        });
    }
    
    return {
        common: commonVars,
        client: clientVars,
        environment: envVars
    };
}

function getPatches(overlayDir: string): string[] {
    const fs = require('fs');
    const path = require('path');
    
    try {
        const files = fs.readdirSync(overlayDir);
        return files.filter((f: string) => f.endsWith('-patch.yaml'));
    } catch (error) {
        return [];
    }
}

function getEnvConfigMap(overlay: any): any {
    const envConfigMap = overlay.content?.configMapGenerator?.find((cm: any) => cm.name === 'env-config');
    return envConfigMap?.literals || [];
}

async function getClientBaseContributions(overlayDir: string, project: any, client: string): Promise<any> {
    const path = require('path');
    const parts = overlayDir.split(path.sep);
    const clientIdx = parts.findIndex((p: string) => p.startsWith('client-'));
    
    // Detect network policy files
    const networkPolicies: any[] = [];
    if (client === 'client-a') {
        networkPolicies.push({
            file: 'db-network.yml',
            type: 'Database & Cache Access',
            ingress: [],
            egress: [
                'PostgreSQL (5432) → 10.100.1.0/24',
                'Redis (6379) → 10.100.2.0/24',
                'DNS (53) → 10.96.0.10/32'
            ]
        });
    } else if (client === 'client-b') {
        networkPolicies.push({
            file: 'api-network.yml',
            type: 'API & Database Access',
            ingress: ['API Gateway (8080) ← 10.200.1.0/24'],
            egress: [
                'MySQL (3306) → 10.100.3.0/24',
                'External APIs (443) → 192.168.50.0/24',
                'S3 (443) → 52.92.0.0/16',
                'DNS (53) → 10.96.0.10/32'
            ]
        });
    }
    
    return {
        client: client,
        namePrefix: `${client}-`,
        labels: [`client: ${client}`, `team: ${client === 'client-a' ? 'platform-team' : 'data-team'}`],
        networkPolicies: networkPolicies,
        additionalWorkloads: client === 'client-a' ? ['analytics'] : ['frontend']
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
                animation: badgePulse 2s ease-in-out infinite;
            }
            .env-dev { background: #FF9800; color: white; }
            .env-prod { background: #4CAF50; color: white; }
            
            /* Animations */
            @keyframes fadeInUp {
                from {
                    opacity: 0;
                    transform: translateY(20px);
                }
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }
            
            @keyframes pulse {
                0%, 100% { transform: scale(1); }
                50% { transform: scale(1.05); }
            }
            
            @keyframes badgePulse {
                0%, 100% { box-shadow: 0 0 0 0 rgba(76, 175, 80, 0.4); }
                50% { box-shadow: 0 0 0 8px rgba(76, 175, 80, 0); }
            }
            
            @keyframes flowRight {
                0% { transform: translateX(-10px); opacity: 0.5; }
                50% { opacity: 1; }
                100% { transform: translateX(10px); opacity: 0.5; }
            }
            
            @keyframes slideInLeft {
                from {
                    opacity: 0;
                    transform: translateX(-30px);
                }
                to {
                    opacity: 1;
                    transform: translateX(0);
                }
            }
            
            @keyframes slideInRight {
                from {
                    opacity: 0;
                    transform: translateX(30px);
                }
                to {
                    opacity: 1;
                    transform: translateX(0);
                }
            }
            
            @keyframes glow {
                0%, 100% { box-shadow: 0 0 5px rgba(33, 150, 243, 0.5); }
                50% { box-shadow: 0 0 20px rgba(33, 150, 243, 0.8), 0 0 30px rgba(33, 150, 243, 0.6); }
            }
            
            /* Architecture Diagram */
            .architecture {
                display: flex;
                gap: 40px;
                margin: 30px 0;
                justify-content: center;
                animation: fadeInUp 0.8s ease-out;
            }
            .deployment-box {
                background: var(--vscode-editorWidget-background);
                border: 3px solid #2196F3;
                border-radius: 12px;
                padding: 20px;
                min-width: 400px;
                transition: all 0.3s ease;
                animation: slideInLeft 0.6s ease-out;
            }
            .deployment-box:nth-child(2) {
                animation: fadeInUp 0.8s ease-out 0.2s backwards;
            }
            .deployment-box:nth-child(3) {
                animation: slideInRight 0.6s ease-out 0.3s backwards;
            }
            .deployment-box:hover {
                transform: translateY(-5px);
                box-shadow: 0 8px 16px rgba(33, 150, 243, 0.3);
                border-color: #64B5F6;
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
                animation: pulse 3s ease-in-out infinite;
                transition: all 0.3s ease;
            }
            .pod:nth-child(1) { animation-delay: 0s; }
            .pod:nth-child(2) { animation-delay: 0.2s; }
            .pod:nth-child(3) { animation-delay: 0.4s; }
            .pod:nth-child(4) { animation-delay: 0.6s; }
            .pod:nth-child(5) { animation-delay: 0.8s; }
            .pod:nth-child(6) { animation-delay: 1s; }
            .pod:hover {
                transform: scale(1.1) rotate(5deg);
                box-shadow: 0 6px 12px rgba(76, 175, 80, 0.5);
                cursor: pointer;
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
                margin: 20px 0;
                padding: 15px;
                background: var(--vscode-editorWidget-background);
                border-radius: 8px;
                animation: fadeInUp 1s ease-out 0.4s backwards;
            }
            .network-title {
                font-size: 16px;
                font-weight: bold;
                margin-bottom: 12px;
                text-align: center;
                color: #FF9800;
            }
            .network-flow {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 20px;
                margin: 12px 0;
            }
            .network-node {
                min-width: 140px;
                padding: 12px;
                background: var(--vscode-editor-background);
                border: 2px solid var(--vscode-panel-border);
                border-radius: 6px;
                text-align: center;
                transition: all 0.3s ease;
            }
            .network-node:hover {
                transform: scale(1.05);
                border-width: 3px;
            }
            .network-node.ingress {
                border-color: #4CAF50;
                animation: slideInLeft 0.6s ease-out 0.5s backwards;
            }
            .network-node.ingress:hover {
                box-shadow: 0 0 15px rgba(76, 175, 80, 0.5);
            }
            .network-node.pod {
                border-color: #2196F3;
                background: #2196F3;
                color: white;
                animation: pulse 2s ease-in-out infinite;
            }
            .network-node.egress {
                border-color: #FF9800;
                animation: slideInRight 0.6s ease-out 0.5s backwards;
            }
            .network-node.egress:hover {
                box-shadow: 0 0 15px rgba(255, 152, 0, 0.5);
            }
            .network-arrow {
                font-size: 28px;
                color: var(--vscode-textLink-foreground);
                animation: flowRight 2s ease-in-out infinite;
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
                margin-top: 6px;
                padding: 6px;
                background: var(--vscode-editor-background);
                border-radius: 3px;
            }
            
            /* Environment Variables */
            .env-section {
                margin: 20px 0;
                padding: 15px;
                background: var(--vscode-editorWidget-background);
                border-radius: 8px;
                animation: fadeInUp 1s ease-out 0.6s backwards;
            }
            .env-section-title {
                font-size: 16px;
                font-weight: bold;
                margin-bottom: 12px;
                text-align: center;
                color: #2196F3;
            }
            
            /* Container animations */
            .diagram-container {
                display: none;
            }
            .diagram-container.active {
                display: block;
                animation: fadeInUp 0.5s ease-out;
            }
            
            /* Hover effects for command blocks */
            code {
                transition: all 0.2s ease;
                display: inline-block;
                cursor: pointer;
            }
            code:hover {
                transform: translateX(5px);
                color: var(--vscode-textLink-activeForeground) !important;
            }
            
            /* Tooltip styling (native title attribute) */
            [title] {
                position: relative;
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
                        // Trigger animations on container elements
                        animateContainers(diagram);
                    }
                }
            }
            
            function animateContainers(diagram) {
                // Stagger container animations
                const containers = diagram.querySelectorAll('[data-container]');
                containers.forEach((container, idx) => {
                    container.style.animation = 'none';
                    setTimeout(() => {
                        container.style.animation = \`slideInLeft 0.4s ease-out \${idx * 0.1}s backwards\`;
                    }, 10);
                });
            }
            
            // Add tooltips to pods
            document.addEventListener('DOMContentLoaded', () => {
                document.querySelectorAll('.pod').forEach(pod => {
                    pod.addEventListener('mouseenter', function() {
                        this.style.animationPlayState = 'paused';
                    });
                    pod.addEventListener('mouseleave', function() {
                        this.style.animationPlayState = 'running';
                    });
                });
            });
        </script>
    </body>
    </html>`;
}

function renderDiagram(overlay: any, index: number): string {
    const namespace = 'shared-platform';
    const workloads = overlay.workloads || [];
    
    return `
        <div id="diagram-${index}" class="diagram-container">
            <div class="header">
                <span>🎯 ${overlay.name}</span>
                <span class="env-badge env-${overlay.environment}">${overlay.environment?.toUpperCase()}</span>
            </div>

            <div style="text-align: center; margin: 15px 0 20px; padding: 8px; background: var(--vscode-editorWidget-background); border-radius: 6px;">
                <strong>Namespace:</strong> <span style="font-family: monospace; color: var(--vscode-textLink-foreground);">${namespace}</span>
            </div>

            <!-- Pod View: Deployments -->
            <div class="architecture">
                ${workloads.map((workload: any) => `
                    <div class="deployment-box">
                        <div class="deployment-header">🚀 ${workload.type}</div>
                        <div style="text-align: center; font-size: 12px; font-weight: bold; color: var(--vscode-textLink-foreground); margin: 8px 0; font-family: monospace;">
                            ${workload.fullName}
                        </div>
                        
                        <div style="margin: 8px 0; padding: 8px; background: var(--vscode-editor-background); border-radius: 4px;">
                            <div style="font-size: 10px; font-weight: bold; margin-bottom: 6px; color: var(--vscode-descriptionForeground);">Containers:</div>
                            ${workload.containers.map((container: any, idx: number) => `
                                <div data-container style="display: flex; align-items: center; gap: 6px; padding: 3px 6px; margin: 2px 0; background: var(--vscode-editorWidget-background); border-radius: 3px; border-left: 2px solid ${container.type === 'main' ? '#4CAF50' : '#FF9800'}; transition: all 0.3s ease; cursor: pointer;" 
                                     onmouseover="this.style.transform='translateX(5px)'; this.style.borderLeftWidth='4px';" 
                                     onmouseout="this.style.transform='translateX(0)'; this.style.borderLeftWidth='2px';"
                                     title="${container.type === 'main' ? 'Main Application Container' : 'Sidecar: ' + container.purpose}">
                                    <span style="font-size: 14px; ${container.type === 'sidecar' ? 'animation: pulse 2s ease-in-out infinite;' : ''}">${container.icon}</span>
                                    <span style="font-size: 10px; font-family: monospace; flex: 1;">${container.name}</span>
                                    ${container.purpose ? `<span style="font-size: 9px; color: var(--vscode-descriptionForeground);">${container.purpose}</span>` : ''}
                                </div>
                            `).join('')}
                        </div>
                        
                        <div class="pods">
                            ${Array(Math.min(workload.replicas, 6)).fill(0).map((_, i) => `
                                <div class="pod">
                                    <div class="pod-icon">📦</div>
                                    <div class="pod-label">${workload.containers.length}c</div>
                                </div>
                            `).join('')}
                            ${workload.replicas > 6 ? `<div class="pod" style="background: #FF9800;">+${workload.replicas - 6}</div>` : ''}
                        </div>
                        <div class="deployment-info">
                            <div class="info-item">
                                <span class="info-label">Replicas:</span>
                                <span class="info-value">${workload.replicas}</span>
                            </div>
                            <div class="info-item">
                                <span class="info-label">Containers:</span>
                                <span class="info-value">${workload.containers.length}</span>
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>

            <!-- Network View -->
            ${renderNetworkFlow(overlay)}

            <!-- Environment View -->
            ${renderEnvironmentVariables(overlay.envVars)}

            <!-- Kubectl Commands -->
            ${renderKubectlCommands(overlay, namespace, workloads)}
        </div>
    `;
}

function renderKubectlCommands(overlay: any, namespace: string, workloads: any[]): string {
    const client = overlay.client;
    
    return `
        <div class="network-diagram" style="margin: 20px 0;">
            <div class="network-title">⌨️ Kubectl Commands</div>
            <div style="background: var(--vscode-editor-background); padding: 12px; border-radius: 8px; margin-top: 12px;">
                
                <!-- Pod Commands -->
                <div style="margin-bottom: 15px;">
                    <div style="font-size: 12px; font-weight: bold; margin-bottom: 8px; color: var(--vscode-textLink-foreground);">📦 Pod Operations</div>
                    <div style="display: grid; gap: 6px;">
                        <div style="padding: 6px 10px; background: var(--vscode-editorWidget-background); border-radius: 4px;">
                            <div style="font-size: 10px; color: var(--vscode-descriptionForeground); margin-bottom: 3px;">List all deployments:</div>
                            <code style="font-family: monospace; font-size: 11px; color: var(--vscode-textLink-foreground);">kubectl get deploy -n ${namespace} -l client=${client}</code>
                        </div>
                        <div style="padding: 6px 10px; background: var(--vscode-editorWidget-background); border-radius: 4px;">
                            <div style="font-size: 10px; color: var(--vscode-descriptionForeground); margin-bottom: 3px;">List all pods:</div>
                            <code style="font-family: monospace; font-size: 11px; color: var(--vscode-textLink-foreground);">kubectl get pods -n ${namespace} -l client=${client} -o wide</code>
                        </div>
                        ${workloads.slice(0, 1).map((workload: any) => `
                        <div style="padding: 6px 10px; background: var(--vscode-editorWidget-background); border-radius: 4px;">
                            <div style="font-size: 10px; color: var(--vscode-descriptionForeground); margin-bottom: 3px;">Describe ${workload.name} deployment:</div>
                            <code style="font-family: monospace; font-size: 11px; color: var(--vscode-textLink-foreground);">kubectl describe deploy ${workload.fullName} -n ${namespace}</code>
                        </div>
                        <div style="padding: 6px 10px; background: var(--vscode-editorWidget-background); border-radius: 4px;">
                            <div style="font-size: 10px; color: var(--vscode-descriptionForeground); margin-bottom: 3px;">Scale ${workload.name}:</div>
                            <code style="font-family: monospace; font-size: 11px; color: var(--vscode-textLink-foreground);">kubectl scale deploy ${workload.fullName} --replicas=10 -n ${namespace}</code>
                        </div>
                        `).join('')}
                    </div>
                </div>
                
                <!-- Network Commands -->
                <div style="margin-bottom: 15px;">
                    <div style="font-size: 12px; font-weight: bold; margin-bottom: 8px; color: #FF9800;">🌐 Network Operations</div>
                    <div style="display: grid; gap: 6px;">
                        <div style="padding: 6px 10px; background: var(--vscode-editorWidget-background); border-radius: 4px;">
                            <div style="font-size: 10px; color: var(--vscode-descriptionForeground); margin-bottom: 3px;">List network policies:</div>
                            <code style="font-family: monospace; font-size: 11px; color: var(--vscode-textLink-foreground);">kubectl get networkpolicies -n ${namespace}</code>
                        </div>
                        <div style="padding: 6px 10px; background: var(--vscode-editorWidget-background); border-radius: 4px;">
                            <div style="font-size: 10px; color: var(--vscode-descriptionForeground); margin-bottom: 3px;">Describe network policy:</div>
                            <code style="font-family: monospace; font-size: 11px; color: var(--vscode-textLink-foreground);">kubectl describe netpol -n ${namespace}</code>
                        </div>
                        <div style="padding: 6px 10px; background: var(--vscode-editorWidget-background); border-radius: 4px;">
                            <div style="font-size: 10px; color: var(--vscode-descriptionForeground); margin-bottom: 3px;">List services:</div>
                            <code style="font-family: monospace; font-size: 11px; color: var(--vscode-textLink-foreground);">kubectl get svc -n ${namespace} -l client=${client}</code>
                        </div>
                    </div>
                </div>
                
                <!-- Logging Commands -->
                <div style="margin-bottom: 15px;">
                    <div style="font-size: 12px; font-weight: bold; margin-bottom: 8px; color: #4CAF50;">📝 Logging Operations</div>
                    <div style="display: grid; gap: 6px;">
                        ${workloads.slice(0, 1).map((workload: any) => `
                        <div style="padding: 6px 10px; background: var(--vscode-editorWidget-background); border-radius: 4px;">
                            <div style="font-size: 10px; color: var(--vscode-descriptionForeground); margin-bottom: 3px;">View ${workload.name} logs (main container):</div>
                            <code style="font-family: monospace; font-size: 11px; color: var(--vscode-textLink-foreground);">kubectl logs -n ${namespace} -l app=${workload.name} -c ${workload.name} --tail=100</code>
                        </div>
                        <div style="padding: 6px 10px; background: var(--vscode-editorWidget-background); border-radius: 4px;">
                            <div style="font-size: 10px; color: var(--vscode-descriptionForeground); margin-bottom: 3px;">View sidecar logs (fluentd):</div>
                            <code style="font-family: monospace; font-size: 11px; color: var(--vscode-textLink-foreground);">kubectl logs -n ${namespace} -l app=${workload.name} -c fluentd-sidecar --tail=50</code>
                        </div>
                        <div style="padding: 6px 10px; background: var(--vscode-editorWidget-background); border-radius: 4px;">
                            <div style="font-size: 10px; color: var(--vscode-descriptionForeground); margin-bottom: 3px;">Stream logs (all containers):</div>
                            <code style="font-family: monospace; font-size: 11px; color: var(--vscode-textLink-foreground);">kubectl logs -n ${namespace} -l app=${workload.name} --all-containers -f</code>
                        </div>
                        `).join('')}
                    </div>
                </div>
                
                <!-- Debug Commands -->
                <div>
                    <div style="font-size: 12px; font-weight: bold; margin-bottom: 8px; color: #9C27B0;">🔍 Debug Operations</div>
                    <div style="display: grid; gap: 6px;">
                        ${workloads.slice(0, 1).map((workload: any) => `
                        <div style="padding: 6px 10px; background: var(--vscode-editorWidget-background); border-radius: 4px;">
                            <div style="font-size: 10px; color: var(--vscode-descriptionForeground); margin-bottom: 3px;">Exec into pod:</div>
                            <code style="font-family: monospace; font-size: 11px; color: var(--vscode-textLink-foreground);">kubectl exec -it -n ${namespace} \$(kubectl get pod -n ${namespace} -l app=${workload.name} -o name | head -1) -- /bin/sh</code>
                        </div>
                        `).join('')}
                        <div style="padding: 6px 10px; background: var(--vscode-editorWidget-background); border-radius: 4px;">
                            <div style="font-size: 10px; color: var(--vscode-descriptionForeground); margin-bottom: 3px;">View ConfigMaps:</div>
                            <code style="font-family: monospace; font-size: 11px; color: var(--vscode-textLink-foreground);">kubectl get cm -n ${namespace}</code>
                        </div>
                        <div style="padding: 6px 10px; background: var(--vscode-editorWidget-background); border-radius: 4px;">
                            <div style="font-size: 10px; color: var(--vscode-descriptionForeground); margin-bottom: 3px;">View events:</div>
                            <code style="font-family: monospace; font-size: 11px; color: var(--vscode-textLink-foreground);">kubectl get events -n ${namespace} --sort-by='.lastTimestamp'</code>
                        </div>
                        <div style="padding: 6px 10px; background: var(--vscode-editorWidget-background); border-radius: 4px;">
                            <div style="font-size: 10px; color: var(--vscode-descriptionForeground); margin-bottom: 3px;">Port forward:</div>
                            <code style="font-family: monospace; font-size: 11px; color: var(--vscode-textLink-foreground);">kubectl port-forward -n ${namespace} svc/${client}-api 8080:8080</code>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function renderEnvironmentVariables(envVars: any): string {
    if (!envVars) return '';
    
    return `
        <div class="env-section">
            <div class="env-section-title">⚙️ Environment Variables</div>
            <div style="display: flex; gap: 12px; margin-top: 12px;">
                ${renderEnvVarSection('Common', envVars.common, '#4CAF50')}
                ${renderEnvVarSection('Client', envVars.client, '#2196F3')}
                ${renderEnvVarSection('Environment', envVars.environment, '#FF9800')}
            </div>
        </div>
    `;
}

function renderEnvVarSection(title: string, vars: any, color: string): string {
    if (!vars || Object.keys(vars).length === 0) return '';
    
    return `
        <div style="flex: 1; background: var(--vscode-editor-background); border: 2px solid ${color}; border-radius: 6px; padding: 10px;">
            <div style="font-weight: bold; margin-bottom: 8px; color: ${color}; font-size: 11px;">${title}</div>
            <div style="font-size: 10px; font-family: monospace;">
                ${Object.entries(vars).map(([key, value]) => `
                    <div style="padding: 2px 0; display: flex; justify-content: space-between; gap: 8px;">
                        <span style="color: var(--vscode-symbolIcon-variableForeground);">${key}</span>
                        <span style="color: var(--vscode-descriptionForeground);">= ${value}</span>
                    </div>
                `).join('')}
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
            
            ${policy.ingress.length > 0 ? `
                <div class="network-flow">
                    <div class="network-node ingress">
                        <div style="font-size: 28px;">🌐</div>
                        <div style="font-weight: bold; margin-top: 6px; font-size: 11px;">Ingress</div>
                        <div class="network-details">
                            ${policy.ingress.map((rule: string) => `
                                <div style="margin: 2px 0;">• ${rule}</div>
                            `).join('')}
                        </div>
                    </div>
                    <div class="network-arrow arrow-green">→</div>
                    <div class="network-node pod">
                        <div style="font-size: 28px;">📦</div>
                        <div style="font-weight: bold; margin-top: 6px; font-size: 11px;">Pods</div>
                    </div>
                </div>
            ` : ''}

            ${policy.egress.length > 0 ? `
                <div class="network-flow">
                    <div class="network-node pod">
                        <div style="font-size: 28px;">📦</div>
                        <div style="font-weight: bold; margin-top: 6px; font-size: 11px;">Pods</div>
                    </div>
                    <div class="network-arrow arrow-orange">→</div>
                    <div class="network-node egress">
                        <div style="font-size: 28px;">🔗</div>
                        <div style="font-weight: bold; margin-top: 6px; font-size: 11px;">Egress</div>
                        <div class="network-details">
                            ${policy.egress.map((rule: string) => `
                                <div style="margin: 2px 0;">• ${rule}</div>
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
    if (tier.namePrefix) {
        items.push(`🔤 Prefix: ${tier.namePrefix}`);
    }
    if (tier.additionalWorkloads) {
        items.push(`➕ Adds: ${tier.additionalWorkloads.join(', ')}`);
    }
    if (tier.namespace) {
        items.push(`📦 Namespace: ${tier.namespace}`);
    }
    if (tier.patches) {
        items.push(`📝 Patches: ${tier.patches.length} files`);
    }
    if (tier.environment) {
        items.push(`🌍 Environment: ${tier.environment}`);
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
