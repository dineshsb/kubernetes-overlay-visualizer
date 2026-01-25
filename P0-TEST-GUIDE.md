# P0 Features - Quick Test Guide

## Prerequisites
- Extension compiled: `npm run compile`
- VS Code with extension loaded (F5)

## Test 1: Hover Tooltips with Click-to-Edit ✨

### Steps
1. Press F5 to run extension
2. Click "Visualize Kustomize Overlay" in tree view
3. Select `overlays/client-a/prod`
4. Hover mouse over any deployment box (e.g., "Backend API")

### Expected Results
✅ Tooltip appears showing:
- Deployment name: `client-a-api`
- File path: `C:\Users\...\demo-kustomize\base\deployment.yaml`
- Replicas count
- Resource limits (CPU, Memory)
- "Edit Deployment" button

### Click-to-Edit Test
5. Click the "Edit Deployment" button in tooltip

### Expected Results
✅ YAML file opens in VS Code editor
✅ File contains the deployment definition

---

## Test 2: Real Kubectl Commands with Copy Buttons 📋

### Steps
1. Keep visualization open from Test 1
2. Scroll down to "⌨️ Kubectl Commands" section
3. Look at the first command under "📦 Pod Operations"

### Expected Results
✅ Command shows real namespace: `shared-platform`
✅ Command shows real client label: `client=client-a`
✅ Command is: `kubectl get deploy -n shared-platform -l client=client-a`
✅ "📋 Copy" button appears next to command

### Copy Button Test
4. Click the "📋 Copy" button
5. Open a terminal (Ctrl + `)
6. Paste (Ctrl + V)

### Expected Results
✅ Full kubectl command is in clipboard
✅ Command is properly formatted and executable

### Real Values Test
7. Check other commands in the section
8. Verify deployment names match your YAML files:
   - `client-a-api` (from base/deployment.yaml)
   - `client-a-analytics` (from base/client-a/deployment-analytics.yaml)

### Expected Results
✅ All deployment names are real (not hardcoded)
✅ Namespace matches kustomization.yaml or default
✅ Client label matches overlay path

---

## Test 3: File Watcher Auto-Refresh 🔄

### Steps
1. Keep visualization open showing `client-a/prod`
2. Note the current replica count for "Backend API" (should be 3)
3. Open `demo-kustomize/base/deployment.yaml` in editor
4. Find the line: `replicas: 3`
5. Change it to: `replicas: 5`
6. Save the file (Ctrl + S)
7. Watch the visualization panel

### Expected Results
✅ Within 500ms, visualization auto-refreshes
✅ "Backend API" deployment now shows 5 replicas
✅ No manual refresh needed

### Multiple Changes Test
8. Change replicas back to `3`
9. Save
10. Immediately change to `7`
11. Save

### Expected Results
✅ Only one refresh happens (debounced)
✅ Final state shows 7 replicas

---

## Test 4: Integration Test (All Features Together) 🎯

### Scenario
You need to scale the analytics deployment and verify it worked.

### Steps
1. Visualize `client-a/prod`
2. Hover over "Analytics Engine" deployment
3. See current replicas (should be 3)
4. Click "Edit Deployment" in tooltip
5. Change replicas from 3 to 5
6. Save the file
7. Watch visualization auto-refresh (shows 5 replicas)
8. Scroll to "Kubectl Commands"
9. Find the scale command
10. Click "📋 Copy" button
11. Verify copied command has correct values

### Expected Results
✅ Hover tooltip works
✅ Click-to-edit opens correct file
✅ File watcher auto-refreshes on save
✅ Kubectl command uses real deployment name
✅ Copy button copies correct command

---

## Common Issues & Solutions

### Tooltip Not Appearing
- **Check**: Mouse is actually hovering over deployment box
- **Solution**: Look for boxes with deployment headers like "🚀 Backend API"

### Edit Button Not Working
- **Check**: Console for error messages (Help → Toggle Developer Tools)
- **Solution**: Ensure filePath is included in workload data

### Copy Button Not Working
- **Check**: Navigator.clipboard API might need HTTPS
- **Solution**: Extension runs in VS Code context, should work automatically

### Auto-Refresh Not Working
- **Check**: File watcher might not be set up
- **Solution**: Close and reopen visualization panel (triggers watcher setup)

---

## Success Criteria

All three P0 features working means:
1. ✅ Can hover and see deployment details
2. ✅ Can click edit button and file opens
3. ✅ Can copy kubectl commands with one click
4. ✅ Commands have real values (not templates)
5. ✅ Changes to YAML files trigger auto-refresh
6. ✅ No manual refresh needed

---

## Demo Flow for Stakeholders

"Let me show you the three key features we built:

1. **Hover to Inspect**: [Hover over deployment] See the full configuration instantly
2. **Click to Edit**: [Click edit button] Jump directly to the YAML file
3. **Copy Commands**: [Click copy button] Get the exact kubectl command
4. **Auto-Refresh**: [Edit YAML, save] Watch it update automatically

No more:
- ❌ Guessing which file to edit
- ❌ Constructing kubectl commands manually
- ❌ Refreshing to see changes
- ❌ Context switching between editor and docs"

---

## Next: Test with Your Own Kustomize Project

1. Open your kustomize project in VS Code
2. Run the extension (F5)
3. Click "Visualize Kustomize Overlay"
4. Select any overlay
5. Test all three P0 features
6. Verify it works with your real configurations

**The extension should work with ANY Kustomize structure - zero hardcoding!** 🚀
