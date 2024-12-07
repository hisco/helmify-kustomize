const { promisify } = require('util');
const { readFile } = require('fs/promises');
const glob = promisify(require('glob'));
const { parse } = require('yaml');
const { parse: parseEnvFile } = require('dotenv');

/*
This file has utility functions to read kustomize files to support the following:

## Kustomize replacements with helm values

Kustomize Replacements are used to copy fields from one source into any number of specified targets.
Combined with .env file you can use it to dynamically set values in your helm chart using helm values.

During the build process the following happens:
1. All configMapGenerator and secretGenerator fields are being read from the kustomization.yaml file
2. All Replacements are being read from the kustomization.yaml file.
3. ConfigMaps and Secrets are being created as helm templates with is using property accessors to access the values such as `{{ .Values.".env".propertyName | default "actual value from .env file" }}` with a default value of the actual value from the .env file.
By the following logic:
- If the property is only being used in a replacement, the property will be set as a placeholder in the helm template with no default value.
- If the property is set in the .env file, the default value will be the value from the .env file.
- property accessor is calculated based on the file name, and property name `{{ .Values.".env".propertyName }}`, supporting any file name and property name.

Example:
Your kustomization.yaml file contains the following:
```yaml
configMapGenerator:
- name: example-configmap
  files:
  - .env
replacements:
  - source:
      fieldPath: data.NAMESPACE
      kind: ConfigMap
      name: example-configmap
    targets:
      - fieldPaths:
        - metadata.namespace
        options:
          create: true
        reject:
        - kind: Namespace
        select: {}
```

Your .env file contains the following:
(Notice we are missing the NAMESPACE property in the .env file)
```
EXAMPLE_PROPERTY=example_value
```

After the build process the following helm template is created:
```yaml
kind: ConfigMap
apiVersion: v1
metadata:
  name: example-configmap
data:
  EXAMPLE_PROPERTY: {{ .Values.".env".EXAMPLE_PROPERTY | default "example_value" }}
  NAMESPACE: {{ .Values.".env".NAMESPACE }}
```
Notice:
- For EXAMPLE_PROPERTY default value is being set from the .env file.
- For NAMESPACE there is no default value set, so it will be empty.
*/

// load kustomize files from kustomize folder
export async function loadKustomizeFiles(baseFolder) {
  try {
    // Find all kustomization.yaml files recursively
    const files = await glob(`${baseFolder}/**/kustomization.yaml`);

    const result = {};

    // Process each file
    for (const file of files) {
      const fileContent = await readFile(file, 'utf8');

      // Convert file path into nested object keys
      const relativePath = file.replace(`${baseFolder}/`, '');
      const pathParts = relativePath.split('/');
      const fileName = pathParts.pop(); // kustomization.yaml
      let currentLevel = result;

      for (const part of pathParts) {
        currentLevel[part] = currentLevel[part] || {};
        currentLevel = currentLevel[part];
      }

      try{
        currentLevel[fileName] = parse(fileContent);
      }catch(err){
        console.error(`Error parsing kustomization.yaml file: ${file}`, err);
        throw err;
      }
    }

    return result;
  } catch (err) {
    console.error('Error reading kustomize files:', err);
    throw err;
  }
}

async function createValuesAccessors(overlays, kustomizeFiles){
  // read kustomization.yaml inside the base folder.
  // find all configMapGenerator and secretGenerator configurations.
  // for each configuration read it's files (parse the .env files) and add the following to the result array:
  // {
  //   overlay: 'base' or 'overlay name',
  //   file: file name,
  //   property: the property name from the .env file
  //   defaultValue: the values found in the .env file or empty string
  //   generatorName: the name of either the config map or secret as defined in the kustomization.yaml in configMapGenerator or secretGenerator
  //   kind: secretGenerator or configMapGenerator
  // }
  const result = [];
  const allConfigFiles = kustomizeFiles.base ? await getAllFiles('base', kustomizeFiles.base) : [];

  for(const overlay of overlays){
    const overlayFiles = await getAllFiles(overlay, kustomizeFiles[overlay]);
    
    
  }

  async function getAllFiles(overlay , folder, kustomizeFile){
    const configMapGenerators = kustomizeFile.configMapGenerator || [];
    const secretGenerators = kustomizeFile.secretGenerator || [];

    allConfigFiles.push(...configMapGenerators.map((configMapGenerator) => configMapGenerator.envs || []).flat());
    allConfigFiles.push(...secretGenerators.map((secretGenerator) => secretGenerator.envs || []).flat());
    // remove duplicates
    allConfigFiles = [...new Set(allConfigFiles)];

    
    const allConfigFilesContent = await Promise.all(allConfigFiles.map(async (file) => {
      const fileContent = await readFile(path.join(folder, file), 'utf8');
      return parseEnvFile(fileContent);
    }));

    return allConfigFilesContent.map((fileContent, index) => ({
      overlay,
      filename: allConfigFiles[index],
      filepath: path.join(folder, allConfigFiles[index]),
      object: fileContent
    }));
  }
}