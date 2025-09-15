import { execSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { parse as parseYaml } from 'yaml';
import { wrapKustomizeIntoHelm } from './index';

describe('Namespace Override with Dynamic Values', () => {
  let tempDir: string;
  let overlayDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'namespace-test-'));
    overlayDir = path.join(tempDir, 'overlays', 'dev');
    fs.mkdirSync(overlayDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should allow globals.namespace override with --set when using dynamic values', async () => {
    // Create a source values.yaml with namespace anchor
    const sourceValues = `
namespace: &namespace default-namespace
globals:
  namespace: *namespace
`;
    fs.writeFileSync(path.join(tempDir, 'values.yaml'), sourceValues);

    // Create kustomization.yaml
    const kustomization = `
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - deployment.yaml
  - service.yaml
`;
    fs.writeFileSync(path.join(overlayDir, 'kustomization.yaml'), kustomization);

    // Create deployment.yaml
    const deployment = `
apiVersion: apps/v1
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
        image: nginx:latest
`;
    fs.writeFileSync(path.join(overlayDir, 'deployment.yaml'), deployment);

    // Create service.yaml
    const service = `
apiVersion: v1
kind: Service
metadata:
  name: test-service
spec:
  selector:
    app: test-app
  ports:
  - port: 80
    targetPort: 80
`;
    fs.writeFileSync(path.join(overlayDir, 'service.yaml'), service);

    // Wrap kustomize into helm with dynamic anchor replacement enabled
    await wrapKustomizeIntoHelm({
      cwd: tempDir,
      targetFolder: '.',
      directory: '.',
      kustomizeOptions: {},
      chartName: 'namespace-test-chart',
      chartVersion: '1.0.0',
      chartAppVersion: '1.0.0',
      tmpFolder: os.tmpdir(),
      enabledDynamicAnchorReplacement: true
    });

    // Test 1: Default namespace from values.yaml
    const defaultResult = execSync(`helm template namespace-test . --set overlay="overlays/dev"`, {
      cwd: tempDir,
      encoding: 'utf-8'
    });
    const defaultYamls = defaultResult.split('---').filter(y => y.trim());
    const defaultDeployment = parseYaml(defaultYamls.find(y => y.includes('kind: Deployment'))!);
    const defaultService = parseYaml(defaultYamls.find(y => y.includes('kind: Service'))!);
    
    expect(defaultDeployment.metadata.namespace).toBe('default-namespace');
    expect(defaultService.metadata.namespace).toBe('default-namespace');

    // Test 2: Override namespace with --set globals.namespace
    const overrideResult = execSync(`helm template namespace-test . --set overlay="overlays/dev" --set globals.namespace=override-namespace`, {
      cwd: tempDir,
      encoding: 'utf-8'
    });
    const overrideYamls = overrideResult.split('---').filter(y => y.trim());
    const overrideDeployment = parseYaml(overrideYamls.find(y => y.includes('kind: Deployment'))!);
    const overrideService = parseYaml(overrideYamls.find(y => y.includes('kind: Service'))!);
    
    expect(overrideDeployment.metadata.namespace).toBe('override-namespace');
    expect(overrideService.metadata.namespace).toBe('override-namespace');

    // Test 3: Override root namespace value
    // NOTE: Command-line overrides don't follow YAML anchors, so setting namespace at root
    // won't automatically update globals.namespace. Users need to set globals.namespace directly.
    const rootOverrideResult = execSync(`helm template namespace-test . --set overlay="overlays/dev" --set namespace=root-override`, {
      cwd: tempDir,
      encoding: 'utf-8'
    });
    const rootYamls = rootOverrideResult.split('---').filter(y => y.trim());
    const rootDeployment = parseYaml(rootYamls.find(y => y.includes('kind: Deployment'))!);
    const rootService = parseYaml(rootYamls.find(y => y.includes('kind: Service'))!);
    
    // Since globals.namespace still uses the anchor from values.yaml (not affected by CLI override)
    // the namespace remains the default
    expect(rootDeployment.metadata.namespace).toBe('default-namespace');
    expect(rootService.metadata.namespace).toBe('default-namespace');
  });

  it('should work without dynamic values (no source values.yaml)', async () => {
    // Create kustomization.yaml
    const kustomization = `
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - deployment.yaml
`;
    fs.writeFileSync(path.join(overlayDir, 'kustomization.yaml'), kustomization);

    // Create deployment.yaml
    const deployment = `
apiVersion: apps/v1
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
        image: nginx:latest
`;
    fs.writeFileSync(path.join(overlayDir, 'deployment.yaml'), deployment);

    // Wrap without dynamic anchor replacement (no source values.yaml)
    await wrapKustomizeIntoHelm({
      cwd: tempDir,
      targetFolder: '.',
      directory: '.',
      kustomizeOptions: {},
      chartName: 'namespace-test-chart',
      chartVersion: '1.0.0',
      chartAppVersion: '1.0.0',
      tmpFolder: os.tmpdir(),
      enabledDynamicAnchorReplacement: false
    });

    // Test: Override namespace with --set globals.namespace
    const overrideResult = execSync(`helm template namespace-test . --set overlay="overlays/dev" --set globals.namespace=test-namespace`, {
      cwd: tempDir,
      encoding: 'utf-8'
    });
    const overrideYamls = overrideResult.split('---').filter(y => y.trim());
    const overrideDeployment = parseYaml(overrideYamls.find(y => y.includes('kind: Deployment'))!);
    
    expect(overrideDeployment.metadata.namespace).toBe('test-namespace');
  });
});