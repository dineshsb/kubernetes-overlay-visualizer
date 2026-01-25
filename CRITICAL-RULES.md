# 🚨 CRITICAL RULES - MUST FOLLOW ON EVERY CHANGE 🚨

## Rule #1: ZERO HARDCODING - EVERYTHING FROM YAML

### ❌ NEVER DO THIS:
```typescript
// Hardcoded workload data
const workloads = [
  { name: 'api', replicas: 3, type: 'Backend API' },
  { name: 'worker', replicas: 5, type: 'Job Processor' }
];

// Hardcoded validation issues
const issues = [
  { severity: 'error', message: 'Using :latest tag' }
];

// Hardcoded environment variables
const envVars = {
  DATABASE_URL: 'postgres://...',
  API_KEY: 'hardcoded-key'
};
```

### ✅ ALWAYS DO THIS:
```typescript
// Parse from YAML files
const deployments = await parser.parseDeployments(overlayPath);
const configMaps = await parser.parseConfigMaps(overlayPath);
const validationIssues = await parser.validateOverlay(overlayPath);

// Build data structures from parsed content
const workloads = deployments.map(d => ({
  name: d.name,
  replicas: d.replicas,
  type: inferWorkloadType(d.name)  // Pattern-based, not hardcoded
}));
```

---

## Rule #2: VALIDATION MUST RUN AGAINST ACTUAL FILES

### How Validation Works (Correctly):
1. `validateOverlay()` calls `parseDeployments()`
2. `parseDeployments()` reads actual YAML files
3. Validation checks actual container specs: `container.resources?.limits?.cpu`
4. Issues are based on REAL missing fields

### How to Verify No Hardcoding:
```bash
# Delete a deployment file
rm demo-kustomize/base/deployment.yaml

# Run extension - that deployment should disappear
# If it still shows, IT'S HARDCODED!
```

---

## Rule #3: USE PATTERN-BASED INFERENCE, NOT LOOKUPS

### ❌ WRONG: Hardcoded Mappings
```typescript
function getWorkloadType(name: string) {
  const types = {
    'api': 'Backend API',
    'worker': 'Job Processor',
    'analytics': 'Analytics Engine'
  };
  return types[name] || 'Unknown';
}
```

### ✅ RIGHT: Pattern Detection
```typescript
function inferWorkloadType(name: string) {
  const lower = name.toLowerCase();
  if (lower.includes('api')) return 'Backend API';
  if (lower.includes('worker')) return 'Job Processor';
  if (lower.includes('analytics')) return 'Analytics Engine';
  return 'Service';  // Generic fallback
}
```

**Why?** Works with ANY deployment name, not just pre-defined ones.

---

## Rule #4: FILE PATHS MUST BE TRACKED

### ✅ Every Resource Needs filePath:
```typescript
interface DeploymentInfo {
  name: string;
  replicas: number;
  filePath: string;  // ← REQUIRED for click-to-edit
  k8sDeployment: k8s.V1Deployment;
}
```

**Why?** Enables click-to-edit, validation "Fix" buttons, and debugging.

---

## Rule #5: DEMO PROJECT MUST HAVE VARIETY

### ✅ Test Coverage in demo-kustomize:
- **Some deployments WITH resource limits** (validation passes)
- **Some deployments WITHOUT resource limits** (validation warns)
- **Some containers using :latest in prod** (validation errors)
- **Some valid, some invalid ConfigMap refs** (test all cases)

### Current State:
- ✅ All deployments properly configured (NO validation issues)
- ❌ Need to add test cases with intentional issues

---

## Rule #6: VALIDATION MUST BE DYNAMIC

### How to Check Validation is NOT Hardcoded:

1. **Check Debug Console:**
   ```
   [Validation] Found 0 issues for overlays/client-a/prod
   ```
   If 0 issues but files have issues → validation broken
   If 5 issues and files have 5 issues → validation working ✅

2. **Edit a File:**
   - Remove `resources.limits` from a container
   - Save file
   - Wait for auto-refresh
   - Validation should NOW show warning

3. **Add Test:**
   ```typescript
   // In tests, verify validation catches issues
   const issues = await parser.validateOverlay(testPath);
   expect(issues.length).toBeGreaterThan(0);
   ```

---

## Rule #7: EVERY FEATURE MUST WORK WITH ANY KUSTOMIZE PROJECT

### Test Matrix:
| Feature | Test With |
|---------|-----------|
| Visualization | Empty project, 1 overlay, 100 overlays |
| Validation | All valid, all invalid, mixed |
| Click-to-edit | Nested paths, Windows/Unix paths |
| File watcher | Rapid edits, bulk changes |
| Export | Small diagram, huge diagram |

### The Golden Question:
**"If someone uses this extension with THEIR kustomize project (not our demo), will it work?"**

If answer is NO → you hardcoded something.

---

## Rule #8: WHEN IN DOUBT, LOG IT

### Debug Logging Pattern:
```typescript
console.log(`[Feature] Parsing ${filePath}`);
console.log(`[Feature] Found ${items.length} items`);
console.log(`[Feature] Mapped to ${mappedItems.length} results`);
```

**Why?** Makes it OBVIOUS if values are hardcoded (same every time) vs dynamic (different per file).

---

## Checking Compliance Checklist

Before committing ANY change, verify:

- [ ] No hardcoded deployment names
- [ ] No hardcoded validation issues
- [ ] No hardcoded environment variables
- [ ] No hardcoded network policies
- [ ] No hardcoded namespaces (use from kustomization.yaml)
- [ ] All data comes from YAML parsing
- [ ] File paths tracked on all resources
- [ ] Validation runs against actual file content
- [ ] Works with demo project
- [ ] Would work with ANY kustomize project

---

## How to Test for Hardcoding

### Test 1: Empty Project
```bash
# Create new empty kustomize overlay
mkdir test-overlay && cd test-overlay
echo "resources: []" > kustomization.yaml

# Open in extension
# Should show: No deployments (not show hardcoded ones)
```

### Test 2: Different Names
```bash
# Rename deployment from 'api' to 'backend-service'
# Extension should show 'backend-service', not 'api'
```

### Test 3: File Deletion
```bash
# Delete a deployment YAML
# Extension should NOT show that deployment anymore
```

### Test 4: Validation Changes
```bash
# Edit deployment: remove resource limits
# Save file
# Extension should NOW show validation warning
```

---

## This File is Your Source of Truth

**READ THIS BEFORE EVERY CODE CHANGE**

If you're about to write code that violates these rules:
1. ⛔ STOP
2. 🤔 Rethink the approach
3. ✅ Use dynamic parsing instead

---

## Why This Matters

**Hardcoding makes the extension USELESS for real users.**

- Demo looks great ✅
- Real projects don't work ❌
- Users uninstall immediately 😞

**Dynamic parsing makes the extension VALUABLE.**

- Works with demo ✅
- Works with any project ✅
- Users love it 🎉

---

## Summary

🚨 **NEVER HARDCODE ANYTHING** 🚨

✅ Parse from YAML
✅ Infer from patterns
✅ Track file paths
✅ Validate dynamically
✅ Test with variety
✅ Log for debugging
✅ Think: "Would this work with someone else's project?"

**This is the #1 rule. Everything else is secondary.**
