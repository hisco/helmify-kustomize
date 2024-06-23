
# helmify-kustomize

`helmify-kustomize` is a cli tool designed to make a Kustomize folder compatible with Helm. This tool allows you to upload (pack) a Kustomize folder into an Helm chart format without converting it.

## Features

- Processes each Kustomize overlays and base configurations and outputs Helm-compatible files based on provided templates.
- Packs all overlays as a single chart.
- Enables helm shipping functionality on a kustomize folder.

## Installation

Esiest no installation (other then nodejs ) just use it with `npx`
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


## Contributing

Contributions are welcome! Please submit a pull request or open an issue to discuss improvements or bugs.

## License

This project is licensed under the MIT License.
