#!/usr/bin/env node
const { Command } = require('commander');
const { wrapKustomizeIntoHelm } = require('../src/index');
const { execSync } = require('child_process');

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
    .option('--chart-name <chartName>', 'The name of the chart', '')
    .option('--chart-version <chartVersion>', 'The version of the chart', '0.1.0')
    .option('--chart-description <chartDescription>', 'The description of the chart', 'A Helm chart for Kubernetes')
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

// Get current working directory
const cwd = process.cwd();

// validate minimum required options [chartName] 
if (!options.chartName) {
    console.error('--chart-name is required');
    process.exit(1);
}


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
    chartDescription: options.chartDescription,
    fs: require('fs'),
    execSync: logAndExecSync
});


function logAndExecSync(command , options = {}) {
    console.log(`Executing: ${command}`);
    return execSync(command, options);
}   
