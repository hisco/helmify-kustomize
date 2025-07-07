import * as path from 'path';
import { parse as parseYaml } from 'yaml';
import { wrapKustomizeIntoHelm } from './index';
import { fsDefault } from './utils';
const { execSync } = require('child_process');
import * as os from 'os';

describe('wrapKustomizeIntoHelm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should create helm chart with basic configuration', async () => {
    const options = {
      cwd: './kustomize-tests',
      targetFolder: '../test-results/simplest-test',
      directory: './simplest-test',
      kustomizeOptions: {},
      chartName: 'test-chart',
      chartVersion: '1.0.0',
      chartAppVersion: '1.0.0',
      chartDescription: 'Test Chart',
      fs: fsDefault,
      execSync: execSync,
      tmpFolder:path.resolve(process.cwd(),  'test-results/replacements-vars'),
    };


    await wrapKustomizeIntoHelm(options);
    const result = execSync(`helm template test-chart . --set overlay="overlays/dev"` , {
      cwd: path.join(options.cwd, options.targetFolder),
    });
    const yamls = result.toString().split(/---\n#.+\n/g).filter((s: string) => s.trim() !== '');
    console.log(yamls);
    expect(yamls.length).toBe(2);
    const serviceYaml = parseYaml(yamls[0]);
    expect(serviceYaml.metadata.name).toBe('nginx-service');
    expect(serviceYaml.spec.ports[0].port).toBe(80);
    expect(serviceYaml.spec.ports[0].protocol).toBe('TCP');
    expect(serviceYaml.spec.ports[0].targetPort).toBe(80);

    const deploymentYaml = parseYaml(yamls[1]);
    expect(deploymentYaml.metadata.name).toBe('nginx-deployment');
    expect(deploymentYaml.spec.replicas).toBe(3);
    expect(deploymentYaml.spec.selector.matchLabels.app).toBe('nginx');
    expect(deploymentYaml.spec.template.spec.containers[0].image).toBe('nginx:1.14.2');
    expect(deploymentYaml.spec.template.spec.containers[0].ports[0].containerPort).toBe(80);
  });

  it('should create helm chart with dynamic configmap parametrization', async () => {
    const options = {
      cwd: './kustomize-tests',
      targetFolder: '../test-results/dynamic-configmap',
      directory: './dynamic-configmap',
      kustomizeOptions: {},
      chartName: 'test-chart',
      chartVersion: '1.0.0',
      chartAppVersion: '2.0.0',
      chartDescription: 'Test Chart',
      fs: fsDefault,
      execSync: execSync,
      overlayFilter: 'overlays/dev,base',
      parametrizeConfigmap: ['env=base-environment-values'],
      tmpFolder:path.resolve(process.cwd(),  'test-results/dynamic-configmap'),
    };
    await wrapKustomizeIntoHelm(options);
    const folder = path.resolve(options.cwd, options.targetFolder);
    const result = execSync(`helm template test-chart . --set overlay="overlays/dev" --set env.TEST=2 --set env.NEW_TEST=1` , {
      cwd: folder,
    });
    const yamls = result.toString().split(/---\n#.+\n/g).filter((s: string) => s.trim() !== '');
    expect(yamls.length).toBe(3);

    const objects = yamls.map((yaml: string) => parseYaml(yaml));

    const baseValuesFile = objects.find((o: any) => o.kind === 'ConfigMap' && o.metadata.name.includes('base-environment-values'));
    // proves that the configmap literals are not overwritten by the values.yaml
    expect(baseValuesFile.data.IMAGE_URL).toBe('nginx:1.14.2');
    // proves that addtional keys are added to the configmap
    expect(baseValuesFile.data.NEW_TEST).toBe("1");
    // proves that the configmap literals are overwritten by the values.yaml
    expect(baseValuesFile.data.TEST).toBe("2");

  });
});
