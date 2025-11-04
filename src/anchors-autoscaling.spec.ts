import * as path from 'path';
import { parse as parseYaml } from 'yaml';
import { wrapKustomizeIntoHelm } from './index';
import { fsDefault } from './utils';
const { execSync } = require('child_process');
const fs = require('fs-extra');

describe('Anchors with HPA Autoscaling test', () => {
  const testName = 'anchors-autoscaling-test';
  const cwd = './kustomize-tests';
  const targetFolder = `../test-results/${testName}`;
  const directory = `./${testName}`;

  afterAll(() => {
    // Clean up test directories
    const resultDir = path.join(cwd, targetFolder);

    if (fs.existsSync(resultDir)) {
      fs.removeSync(resultDir);
    }
  });

  it('should create HPA with default anchor values from values.yaml', async () => {
    const options = {
      cwd,
      targetFolder,
      directory,
      kustomizeOptions: {},
      chartName: 'hpa-test-chart',
      chartVersion: '1.0.0',
      chartAppVersion: '1.0.0',
      chartDescription: 'HPA Test Chart with Dynamic Anchors',
      fs: fsDefault,
      execSync,
      tmpFolder: path.resolve(process.cwd(), `test-results/${testName}`),
      replaceAnchorsWithHashes: true, // Enable dynamic anchor replacement
    };

    try {
      await wrapKustomizeIntoHelm(options);
    } catch (error) {
      console.error('wrapKustomizeIntoHelm failed:', error);
      throw error;
    }

    const cwdHelm = path.join(cwd, targetFolder);

    // Test with default values
    const defaultResult = execSync(`helm template hpa-test-chart . --set overlay="overlays/dev"`, {
      cwd: cwdHelm
    });

    console.log('=== DEFAULT VALUES HELM TEMPLATE OUTPUT ===');
    console.log(defaultResult.toString());
    console.log('=== END OUTPUT ===');

    const defaultYamls = defaultResult.toString().split(/---\n/g).filter((s: string) => s.trim() !== '');
    console.log('YAML chunks found:', defaultYamls.length);

    const defaultObjects = defaultYamls.map((yaml: string) => parseYaml(yaml));
    console.log('Objects found:', defaultObjects.map((obj: any) => obj?.kind || 'Unknown'));

    const deployment = defaultObjects.find((obj: any) => obj.kind === 'Deployment');
    const service = defaultObjects.find((obj: any) => obj.kind === 'Service');
    const hpa = defaultObjects.find((obj: any) => obj.kind === 'HorizontalPodAutoscaler');

    // Verify all objects exist
    expect(deployment).toBeDefined();
    expect(service).toBeDefined();
    expect(hpa).toBeDefined();

    // Verify HPA default anchor values
    expect(hpa.metadata.name).toBe('web-app-hpa');
    expect(hpa.spec.scaleTargetRef.name).toBe('web-app'); // deployment_name anchor
    expect(hpa.spec.minReplicas).toBe(2); // autoscaling.minReplicas anchor
    expect(hpa.spec.maxReplicas).toBe(10); // autoscaling.maxReplicas anchor
    expect(hpa.spec.metrics[0].resource.target.averageUtilization).toBe(70); // autoscaling.targetCPUUtilizationPercentage anchor
    expect(hpa.spec.metrics[1].resource.target.averageUtilization).toBe(80); // autoscaling.targetMemoryUtilizationPercentage anchor
    expect(hpa.spec.metrics[1].resource.name).toBe('memory'); // Memory metric

    console.log('✓ Default HPA anchor values work correctly');
  });

  it('should override HPA anchor values at runtime with --set', async () => {
    const options = {
      cwd,
      targetFolder,
      directory,
      kustomizeOptions: {},
      chartName: 'hpa-test-chart',
      chartVersion: '1.0.0',
      chartAppVersion: '1.0.0',
      chartDescription: 'HPA Test Chart with Dynamic Anchors',
      fs: fsDefault,
      execSync,
      tmpFolder: path.resolve(process.cwd(), `test-results/${testName}`),
      replaceAnchorsWithHashes: true,
    };

    await wrapKustomizeIntoHelm(options);

    const cwdHelm = path.join(cwd, targetFolder);

    // Test with runtime overrides
    const runtimeResult = execSync(
      `helm template hpa-test-chart . --set overlay="overlays/dev" --set autoscaling.minReplicas=3 --set autoscaling.maxReplicas=20 --set autoscaling.targetCPUUtilizationPercentage=80 --set autoscaling.targetMemoryUtilizationPercentage=90 --set deployment_name="custom-app"`,
      { cwd: cwdHelm }
    );

    console.log('=== RUNTIME OVERRIDE HELM TEMPLATE OUTPUT ===');
    console.log(runtimeResult.toString());
    console.log('=== END OUTPUT ===');

    const runtimeYamls = runtimeResult.toString().split(/---\n/g).filter((s: string) => s.trim() !== '');
    const runtimeObjects = runtimeYamls.map((yaml: string) => parseYaml(yaml));

    const hpa = runtimeObjects.find((obj: any) => obj.kind === 'HorizontalPodAutoscaler');

    expect(hpa).toBeDefined();

    // Verify runtime overrides worked
    expect(hpa.spec.scaleTargetRef.name).toBe('custom-app'); // overridden deployment_name
    expect(hpa.spec.minReplicas).toBe(3); // overridden autoscaling.minReplicas
    expect(hpa.spec.maxReplicas).toBe(20); // overridden autoscaling.maxReplicas
    expect(hpa.spec.metrics[0].resource.target.averageUtilization).toBe(80); // overridden autoscaling.targetCPUUtilizationPercentage
    expect(hpa.spec.metrics[1].resource.target.averageUtilization).toBe(90); // overridden autoscaling.targetMemoryUtilizationPercentage

    console.log('✓ Runtime HPA anchor overrides work correctly');
  });

  it('should override HPA anchor values using values file', async () => {
    const options = {
      cwd,
      targetFolder,
      directory,
      kustomizeOptions: {},
      chartName: 'hpa-test-chart',
      chartVersion: '1.0.0',
      chartAppVersion: '1.0.0',
      chartDescription: 'HPA Test Chart with Dynamic Anchors',
      fs: fsDefault,
      execSync,
      tmpFolder: path.resolve(process.cwd(), `test-results/${testName}`),
      replaceAnchorsWithHashes: true,
    };

    await wrapKustomizeIntoHelm(options);

    const cwdHelm = path.join(cwd, targetFolder);

    // Create custom values file
    const customValuesPath = path.join(cwdHelm, 'custom-values.yaml');
    fs.writeFileSync(customValuesPath, `overlay: "overlays/dev"
autoscaling:
  enabled: true
  minReplicas: 5
  maxReplicas: 25
  targetCPUUtilizationPercentage: 85
  targetMemoryUtilizationPercentage: 95
deployment_name: "production-app"
`);

    const valuesFileResult = execSync(`helm template hpa-test-chart . -f custom-values.yaml`, {
      cwd: cwdHelm
    });

    console.log('=== VALUES FILE OVERRIDE HELM TEMPLATE OUTPUT ===');
    console.log(valuesFileResult.toString());
    console.log('=== END OUTPUT ===');

    const valuesFileYamls = valuesFileResult.toString().split(/---\n/g).filter((s: string) => s.trim() !== '');
    const valuesFileObjects = valuesFileYamls.map((yaml: string) => parseYaml(yaml));

    const hpa = valuesFileObjects.find((obj: any) => obj.kind === 'HorizontalPodAutoscaler');

    expect(hpa).toBeDefined();

    // Verify values file overrides worked
    expect(hpa.spec.scaleTargetRef.name).toBe('production-app');
    expect(hpa.spec.minReplicas).toBe(5);
    expect(hpa.spec.maxReplicas).toBe(25);
    expect(hpa.spec.metrics[0].resource.target.averageUtilization).toBe(85);
    expect(hpa.spec.metrics[1].resource.target.averageUtilization).toBe(95);

    console.log('✓ Values file HPA anchor overrides work correctly');

    // Clean up custom values file
    fs.unlinkSync(customValuesPath);
  });

  it('should work with both deployment and HPA having consistent anchor values', async () => {
    const options = {
      cwd,
      targetFolder,
      directory,
      kustomizeOptions: {},
      chartName: 'hpa-test-chart',
      chartVersion: '1.0.0',
      chartAppVersion: '1.0.0',
      chartDescription: 'HPA Test Chart with Dynamic Anchors',
      fs: fsDefault,
      execSync,
      tmpFolder: path.resolve(process.cwd(), `test-results/${testName}`),
      replaceAnchorsWithHashes: true,
    };

    await wrapKustomizeIntoHelm(options);

    const cwdHelm = path.join(cwd, targetFolder);

    // Test that changing deployment_name updates both deployment references
    const result = execSync(
      `helm template hpa-test-chart . --set overlay="overlays/dev" --set deployment_name="consistent-app"`,
      { cwd: cwdHelm }
    );

    const yamls = result.toString().split(/---\n/g).filter((s: string) => s.trim() !== '');
    const objects = yamls.map((yaml: string) => parseYaml(yaml));

    const deployment = objects.find((obj: any) => obj.kind === 'Deployment');
    const hpa = objects.find((obj: any) => obj.kind === 'HorizontalPodAutoscaler');

    expect(deployment).toBeDefined();
    expect(hpa).toBeDefined();

    // Verify the deployment name is used consistently
    // Note: The base deployment has name "web-app", we're checking HPA references it correctly
    expect(hpa.spec.scaleTargetRef.name).toBe('consistent-app');

    console.log('✓ Anchor values maintain consistency across resources');
  });

  it('should conditionally include HPA when autoscaling.enabled=true', async () => {
    const options = {
      cwd,
      targetFolder,
      directory,
      kustomizeOptions: {},
      chartName: 'hpa-test-chart',
      chartVersion: '1.0.0',
      chartAppVersion: '1.0.0',
      chartDescription: 'HPA Test Chart with Dynamic Anchors',
      fs: fsDefault,
      execSync,
      tmpFolder: path.resolve(process.cwd(), `test-results/${testName}`),
      replaceAnchorsWithHashes: true,
    };

    await wrapKustomizeIntoHelm(options);

    const cwdHelm = path.join(cwd, targetFolder);

    // Test with enabled=true (default)
    const enabledResult = execSync(
      `helm template hpa-test-chart . --set overlay="overlays/dev" --set autoscaling.enabled=true`,
      { cwd: cwdHelm }
    );

    const enabledYamls = enabledResult.toString().split(/---\n/g).filter((s: string) => s.trim() !== '');
    const enabledObjects = enabledYamls.map((yaml: string) => parseYaml(yaml));

    const deployment = enabledObjects.find((obj: any) => obj.kind === 'Deployment');
    const service = enabledObjects.find((obj: any) => obj.kind === 'Service');
    const hpa = enabledObjects.find((obj: any) => obj.kind === 'HorizontalPodAutoscaler');

    expect(deployment).toBeDefined();
    expect(service).toBeDefined();
    expect(hpa).toBeDefined(); // HPA should be present when enabled=true

    // Verify the control annotation is removed from the output
    // The annotation should either not exist, or if other annotations exist, the control annotation should not be present
    if (hpa.metadata.annotations) {
      expect(hpa.metadata.annotations['helmify-kustomize.io/enabled-by']).toBeUndefined();
    }
    // In most cases, annotations should be completely removed if it was the only annotation
    // This is the expected behavior for our test case
    expect(hpa.metadata.annotations).toBeUndefined();

    console.log('✓ HPA is created when autoscaling.enabled=true');
    console.log('✓ Control annotation helmify-kustomize.io/enabled-by is removed from output');
  });

  it('should NOT include HPA when autoscaling.enabled=false', async () => {
    const options = {
      cwd,
      targetFolder,
      directory,
      kustomizeOptions: {},
      chartName: 'hpa-test-chart',
      chartVersion: '1.0.0',
      chartAppVersion: '1.0.0',
      chartDescription: 'HPA Test Chart with Dynamic Anchors',
      fs: fsDefault,
      execSync,
      tmpFolder: path.resolve(process.cwd(), `test-results/${testName}`),
      replaceAnchorsWithHashes: true,
    };

    await wrapKustomizeIntoHelm(options);

    const cwdHelm = path.join(cwd, targetFolder);

    // Test with enabled=false
    const disabledResult = execSync(
      `helm template hpa-test-chart . --set overlay="overlays/dev" --set autoscaling.enabled=false`,
      { cwd: cwdHelm }
    );

    const disabledYamls = disabledResult.toString().split(/---\n/g).filter((s: string) => s.trim() !== '');
    const disabledObjects = disabledYamls.map((yaml: string) => parseYaml(yaml));

    const deployment = disabledObjects.find((obj: any) => obj.kind === 'Deployment');
    const service = disabledObjects.find((obj: any) => obj.kind === 'Service');
    const hpa = disabledObjects.find((obj: any) => obj.kind === 'HorizontalPodAutoscaler');

    expect(deployment).toBeDefined();
    expect(service).toBeDefined();
    expect(hpa).toBeUndefined(); // HPA should NOT be present when enabled=false

    console.log('✓ HPA is NOT created when autoscaling.enabled=false');
  });
});
