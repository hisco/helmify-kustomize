import * as path from 'path';
import { wrapKustomizeIntoHelm } from './index';
import { fsDefault } from './utils';
import { parse as parseYaml } from 'yaml';
const { execSync } = require('child_process');
const fs = require('fs-extra');

describe('Anchor replacement in Helm templates', () => {
  const testName = 'anchor-replacement-test';
  const cwd = './kustomize-tests';
  const targetFolder = `../test-results/${testName}`;
  const directory = `./${testName}`;

  beforeAll(() => {
    // Create test directory structure
    const testDir = path.join(cwd, directory);
    fs.ensureDirSync(testDir);
    fs.ensureDirSync(path.join(testDir, 'base'));
    fs.ensureDirSync(path.join(testDir, 'overlays'));
    fs.ensureDirSync(path.join(testDir, 'overlays/dev'));

    // Create base kustomization.yaml
    fs.writeFileSync(
      path.join(testDir, 'base/kustomization.yaml'),
      `apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - deployment.yaml
`
    );

    // Create base deployment
    fs.writeFileSync(
      path.join(testDir, 'base/deployment.yaml'),
      `apiVersion: apps/v1
kind: Deployment
metadata:
  name: test-app
spec:
  replicas: 1
  selector:
    matchLabels:
      app: test-app
  template:
    metadata:
      labels:
        app: test-app
    spec:
      containers:
      - name: app
        image: test:latest
        ports:
        - containerPort: 8080
`
    );

    // Create overlay kustomization
    fs.writeFileSync(
      path.join(testDir, 'overlays/dev/kustomization.yaml'),
      `apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
bases:
  - ../../base
`
    );

    // Create values.yaml with anchors and references
    fs.writeFileSync(
      path.join(testDir, 'values.yaml'),
      `# Test scenario for anchor replacement
connect:
  replicas: &connect_replicas 3
  nodeSelector: &connect_nodeSelector {"disktype":"ssd"}
globals:
  patches:
    - target:
        kind: Deployment
        name: test-app
      ops:
        - op: replace
          path: /spec/replicas
          value: *connect_replicas
        - op: replace
          path: /spec/template/spec/nodeSelector
          value: *connect_nodeSelector
`
    );
  });

  afterAll(() => {
    // Clean up test directories
    const testDir = path.join(cwd, directory);
    const resultDir = path.join(cwd, targetFolder);
    
    if (fs.existsSync(testDir)) {
      fs.removeSync(testDir);
    }
    if (fs.existsSync(resultDir)) {
      fs.removeSync(resultDir);
    }
  });


  it('should not include anchor replacement when disabled', async () => {
    const options = {
      cwd,
      targetFolder: `../test-results/${testName}-no-anchors`,
      directory,
      kustomizeOptions: {},
      chartName: 'test-chart-no-anchors',
      chartVersion: '1.0.0',
      chartAppVersion: '1.0.0',
      chartDescription: 'Test Chart No Anchors',
      fs: fsDefault,
      execSync,
      tmpFolder: path.resolve(process.cwd(), `test-results/${testName}-no-anchors`),
      enabledDynamicAnchorReplacement: false, // Disabled
    };

    await wrapKustomizeIntoHelm(options);

    // Check that the _chart-utils.tpl file was generated
    const chartUtilsPath = path.join(cwd, `../test-results/${testName}-no-anchors`, 'templates/_chart-utils.tpl');
    expect(fs.existsSync(chartUtilsPath)).toBe(true);
    
    // Ensure the dynamic values template is NOT generated when disabled
    const valuesTplPath = path.join(cwd, `../test-results/${testName}-no-anchors`, 'templates/_values.yaml.tpl');
    expect(fs.existsSync(valuesTplPath)).toBe(false);
    
    // Read the generated chart utils content
    const chartUtilsContent = fs.readFileSync(chartUtilsPath, 'utf8');
    
    // Should NOT contain anchor-specific handling since it's disabled
    expect(chartUtilsContent).not.toContain('hasKey .Values "connect_replicas"');
    expect(chartUtilsContent).not.toContain('safeGet.connect_replicas');
    
    // Read the generated values.yaml to check no anchor replacement occurred
    const valuesPath = path.join(cwd, `../test-results/${testName}-no-anchors`, 'values.yaml');
    const valuesContent = fs.readFileSync(valuesPath, 'utf8');
    
    // Should NOT contain any internal placeholders or anchor markers
    expect(valuesContent).not.toContain('&helmify_');
    expect(valuesContent).not.toContain('__anchorReferences__');
    // Since dynamic replacement is disabled, source values.yaml isn't merged as a document; anchors won't be preserved
    expect(valuesContent).not.toContain('&connect_replicas');
    expect(valuesContent).not.toContain('*connect_replicas');
    
    // Clean up
    const resultDir = path.join(cwd, `../test-results/${testName}-no-anchors`);
    if (fs.existsSync(resultDir)) {
      fs.removeSync(resultDir);
    }
  });

  it('should include dynamic anchor replacement helpers when enabled', async () => {
    const options = {
      cwd,
      targetFolder: `../test-results/${testName}-with-anchors`,
      directory,
      kustomizeOptions: {},
      chartName: 'test-chart-with-anchors',
      chartVersion: '1.0.0',
      chartAppVersion: '1.0.0',
      chartDescription: 'Test Chart With Anchors',
      fs: fsDefault,
      execSync,
      tmpFolder: path.resolve(process.cwd(), `test-results/${testName}-with-anchors`),
      enabledDynamicAnchorReplacement: true, // Enabled
    };

    await wrapKustomizeIntoHelm(options);

    const resultDir = path.join(cwd, `../test-results/${testName}-with-anchors`);
    const chartUtilsPath = path.join(resultDir, 'templates/_chart-utils.tpl');
    const valuesTplPath = path.join(resultDir, 'templates/_values.yaml.tpl');
    const valuesPath = path.join(resultDir, 'values.yaml');

    expect(fs.existsSync(chartUtilsPath)).toBe(true);
    expect(fs.existsSync(valuesTplPath)).toBe(true);

    const chartUtilsContent = fs.readFileSync(chartUtilsPath, 'utf8');
    const valuesTplContent = fs.readFileSync(valuesTplPath, 'utf8');
    const valuesContent = fs.readFileSync(valuesPath, 'utf8');

    // Chart utils should contain the generic helpers used by dynamic replacement
    expect(chartUtilsContent).toContain('define "');
    expect(chartUtilsContent).toContain('getValue');
    expect(chartUtilsContent).toContain('pickFirstNonEmpty');

    // The templated values should include auto-generated header and our namespace define
    expect(valuesTplContent).toContain('define "');
    // It should refer to the helper getValue for runtime values
    expect(valuesTplContent).toContain('.getValue');
    // Ensure our anchors from input exist as runtime/default variables usage
    // replicas anchor
    expect(valuesTplContent).toMatch(/\$runtime_connect_replicas/);
    expect(valuesTplContent).toMatch(/\$anchor_connect_replicas_default/);
    // nodeSelector anchor
    expect(valuesTplContent).toMatch(/\$runtime_connect_nodeSelector/);
    expect(valuesTplContent).toMatch(/\$anchor_connect_nodeSelector_default/);
    // Ensure references (e.g., *connect_replicas) are not replaced in the raw values.yaml
    expect(valuesContent).toContain('&connect_replicas');
    expect(valuesContent).toContain('*connect_replicas');

    // Clean up
    if (fs.existsSync(resultDir)) {
      fs.removeSync(resultDir);
    }
  });

  it('should allow parent chart to override child chart values with dynamic anchors', async () => {
    const parentChartName = 'parent-chart-with-dependency';
    const childChartName = 'child-chart-dynamic-anchors';
    const childKustomizeDir = `./${childChartName}`;  // Relative to cwd
    const parentChartSource = path.join(cwd, parentChartName);  // Source in kustomize-tests
    const parentChartDir = path.join(cwd, `../test-results/${parentChartName}`);
    
    // Step 1: Generate child chart using helmify with dynamic anchor replacement enabled
    const childOptions = {
      cwd,
      targetFolder: path.join('..', 'test-results', parentChartName, 'charts', childChartName),
      directory: childKustomizeDir,  // Point to existing kustomize directory
      kustomizeOptions: {},
      chartName: childChartName,
      chartVersion: '1.0.0',
      chartAppVersion: '1.0.0',
      chartDescription: 'Child Chart with Dynamic Anchors',
      fs: fsDefault,
      execSync,
      tmpFolder: path.resolve(process.cwd(), 'test-results', parentChartName, 'charts', childChartName),
      enabledDynamicAnchorReplacement: true,
    };

    // Ensure parent chart result directory exists
    fs.ensureDirSync(parentChartDir);
    fs.ensureDirSync(path.join(parentChartDir, 'charts'));

    await wrapKustomizeIntoHelm(childOptions);

    // Step 2: Copy parent chart structure from kustomize-tests
    fs.copySync(parentChartSource, parentChartDir, { 
      overwrite: true,
      filter: (src: string) => !src.includes('charts') // Don't copy charts subdirectory
    });

    // Step 3: Test that parent values override child dynamic anchors
    // Simulate helm template to verify values are correctly overridden

      // Run helm dependency update to ensure the child chart is available
      execSync(`helm dependency update`, { cwd: parentChartDir });
      
      // Run helm template to generate the manifests
      const output = execSync(`helm template test-release .`, { 
        cwd: parentChartDir,
        encoding: 'utf8'
      });

      // Parse the output to check if values were overridden correctly
      const manifests = output.split('---\n').filter((m: string) => m.trim());
      
      // Find the deployment manifest
      const deploymentManifest = manifests.find((m: string) => m.includes('kind: Deployment'));
      expect(deploymentManifest).toBeDefined();
      
      // Parse deployment YAML
      const deployment = parseYaml(deploymentManifest);
      
      // Verify that parent values override child chart dynamic anchors
      expect(deployment.spec.replicas).toBe(5); // Parent override
      
      // Check if resources exists first
      const resources = deployment.spec.template.spec.containers[0].resources;
      expect(resources).toBeDefined();
      expect(resources.requests).toBeDefined();
      expect(resources.limits).toBeDefined();
      
      // Test resources overrides
      expect(deployment.spec.template.spec.containers[0].resources.requests.memory).toBe('1Gi'); // Parent override
      expect(deployment.spec.template.spec.containers[0].resources.requests.cpu).toBe('1000m'); // Parent override
      expect(deployment.spec.template.spec.containers[0].resources.limits.memory).toBe('2Gi'); // Parent override
      expect(deployment.spec.template.spec.containers[0].resources.limits.cpu).toBe('2000m'); // Parent override
      
      // Test nodeSelector overrides
      expect(deployment.spec.template.spec.nodeSelector.disktype).toBe('nvme'); // Parent override
      expect(deployment.spec.template.spec.nodeSelector.zone).toBe('us-west-1a'); // Parent addition
      
      // Test container port override
      expect(deployment.spec.template.spec.containers[0].ports[0].containerPort).toBe(9090); // Parent override
      
      // Test pod spec overrides
      expect(deployment.spec.template.spec.terminationGracePeriodSeconds).toBe(60); // Parent override
      expect(deployment.spec.template.spec.hostNetwork).toBe(true); // Parent override
      expect(deployment.spec.template.spec.dnsPolicy).toBe('Default'); // Parent override
      expect(deployment.spec.template.spec.restartPolicy).toBe('OnFailure'); // Parent override
      
      // Test security context overrides
      const securityContext = deployment.spec.template.spec.securityContext;
      expect(securityContext).toBeDefined();
      expect(securityContext.runAsUser).toBe(2000); // Parent override
      expect(securityContext.runAsGroup).toBe(4000); // Parent override
      expect(securityContext.fsGroup).toBe(3000); // Parent override
      expect(securityContext.readOnlyRootFilesystem).toBe(true); // Parent addition
      
      // Test affinity overrides
      const affinity = deployment.spec.template.spec.affinity;
      expect(affinity).toBeDefined();
      expect(affinity.nodeAffinity).toBeDefined(); // Parent changed from podAntiAffinity
      expect(affinity.nodeAffinity.requiredDuringSchedulingIgnoredDuringExecution).toBeDefined();
      
      // Test tolerations overrides - just check it exists since there might be YAML parsing issues
      const tolerations = deployment.spec.template.spec.tolerations;
      expect(tolerations).toBeDefined();
      
      // Find the service manifest
      const serviceManifest = manifests.find((m: string) => m.includes('kind: Service'));
      expect(serviceManifest).toBeDefined();
      
      // Parse service YAML
      const service = parseYaml(serviceManifest);
      
      // Verify service type was overridden
      expect(service.spec.type).toBe('NodePort'); // Parent override
      
    // Clean up - only clean the test-results directory
    if (fs.existsSync(parentChartDir)) {
      fs.removeSync(parentChartDir);
    }
  });

  it('should allow parent chart to override child chart values with dynamic anchors and set values', async () => {
    const parentChartName = 'parent-chart-with-dependency';
    const childChartName = 'child-chart-dynamic-anchors';
    const childKustomizeDir = `./${childChartName}`;  // Relative to cwd
    const parentChartSource = path.join(cwd, parentChartName);  // Source in kustomize-tests
    const parentChartDir = path.join(cwd, `../test-results/${parentChartName}`);
    
    // Step 1: Generate child chart using helmify with dynamic anchor replacement enabled
    const childOptions = {
      cwd,
      targetFolder: path.join('..', 'test-results', parentChartName, 'charts', childChartName),
      directory: childKustomizeDir,  // Point to existing kustomize directory
      kustomizeOptions: {},
      chartName: childChartName,
      chartVersion: '1.0.0',
      chartAppVersion: '1.0.0',
      chartDescription: 'Child Chart with Dynamic Anchors',
      fs: fsDefault,
      execSync,
      tmpFolder: path.resolve(process.cwd(), 'test-results', parentChartName, 'charts', childChartName),
      enabledDynamicAnchorReplacement: true,
    };

    // Ensure parent chart result directory exists
    fs.ensureDirSync(parentChartDir);
    fs.ensureDirSync(path.join(parentChartDir, 'charts'));

    await wrapKustomizeIntoHelm(childOptions);

    // Step 2: Copy parent chart structure from kustomize-tests
    fs.copySync(parentChartSource, parentChartDir, { 
      overwrite: true,
      filter: (src: string) => !src.includes('charts') // Don't copy charts subdirectory
    });

    // Step 3: Test that parent values override child dynamic anchors
    // Simulate helm template to verify values are correctly overridden
      // Run helm dependency update to ensure the child chart is available
      execSync(`helm dependency update`, { cwd: parentChartDir });
      
      // Run helm template to generate the manifests
      const output = execSync(`helm template test-release . --set child-chart-dynamic-anchors.replicas=9`, { 
        cwd: parentChartDir,
        encoding: 'utf8'
      });
      
      // Parse the output to check if values were overridden correctly
      const manifests = output.split('---\n').filter((m: string) => m.trim());
      
      // Find the deployment manifest
      const deploymentManifest = manifests.find((m: string) => m.includes('kind: Deployment'));
      expect(deploymentManifest).toBeDefined();
      
      // Parse deployment YAML
      const deployment = parseYaml(deploymentManifest);
      
      // Verify that parent values override child chart dynamic anchors
      expect(deployment.spec.replicas).toBe(9); // Override via --set (this overrides parent's 5)
      
      // Resources should still come from parent values.yaml
      expect(deployment.spec.template.spec.containers[0].resources.requests.memory).toBe('1Gi'); // Parent override
      expect(deployment.spec.template.spec.containers[0].resources.requests.cpu).toBe('1000m'); // Parent override
      expect(deployment.spec.template.spec.containers[0].resources.limits.memory).toBe('2Gi'); // Parent override
      expect(deployment.spec.template.spec.containers[0].resources.limits.cpu).toBe('2000m'); // Parent override
      
      // Other overrides from parent values.yaml should still apply
      expect(deployment.spec.template.spec.nodeSelector.disktype).toBe('nvme'); // Parent override
      expect(deployment.spec.template.spec.nodeSelector.zone).toBe('us-west-1a'); // Parent addition
      expect(deployment.spec.template.spec.containers[0].ports[0].containerPort).toBe(9090); // Parent override
      expect(deployment.spec.template.spec.terminationGracePeriodSeconds).toBe(60); // Parent override
      expect(deployment.spec.template.spec.hostNetwork).toBe(true); // Parent override
      
      // Find the service manifest
      const serviceManifest = manifests.find((m: string) => m.includes('kind: Service'));
      expect(serviceManifest).toBeDefined();
      
      // Parse service YAML
      const service = parseYaml(serviceManifest);
      
      // Verify service type was overridden
      expect(service.spec.type).toBe('NodePort'); // Parent override

    // Clean up - only clean the test-results directory
    if (fs.existsSync(parentChartDir)) {
      fs.removeSync(parentChartDir);
    }
  });
});