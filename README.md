# helmify-kustomize

`helmify-kustomize` is a cli tool designed to make a Kustomize folder compatible with Helm. This tool allows you to upload (pack) a Kustomize folder into an Helm chart format without manually converting it.
This to enjoy both the philosophy of kustomize and the shipping/deployment functionality of helm.

[![npm version](https://img.shields.io/npm/v/helmify-kustomize.svg?style=flat-square)](https://www.npmjs.org/package/helmify-kustomize)
[![Known Vulnerabilities](https://snyk.io/test/npm/helmify-kustomize/badge.svg)](https://snyk.io/test/npm/helmify-kustomize)

## TL;DR

You have a standard kustomize folder and you want to convert it to a helm chart, you can do it with this tool.
Let's assume this is your kustomize folder structure:
```
kustomize-folder
└── base
|   ├── kustomization.yaml
|   |   ├── .env
|   |   ├── configmap.yaml
|   |   ├── service.yaml
|   |   └── deployment.yaml
├── overlays
│   ├── dev
│   │   ├── kustomization.yaml
│   │   ├── deployment-patch.yaml
│   │   └── .env
│   └── prod
│       ├── kustomization.yaml
│       ├── deployment-patch.yaml
│       └── .env
```

You can run the following command to convert it to a helm chart:
```sh
npx helmify-kustomize build ./kustomize-folder --chart-name example-service --target ./helm-chart
```

This will create a helm chart in the `helm-chart` folder in the target folder `./helm-chart`.
You can now use the helm chart to deploy your application.

Upgrade the chart with the following command:
```sh
helm upgrade --install example-service ./helm-chart
```

Or Create a package and push it to a chart repository:
```sh
helm package ./helm-chart
helm push example-service-0.1.0.tgz oci://<registry>/<repository>
```


## Features

- Processes each Kustomize overlays and base configurations and outputs Helm-compatible files based on provided templates.
- Packs all overlays as a single chart.
- Enables helm shipping functionality on a kustomize folder.
- Support helm values with kustomize replacements.
- Built in helm values to enable advanced functionality (Read more below).
- **Overlay filtering** - Process only specific overlays
- **NEW: Kustomize Files Integration** - Include original kustomization files as Helm template data
- **NEW: Enhanced ConfigMap Parametrization** - Full runtime configurability of ConfigMap data

## Installation

Easiest, no installation (other then nodejs ) just use it with `npx`
```sh
npx helmify-kustomize build <context> --chart-name example-service --target <targetFolder>
```
You can install it globally
```sh
npm i -g helmify-kustomize
helmify-kustomize build <context> --chart-name example-service --target <targetFolder>
```

## Usage

To use the module, run the following command:

```sh
npx helmify-kustomize build <context> --target <targetFolder>
```

### Options

- `--chart-name <chartName>` : The chart name to be used in Chart.yaml you can read more on the following section what is a valid char name.
- `--chart-version <chartVersion>` : The version of the chart to be used in Chart.yaml.
- `--chart-description <chartDescription>` : The description of the chart to be used in Chart.yaml.
- `--target <targetFolder>`: Target folder for output files (default: `helm-output`).
- `-k-[name] *` : any flag will be forwarded to the kustomize build command `-k-something` is converted to `-something`
- `--k-[name] *` : any flag will be forwarded to the kustomize build command `--k-something` is converted to `--something`
- `--parametrize <key>=<path>` : This flag is used to parametrize .env files into the helm values.
- `--parametrize-configmap <key>=<path>` : The flag is used to parametrize the configmap in runtime by the key parameter in the .Values, read more about `disableNameSuffixHash`
- `--overlay-filter <filter>` : Comma-separated list of overlay names to include
- `--include-kustomize-files` : Include original kustomization files as template data (default: false)

### Example

```sh
npx helmify-kustomize build ./kustomize-folder --chart-name example-service --target ./helm-chart
```

This command processes the Kustomize overlays and base configuration, then outputs the Helm-compatible files to the `helm-output` directory.

## How It Works
The core logic is as follows:
1. The module reads the overlays and base configuration from the current working directory.
2. `kustomize` cli needs to be installed seperatly, `helmify-kustomize` executes `kustomize build` to process each overlay and the base configuration.
3. The output overlays are then rendered wrapped as helm chart templates and written to the target folder as templates, with a single if..else condition to activate the specific overlay template.
4. You can activate the specific overlay by defining the overlay name in the overlay parameter


## Helm Chart Naming Conventions

When naming a Helm chart, there are some limitations and best practices you should follow. Here are the key considerations:

### Character Set
- Chart names must consist of lower case alphanumeric characters (`a-z`, `0-9`) and hyphens (`-`).
- They cannot contain spaces or special characters other than hyphens.

### Length
- There is no explicit length limit for chart names, but it is good practice to keep names reasonably short and meaningful.

### Start and End
- Chart names must start with a lower case letter.
- They must end with a lower case letter or a number.

### DNS Compatibility
- Helm chart names should be DNS-compatible. This means they should follow the conventions used for domain names, which helps avoid issues with tools and services that expect DNS-compatible names.

### Uniqueness
- Ensure that the chart name is unique within your repository to avoid conflicts.

### Avoid Reserved Words
- Avoid using reserved words or names that might conflict with existing tools or services.

### Examples

#### Valid Helm Chart Names
- `my-app`
- `nginx-chart`
- `example-service`

#### Invalid Helm Chart Names
- `MyApp` (uppercase letters)
- `my_app` (underscore character)
- `my-app!` (special character `!`)

### Example of a Valid `Chart.yaml`

Here is a snippet of a `Chart.yaml` file with a valid chart name:

```yaml
apiVersion: v2
name: my-app
description: A Helm chart for Kubernetes
version: 0.1.0
appVersion: 1.0.0
```

By following these guidelines, you can ensure that your Helm chart names are valid and compatible with Helm and Kubernetes naming conventions.

## Built in helm values

`helmify-kustomize` comes with a built in helm values file that is used to set the values for the helm chart.
The file is named `values.yaml` and is located in the target folder.

This allows for a lot of flexibility in the helm chart, for example you can set the namespace, namePrefix, nameSuffix, nameReleasePrefix, labels, annotations, images, manifests, resources even after the chart is uploaded to a chart repository.


If you think that something is missing and should be added to the built in helm values, please open an issue or a pull request.

- `Values.overlay` : This is the name of the overlay that is been deployed, example `overlays/dev` or `overlays/prod`.
- `Values.helmifyPrefix` : Customize the location of global helmify configuration. By default, global settings are read from `globals`, but setting this to another value (e.g., `"customGlobals"`) will read from that location instead. 
- `Values.globals.namespace` : Specify the namespace in all resources.
- `Values.globals.namePrefix` : Prepends the value to the names of all resources and references.
- `Values.globals.nameSuffix` : Appends the value to the names of all resources and references.
- `Values.globals.nameReleasePrefix` : Prepends the value to the name of the release.
- `Values.globals.labels` : Specify the labels in all resources.
- `Values.globals.annotations` : Specify the annotations in all resources.
- `Values.globals.patches` : Apply targeted patches to specific resources. Allows fine-grained modification of Kubernetes resources based on flexible target selectors.
- `Values.images` : Specify the images to be updated in the helm chart, simillar to kustomize images section, see example below.
- `Values.manifests` : Specify the manifests to be added to your deployment, these manifests will go through the rest of the pipeline, i.e. they will be affected by the `globals` and `images` sections.
- `Values.resources` : Specify the resources to be added to your deployment, these resources will be added as is to the deployment they will not go through the rest of the pipeline.

### Example of what is possilbe to set in the `values.yaml` file
```yaml
overlay: overlays/dev
globals:
  namespace: dev
  namePrefix: dev-
  nameSuffix: -dev
  nameReleasePrefix: dev-
  labels:
    app: dev
  annotations:
    app: dev
  patches:
    - target:
        kind: Deployment
        name: web-app
      ops:
        - op: add
          path: /spec/template/spec/containers/0/env/-
          value:
            name: LOG_LEVEL
            value: debug
    - target:
        labelSelector: "app=web"
      ops:
        - op: add
          path: /metadata/labels/environment
          value: development
  images:
    - image: . # this will catch all images in all deployment
      pullSecrets: # this will add the pull secrets to all pods
        - name: new-pull-secret
    - image: old-image # this will catch all images in all deployment with the old-image name
      newName: new-image
      newTag: new-tag
      digest: new-digest
manifests:
  - kind: Deployment # this will be added to result and go through the rest of the pipeline manipulations
    name: example-deployment
    spec:
      template:
        spec:
          containers:
            - name: example-container
              image: example-image
resources:
  - kind: Deployment # this will be added to result as is
    name: example-deployment
    spec:
      template:
        spec:
          containers:
            - name: example-container
              image: example-image
```

### Example using custom helmifyPrefix location
```yaml
overlay: overlays/prod
helmifyPrefix: "customGlobals"  # use customGlobals instead of globals
customGlobals:  # all global settings now go here instead of globals
  namespace: production
  namePrefix: prod-
  labels:
    environment: production
    team: platform
  patches:
    - target:
        group: apps
        version: v1
        kind: Deployment
        namespace: production
      ops:
        - op: add
          path: /metadata/labels/release-channel
          value: stable
  images:
    - image: old-image
      newName: prod-image
      newTag: v2.0.0
```

### Example of how to set these values with the helm set command

Here demonstrated only a few of the possible values, but you can set any of the values in the `values.yaml` file.

```sh
helm upgrade --install example-service ./helm-chart --set globals.namespace=new-namespace --set globals.namePrefix=new-name-prefix
```

When using custom helmifyPrefix, adjust the paths accordingly:

```sh
helm upgrade --install example-service ./helm-chart --set helmifyPrefix=customGlobals --set customGlobals.namespace=new-namespace --set customGlobals.namePrefix=new-name-prefix
```

## Targeted Resource Patching

The `globals.patches` feature allows you to apply targeted modifications to specific Kubernetes resources in your Helm chart. This provides fine-grained control over resource configuration without modifying the underlying Kustomize files.

> **Implementation Status**: ✅ **Fully supported** with advanced targeting capabilities including regex patterns, namespace filtering, label/annotation selectors, and wildcard behavior. See table below for specific limitations.

### Target Filtering

Each patch contains a `target` block that lets you filter which objects the patch will affect by combining any of these fields:

| Field | Matches by … | Accepts |
|-------|-------------|---------|
| `group` | API group | e.g. `apps`, `batch`, empty string `""` for core/v1 |
| `version` | API version | `v1`, `v1beta1`, etc. |
| `kind` | Resource kind | `Deployment`, `ConfigMap`, etc.<br/>Regex allowed: `.*Set$` |
| `name` | Object name | Exact name or Go-regex: `^web-.*` |
| `namespace` | Namespace | `prod`, `staging`, etc. |
| `labelSelector`* | Kubernetes label selector | `app=web,tier=frontend` (simple selectors) |
| `annotationSelector` | Annotation selector | **Not yet implemented** (planned) |

**Important:** 
- All supplied conditions are AND-ed together
- Anything you leave out acts like a wildcard ("match all")
- (*) Complex label selectors with `in` operators (e.g., `tier in (frontend,backend)`) have parsing limitations

### Patch Operations

Each patch supports standard JSON Patch operations:
- `add` - Add new values or append to arrays
- `remove` - Remove properties or array elements  
- `replace` - Replace existing values

### Examples

#### Basic Resource Targeting
```yaml
globals:
  patches:
  - target:
      group: apps
      version: v1
      kind: Deployment
      name: web-app
    ops:
    - op: add
      path: /spec/template/spec/containers/0/env/-
      value:
        name: LOG_LEVEL
        value: debug
```

#### Regex Pattern Matching
```yaml
globals:
  patches:
  - target:
      group: apps
      version: v1
      kind: ".*Set$"  # Matches DaemonSet, ReplicaSet, etc.
      name: "^web-.*" # Matches names starting with "web-"
    ops:
    - op: add
      path: /metadata/labels/matched-by-regex
      value: "true"
```

#### Label Selector Targeting
```yaml
globals:
  patches:
  - target:
      labelSelector: "app=web,tier=frontend"
    ops:
    - op: add
      path: /metadata/labels/web-tier
      value: "true"
```

#### Annotation Selector Targeting
```yaml
globals:
  patches:
  - target:
      annotationSelector: "service.beta.kubernetes.io/aws-load-balancer-type,environment=production"
    ops:
    - op: add
      path: /metadata/labels/aws-production-lb
      value: "true"
```

#### Combined Targeting (AND Logic)
```yaml
globals:
  patches:
  - target:
      group: apps
      version: v1
      kind: Deployment
      name: "^web-.*"
      namespace: production
      labelSelector: "app=web,tier=frontend"
      annotationSelector: "deploy.version=2.0"
    ops:
    - op: add
      path: /metadata/labels/fully-matched
      value: "true"
```

#### Wildcard Targeting
```yaml
globals:
  patches:
  - target:
      labelSelector: "type=application"  # Only labelSelector specified
      # group, version, kind omitted = matches ALL resource types
    ops:
    - op: add
      path: /metadata/labels/wildcard-matched
      value: "true"
```

#### Advanced Path Operations
```yaml
globals:
  patches:
  - target:
      kind: Deployment
      name: my-app
    ops:
    # Add environment variable
    - op: add
      path: /spec/template/spec/containers/0/env/-
      value:
        name: NEW_VAR
        value: new_value
    # Remove a label
    - op: remove
      path: /metadata/labels/old-label
    # Replace replicas
    - op: replace
      path: /spec/replicas
      value: 5
```

### Using with Helm Commands

You can also set patches via Helm command line using `--set-json`:

```sh
helm upgrade --install myapp ./chart \
  --set-json 'globals.patches=[{
    "target": {
      "kind": "Deployment",
      "name": "web-app"
    },
    "ops": [{
      "op": "add",
      "path": "/metadata/labels/env",
      "value": "production"
    }]
  }]'
```

Or for multiple patches:

```sh
helm upgrade --install myapp ./chart \
  --set-json 'globals.patches=[
    {
      "target": {
        "group": "apps",
        "version": "v1", 
        "kind": "Deployment",
        "labelSelector": "app=web"
      },
      "ops": [{
        "op": "add",
        "path": "/spec/template/spec/containers/0/env/-",
        "value": {
          "name": "LOG_LEVEL",
          "value": "debug"
        }
      }]
    },
    {
      "target": {
        "kind": "Service"
      },
      "ops": [{
        "op": "add",
        "path": "/metadata/labels/environment",
        "value": "production"
      }]
    }
  ]'
```

#### Advanced Helm Targeting Examples

```sh
# Regex pattern targeting
helm upgrade --install myapp ./chart \
  --set-json 'globals.patches=[{
    "target": {
      "kind": ".*Set$",
      "name": "^web-.*"
    },
    "ops": [{"op": "add", "path": "/metadata/labels/matched-by-regex", "value": "true"}]
  }]'

# Namespace-specific targeting
helm upgrade --install myapp ./chart \
  --set-json 'globals.patches=[{
    "target": {
      "namespace": "production",
      "kind": "Deployment"
    },
    "ops": [{"op": "add", "path": "/metadata/labels/env", "value": "prod"}]
  }]'

# Label selector targeting (simple selectors)
helm upgrade --install myapp ./chart \
  --set-json 'globals.patches=[{
    "target": {
      "labelSelector": "app=web,tier=frontend"
    },
    "ops": [{"op": "add", "path": "/metadata/labels/web-tier", "value": "true"}]
  }]'
```

## Kustomize replacements with helm values

Kustomize Replacements are used to copy fields from one source into any number of specified targets.
Combined with .env file you can use it to dynamically set values in your helm chart using helm values.

During build process when the parametrize list is provided example `--parametrize devEnv=overlays/dev/.env --parametrize baseEnv=base/.env` the following happens:
- The parametrize list is a list of pairs, the left side is the key of the value in the helm values, the right side is the path to the file to be read, `devEnv=overlays/dev/.env` will set the value of `devEnv` in the helm values to the value of the `.env` file in the `overlays/dev` folder.
- Each of the files in the parametrize list is being read and the values are being randomly set during the kustomize build process.
- The core logic wraps the results of all overlays into a single helm chart.
- The random values are replaced with the property accessor based on the left side of the pair `{{ .Values.devEnv.propertyName }}` with a default value of the actual value from the .env file.

Example:
Your kustomization.yaml file contains the following:
```yaml
configMapGenerator:
- name: example-configmap
  files:
  - .env
replacements:
  - source:
      fieldPath: data.EXAMPLE_PROPERTY
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
```
EXAMPLE_PROPERTY=example_value
```

Building the kustomize folder with the following command:
```sh
npx helmify-kustomize build ./kustomize-folder --chart-name example-service --target ./helm-chart --parametrize devEnv=overlays/dev/.env
```

After the build process the following helm template is created:
```yaml
kind: ConfigMap
apiVersion: v1
metadata:
  name: example-configmap
data:
  EXAMPLE_PROPERTY: {{ .Values.devEnv.EXAMPLE_PROPERTY }}
```

This is the relevant part of the Values.yaml file that is created:
```yaml
devEnv:
  EXAMPLE_PROPERTY: example_value
```

## ConfigMap Parametrization

The `--parametrize-configmap` flag allows you to make specific ConfigMaps in your Helm chart fully parametrizable through Helm values. This transforms static ConfigMap data into dynamic template expressions that are resolved at deployment runtime.

### How It Works

When you use `--parametrize-configmap <key>=<name>`, the tool:

1. **Identifies the ConfigMap** by the specified `<name>` in your Kustomize output
2. **Replaces all static data values** in that ConfigMap with Helm template expressions
3. **Creates template expressions** that reference `.Values.<key>` for each data field
4. **Requires you to provide the actual values** in your Helm values.yaml or at deployment time

### Usage

```bash
npx helmify-kustomize build ./kustomize-folder \
  --chart-name example-service \
  --target ./helm-chart \
  --parametrize-configmap appConfig=app-config \
  --parametrize-configmap dbConfig=database-config
```

### Example

**Input:** Your Kustomize generates a ConfigMap like:
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
data:
  APP_NAME: my-application
  APP_VERSION: 1.0.0
  DEBUG_MODE: false
```

**Command:**
```bash
npx helmify-kustomize build ./kustomize-folder \
  --chart-name example-service \
  --target ./helm-chart \
  --parametrize-configmap appConfig=app-config
```

**Output:** Generated Helm template:
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
data:
  APP_NAME: my-app-example
  APP_VERSION: 2.0.0
  DEBUG_MODE: true
```

**Required:** You must provide the values in your `values.yaml`:
```yaml
appConfig:
  APP_NAME: my-application
  APP_VERSION: 1.0.0
  DEBUG_MODE: false
```

**Important:** Any key/value pair you add to the `appConfig` object will automatically become a key/value pair in the ConfigMap data. This means you can dynamically add new configuration keys without modifying the Helm template.

### Deployment-Time Configuration

The real power comes at deployment time when you can override these values:

```bash
helm upgrade --install my-app ./helm-chart \
  --set appConfig.APP_NAME="production-app" \
  --set appConfig.DEBUG_MODE="true"
```

Or using a custom values file:
```bash
helm upgrade --install my-app ./helm-chart -f custom-values.yaml
```

Where `custom-values.yaml` contains:
```yaml
appConfig:
  APP_NAME: production-app
  APP_VERSION: 2.0.0
  DEBUG_MODE: true
  # New keys automatically added to ConfigMap
  DATABASE_URL: postgres://prod-db:5432/myapp
  REDIS_URL: redis://prod-redis:6379
  FEATURE_FLAG_X: enabled
```

### Dynamic ConfigMap Example

Here's what happens when you add new properties and change existing ones:

**Original ConfigMap (from Kustomize):**
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: database-config
data:
  DB_HOST: localhost
  DB_PORT: "5432"
  DB_NAME: myapp
```

**After parametrization with additional values:**
```yaml
# values.yaml
dbConfig:
  DB_HOST: localhost          # original value
  DB_PORT: "5432"            # original value  
  DB_NAME: production-db     # changed value
  DB_SSL_MODE: require       # new value
  DB_POOL_SIZE: "20"         # new value
  BACKUP_ENABLED: "true"     # new value
```

**Resulting deployed ConfigMap:**
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: database-config
data:
  DB_HOST: localhost
  DB_PORT: "5432"
  DB_NAME: production-db     # ← changed
  DB_SSL_MODE: require       # ← new
  DB_POOL_SIZE: "20"         # ← new  
  BACKUP_ENABLED: "true"     # ← new
```

### disableNameSuffixHash

By default, Kustomize adds a hash suffix to ConfigMap names to trigger pod restarts when the ConfigMap content changes. When using `--parametrize-configmap`, you should disable this behavior to maintain consistent ConfigMap names that can be reliably referenced by the parametrization.

Add `disableNameSuffixHash: true` to your ConfigMap generator in kustomization.yaml:

```yaml
configMapGenerator:
- name: app-config
  files:
  - app.properties
  options:
    disableNameSuffixHash: true
```

This ensures that the ConfigMap name remains `app-config` instead of `app-config-abc123hash`, allowing the tool to correctly identify and parametrize the ConfigMap by its predictable name.

### Best Practices

1. **Use descriptive keys** for the parametrization (e.g., `appConfig`, `dbConfig`) to make values.yaml clear
2. **Always set disableNameSuffixHash: true** for ConfigMaps you want to parametrize
3. **Provide complete values** in your values.yaml since the ConfigMap data becomes fully dependent on Helm values
4. **Take advantage of dynamic properties** - You can add new configuration keys at deployment time without modifying the Helm template
5. **Use environment-specific values files** to maintain different configurations for different environments while using the same template

## Contributing

Contributions are welcome! Please submit a pull request or open an issue to discuss improvements or bugs.

## License

This project is licensed under the MIT License.

## Examples

### Example 1: Single Overlay Filter

```bash
helmify-kustomize \
  --directory ./my-kustomize \
  --target-folder ./my-helm-chart \
  --chart-name my-app \
  --chart-version 1.0.0 \
  --overlay-filter staging
```

### Example 2: Multiple Overlay Filter

```bash
helmify-kustomize \
  --directory ./my-kustomize \
  --target-folder ./my-helm-chart \
  --chart-name my-app \
  --chart-version 1.0.0 \
  --overlay-filter staging,prod
```

### Example 3: With Parameterization

```bash
helmify-kustomize \
  --directory ./my-kustomize \
  --target-folder ./my-helm-chart \
  --chart-name my-app \
  --chart-version 1.0.0 \
  --overlay-filter dev \
  --parametrize devEnv=overlays/dev/.env
```

### Example 4: With ConfigMap Parametrization

```bash
helmify-kustomize \
  --directory ./my-kustomize \
  --target-folder ./my-helm-chart \
  --chart-name my-app \
  --chart-version 1.0.0 \
  --parametrize-configmap appConfig=app-config-cm \
  --parametrize-configmap dbConfig=database-config-cm
```


### Practical Example

Given a Kustomize directory structure:

```
my-kustomize/
├── base/
│   ├── kustomization.yaml
│   ├── deployment.yaml
│   └── service.yaml
└── overlays/
    ├── dev/
    │   ├── kustomization.yaml
    │   └── .env
    ├── staging/
    │   ├── kustomization.yaml
    │   └── .env
    ├── prod/
    │   ├── kustomization.yaml
    │   └── .env
    └── test/
        ├── kustomization.yaml
        └── .env
```

**Process only staging and prod overlays:**
```bash
helmify-kustomize \
  --directory ./my-kustomize \
  --target-folder ./my-helm-chart \
  --chart-name my-app \
  --chart-version 1.0.0 \
  --overlay-filter staging,prod
```

**Process only the dev overlay with kustomize files:**
```bash
helmify-kustomize \
  --directory ./my-kustomize \
  --target-folder ./my-helm-chart \
  --chart-name my-app \
  --chart-version 1.0.0 \
  --overlay-filter dev \
  --include-kustomize-files
```

**Process all overlays with ConfigMap parametrization:**
```bash
helmify-kustomize \
  --directory ./my-kustomize \
  --target-folder ./my-helm-chart \
  --chart-name my-app \
  --chart-version 1.0.0 \
  --parametrize-configmap appConfig=app-config-cm
  # No --overlay-filter specified, processes all overlays
```
