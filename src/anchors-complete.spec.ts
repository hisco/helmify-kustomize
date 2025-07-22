import * as path from 'path';
import { parse as parseYaml } from 'yaml';
import { wrapKustomizeIntoHelm } from './index';
import { fsDefault } from './utils';
const { execSync } = require('child_process');
const fs = require('fs-extra');

describe('Complete Anchors functionality test', () => {
  const testName = 'anchors-complete-test';
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
  - service.yaml
`
    );

    // Create base deployment with patches that will use anchors
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

    // Create base service
    fs.writeFileSync(
      path.join(testDir, 'base/service.yaml'),
      `apiVersion: v1
kind: Service
metadata:
  name: test-service
spec:
  ports:
  - port: 80
    targetPort: 8080
  selector:
    app: test-app
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

    // Create values.yaml with simple anchors that should match our patterns
    fs.writeFileSync(
      path.join(testDir, 'values.yaml'),
      `# Test scenario for complete anchor functionality - using simple patterns
app_name: &app_name "my-test-app"
app_replicas: &app_replicas 5
app_port: &app_port 9090

globals:
  patches:
    # Patch deployment name using anchor
    - target:
        kind: Deployment
        name: test-app
      ops:
        - op: replace
          path: /metadata/name
          value: *app_name
        - op: replace
          path: /spec/replicas
          value: *app_replicas
        - op: replace
          path: /spec/template/spec/containers/0/ports/0/containerPort
          value: *app_port
    
    # Patch service using anchors
    - target:
        kind: Service
        name: test-service
      ops:
        - op: replace
          path: /metadata/name
          value: *app_name
        - op: replace
          path: /spec/ports/0/targetPort
          value: *app_port
        - op: add
          path: /spec/ports/0/port
          value: *app_port
    
    # Test additional anchor usage - add annotation with anchor value
    - target:
        kind: Service
        name: test-service
      ops:
        - op: add
          path: /metadata/annotations
          value:
            app-name: *app_name
            app-port: *app_port
`
    );
  });

  afterAll(() => {
    // Clean up test directories - TEMPORARILY DISABLED FOR DEBUGGING
    // const testDir = path.join(cwd, directory);
    // const resultDir = path.join(cwd, targetFolder);
    
    // if (fs.existsSync(testDir)) {
    //   fs.removeSync(testDir);
    // }
    // if (fs.existsSync(resultDir)) {
    //   fs.removeSync(resultDir);
    // }
  });

  it('should properly replace anchor values in generated k8s objects when using runtime helm set', async () => {
    const options = {
      cwd,
      targetFolder,
      directory,
      kustomizeOptions: {},
      chartName: 'anchors-test-chart',
      chartVersion: '1.0.0',
      chartAppVersion: '1.0.0',
      chartDescription: 'Anchors Test Chart',
      fs: fsDefault,
      execSync,
      tmpFolder: path.resolve(process.cwd(), `test-results/${testName}`),
      replaceAnchorsWithHashes: true, // Enable hash replacement
    };

    try {
      await wrapKustomizeIntoHelm(options);
    } catch (error) {
      console.error('wrapKustomizeIntoHelm failed:', error);
      throw error;
    }

    // Verify the replaceAnchorsWithHashes function is generated
    
    const cwdHelm = path.join(cwd, targetFolder);
    
    
    const runtimeOverrideResult = execSync(`helm template anchors-test-chart . --set overlay="overlays/dev" --set app_name="runtime-app" --set app_port=7777 --set app_replicas=42`, {
      cwd: cwdHelm
    });
    
    console.log('=== HELM TEMPLATE OUTPUT ===');
    console.log(runtimeOverrideResult.toString());
    console.log('=== END OUTPUT ===');
    
    const runtimeOverrideYamls = runtimeOverrideResult.toString().split(/---\n/g).filter((s: string) => s.trim() !== '');
    console.log('YAML chunks found:', runtimeOverrideYamls.length);
    
    const runtimeOverrideObjects = runtimeOverrideYamls.map((yaml: string) => parseYaml(yaml));
    console.log('Objects found:', runtimeOverrideObjects.map((obj: any) => obj?.kind || 'Unknown'));
    
    const runtimeOverrideDeployment = runtimeOverrideObjects.find((obj: any) => obj.kind === 'Deployment');
    const runtimeOverrideService = runtimeOverrideObjects.find((obj: any) => obj.kind === 'Service');
    
    // Verify objects exist
    expect(runtimeOverrideDeployment).toBeDefined();
    expect(runtimeOverrideService).toBeDefined();
    
    expect(runtimeOverrideDeployment.spec.replicas).toBe(42);
    expect(runtimeOverrideDeployment.metadata.name).toBe('runtime-app');
    expect(runtimeOverrideService.spec.ports[0].port).toBe(7777);
    // Test with anchor name overrides - document current behavior
    const anchorOverrideResult = execSync(`helm template anchors-test-chart . --set overlay="overlays/dev" --set app_name="anchor-override-app" --set app_port=8888 --set app_replicas=40`, {
      cwd: path.join(cwd, targetFolder),
    });
    
    const anchorOverrideYamls = anchorOverrideResult.toString().split(/---\n/g).filter((s: string) => s.trim() !== '');
    const anchorOverrideObjects = anchorOverrideYamls.map((yaml: string) => parseYaml(yaml));
    const anchorOverrideDeployment = anchorOverrideObjects.find((obj: any) => obj.kind === 'Deployment');
    const anchorOverrideService = anchorOverrideObjects.find((obj: any) => obj.kind === 'Service');
    

    
    expect(anchorOverrideDeployment.metadata.name).toBe('anchor-override-app');
    expect(anchorOverrideDeployment.spec.replicas).toBe(40);
    expect(anchorOverrideDeployment.spec.template.spec.containers[0].ports[0].containerPort).toBe(8888);
    expect(anchorOverrideService.metadata.name).toBe('anchor-override-app');
    expect(anchorOverrideService.spec.ports[0].targetPort).toBe(8888);
    expect(anchorOverrideService.spec.ports[0].port).toBe(8888);

  });

  it('should properly replace anchor values in generated k8s objects when using values file', async () => {
    const options = {
      cwd,
      targetFolder,
      directory,
      kustomizeOptions: {},
      chartName: 'anchors-test-chart',
      chartVersion: '1.0.0',
      chartAppVersion: '1.0.0',
      chartDescription: 'Anchors Test Chart',
      fs: fsDefault,
      execSync,
      tmpFolder: path.resolve(process.cwd(), `test-results/${testName}`),
      replaceAnchorsWithHashes: true, // Enable hash replacement
    };

    try {
      await wrapKustomizeIntoHelm(options);
    } catch (error) {
      console.error('wrapKustomizeIntoHelm failed:', error);
      throw error;
    }

    const cwdHelm = path.join(cwd, targetFolder);
    
    // Create values file with runtime overrides
    const valuesFilePath = path.join(cwdHelm, 'runtime-values.yaml');
    fs.writeFileSync(valuesFilePath, `overlay: "overlays/dev"
app_name: "runtime-app"
app_port: 7777
app_replicas: 42
`);
    
    const runtimeOverrideResult = execSync(`helm template anchors-test-chart . -f runtime-values.yaml`, {
      cwd: cwdHelm
    });
    
    console.log('=== HELM TEMPLATE OUTPUT (VALUES FILE) ===');
    console.log(runtimeOverrideResult.toString());
    console.log('=== END OUTPUT ===');
    
    const runtimeOverrideYamls = runtimeOverrideResult.toString().split(/---\n/g).filter((s: string) => s.trim() !== '');
    console.log('YAML chunks found:', runtimeOverrideYamls.length);
    
    const runtimeOverrideObjects = runtimeOverrideYamls.map((yaml: string) => parseYaml(yaml));
    console.log('Objects found:', runtimeOverrideObjects.map((obj: any) => obj?.kind || 'Unknown'));
    
    const runtimeOverrideDeployment = runtimeOverrideObjects.find((obj: any) => obj.kind === 'Deployment');
    const runtimeOverrideService = runtimeOverrideObjects.find((obj: any) => obj.kind === 'Service');
    
    // Verify objects exist
    expect(runtimeOverrideDeployment).toBeDefined();
    expect(runtimeOverrideService).toBeDefined();
    
    expect(runtimeOverrideDeployment.spec.replicas).toBe(42);
    expect(runtimeOverrideDeployment.metadata.name).toBe('runtime-app');
    expect(runtimeOverrideService.spec.ports[0].port).toBe(7777);
    
    // Test with anchor name overrides using second values file
    const anchorOverrideValuesPath = path.join(cwdHelm, 'anchor-override-values.yaml');
    fs.writeFileSync(anchorOverrideValuesPath, `overlay: "overlays/dev"
app_name: "anchor-override-app"
app_port: 8888
app_replicas: 45
`);
    
    const anchorOverrideResult = execSync(`helm template anchors-test-chart . -f anchor-override-values.yaml`, {
      cwd: cwdHelm,
    });
    
    const anchorOverrideYamls = anchorOverrideResult.toString().split(/---\n/g).filter((s: string) => s.trim() !== '');
    const anchorOverrideObjects = anchorOverrideYamls.map((yaml: string) => parseYaml(yaml));
    const anchorOverrideDeployment = anchorOverrideObjects.find((obj: any) => obj.kind === 'Deployment');
    const anchorOverrideService = anchorOverrideObjects.find((obj: any) => obj.kind === 'Service');
    
    expect(anchorOverrideDeployment.metadata.name).toBe('anchor-override-app');
    expect(anchorOverrideDeployment.spec.replicas).toBe(45);
    expect(anchorOverrideDeployment.spec.template.spec.containers[0].ports[0].containerPort).toBe(8888);
    expect(anchorOverrideService.metadata.name).toBe('anchor-override-app');
    expect(anchorOverrideService.spec.ports[0].targetPort).toBe(8888);
    expect(anchorOverrideService.spec.ports[0].port).toBe(8888);

    // Clean up values files
    fs.unlinkSync(valuesFilePath);
    fs.unlinkSync(anchorOverrideValuesPath);
  });

  it('should properly replace anchor values in generated k8s objects', async () => {
    const options = {
      cwd,
      targetFolder,
      directory,
      kustomizeOptions: {},
      chartName: 'anchors-test-chart',
      chartVersion: '1.0.0',
      chartAppVersion: '1.0.0',
      chartDescription: 'Anchors Test Chart',
      fs: fsDefault,
      execSync,
      tmpFolder: path.resolve(process.cwd(), `test-results/${testName}`),
      replaceAnchorsWithHashes: true, // Enable hash replacement
    };

    await wrapKustomizeIntoHelm(options);

    const defaultResult = execSync(`helm template anchors-test-chart . --set overlay="overlays/dev"`, {
      cwd: path.join(cwd, targetFolder),
    });
    
    console.log('=== DEFAULT VALUES TEST ===');
    const defaultYamls = defaultResult.toString().split(/---\n/g).filter((s: string) => s.trim() !== '');
    const defaultObjects = defaultYamls.map((yaml: string) => parseYaml(yaml));
    const defaultDeployment = defaultObjects.find((obj: any) => obj.kind === 'Deployment');
    const defaultService = defaultObjects.find((obj: any) => obj.kind === 'Service');
    
    // Verify default anchor values are used
    expect(defaultDeployment).toBeDefined();
    expect(defaultService).toBeDefined();
    expect(defaultDeployment.metadata.name).toBe('my-test-app'); // Default anchor value
    expect(defaultDeployment.spec.replicas).toBe(5); // Default anchor value
    expect(defaultDeployment.spec.template.spec.containers[0].ports[0].containerPort).toBe(9090); // Default anchor value
    expect(defaultService.metadata.name).toBe('my-test-app'); // Default anchor value
    expect(defaultService.spec.ports[0].targetPort).toBe(9090); // Default anchor value
    expect(defaultService.spec.ports[0].port).toBe(9090); // Default anchor value
    
    console.log('✓ Default anchor values work correctly');

    const currentBehaviorResult = execSync(`helm template anchors-test-chart . --set overlay="overlays/dev" --set app_name="runtime-override-value" --set app_port=8888 --set app_replicas=7`, {
      cwd: path.join(cwd, targetFolder),
    });

    const currentBehaviorYamls = currentBehaviorResult.toString().split(/---\n/g).filter((s: string) => s.trim() !== '');
    const currentBehaviorObjects = currentBehaviorYamls.map((yaml: string) => parseYaml(yaml));
    const currentBehaviorDeployment = currentBehaviorObjects.find((obj: any) => obj.kind === 'Deployment');
    const currentBehaviorService = currentBehaviorObjects.find((obj: any) => obj.kind === 'Service');


    expect(currentBehaviorDeployment).toBeDefined();
    expect(currentBehaviorService).toBeDefined();
    expect(currentBehaviorDeployment.metadata.name).toBe('runtime-override-value'); // Runtime override now works!
    expect(currentBehaviorDeployment.spec.replicas).toBe(7); // Runtime override now works!
    expect(currentBehaviorDeployment.spec.template.spec.containers[0].ports[0].containerPort).toBe(8888); // Runtime override now works!
    expect(currentBehaviorService.metadata.name).toBe('runtime-override-value'); // Runtime override now works!
    expect(currentBehaviorService.spec.ports[0].targetPort).toBe(8888); // Runtime override now works!
    expect(currentBehaviorService.spec.ports[0].port).toBe(8888); // Runtime override now works!

  });


  it('should handle anchor replacement when disabled', async () => {
    const options = {
      cwd,
      targetFolder: `../test-results/${testName}-disabled`,
      directory,
      kustomizeOptions: {},
      chartName: 'anchors-test-chart-disabled',
      chartVersion: '1.0.0',
      chartAppVersion: '1.0.0',
      chartDescription: 'Anchors Test Chart Disabled',
      fs: fsDefault,
      execSync,
      tmpFolder: path.resolve(process.cwd(), `test-results/${testName}-disabled`),
      replaceAnchorsWithHashes: false, // Disable hash replacement
    };

    await wrapKustomizeIntoHelm(options);

    // Generate the Helm template and parse the results
    const result = execSync(`helm template anchors-test-chart-disabled . --set overlay="overlays/dev"`, {
      cwd: path.join(cwd, `../test-results/${testName}-disabled`),
    });

    const yamls = result.toString().split(/---\n#.+\n/g).filter((s: string) => s.trim() !== '');
    const objects = yamls.map((yaml: string) => parseYaml(yaml));
    
    const deployment = objects.find((obj: any) => obj.kind === 'Deployment');
    const service = objects.find((obj: any) => obj.kind === 'Service');

    // Verify objects exist
    expect(deployment).toBeDefined();
    expect(service).toBeDefined();

    // Since hash replacement is disabled, the original anchor values should still work
    expect(deployment.metadata.name).toBe('my-test-app');
    expect(deployment.spec.replicas).toBe(5);
    expect(service.metadata.name).toBe('my-test-app');

    // Clean up the disabled test result folder
    const resultDir = path.join(cwd, `../test-results/${testName}-disabled`);
    if (fs.existsSync(resultDir)) {
      fs.removeSync(resultDir);
    }
  });
});