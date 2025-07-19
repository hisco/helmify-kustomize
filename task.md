Context
We have a chart whose values.yaml uses YAML anchors/aliases to keep the replica count for a Deployment in sync:

```yaml
connect:
  replicas: &connect_replicas 5      # single source of truth

globals:
  patches:
    - target:
        kind: Deployment
        name: mcp-s-connect
      ops:
        - op: add
          path: /spec/replicas
          value: *connect_replicas     # alias so patch uses the same number
```
Requirement
At upgrade time we need to override just once on the CLI:

```bash
helm upgrade my-release ./my-chart \
  --set connect.replicas=10
```
and have that automatically propagate to the patch (globals.patches[0].ops[0].value) so the Deployment ends up with 10 replicas.

Problem
Helm merges CLI flags after it has parsed values.yaml.
Because YAML anchors are resolved during parsing, value: *connect_replicas is replaced with the literal 5 long before Helm sees the --set. The override therefore changes .Values.connect.replicas but not the hard-coded value in the patch.

Symptoms
kubectl get deployment mcp-s-connect -o jsonpath='{.spec.replicas}' still returns 5.

Rendered manifests show the patch with value: 5 even though .Values.connect.replicas is 10.

What we’ve tried
Plain --set connect.replicas=10 (patch stays 5).

Adding a second --set globals.patches[0].ops[0].value=10 works, but we want to avoid specifying the same number twice and not define it nested, define it only in the anchor.

Looked for a Helm flag to “re-anchor” values after merging—doesn’t exist.

Desired outcome
A pattern or chart structure where one override (via --set, -f, or another straightforward mechanism) drives both the Deployment replica count and the patch, without manual duplication.



## Solution Implementation

The solution uses a template-based approach to reconstruct the values.yaml file with dynamic anchor resolution:

### Step 1: Identify Anchors and References
- Parse the values.yaml file to identify YAML anchors (e.g., `&connect_replicas`) and their references (e.g., `*connect_replicas`)
- Extract anchor names, paths, values, and reference locations using the `analyzeYamlAnchors` function

### Step 2: Generate Dynamic Values Template
- Create a Helm template function (`valuesYaml`) that reconstructs the values.yaml with dynamic anchor resolution
- **Only replace anchor definitions** (e.g., `&connect_replicas 5` → `%v`) with template function calls
- **Leave references unchanged** (e.g., `*connect_replicas` stays as-is) - the YAML parser handles these naturally
- Use `%v` placeholders to support any data type (strings, numbers, objects)

### Step 3: Runtime Resolution
- For each anchor, generate safe getter functions that check `.Values` for runtime overrides
- Use `pickFirstNonEmpty` helper to choose between runtime values and defaults
- The template uses printf with the resolved values to reconstruct valid YAML

### Example Output
```yaml
# Original values.yaml
connect:
  replicas: &connect_replicas 5
globals:
  patches:
    - ops:
      - value: *connect_replicas

# Generated template produces:
connect:
  replicas: 10  # Runtime value from --set connect.replicas=10
globals:
  patches:
    - ops:
      - value: 10  # Automatically resolved by YAML parser
```

### Key Principles
1. **No hash replacement** - use straightforward template replacement
2. **Preserve YAML semantics** - let the YAML parser handle references naturally  
3. **Simple Go templates** - use basic Helm template functions for value resolution
4. **Type safety** - use `%v` to support any data type, not just strings
