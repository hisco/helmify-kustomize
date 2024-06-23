#!/usr/bin/env node
const path = require('path');
const cp = require('child_process');

module.exports = {
    wrapKustomizeIntoHelm,
}

// Define the wrapKustomizeIntoHelm function
function wrapKustomizeIntoHelm({
    cwd, 
    targetFolder,
    directory,
    // kustomize cli options
    kustomizeOptions,
    chartName,
    chartVersion,
    chartDescription,
    fs = {
        readdirSync: fs.readdirSync,
        statSync: fs.statSync,
        existsSync: fs.existsSync,
        mkdirSync: fs.mkdirSync,
        writeFileSync: fs.writeFileSync,
        copyFileSync: fs.copyFileSync,
    },
    execSync = cp.execSync,
}) {
    const kustomizeDir = /^\./.test(directory) ? path.resolve(cwd, directory) : directory;
    const baseOverlayPath = path.join(kustomizeDir, 'base').replace(kustomizeDir,'').replace(/^\//,'').replace(/^\\/,'');
    const overlaysDir = path.join(kustomizeDir, 'overlays');
    const overlays = fs.readdirSync(overlaysDir).filter(file => fs.statSync(path.join(overlaysDir, file)).isDirectory());

    const targetChartFolder = targetFolder;
    const targetTemplateFolder = path.join(targetChartFolder, 'templates');

    // Ensure the target folder exists
    if (!fs.existsSync(targetTemplateFolder)) {
        fs.mkdirSync(targetTemplateFolder, { recursive: true });
    }
    // prepare to forward kustomizeOptions to kustomize build command
    const kustomizeCliOptions = [
        ...Object.entries(kustomizeOptions).map(([key, value]) => `${key} ${value}`),
    ].join(' ');
    // Process base overlay
    if (fs.existsSync(baseOverlayPath)) {
        const baseOverlayOutput = execSync(`kustomize build ${baseOverlayPath} ${kustomizeCliOptions}`, {encoding:'utf-8', cwd :kustomizeDir}).toString();
        const baseOutputFilePath = path.join(targetTemplateFolder, 'base.yaml');
        fs.writeFileSync(baseOutputFilePath, wrapOverlayWithHelmCondition(`base` , baseOverlayOutput), 'utf8');
        console.log(`Output for base overlay written to ${baseOutputFilePath}`);
    }
    // Process other overlays
    overlays.forEach(overlay => {
        const overlayPath = path.join(overlaysDir, overlay).replace(kustomizeDir,'').replace(/^\//,'').replace(/^\\/,'');
        const kustomizeOverlayOutput = execSync(`kustomize build ${overlayPath} ${kustomizeCliOptions}`, {encoding:'utf-8' , cwd :kustomizeDir}).toString();
        
        const outputFilePath = path.join(targetTemplateFolder,`overlays-${overlay}.yaml`);

        fs.writeFileSync(outputFilePath, wrapOverlayWithHelmCondition(`overlays/${overlay}` , kustomizeOverlayOutput), 'utf8');
        console.log(`Output for overlay ${overlay} written to ${outputFilePath}`);
    });

    if (!chartDescription || chartDescription == ""){
        chartDescription = `Auto generated Helm chart from kustomize base and overlays`;
    }
    fs.writeFileSync(path.join(targetChartFolder, 'values.yaml'), `overlay: base`, 'utf8');
    fs.writeFileSync(path.join(targetChartFolder, 'Chart.yaml'), `apiVersion: v2
name: ${chartName}
version: ${chartVersion}
description: ${chartDescription}`, 'utf8');
    // if NOTEX.txt exists, copy it to the target folder
    const notexPath = path.join(kustomizeDir, 'NOTEX.txt');
    if (fs.existsSync(notexPath)) {
        fs.copyFileSync(notexPath, path.join(targetChartFolder, 'NOTEX.txt'));
    }
}

function wrapOverlayWithHelmCondition(
    overlayCondition,
    content,
){
    return `
{{- if eq .Values.overlay "${overlayCondition}" }}
${content}
{{- end }}
`;
}
