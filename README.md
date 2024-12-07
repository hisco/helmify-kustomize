
# helmify-kustomize

`helmify-kustomize` is a cli tool designed to make a Kustomize folder compatible with Helm. This tool allows you to upload (pack) a Kustomize folder into an Helm chart format without manually converting it.
This to enjoy both the philosophy of kustomize and the shipping functionality of helm.

## Features

- Processes each Kustomize overlays and base configurations and outputs Helm-compatible files based on provided templates.
- Packs all overlays as a single chart.
- Enables helm shipping functionality on a kustomize folder.
- Support helm values with kustomize replacements.

## Installation

Easiest, no installation (other then nodejs ) just use it with `npx`
```sh
npx helmify-kustomize <context> --chart-name example-service --target <targetFolder>
```
You can install it globally
```sh
npm i -g helmify-kustomize
helmify-kustomize <context> --chart-name example-service --target <targetFolder>
```

## Usage

To use the module, run the following command:

```sh
npx helmify-kustomize <context> --target <targetFolder>
```

### Options

- `--chart-name <chartName>` : The chart name to be used in Chart.yaml you can read more on the following section what is a valid char name.
- `--chart-version <chartVersion>` : The version of the chart to be used in Chart.yaml.
- `--chart-description <chartDescription>` : The description of the chart to be used in Chart.yaml.
- `--target <targetFolder>`: Target folder for output files (default: `helm-output`).
- `-k-[name] *` : any flag will be forwarded to the kustomize build command `-k-something` is converted to `-something`
- `--k-[name] *` : any flag will be forwarded to the kustomize build command `--k-something` is converted to `--something`

### Example

```sh
npx helmify-kustomize ./kustomize-folder --chart-name example-service --target ./helm-chart
```

This command processes the Kustomize overlays and base configuration, then outputs the Helm-compatible files to the `helm-output` directory.

## How It Works

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


## Contributing

Contributions are welcome! Please submit a pull request or open an issue to discuss improvements or bugs.

## License

This project is licensed under the MIT License.
