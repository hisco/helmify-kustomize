#!/usr/bin/env node
const path = require('path');
const cp = require('child_process');
const { trimIndent } = require('./lang');
const { overlaysResults } = require('./templates/overlays-files');
const {kustomizeFiles} = require('./templates/kustomize-files');
const {parseAllDocuments} = require('yaml'); 
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

    // Process other overlays
    const kustomizeManifestsResults = overlays.map(overlay => {
        const overlayPath = path.join(overlaysDir, overlay).replace(kustomizeDir,'').replace(/^\//,'').replace(/^\\/,'');
        const kustomizeOverlayOutput = execSync(`kustomize build ${overlayPath} ${kustomizeCliOptions}`, {encoding:'utf-8' , cwd :kustomizeDir}).toString();
        console.log(`Calculated overlay ${overlay}`);

       return {
        overlay:`overlays/${overlay}`,
        content: kustomizeOverlayOutput
       }
    });
    // Process base overlay
    if (fs.existsSync(baseOverlayPath)) {
        const baseOverlayOutput = execSync(`kustomize build ${baseOverlayPath} ${kustomizeCliOptions}`, {encoding:'utf-8', cwd :kustomizeDir}).toString();
        kustomizeManifestsResults.push({
            overlay: 'base',
            content: baseOverlayOutput
        });
    }
    // Write the overlays to a single helper file
    const resultContent = overlaysResults(kustomizeManifestsResults);
    const overlaysHelperPath = path.join(targetTemplateFolder,`_overlays-content.tpl`);
    fs.writeFileSync(overlaysHelperPath,resultContent, 'utf8');

    const kustomizationFiles = getKustomizationFiles(fs,kustomizeDir);
    const kustomizeFilesHelperContent = kustomizeFiles(kustomizationFiles);
    const kustomizeHelperPath = path.join(targetTemplateFolder,`_kustomize-files.tpl`);
    fs.writeFileSync(kustomizeHelperPath,kustomizeFilesHelperContent, 'utf8');

    if (!chartDescription || chartDescription == ""){
        chartDescription = `Auto generated Helm chart from kustomize base and overlays`;
    }
    fs.writeFileSync(path.join(targetChartFolder, 'values.yaml'), trimIndent(
        `# Few usage examples:
        |# overlay: base
        |# kustomizeFiles:
        |#   include: true
        |#   printNames:
        |#     - overlays/dev
        |#     - base
        |# globals:
        |#   namePrefix: prefix-
        |#   nameSuffix: end
        |#   nameReleasePrefix: true
        |#   labels:
        |#     key: 2
        |#   annotations:
        |#     key: 5
        |# manifests:
        |#   - kind: manifest
        |# crds:
        |#   - kind: test`
    ), 'utf8');
    fs.writeFileSync(path.join(targetChartFolder, 'Chart.yaml'), 
        trimIndent(`|apiVersion: v2
                    |name: ${chartName}
                    |version: ${chartVersion}
                    |description: ${chartDescription}`
            ),'utf8');
    // if NOTEX.txt exists, copy it to the target folder
    const notesPath = path.join(kustomizeDir, 'NOTEX.txt');
    if (fs.existsSync(notesPath)) {
        fs.copyFileSync(notesPath, path.join(targetChartFolder, 'NOTEX.txt'));
    }
    copyFromStatic(fs,targetTemplateFolder,'_static_helpers.tpl')
    copyFromStatic(fs,targetTemplateFolder,'result.yaml')

    // const kustomizationFile = path.join(kustomizeDir, 'NOTEX.txt');
    // if (fs.existsSync(notexPath)) {
    //     fs.copyFileSync(notexPath, path.join(targetChartFolder, 'NOTEX.txt'));
    // }
}

function copyFromStatic(fs,targetTemplateFolder, fileName){
    fs.copyFileSync(path.join(__dirname,'static' , fileName), path.join(targetTemplateFolder, fileName));
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

function replaceConfigMapsAndSecretsValues(content){
    const documents = parseAllDocuments(content);
    const configMapsAndSecrets = documents.filter((doc) => {
        return doc.kind === 'ConfigMap' || doc.kind === 'Secret';
    });

    configMapsAndSecrets.forEach((doc) => {
        doc.data
    });
}


// function getKustomizationFiles(fs,folder) {
//     const result = [];

//     function scanDirectory(directory) {
//         const files = fs.readdirSync(directory);

//         files.forEach(file => {
//             const filePath = path.join(directory, file);
//             const stat = fs.statSync(filePath);

//             if (stat.isDirectory()) {
//                 scanDirectory(filePath);
//             } else if (file === 'kustomization.yaml' || file === 'kustomization.yml') {
//                 const content = fs.readFileSync(filePath, 'utf8');
//                 result.push({
//                     folder: path.relative(folder, directory),
//                     filePath: path.relative(folder, filePath    ),
//                     content: content
//                 });
//             }
//         });
//     }

//     scanDirectory(folder);
//     return result;
// }