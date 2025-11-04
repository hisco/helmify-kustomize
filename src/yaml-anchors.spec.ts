import * as path from 'path';
import { wrapKustomizeIntoHelm } from './index';
import { fsDefault } from './utils';
import { parse as parseYaml } from 'yaml';
const { execSync } = require('child_process');
const fs = require('fs-extra');

describe('YAML anchors and references preservation', () => {
  const testName = 'yaml-anchors-test';
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
      `# Common configuration anchor
common: &common
  environment: production
  region: us-east-1
  logLevel: info

# App configuration using anchor reference
app:
  <<: *common
  name: my-app
  version: 1.0.0
  replicas: 3

# Database configuration with partial reference
database:
  <<: *common
  host: db.example.com
  port: 5432

# Another anchor for defaults
defaults: &defaults
  timeout: 30
  retries: 3

# Service configuration using defaults
service:
  <<: *defaults
  endpoint: https://api.example.com
  healthcheck: /health
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

  it('should preserve YAML anchors and references in values.yaml', async () => {
    const options = {
      cwd,
      targetFolder,
      directory,
      kustomizeOptions: {},
      chartName: 'test-chart',
      chartVersion: '1.0.0',
      chartAppVersion: '1.0.0',
      chartDescription: 'Test Chart',
      fs: fsDefault,
      execSync,
      tmpFolder: path.resolve(process.cwd(), `test-results/${testName}`),
    };

    await wrapKustomizeIntoHelm(options);

    // Read the generated values.yaml
    const generatedValuesPath = path.join(cwd, targetFolder, 'values.yaml');
    const generatedValues = fs.readFileSync(generatedValuesPath, 'utf8');

    // Check that anchors are preserved (default behavior)
    expect(generatedValues).toContain('common: &common');
    expect(generatedValues).toContain('defaults: &defaults');
    
    // Check that references are preserved
    expect(generatedValues).toContain('<<: *common');
    expect(generatedValues).toContain('<<: *defaults');
    
    // Check that the structure is maintained
    expect(generatedValues).toMatch(/common:\s*&common/);
    expect(generatedValues).toMatch(/defaults:\s*&defaults/);
    
    // Check that overlay key was added
    expect(generatedValues).toContain('overlay:');

    // Verify the YAML is still valid by parsing it
    const parsedValues = parseYaml(generatedValues);
    
    // Verify that the anchors and references structure is preserved
    expect(parsedValues.common.environment).toBe('production');
    expect(parsedValues.common.region).toBe('us-east-1');
    expect(parsedValues.common.logLevel).toBe('info');
    
    // Verify that the merge key references are preserved (not resolved)
    expect(parsedValues.app['<<'].environment).toBe('production');
    expect(parsedValues.app['<<'].region).toBe('us-east-1');
    expect(parsedValues.app.name).toBe('my-app');
    
    expect(parsedValues.service['<<'].timeout).toBe(30);
    expect(parsedValues.service['<<'].retries).toBe(3);
    expect(parsedValues.service.endpoint).toBe('https://api.example.com');
  });

  it('should handle deep nested values merging while preserving anchors', async () => {
    const testNameNested = 'yaml-nested-test';
    const targetFolderNested = `../test-results/${testNameNested}`;
    const directoryNested = `./${testNameNested}`;
    
    // Create test directory structure
    const testDirNested = path.join(cwd, directoryNested);
    fs.ensureDirSync(testDirNested);
    fs.ensureDirSync(path.join(testDirNested, 'base'));
    fs.ensureDirSync(path.join(testDirNested, 'overlays'));
    fs.ensureDirSync(path.join(testDirNested, 'overlays/dev'));

    // Create base kustomization.yaml
    fs.writeFileSync(
      path.join(testDirNested, 'base/kustomization.yaml'),
      `apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - deployment.yaml
`
    );

    // Create base deployment
    fs.writeFileSync(
      path.join(testDirNested, 'base/deployment.yaml'),
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
`
    );

    // Create overlay kustomization
    fs.writeFileSync(
      path.join(testDirNested, 'overlays/dev/kustomization.yaml'),
      `apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
bases:
  - ../../base
`
    );

    // Create values.yaml with nested structure and anchors
    fs.writeFileSync(
      path.join(testDirNested, 'values.yaml'),
      `# Common configuration anchor
common: &common
  environment: production
  region: us-east-1

# Existing globals with nested structure
globals:
  existing: value
  namespace: default
  labels:
    app: existing-app
  nested:
    deep:
      value: existing-deep-value
    other: existing-other

# App using anchor
app:
  <<: *common
  name: existing-app
`
    );

    const options = {
      cwd,
      targetFolder: targetFolderNested,
      directory: directoryNested,
      kustomizeOptions: {},
      chartName: 'test-chart-nested',
      chartVersion: '1.0.0',
      chartAppVersion: '1.0.0',
      chartDescription: 'Test Chart Nested',
      fs: fsDefault,
      execSync,
      tmpFolder: path.resolve(process.cwd(), `test-results/${testNameNested}`),
    };

    await wrapKustomizeIntoHelm(options);

    // Read the generated values.yaml
    const generatedValuesPath = path.join(cwd, targetFolderNested, 'values.yaml');
    const generatedValues = fs.readFileSync(generatedValuesPath, 'utf8');

    // Check that anchors are preserved
    expect(generatedValues).toContain('common: &common');
    expect(generatedValues).toContain('<<: *common');

    // Check that overlay key was added
    expect(generatedValues).toContain('overlay:');

    // Verify the YAML parses correctly
    const parsedValues = parseYaml(generatedValues);

    // Verify globals section was removed from values.yaml
    // (It will only exist in _values.yaml.tpl template to prevent
    // static anchor references from overwriting templated values during mergeOverwrite)
    expect(parsedValues.globals).toBeUndefined();
    
    // Verify anchors work when parsed
    expect(parsedValues.app['<<'].environment).toBe('production');
    expect(parsedValues.app['<<'].region).toBe('us-east-1');
    expect(parsedValues.app.name).toBe('existing-app');

    // Clean up
    if (fs.existsSync(testDirNested)) {
      fs.removeSync(testDirNested);
    }
    const resultDirNested = path.join(cwd, targetFolderNested);
    if (fs.existsSync(resultDirNested)) {
      fs.removeSync(resultDirNested);
    }
  });

  it('should handle values.yaml without anchors', async () => {
    const testNameSimple = 'yaml-simple-test';
    const cwdSimple = './kustomize-tests';
    const targetFolderSimple = `../test-results/${testNameSimple}`;
    const directorySimple = `./${testNameSimple}`;

    // Create test directory structure
    const testDirSimple = path.join(cwdSimple, directorySimple);
    fs.ensureDirSync(testDirSimple);
    fs.ensureDirSync(path.join(testDirSimple, 'base'));
    fs.ensureDirSync(path.join(testDirSimple, 'overlays'));
    fs.ensureDirSync(path.join(testDirSimple, 'overlays/dev'));

    // Create base kustomization.yaml
    fs.writeFileSync(
      path.join(testDirSimple, 'base/kustomization.yaml'),
      `apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - deployment.yaml
`
    );

    // Create base deployment
    fs.writeFileSync(
      path.join(testDirSimple, 'base/deployment.yaml'),
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
`
    );

    // Create overlay kustomization
    fs.writeFileSync(
      path.join(testDirSimple, 'overlays/dev/kustomization.yaml'),
      `apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
bases:
  - ../../base
`
    );

    // Create simple values.yaml without anchors
    fs.writeFileSync(
      path.join(testDirSimple, 'values.yaml'),
      `app:
  name: my-app
  version: 1.0.0
database:
  host: localhost
  port: 5432
`
    );

    const options = {
      cwd: cwdSimple,
      targetFolder: targetFolderSimple,
      directory: directorySimple,
      kustomizeOptions: {},
      chartName: 'test-chart-simple',
      chartVersion: '1.0.0',
      chartAppVersion: '1.0.0',
      chartDescription: 'Test Chart Simple',
      fs: fsDefault,
      execSync,
      tmpFolder: path.resolve(process.cwd(), `test-results/${testNameSimple}`),
    };

    await wrapKustomizeIntoHelm(options);

    // Read the generated values.yaml
    const generatedValuesPath = path.join(cwdSimple, targetFolderSimple, 'values.yaml');
    const generatedValues = fs.readFileSync(generatedValuesPath, 'utf8');

    // Check that content is preserved
    expect(generatedValues).toContain('app:');
    expect(generatedValues).toContain('name: my-app');
    expect(generatedValues).toContain('version: 1.0.0');
    expect(generatedValues).toContain('database:');
    expect(generatedValues).toContain('host: localhost');
    expect(generatedValues).toContain('port: 5432');
    expect(generatedValues).toContain('overlay:');

    // Clean up
    if (fs.existsSync(testDirSimple)) {
      fs.removeSync(testDirSimple);
    }
    const resultDirSimple = path.join(cwdSimple, targetFolderSimple);
    if (fs.existsSync(resultDirSimple)) {
      fs.removeSync(resultDirSimple);
    }
  });
});