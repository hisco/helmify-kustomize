# HPA Autoscaling with Dynamic Anchors and Conditional Rendering

This example demonstrates how to use dynamic anchors in `values.yaml` with patches to add HorizontalPodAutoscaler (HPA) autoscaling to a Kubernetes deployment, including **conditional manifest rendering** using the `helmify-kustomize.io/enabled-by` annotation.

## Structure

```
anchors-autoscaling-test/
├── base/
│   ├── deployment.yaml       # Base deployment with resource limits
│   ├── service.yaml          # Service definition
│   └── kustomization.yaml    # Base kustomization
├── overlays/
│   └── dev/
│       └── kustomization.yaml # Dev overlay
├── values.yaml               # Helm values with autoscaling config
└── README.md                 # This file
```

## User-Friendly Values Configuration

Users can control HPA autoscaling using the standard `autoscaling` structure in `values.yaml`:

```yaml
autoscaling:
  enabled: true                          # ← Controls HPA creation
  minReplicas: 2
  maxReplicas: 10
  targetCPUUtilizationPercentage: 70
  targetMemoryUtilizationPercentage: 80
```

## How It Works

1. **Anchors in values.yaml**: The autoscaling values are defined as YAML anchors
2. **Conditional Rendering**: The `helmify-kustomize.io/enabled-by` annotation points to `autoscaling.enabled`
3. **Manifests Section**: Creates the HPA resource as a base manifest
4. **Patches Section**: Uses `globals.patches` to dynamically update HPA fields with anchor references
5. **Dynamic Anchor Resolution**: The `helmify-kustomize` tool converts anchors to Helm template expressions

### Conditional Manifest Rendering (NEW!)

The HPA manifest uses a special annotation for conditional rendering:

```yaml
manifests:
  - apiVersion: autoscaling/v2
    kind: HorizontalPodAutoscaler
    metadata:
      name: web-app-hpa
      annotations:
        helmify-kustomize.io/enabled-by: "autoscaling.enabled"  # ← Generic feature!
    spec:
      # ... HPA configuration
```

**How it works:**
- When `autoscaling.enabled=true`, the HPA manifest is included in the chart
- When `autoscaling.enabled=false`, the HPA manifest is **completely excluded** from rendering
- The annotation value is a dot-separated path to any value in the values.yaml (e.g., `"autoscaling.enabled"`, `"features.monitoring.enabled"`, etc.)
- **Important**: The `helmify-kustomize.io/enabled-by` annotation is automatically **removed** from the final rendered YAML output - it's only used as a control directive during chart generation

## Deployment Examples

### Enable Autoscaling (Default)

```bash
helm install my-app ./chart --set overlay="overlays/dev"
```

This uses the default `autoscaling.enabled=true` from `values.yaml` and creates the HPA.

### Disable Autoscaling

```bash
helm install my-app ./chart \
  --set overlay="overlays/dev" \
  --set autoscaling.enabled=false
```

The HPA manifest will NOT be created - only Deployment and Service will be rendered.

### Override Autoscaling Parameters

```bash
helm install my-app ./chart \
  --set overlay="overlays/dev" \
  --set autoscaling.minReplicas=3 \
  --set autoscaling.maxReplicas=20 \
  --set autoscaling.targetCPUUtilizationPercentage=80 \
  --set autoscaling.targetMemoryUtilizationPercentage=90
```

### Use Custom Values File

Create `production-values.yaml`:
```yaml
overlay: "overlays/dev"
autoscaling:
  enabled: true
  minReplicas: 5
  maxReplicas: 25
  targetCPUUtilizationPercentage: 85
  targetMemoryUtilizationPercentage: 95
```

Deploy:
```bash
helm install my-app ./chart -f production-values.yaml
```

### Disable in Production

Create `no-autoscale-values.yaml`:
```yaml
overlay: "overlays/dev"
autoscaling:
  enabled: false  # ← HPA will not be created
```

Deploy:
```bash
helm install my-app ./chart -f no-autoscale-values.yaml
```

## Features Demonstrated

- ✅ User-friendly `autoscaling` configuration structure
- ✅ **Generic conditional manifest rendering** via `helmify-kustomize.io/enabled-by` annotation
- ✅ Dynamic anchor replacement for runtime overrides
- ✅ CPU and Memory-based autoscaling metrics
- ✅ Integration with existing Kustomize deployments
- ✅ Full Helm values override support (`--set` and `-f`)
- ✅ Complete enable/disable control

## Generic Conditional Rendering

The `helmify-kustomize.io/enabled-by` annotation is a **generic feature** that works with ANY manifest and ANY value path:

### Example: Conditional Monitoring

```yaml
monitoring:
  enabled: true

manifests:
  - apiVersion: v1
    kind: ServiceMonitor
    metadata:
      name: my-app-monitor
      annotations:
        helmify-kustomize.io/enabled-by: "monitoring.enabled"
    spec:
      # ... ServiceMonitor configuration
```

### Example: Nested Conditional

```yaml
features:
  database:
    backup:
      enabled: false

manifests:
  - apiVersion: batch/v1
    kind: CronJob
    metadata:
      name: db-backup
      annotations:
        helmify-kustomize.io/enabled-by: "features.database.backup.enabled"
    spec:
      # ... CronJob configuration
```

## Key Points

1. **Anchor Names**: Use descriptive anchor names like `&autoscaling_minReplicas` that reference the values path
2. **Manifests + Patches**: Combine `manifests:` to create the resource and `globals.patches` to apply anchor values
3. **Dynamic Resolution**: With `replaceAnchorsWithHashes: true`, anchors become Helm template expressions that can be overridden at runtime
4. **Conditional Rendering**: Use `helmify-kustomize.io/enabled-by` annotation to conditionally include/exclude manifests
5. **Clean Output**: The `helmify-kustomize.io/enabled-by` annotation is automatically removed from rendered output - it won't appear in your deployed resources
6. **Multiple Metrics**: Support both CPU and Memory utilization metrics in the same HPA

## Testing

Run the e2e test to verify the functionality:

```bash
npm test -- src/anchors-autoscaling.spec.ts
```

The test covers:
- Default anchor values from `values.yaml` ✓
- Runtime overrides with `--set` commands ✓
- Custom values file overrides ✓
- Consistency of anchor values across resources ✓
- **Conditional inclusion when enabled=true** ✓
- **Conditional exclusion when enabled=false** ✓

All 6 tests pass!
