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
- **NEW: Overlay filtering** - Process only specific overlays

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
- `--overlay-filter <filter>` : Comma-separated list of overlay names to include

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
- `Values.globals.namespace` : Specify the namespace in all resources.
- `Values.globals.namePrefix` : Prepends the value to the names of all resources and references.
- `Values.globals.nameSuffix` : Appends the value to the names of all resources and references.
- `Values.globals.nameReleasePrefix` : Prepends the value to the name of the release.
- `Values.globals.labels` : Specify the labels in all resources.
- `Values.globals.annotations` : Specify the annotations in all resources.
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

### Example of how to set these values with the helm set command

Here demonstrated only a few of the possible values, but you can set any of the values in the `values.yaml` file.

```sh
helm upgrade --install example-service ./helm-chart --set globals.namespace=new-namespace --set globals.namePrefix=new-name-prefix
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

**Process only the dev overlay:**
```bash
helmify-kustomize \
  --directory ./my-kustomize \
  --target-folder ./my-helm-chart \
  --chart-name my-app \
  --chart-version 1.0.0 \
  --overlay-filter dev
```

**Process all overlays (default behavior):**
```bash
helmify-kustomize \
  --directory ./my-kustomize \
  --target-folder ./my-helm-chart \
  --chart-name my-app \
  --chart-version 1.0.0
  # No --overlay-filter specified, processes all overlays
```
