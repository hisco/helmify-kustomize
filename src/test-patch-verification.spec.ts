import * as path from 'path';
import { parse as parseYaml } from 'yaml';
import { fsDefault } from './utils';
const { execSync } = require('child_process');
import * as os from 'os';
import { chartUtils } from './templates/helm-utils';

const helmChartRaw = chartUtils('chartUtils');

function printOutput2(template:string){
  return `
  ${template}
  {{- include "chartUtils.applyTargetedPatches" (dict "resources" .Values.k8sResources "patches" .Values.patchs) -}}
{{- range $index, $resource := .Values.k8sResources -}}
{{- if $index }}
---
{{- end }}
{{- toYaml $resource }}
{{- end -}}
  `
}

function testHelm({valuesYaml , template }:{valuesYaml:string, template:string}):string{
  const tmpFolder = path.join(os.tmpdir(), Math.random().toString(36).substring(2, 15));
  fsDefault.mkdirSync(tmpFolder);
  fsDefault.writeFileSync(path.join(tmpFolder, 'values.yaml'), valuesYaml);
  fsDefault.mkdirSync(path.join(tmpFolder, 'templates'));
  fsDefault.writeFileSync(path.join(tmpFolder, 'templates', 'test.yaml'), template);
  fsDefault.writeFileSync(path.join(tmpFolder, 'Chart.yaml'), `
    name: test-chart
    version: 1.0.0
    appVersion: 1.0.0
  `);
  const result = execSync(`helm template test-chart .` , {
    cwd: tmpFolder,
  });
  return result.toString();
}

describe('Patch Application Verification', () => {
  it('should apply patches to a simple deployment', () => {
    const valuesYaml = `
k8sResources:
- apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: test-deployment
  spec:
    replicas: 1

patchs:
- target:
    group: apps
    version: v1
    kind: Deployment
    name: test-deployment
  ops:
    - op: add
      path: /metadata/labels
      value:
        patched: "true"
`;

    const result = testHelm({
      valuesYaml,
      template: printOutput2(helmChartRaw),
    });

    console.log('=== RAW HELM OUTPUT ===');
    console.log(result);
    console.log('=== END RAW OUTPUT ===\n');

    // Parse the output
    const documents = result.split('---').filter(doc => doc.trim());
    const actualResources = documents.map(doc => {
      try {
        // Remove comment lines before parsing
        const lines = doc.split('\n');
        const yamlLines = lines.filter(line => !line.trim().startsWith('#'));
        const yamlContent = yamlLines.join('\n').trim();
        
        if (!yamlContent) return null;
        
        return parseYaml(yamlContent);
      } catch (e) {
        console.error('Parse error:', e);
        return null;
      }
    }).filter(obj => obj);

    console.log('Parsed resources:', actualResources);

    expect(actualResources).toHaveLength(1);
    const deployment = actualResources[0];
    expect(deployment.kind).toBe('Deployment');
    expect(deployment.metadata.name).toBe('test-deployment');
    expect(deployment.metadata.labels).toBeDefined();
    expect(deployment.metadata.labels.patched).toBe('true');
  });
}); 