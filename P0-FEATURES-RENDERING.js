// P0 Features - Rendering Updates

// Add to getWebviewContent JavaScript section:

function showTooltip(workload, event) {
    const tooltip = document.getElementById('hover-tooltip');
    if (!tooltip) return;
    
    const config = JSON.parse(workload.dataset.config);
    
    tooltip.innerHTML = `
        <div style="padding: 12px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <strong style="font-size: 13px;">${config.fullName}</strong>
                <button onclick="editDeployment('${config.filePath}')" 
                        style="background: #007ACC; color: white; border: none; padding: 4px 8px; border-radius: 3px; cursor: pointer; font-size: 11px;">
                    ✏️ Edit
                </button>
            </div>
            <div style="font-size: 11px; color: var(--vscode-descriptionForeground);">
                <div><strong>File:</strong> ${config.filePath.split('/').pop()}</div>
                <div><strong>Type:</strong> ${config.type}</div>
                <div><strong>Replicas:</strong> ${config.replicas}</div>
                <div><strong>CPU:</strong> ${config.resources.cpu} / ${config.resources.cpuRequest}</div>
                <div><strong>Memory:</strong> ${config.resources.memory} / ${config.resources.memoryRequest}</div>
                <div><strong>Containers:</strong> ${config.containers.length}</div>
            </div>
        </div>
    `;
    
    tooltip.style.display = 'block';
    tooltip.style.left = event.pageX + 10 + 'px';
    tooltip.style.top = event.pageY + 10 + 'px';
}

function hideTooltip() {
    const tooltip = document.getElementById('hover-tooltip');
    if (tooltip) {
        tooltip.style.display = 'none';
    }
}

function editDeployment(filePath) {
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

// Add tooltip container to HTML:
<div id="hover-tooltip" style="
    position: absolute;
    display: none;
    background: var(--vscode-editorWidget-background);
    border: 1px solid var(--vscode-widget-border);
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    z-index: 1000;
    min-width: 250px;
    max-width: 400px;
"></div>

// Update deployment box rendering:
function renderDeploymentBox(workload, namespace) {
    const configData = {
        fullName: workload.fullName,
        type: workload.type,
        replicas: workload.replicas,
        resources: workload.resources,
        containers: workload.containers,
        filePath: workload.filePath
    };
    
    return `
        <div class="deployment" 
             data-config='${JSON.stringify(configData)}'
             onmouseenter="showTooltip(this, event)"
             onmouseleave="hideTooltip()"
             style="cursor: pointer;">
            <!-- existing deployment content -->
        </div>
    `;
}

// Update kubectl commands with real values:
function renderRealKubectlCommands(workloads, namespace, client) {
    return workloads.map(workload => `
        <div style="padding: 6px 10px; background: var(--vscode-editorWidget-background); border-radius: 4px;">
            <div style="font-size: 10px; color: var(--vscode-descriptionForeground); margin-bottom: 3px;">
                Get ${workload.name} pods:
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
                <code style="flex: 1; font-family: monospace; font-size: 11px; color: var(--vscode-textLink-foreground);">
                    kubectl get pods -n ${namespace} -l app=${workload.name}
                </code>
                <button onclick="copyCommand('kubectl get pods -n ${namespace} -l app=${workload.name}')"
                        style="background: #007ACC; color: white; border: none; padding: 3px 8px; border-radius: 3px; cursor: pointer; font-size: 10px;">
                    Copy
                </button>
            </div>
        </div>
    `).join('');
}

// Render validation issues:
function renderValidationIssues(issues) {
    if (!issues || issues.length === 0) {
        return `
            <div style="padding: 12px; background: rgba(76, 175, 80, 0.1); border-left: 4px solid #4CAF50; border-radius: 4px; margin-bottom: 20px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="font-size: 18px;">✅</span>
                    <strong style="color: #4CAF50;">No validation issues found</strong>
                </div>
            </div>
        `;
    }
    
    const errors = issues.filter(i => i.severity === 'error');
    const warnings = issues.filter(i => i.severity === 'warning');
    
    return `
        <div style="margin-bottom: 20px;">
            ${errors.length > 0 ? `
                <div style="padding: 12px; background: rgba(244, 67, 54, 0.1); border-left: 4px solid #F44336; border-radius: 4px; margin-bottom: 10px;">
                    <div style="font-weight: bold; margin-bottom: 8px; color: #F44336;">
                        🔴 ${errors.length} Error${errors.length > 1 ? 's' : ''}
                    </div>
                    ${errors.map(issue => `
                        <div style="margin: 6px 0; padding: 6px; background: var(--vscode-editor-background); border-radius: 3px;">
                            <div style="font-size: 11px; font-weight: bold;">${issue.resource}</div>
                            <div style="font-size: 10px; color: var(--vscode-descriptionForeground); margin-top: 2px;">${issue.message}</div>
                            ${issue.filePath ? `
                                <button onclick="editDeployment('${issue.filePath}')"
                                        style="margin-top: 4px; background: transparent; color: #007ACC; border: 1px solid #007ACC; padding: 2px 6px; border-radius: 3px; cursor: pointer; font-size: 10px;">
                                    Open File
                                </button>
                            ` : ''}
                        </div>
                    `).join('')}
                </div>
            ` : ''}
            
            ${warnings.length > 0 ? `
                <div style="padding: 12px; background: rgba(255, 152, 0, 0.1); border-left: 4px solid #FF9800; border-radius: 4px;">
                    <div style="font-weight: bold; margin-bottom: 8px; color: #FF9800;">
                        ⚠️ ${warnings.length} Warning${warnings.length > 1 ? 's' : ''}
                    </div>
                    ${warnings.map(issue => `
                        <div style="margin: 6px 0; padding: 6px; background: var(--vscode-editor-background); border-radius: 3px;">
                            <div style="font-size: 11px; font-weight: bold;">${issue.resource}</div>
                            <div style="font-size: 10px; color: var(--vscode-descriptionForeground); margin-top: 2px;">${issue.message}</div>
                            ${issue.filePath ? `
                                <button onclick="editDeployment('${issue.filePath}')"
                                        style="margin-top: 4px; background: transparent; color: #007ACC; border: 1px solid #007ACC; padding: 2px 6px; border-radius: 3px; cursor: pointer; font-size: 10px;">
                                    Open File
                                </button>
                            ` : ''}
                        </div>
                    `).join('')}
                </div>
            ` : ''}
        </div>
    `;
}
