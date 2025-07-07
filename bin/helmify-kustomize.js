#!/usr/bin/env node
const { Command } = require('commander');
const { wrapKustomizeIntoHelm } = require('../dist/index');
const { execSync } = require('child_process');
const os = require('os');
// Configure command-line arguments
let directory = '.';
let action = '';
const program = new Command();
program
    .option('--target <targetFolder>', 'Target folder for output files', 'helm-output')
    // kustomize options
    .allowUnknownOption() // To allow unknown options for parsing kustomize options
    .argument('[action]', 'build creates a chart folder', '.')
    .argument('[directory]', 'Path to kustomization directory', '.')
    .option('--clear', 'Clear target folder', false)
    .option('--chart-name <chartName>', 'The name of the chart', '')
    .option('--chart-version <chartVersion>', 'The version of the chart', '0.0.1')
    .option('--chart-app-version <chartAppVersion>', 'The app version of the chart', '0.0.1')
    .option('--chart-description <chartDescription>', 'The description of the chart', 'A Helm chart for Kubernetes')
    // add a list of files to parametrize, example --parametrize devEnv=overlays/dev/.env --parametrize baseEnv=base/.env
    .option('--parametrize <parametrize>', 'List of files to parametrize', collect, [])
    // add overlay filter option, example --overlay-filter staging,prod
    .option('--parametrize-configmap <parametrizeConfigmap>', 'The configmap to parametrize', collect, [])
    .option('--overlay-filter <overlayFilter>', 'Comma-separated list of overlay names to include (e.g., "overlays/staging,overlays/prod")')
    .action((actionArg, directoryArg ) => {
        directory = directoryArg
        action = actionArg
    })
    .parse(process.argv);
if (action!= 'build') {
    console.error(`unknown action ${action}, only action 'build' is supported`);
    process.exit(1);
}
const options = program.opts();
const parametrize = options.parametrize || [];
const parametrizeConfigmap = options.parametrizeConfigmap || [];

// Get current working directory
const cwd = process.cwd();


// Call the function with provided arguments
const optionKeys = Object.keys(options);
const kustomizeOptions = [

]
const singleKFlagName = '--k-';
const doubleKFlagName = '-k-';
  optionKeys.forEach(key => {
    if (key.startsWith(singleKFlagName) || key.startsWith(doubleKFlagName)) {
      const value = options[key] || "";
      if (key.startsWith(doubleKFlagName)) {
        kustomizeOptions.push([key.replace(doubleKFlagName, ''), value])
      } else if (key.startsWith(singleKFlagName)) {
        kustomizeOptions.push([key.replace(singleKFlagName, ''), value])
      }
    }
  });
wrapKustomizeIntoHelm({
    cwd,
    targetFolder: options.target,
    directory,
    kustomizeOptions,
    chartName: options.chartName,
    chartVersion: options.chartVersion,
    chartAppVersion: options.chartAppVersion,
    chartDescription: options.chartDescription,
    parametrizeConfigmap,
    fs: require('fs'),
    execSync: logAndExecSync,
    parametrize,
    overlayFilter: options.overlayFilter,
    clearTargetFolder: options.clear,
    tmpFolder: os.tmpdir()
});


function logAndExecSync(command , options = {}) {
    return execSync(command, options);
}   

function collect(value, previous) {
    return previous.concat([value]);
}
