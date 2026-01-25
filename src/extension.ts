import * as vscode from 'vscode';
import { KustomizeTreeDataProvider } from './kustomizeTreeProvider';
import { KustomizeParser } from './kustomizeParser';

let currentPanel: vscode.WebviewPanel | undefined;
let fileWatcher: vscode.FileSystemWatcher | undefined;

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
            await showVisualization(parser, context);
        }
    );

    const refreshCommand = vscode.commands.registerCommand(
        'kustomize-visualizer.refresh',
        () => {
            treeDataProvider.refresh();
        }
    );

    // Command to open YAML file at specific line
    const openFileCommand = vscode.commands.registerCommand(
        'kustomize-visualizer.openFile',
        async (filePath: string) => {
            const uri = vscode.Uri.file(filePath);
            const document = await vscode.workspace.openTextDocument(uri);
            await vscode.window.showTextDocument(document);
        }
    );

    context.subscriptions.push(treeView, visualizeCommand, refreshCommand, openFileCommand);
}

async function showVisualization(parser: KustomizeParser, context: vscode.ExtensionContext) {
    // Reuse existing panel if available
    if (currentPanel) {
        currentPanel.reveal(vscode.ViewColumn.One);
    } else {
        currentPanel = vscode.window.createWebviewPanel(
            'kustomizeVisualization',
            'Kustomize Overlay Visualization',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: []
            }
        );

        // Handle panel disposal
        currentPanel.onDidDispose(() => {
            currentPanel = undefined;
            if (fileWatcher) {
                fileWatcher.dispose();
                fileWatcher = undefined;
            }
        });

        // Handle messages from webview
        currentPanel.webview.onDidReceiveMessage(
            async message => {
                switch (message.command) {
                    case 'openFile':
                        await vscode.commands.executeCommand('kustomize-visualizer.openFile', message.filePath);
                        break;
                    case 'copyCommand':
                        await vscode.env.clipboard.writeText(message.text);
                        vscode.window.showInformationMessage('Command copied to clipboard!');
                        break;
                    case 'exportImage':
                        // Handle image export
                        const buffer = Buffer.from(message.imageData.split(',')[1], 'base64');
                        const options: vscode.SaveDialogOptions = {
                            defaultUri: vscode.Uri.file(`kustomize-${message.overlayName}-${Date.now()}.${message.format}`),
                            filters: {
                                'Images': message.format === 'png' ? ['png'] : ['jpg', 'jpeg']
                            }
                        };
                        const fileUri = await vscode.window.showSaveDialog(options);
                        if (fileUri) {
                            const fs = require('fs').promises;
                            await fs.writeFile(fileUri.fsPath, buffer);
                            vscode.window.showInformationMessage(`Diagram exported to ${fileUri.fsPath}`);
                        }
                        break;
                }
            },
            undefined,
            context.subscriptions
        );
    }

    // Load and display content
    await refreshVisualization(currentPanel, parser);

    // Setup file watcher for auto-refresh
    setupFileWatcher(currentPanel, parser);
}

async function refreshVisualization(panel: vscode.WebviewPanel, parser: KustomizeParser) {
    const projects = await parser.findKustomizeProjects();

    // Parse all overlays with their inheritance chain
    const overlayDetails = await parseAllOverlays(parser, projects);

    panel.webview.html = getWebviewContent(overlayDetails);
}

function setupFileWatcher(panel: vscode.WebviewPanel, parser: KustomizeParser) {
    // Dispose existing watcher
    if (fileWatcher) {
        fileWatcher.dispose();
    }

    // Watch for YAML file changes
    fileWatcher = vscode.workspace.createFileSystemWatcher('**/*.{yaml,yml}');

    let refreshTimeout: NodeJS.Timeout | undefined;

    const scheduleRefresh = () => {
        if (refreshTimeout) {
            clearTimeout(refreshTimeout);
        }
        // Debounce: wait 500ms after last change before refreshing
        refreshTimeout = setTimeout(() => {
            refreshVisualization(panel, parser);
        }, 500);
    };

    fileWatcher.onDidChange(scheduleRefresh);
    fileWatcher.onDidCreate(scheduleRefresh);
    fileWatcher.onDidDelete(scheduleRefresh);
}

async function parseAllOverlays(parser: KustomizeParser, projects: any[]): Promise<any[]> {
    const overlays: any[] = [];

    for (const project of projects) {
        if (project.overlays) {
            for (const overlay of project.overlays) {
                const details = await analyzeOverlay(parser, overlay, project);
                overlays.push(details);
            }
        }
    }

    return overlays;
}

async function analyzeOverlay(parser: KustomizeParser, overlay: any, project: any): Promise<any> {
    const path = require('path');
    const overlayPath = overlay.path;
    const overlayDir = path.dirname(overlayPath);

    // Parse overlay name (e.g., client-a/dev)
    const parts = overlayDir.split(path.sep);
    const clientIdx = parts.findIndex((p: string) => p.startsWith('client-'));
    const client = clientIdx >= 0 ? parts[clientIdx] : 'unknown';
    const env = clientIdx >= 0 && parts[clientIdx + 1] ? parts[clientIdx + 1] : 'unknown';

    // Parse all resources dynamically
    const workloads = await getWorkloads(overlay, client, env);
    const configMaps = await parser.parseConfigMaps(overlay.path);
    const networkPolicies = await parser.parseNetworkPolicies(overlay.path);
    const services = await parser.parseServices(overlay.path);

    // Validate configuration
    const validationIssues = await parser.validateOverlay(overlay.path);
    console.log(`[Validation] Found ${validationIssues.length} issues for ${overlay.path}`);
    
    // Map validation issues to workloads
    const issuesByDeployment = new Map<string, any[]>();
    for (const issue of validationIssues) {
        console.log(`[Validation] Issue: ${issue.severity} - ${issue.resource} - ${issue.message}`);
        // Extract deployment name from resource string (e.g., "Deployment: api / Container: main")
        const match = issue.resource.match(/Deployment:\s*([^\s\/]+)/);
        if (match) {
            const deploymentName = match[1];
            if (!issuesByDeployment.has(deploymentName)) {
                issuesByDeployment.set(deploymentName, []);
            }
            issuesByDeployment.get(deploymentName)!.push(issue);
            console.log(`[Validation] Mapped to deployment: ${deploymentName}`);
        }
    }

    // Add validation issues to each workload
    workloads.forEach(workload => {
        workload.validationIssues = issuesByDeployment.get(workload.name) || [];
        console.log(`[Validation] Workload ${workload.name} has ${workload.validationIssues.length} issues`);
    });

    // Organize ConfigMaps by scope
    const envVars = organizeConfigMaps(configMaps, overlay);

    // Get namespace for kubectl commands
    const namespace = overlay.content?.namespace || 'default';

    // Get base contributions
    const baseContributions = project.base ? {
        resources: project.base.resources || [],
        provides: 'Core deployment templates and shared config'
    } : null;

    // Get client base contributions
    const clientBaseContributions = {
        client: client,
        namePrefix: overlay.content?.namePrefix || `${client}-`,
        namespace: namespace,
        networkPolicies: networkPolicies
    };

    // Get overlay contributions
    const overlayContributions = {
        namespace: namespace,
        patches: overlay.patches || [],
        environment: env.toUpperCase(),
        configMaps: configMaps.filter(cm => cm.name.includes('env') || cm.name === 'env-config')
    };

    return {
        name: `${client} / ${env}`,
        client,
        environment: env,
        namespace,
        path: overlayPath,
        workloads: workloads,
        envVars: envVars,
        networkPolicies: networkPolicies,
        services: services,
        validationIssues: validationIssues,
        tier1: baseContributions,
        tier2: clientBaseContributions,
        tier3: overlayContributions
    };
}

function organizeConfigMaps(configMaps: any[], overlay: any): any {
    const organized: any = {
        common: {},
        client: {},
        environment: {}
    };

    // Categorize ConfigMaps by name patterns
    for (const cm of configMaps) {
        if (cm.name.includes('common')) {
            Object.assign(organized.common, cm.data);
        } else if (cm.name.includes('client')) {
            Object.assign(organized.client, cm.data);
        } else if (cm.name.includes('env')) {
            Object.assign(organized.environment, cm.data);
        } else {
            // Default to common if unclear
            Object.assign(organized.common, cm.data);
        }
    }

    // Also check for generated ConfigMaps in the overlay
    const generators = overlay.content?.configMapGenerator || [];
    for (const generator of generators) {
        if (generator.literals) {
            const data: { [key: string]: string } = {};
            generator.literals.forEach((literal: string) => {
                const [key, ...valueParts] = literal.split('=');
                data[key] = valueParts.join('=');
            });

            if (generator.name.includes('env')) {
                Object.assign(organized.environment, data);
            } else if (generator.name.includes('client')) {
                Object.assign(organized.client, data);
            } else {
                Object.assign(organized.common, data);
            }
        }
    }

    return organized;
}

async function getWorkloads(overlay: any, client: string, env: string): Promise<any[]> {
    const parser = new KustomizeParser();
    const fs = require('fs').promises;

    // Parse deployments from the overlay path (includes base inheritance)
    const deployments = await parser.parseDeployments(overlay.path);

    // Convert parsed deployments to workload format
    const workloads = await Promise.all(deployments.map(async deployment => {
        const namePrefix = overlay.content?.namePrefix || '';
        const fullName = deployment.name.startsWith(namePrefix) ? deployment.name : `${namePrefix}${deployment.name}`;

        // Extract resource information from first main container
        const mainContainer = deployment.containers.find(c => c.type === 'main');
        const resources = mainContainer?.resources || deployment.resources || {};

        // Read the actual YAML file content
        let yamlContent = '';
        try {
            if (deployment.filePath) {
                yamlContent = await fs.readFile(deployment.filePath, 'utf8');
            }
        } catch (error) {
            yamlContent = '# Error reading file';
        }

        return {
            name: deployment.name,
            fullName: fullName,
            replicas: deployment.replicas,
            type: inferWorkloadType(deployment.name),
            resources: {
                cpu: resources.limits?.cpu || 'N/A',
                memory: resources.limits?.memory || 'N/A',
                cpuRequest: resources.requests?.cpu || 'N/A',
                memoryRequest: resources.requests?.memory || 'N/A'
            },
            containers: deployment.containers,
            filePath: deployment.filePath,  // Include file path for click-to-edit
            yamlContent: yamlContent  // Include full YAML content for tooltip
        };
    }));

    return workloads;
}

function inferWorkloadType(deploymentName: string): string {
    const nameLower = deploymentName.toLowerCase();
    if (nameLower.includes('api')) return 'Backend API';
    if (nameLower.includes('worker') || nameLower.includes('job')) return 'Job Processor';
    if (nameLower.includes('frontend') || nameLower.includes('web') || nameLower.includes('ui')) return 'Web Frontend';
    if (nameLower.includes('analytics') || nameLower.includes('data')) return 'Analytics Engine';
    if (nameLower.includes('database') || nameLower.includes('db')) return 'Database';
    if (nameLower.includes('cache') || nameLower.includes('redis')) return 'Cache';
    return 'Service';
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
        <!-- html2canvas for export functionality -->
        <script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
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
                position: relative;
                
                animation: slideInLeft 0.6s ease-out;
            }
            .deployment-box::after {
                content: '👁️ Click to view';
                position: absolute;
                top: 10px;
                right: 15px;
                font-size: 10px;
                color: var(--vscode-descriptionForeground);
                background: var(--vscode-editor-background);
                padding: 4px 8px;
                border-radius: 4px;
                opacity: 0;
                pointer-events: none;
                transition: opacity 0.2s;
            }
            .deployment-box:hover {
                transform: translateY(-5px);
                box-shadow: 0 8px 16px rgba(33, 150, 243, 0.3);
                border-color: #64B5F6;
            }
            .deployment-box:hover::after {
                opacity: 0.8;
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
                min-height: 100vh;
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
        <!-- Hover Tooltip Container - Centered Modal -->
        <div id="hover-tooltip" style="
            position: fixed;
            display: none;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: var(--vscode-editorWidget-background);
            border: 2px solid var(--vscode-widget-border);
            border-radius: 8px;
            box-shadow: 0 8px 24px rgba(0,0,0,0.5);
            z-index: 10000;
            width: 70vw;
            max-width: 900px;
            max-height: 80vh;
        "></div>
        
        <!-- Backdrop for modal -->
        <div id="tooltip-backdrop" style="
            position: fixed;
            display: none;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.5);
            z-index: 9999;
        " onclick="hideTooltip()"></div>

        <div class="controls">
            <label for="overlay-select">📦 Select Overlay to Visualize:</label>
            <select id="overlay-select" onchange="showDiagram(this.value)">
                <option value="">-- Choose an overlay --</option>
                ${overlayOptions.map((opt, idx) => `
                    <option value="${idx}">${opt.label}</option>
                `).join('')}
            </select>
            
            <!-- Export Buttons -->
            <div style="display: inline-block; margin-left: 20px;">
                <button onclick="exportDiagram('png')" 
                        style="background: #4CAF50; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-size: 12px; margin-right: 8px;">
                    📸 Export PNG
                </button>
                <button onclick="exportDiagram('jpg')" 
                        style="background: #2196F3; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-size: 12px;">
                    📸 Export JPG
                </button>
            </div>
        </div>

        ${overlays.map((overlay, idx) => renderDiagram(overlay, idx)).join('')}

        <script>
            const vscode = acquireVsCodeApi();
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

            // Hover tooltip functionality - Modal style
            let tooltipHideTimer;
            
            function showTooltip(element, event) {
                clearTimeout(tooltipHideTimer);
                const tooltip = document.getElementById('hover-tooltip');
                const backdrop = document.getElementById('tooltip-backdrop');
                if (!tooltip || !backdrop || !element.dataset.workload) return;
                
                const workload = JSON.parse(element.dataset.workload);
                const issues = workload.validationIssues || [];
                const errors = issues.filter(i => i.severity === 'error');
                const warnings = issues.filter(i => i.severity === 'warning');
                
                // Escape HTML in YAML content
                const yamlHtml = (workload.yamlContent || '# No content available')
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;');
                
                // Render validation issues
                let issuesHtml = '';
                if (issues.length > 0) {
                    issuesHtml = \`
                        <div style="margin-bottom: 16px; padding: 12px; background: var(--vscode-inputValidation-errorBackground); border-left: 4px solid #f44336; border-radius: 4px;">
                            <div style="font-size: 14px; font-weight: bold; margin-bottom: 12px; color: #f44336;">⚠️ VALIDATION ISSUES</div>
                            \${errors.map(issue => \`
                                <div style="margin-bottom: 12px; padding: 10px; background: rgba(244, 67, 54, 0.1); border-radius: 4px; border-left: 3px solid #f44336;">
                                    <div style="display: flex; justify-content: space-between; align-items: start;">
                                        <div style="flex: 1;">
                                            <div style="font-size: 12px; font-weight: bold; color: #f44336; margin-bottom: 4px;">❌ ERROR: \${issue.resource}</div>
                                            <div style="font-size: 11px; color: var(--vscode-foreground); line-height: 1.5;">\${issue.message}</div>
                                        </div>
                                        <button onclick="event.stopPropagation(); editDeployment('\${issue.filePath.replace(/\\\\/g, '\\\\\\\\').replace(/'/g, "\\\\'")}');"
                                                style="background: #f44336; color: white; border: none; padding: 4px 10px; border-radius: 3px; cursor: pointer; font-size: 10px; white-space: nowrap; margin-left: 10px;">
                                            🔧 Fix
                                        </button>
                                    </div>
                                </div>
                            \`).join('')}
                            \${warnings.map(issue => \`
                                <div style="margin-bottom: 12px; padding: 10px; background: rgba(255, 152, 0, 0.1); border-radius: 4px; border-left: 3px solid #FF9800;">
                                    <div style="display: flex; justify-content: space-between; align-items: start;">
                                        <div style="flex: 1;">
                                            <div style="font-size: 12px; font-weight: bold; color: #FF9800; margin-bottom: 4px;">⚠️ WARNING: \${issue.resource}</div>
                                            <div style="font-size: 11px; color: var(--vscode-foreground); line-height: 1.5;">\${issue.message}</div>
                                        </div>
                                        <button onclick="event.stopPropagation(); editDeployment('\${issue.filePath.replace(/\\\\/g, '\\\\\\\\').replace(/'/g, "\\\\'")}');"
                                                style="background: #FF9800; color: white; border: none; padding: 4px 10px; border-radius: 3px; cursor: pointer; font-size: 10px; white-space: nowrap; margin-left: 10px;">
                                            🔧 Fix
                                        </button>
                                    </div>
                                </div>
                            \`).join('')}
                        </div>
                    \`;
                }
                
                tooltip.innerHTML = \`
                    <div style="display: flex; flex-direction: column; height: 100%; max-height: 80vh;">
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 16px; background: var(--vscode-editor-background); border-bottom: 2px solid var(--vscode-panel-border); border-radius: 8px 8px 0 0;">
                            <div>
                                <strong style="font-size: 16px; color: var(--vscode-textLink-foreground);">\${workload.fullName}</strong>
                                <div style="font-size: 11px; color: var(--vscode-descriptionForeground); margin-top: 4px;">
                                    <strong>File:</strong> \${workload.filePath.split(/[\\\\\/]/).pop()}
                                </div>
                            </div>
                            <div style="display: flex; gap: 8px; align-items: center;">
                                <button onclick="event.stopPropagation(); editDeployment('\${workload.filePath.replace(/\\\\/g, '\\\\\\\\').replace(/'/g, "\\\\'")}');" 
                                        style="background: #007ACC; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: bold;">
                                    ✏️ Edit Deployment
                                </button>
                                <button onclick="hideTooltip();" 
                                        style="background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-size: 12px;">
                                    ✕ Close
                                </button>
                            </div>
                        </div>
                        <div style="flex: 1; overflow-y: auto; padding: 16px;">
                            \${issuesHtml}
                            <div style="font-size: 14px; font-weight: bold; margin-bottom: 8px; color: var(--vscode-textLink-foreground);">📄 YAML CONTENT</div>
                            <div style="background: var(--vscode-textCodeBlock-background); padding: 12px; border-radius: 4px; font-family: 'Courier New', Consolas, monospace; font-size: 12px; white-space: pre-wrap; line-height: 1.6; overflow-x: auto;">
                                <code style="color: var(--vscode-editor-foreground);">\${yamlHtml}</code>
                            </div>
                        </div>
                    </div>
                \`;
                
                // Show modal
                backdrop.style.display = 'block';
                tooltip.style.display = 'block';
                
                // Prevent tooltip from closing when interacting with it
                tooltip.onclick = (e) => e.stopPropagation();
            }

            function hideTooltip() {
                clearTimeout(tooltipHideTimer);
                const tooltip = document.getElementById('hover-tooltip');
                const backdrop = document.getElementById('tooltip-backdrop');
                if (tooltip) tooltip.style.display = 'none';
                if (backdrop) backdrop.style.display = 'none';
            }

            function editDeployment(filePath) {
                if (!filePath) return;
                vscode.postMessage({
                    command: 'openFile',
                    filePath: filePath
                });
            }

            function copyCommand(command) {
                vscode.postMessage({
                    command: 'copyCommand',
                    text: command
                });
            }

            // Show all validation issues in a modal
            function showAllValidationIssues(overlayIndex) {
                const overlay = overlaysData[overlayIndex];
                const allIssues = overlay.validationIssues || [];
                const errors = allIssues.filter(i => i.severity === 'error');
                const warnings = allIssues.filter(i => i.severity === 'warning');
                
                const tooltip = document.getElementById('hover-tooltip');
                const backdrop = document.getElementById('tooltip-backdrop');
                if (!tooltip || !backdrop) return;
                
                tooltip.innerHTML = \`
                    <div style="display: flex; flex-direction: column; height: 100%; max-height: 80vh;">
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 16px; background: var(--vscode-editor-background); border-bottom: 2px solid var(--vscode-panel-border); border-radius: 8px 8px 0 0;">
                            <div>
                                <strong style="font-size: 16px; color: var(--vscode-textLink-foreground);">Validation Report</strong>
                                <div style="font-size: 11px; color: var(--vscode-descriptionForeground); margin-top: 4px;">
                                    \${overlay.name} - \${errors.length} errors, \${warnings.length} warnings
                                </div>
                            </div>
                            <button onclick="hideTooltip();" 
                                    style="background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-size: 12px;">
                                ✕ Close
                            </button>
                        </div>
                        <div style="flex: 1; overflow-y: auto; padding: 16px;">
                            \${errors.length > 0 ? \`
                                <div style="margin-bottom: 20px;">
                                    <div style="font-size: 14px; font-weight: bold; margin-bottom: 12px; color: #f44336;">❌ ERRORS (\${errors.length})</div>
                                    \${errors.map(issue => \`
                                        <div style="margin-bottom: 12px; padding: 12px; background: rgba(244, 67, 54, 0.1); border-radius: 4px; border-left: 4px solid #f44336;">
                                            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
                                                <div style="font-size: 12px; font-weight: bold; color: #f44336;">\${issue.resource}</div>
                                                <button onclick="event.stopPropagation(); editDeployment('\${issue.filePath.replace(/\\\\/g, '\\\\\\\\').replace(/'/g, "\\\\'")}');"
                                                        style="background: #f44336; color: white; border: none; padding: 4px 10px; border-radius: 3px; cursor: pointer; font-size: 10px; white-space: nowrap;">
                                                    🔧 Fix
                                                </button>
                                            </div>
                                            <div style="font-size: 11px; color: var(--vscode-foreground); line-height: 1.5;">\${issue.message}</div>
                                            <div style="font-size: 10px; color: var(--vscode-descriptionForeground); margin-top: 4px;">📄 \${issue.filePath.split(/[\\\\\/]/).pop()}</div>
                                        </div>
                                    \`).join('')}
                                </div>
                            \` : ''}
                            \${warnings.length > 0 ? \`
                                <div style="margin-bottom: 20px;">
                                    <div style="font-size: 14px; font-weight: bold; margin-bottom: 12px; color: #FF9800;">⚠️ WARNINGS (\${warnings.length})</div>
                                    \${warnings.map(issue => \`
                                        <div style="margin-bottom: 12px; padding: 12px; background: rgba(255, 152, 0, 0.1); border-radius: 4px; border-left: 4px solid #FF9800;">
                                            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
                                                <div style="font-size: 12px; font-weight: bold; color: #FF9800;">\${issue.resource}</div>
                                                <button onclick="event.stopPropagation(); editDeployment('\${issue.filePath.replace(/\\\\/g, '\\\\\\\\').replace(/'/g, "\\\\'")}');"
                                                        style="background: #FF9800; color: white; border: none; padding: 4px 10px; border-radius: 3px; cursor: pointer; font-size: 10px; white-space: nowrap;">
                                                    🔧 Fix
                                                </button>
                                            </div>
                                            <div style="font-size: 11px; color: var(--vscode-foreground); line-height: 1.5;">\${issue.message}</div>
                                            <div style="font-size: 10px; color: var(--vscode-descriptionForeground); margin-top: 4px;">📄 \${issue.filePath.split(/[\\\\\/]/).pop()}</div>
                                        </div>
                                    \`).join('')}
                                </div>
                            \` : ''}
                            \${errors.length === 0 && warnings.length === 0 ? \`
                                <div style="text-align: center; padding: 40px; color: var(--vscode-descriptionForeground);">
                                    <div style="font-size: 48px; margin-bottom: 16px;">🟢</div>
                                    <div style="font-size: 16px; font-weight: bold; color: #4CAF50;">All Checks Passed!</div>
                                    <div style="font-size: 12px; margin-top: 8px;">No validation issues found in this overlay.</div>
                                </div>
                            \` : ''}
                        </div>
                    </div>
                \`;
                
                backdrop.style.display = 'block';
                tooltip.style.display = 'block';
                tooltip.onclick = (e) => e.stopPropagation();
            }

            // Export diagram to PNG/JPG
            async function exportDiagram(format) {
                const select = document.getElementById('overlay-select');
                const selectedIndex = select.value;
                
                if (!selectedIndex) {
                    alert('Please select an overlay first!');
                    return;
                }
                
                const diagramContainer = document.getElementById('diagram-' + selectedIndex);
                if (!diagramContainer || !diagramContainer.classList.contains('active')) {
                    alert('Please make sure the diagram is visible!');
                    return;
                }
                
                // Show loading message
                const button = event.target;
                const originalText = button.textContent;
                button.textContent = '⏳ Exporting...';
                button.disabled = true;
                
                try {
                    // Hide tooltips and modals before export
                    const tooltip = document.getElementById('hover-tooltip');
                    const backdrop = document.getElementById('tooltip-backdrop');
                    if (tooltip) tooltip.style.display = 'none';
                    if (backdrop) backdrop.style.display = 'none';
                    
                    // Temporarily change architecture layout for export (flexbox issues with html2canvas)
                    const architecture = diagramContainer.querySelector('.architecture');
                    const originalDisplay = architecture ? architecture.style.display : '';
                    const originalFlexDirection = architecture ? architecture.style.flexDirection : '';
                    
                    if (architecture) {
                        architecture.style.display = 'block';
                        architecture.style.flexDirection = '';
                        
                        // Make deployment boxes stack vertically for export
                        const deploymentBoxes = architecture.querySelectorAll('.deployment-box');
                        const originalStyles = [];
                        deploymentBoxes.forEach((box, idx) => {
                            originalStyles[idx] = {
                                display: box.style.display,
                                marginBottom: box.style.marginBottom
                            };
                            box.style.display = 'block';
                            box.style.marginBottom = '30px';
                        });
                    }
                    
                    // Scroll to top and wait for layout
                    window.scrollTo(0, 0);
                    await new Promise(resolve => setTimeout(resolve, 500));
                    
                    console.log('Capturing diagram:', {
                        width: diagramContainer.offsetWidth,
                        height: diagramContainer.offsetHeight,
                        scrollWidth: diagramContainer.scrollWidth,
                        scrollHeight: diagramContainer.scrollHeight
                    });
                    
                    // Capture with simplified options
                    const canvas = await html2canvas(diagramContainer, {
                        backgroundColor: '#1e1e1e',
                        scale: 2,
                        logging: false,
                        useCORS: true,
                        allowTaint: false
                    });
                    
                    // Restore original layout
                    if (architecture) {
                        architecture.style.display = originalDisplay;
                        architecture.style.flexDirection = originalFlexDirection;
                        
                        const deploymentBoxes = architecture.querySelectorAll('.deployment-box');
                        const originalStyles = [];
                        deploymentBoxes.forEach((box, idx) => {
                            if (originalStyles[idx]) {
                                box.style.display = originalStyles[idx].display;
                                box.style.marginBottom = originalStyles[idx].marginBottom;
                            }
                        });
                    }
                    
                    console.log('Canvas created:', {
                        width: canvas.width,
                        height: canvas.height
                    });
                    
                    // Convert to data URL
                    const imageData = canvas.toDataURL(\`image/\${format}\`, format === 'jpg' ? 0.9 : 1.0);
                    
                    // Get overlay name for filename
                    const overlayName = overlaysData[selectedIndex].name.replace(/[\\\/]/g, '-');
                    
                    // Send to extension to save
                    vscode.postMessage({
                        command: 'exportImage',
                        imageData: imageData,
                        format: format,
                        overlayName: overlayName
                    });
                    
                } catch (error) {
                    console.error('Export failed:', error);
                    alert('Export failed: ' + error.message);
                } finally {
                    button.textContent = originalText;
                    button.disabled = false;
                }
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
    const allIssues = overlay.validationIssues || [];
    
    // Count errors and warnings
    const errors = allIssues.filter((i: any) => i.severity === 'error').length;
    const warnings = allIssues.filter((i: any) => i.severity === 'warning').length;
    
    // Determine status
    let statusBadge = '';
    if (errors > 0) {
        statusBadge = `<span style="background: #f44336; color: white; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: bold;">🔴 ${errors} error${errors > 1 ? 's' : ''}, ${warnings} warning${warnings > 1 ? 's' : ''}</span>`;
    } else if (warnings > 0) {
        statusBadge = `<span style="background: #FF9800; color: white; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: bold;">🟡 ${warnings} warning${warnings > 1 ? 's' : ''}</span>`;
    } else {
        statusBadge = `<span style="background: #4CAF50; color: white; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: bold;">🟢 All checks passed</span>`;
    }

    return `
        <div id="diagram-${index}" class="diagram-container">
            <div class="header">
                <span>🎯 ${overlay.name}</span>
                <span class="env-badge env-${overlay.environment}">${overlay.environment?.toUpperCase()}</span>
            </div>
            
            <!-- Validation Status -->
            <div style="text-align: center; margin: 15px 0 10px; padding: 10px; background: var(--vscode-editorWidget-background); border-radius: 6px;">
                <div style="display: flex; justify-content: center; align-items: center; gap: 12px;">
                    <strong>Validation Status:</strong> ${statusBadge}
                    ${(errors > 0 || warnings > 0) ? `
                        <button onclick="showAllValidationIssues(${index})" 
                                style="background: #007ACC; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: bold;">
                            📋 View All Issues
                        </button>
                    ` : ''}
                </div>
            </div>

            <div style="text-align: center; margin: 15px 0 20px; padding: 8px; background: var(--vscode-editorWidget-background); border-radius: 6px;">
                <strong>Namespace:</strong> <span style="font-family: monospace; color: var(--vscode-textLink-foreground);">${namespace}</span>
            </div>

            <!-- Pod View: Deployments -->
            <div class="architecture">
                ${workloads.map((workload: any) => {
                    const workloadErrors = (workload.validationIssues || []).filter((i: any) => i.severity === 'error').length;
                    const workloadWarnings = (workload.validationIssues || []).filter((i: any) => i.severity === 'warning').length;
                    
                    let badges = '';
                    if (workloadErrors > 0) {
                        badges += `<span style="background: #f44336; color: white; padding: 2px 8px; border-radius: 8px; font-size: 10px; margin-left: 8px;">❌ ${workloadErrors}</span>`;
                    }
                    if (workloadWarnings > 0) {
                        badges += `<span style="background: #FF9800; color: white; padding: 2px 8px; border-radius: 8px; font-size: 10px; margin-left: 8px;">⚠️ ${workloadWarnings}</span>`;
                    }
                    
                    return `
                    <div class="deployment-box" 
                         data-workload='${JSON.stringify(workload).replace(/'/g, "&apos;")}'
                         onclick="showTooltip(this, event)"
                         style="cursor: pointer;">
                        <div class="deployment-header" style="display: flex; justify-content: space-between; align-items: center;">
                            <span>🚀 ${workload.type}</span>
                            ${badges ? `<div>${badges}</div>` : ''}
                        </div>
                        <div style="text-align: center; font-size: 12px; font-weight: bold; color: var(--vscode-textLink-foreground); margin: 8px 0; font-family: monospace;">
                            Deployment: ${workload.fullName}
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

                        <!-- Resource Limits -->
                        <div style="margin-top: 10px; padding: 8px; background: var(--vscode-editor-background); border-radius: 6px; border-left: 3px solid #9C27B0;">
                            <div style="font-size: 10px; font-weight: bold; margin-bottom: 6px; color: #9C27B0;">💻 Resources</div>
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 10px;">
                                <div>
                                    <div style="color: var(--vscode-descriptionForeground); margin-bottom: 2px;">CPU Limit:</div>
                                    <div style="font-family: monospace; color: var(--vscode-textLink-foreground); font-weight: bold;">${workload.resources.cpu}</div>
                                </div>
                                <div>
                                    <div style="color: var(--vscode-descriptionForeground); margin-bottom: 2px;">Memory Limit:</div>
                                    <div style="font-family: monospace; color: var(--vscode-textLink-foreground); font-weight: bold;">${workload.resources.memory}</div>
                                </div>
                                <div>
                                    <div style="color: var(--vscode-descriptionForeground); margin-bottom: 2px;">CPU Request:</div>
                                    <div style="font-family: monospace; color: var(--vscode-descriptionForeground);">${workload.resources.cpuRequest}</div>
                                </div>
                                <div>
                                    <div style="color: var(--vscode-descriptionForeground); margin-bottom: 2px;">Memory Request:</div>
                                    <div style="font-family: monospace; color: var(--vscode-descriptionForeground);">${workload.resources.memoryRequest}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                    `;
                }).join('')}
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

    // Helper to render command with copy button
    const cmdBox = (label: string, command: string) => `
        <div style="padding: 6px 10px; background: var(--vscode-editorWidget-background); border-radius: 4px;">
            <div style="font-size: 10px; color: var(--vscode-descriptionForeground); margin-bottom: 3px;">${label}:</div>
            <div style="display: flex; align-items: center; gap: 8px;">
                <code style="flex: 1; font-family: monospace; font-size: 11px; color: var(--vscode-textLink-foreground);">${command}</code>
                <button onclick="copyCommand('${command.replace(/'/g, "\\'")}')"
                        style="background: #007ACC; color: white; border: none; padding: 3px 8px; border-radius: 3px; cursor: pointer; font-size: 10px; white-space: nowrap;">
                    📋 Copy
                </button>
            </div>
        </div>
    `;

    return `
        <div class="network-diagram" style="margin: 20px 0;">
            <div class="network-title">⌨️ Kubectl Commands</div>
            <div style="background: var(--vscode-editor-background); padding: 12px; border-radius: 8px; margin-top: 12px;">

                <!-- Pod Commands -->
                <div style="margin-bottom: 15px;">
                    <div style="font-size: 12px; font-weight: bold; margin-bottom: 8px; color: var(--vscode-textLink-foreground);">📦 Pod Operations</div>
                    <div style="display: grid; gap: 6px;">
                        ${cmdBox('List all deployments', `kubectl get deploy -n ${namespace} -l client=${client}`)}
                        ${cmdBox('List all pods', `kubectl get pods -n ${namespace} -l client=${client} -o wide`)}
                        ${workloads.slice(0, 1).map((workload: any) => `
                            ${cmdBox(`Describe ${workload.name} deployment`, `kubectl describe deploy ${workload.fullName} -n ${namespace}`)}
                            ${cmdBox(`Scale ${workload.name}`, `kubectl scale deploy ${workload.fullName} --replicas=10 -n ${namespace}`)}
                        `).join('')}
                    </div>
                </div>

                <!-- Network Commands -->
                <div style="margin-bottom: 15px;">
                    <div style="font-size: 12px; font-weight: bold; margin-bottom: 8px; color: #FF9800;">🌐 Network Operations</div>
                    <div style="display: grid; gap: 6px;">
                        ${cmdBox('List network policies', `kubectl get networkpolicies -n ${namespace}`)}
                        ${cmdBox('Describe network policy', `kubectl describe netpol -n ${namespace}`)}
                        ${cmdBox('List services', `kubectl get svc -n ${namespace} -l client=${client}`)}
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
    const networkPolicies = overlay.networkPolicies || [];
    if (networkPolicies.length === 0) return '';

    // Render all network policies
    return networkPolicies.map((policy: any) => `
        <div class="network-diagram">
            <div class="network-title">🔒 Network Policy: ${policy.name}</div>

            ${policy.ingress && policy.ingress.length > 0 ? `
                <div class="network-flow">
                    <div class="network-node ingress">
                        <div style="font-size: 28px;">🌐</div>
                        <div style="font-weight: bold; margin-top: 6px; font-size: 11px;">Ingress</div>
                        <div class="network-details">
                            ${policy.ingress.map((rule: any) => `
                                <div style="margin: 2px 0;">• ${rule.description}</div>
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

            ${policy.egress && policy.egress.length > 0 ? `
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
                            ${policy.egress.map((rule: any) => `
                                <div style="margin: 2px 0;">• ${rule.description}</div>
                            `).join('')}
                        </div>
                    </div>
                </div>
            ` : ''}
        </div>
    `).join('');
}

function renderLayer(tier: any, className: string, title: string, subtitle: string): string {
    if (!tier) return '';

    let items: string[] = [];

    // Dynamically extract tier information
    if (tier.resources && Array.isArray(tier.resources)) {
        items.push(...tier.resources.map((r: string) => `📄 ${r}`));
    }
    if (tier.provides) {
        items.push(`ℹ️ ${tier.provides}`);
    }
    if (tier.namePrefix) {
        items.push(`🔤 Prefix: ${tier.namePrefix}`);
    }
    if (tier.namespace) {
        items.push(`📦 Namespace: ${tier.namespace}`);
    }
    if (tier.client) {
        items.push(`👤 Client: ${tier.client}`);
    }
    if (tier.networkPolicies && Array.isArray(tier.networkPolicies)) {
        items.push(`🔒 Network Policies: ${tier.networkPolicies.length}`);
    }
    if (tier.patches && Array.isArray(tier.patches)) {
        items.push(`📝 Patches: ${tier.patches.length} files`);
    }
    if (tier.environment) {
        items.push(`🌍 Environment: ${tier.environment}`);
    }
    if (tier.configMaps && Array.isArray(tier.configMaps)) {
        items.push(`⚙️ ConfigMaps: ${tier.configMaps.length}`);
    }

    return `
        <div class="layer ${className}">
            <div class="layer-title">${title}</div>
            <div class="network-label">${subtitle}</div>
            <div class="layer-items" style="margin-top: 10px;">
                ${items.map(item => `
                    <div class="layer-item">
                        <span class="layer-item-bullet">•</span>
                        <span class="layer-item-text">${item}</span>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

export function deactivate() {}
