#!/usr/bin/env node
const path = require('path');
const cp = require('child_process');
const { trimIndent } = require('./lang');
const { overlaysResults } = require('./templates/overlays-files');
const {kustomizeFiles} = require('./templates/kustomize-files');
const {stringify: yamlStringify} = require('yaml'); 
const dotenv = require('dotenv');
module.exports = {
    wrapKustomizeIntoHelm,
}

// Define the wrapKustomizeIntoHelm function
async function wrapKustomizeIntoHelm({
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
    parametrize = [],
}) {
    const kustomizeDir = /^\./.test(directory) ? path.resolve(cwd, directory) : directory;
    // copy the entire kustomize directory to the temp folder
    const tempFolder = path.join(kustomizeDir, '.helmify-kustomize-build');
    const filter = (src, _dest) => {
        // Ignore files in a folder named "ignore-this-folder"
        if (src.includes('.helmify-kustomize-build')) {
          return false; // Exclude this path
        }
      
        return true; // Include everything else
      };
    copyFolder(fs,kustomizeDir, tempFolder , filter);
    
    const baseOverlayPath = path.join(tempFolder, 'base').replace(tempFolder,'').replace(/^\//,'').replace(/^\\/,'');
    const overlaysDir = path.join(tempFolder, 'overlays');
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

    const parametrizeOptions = parametrize.map(parametrize => ({
        valuesProp: parametrize.split('=')[0],
        filePath: parametrize.split('=')[1],
    }));

    const parametrizeResults = [];
    const mapRandomStringsToParametrize = {};

    parametrizeOptions.forEach(({filePath,valuesProp}) => {
        const envPath = path.join(tempFolder,filePath);
        const before = dotenv.parse(fs.readFileSync(envPath, 'utf8'));
        const after = {...before};

        Object.keys(after).forEach(key => {
            // put random to each property
            const parametrizeResult = {
                valuesProp,
                before,
                after,
                key
            }
            const id = randomString();
            after[key] = id
            mapRandomStringsToParametrize[id] = parametrizeResult;
            parametrizeResults.push(parametrizeResult);
        });
        fs.writeFileSync(envPath, Object.entries(after).map(([key, value]) => `${key}=${value}`).join('\n'), 'utf8');
    });
    const paramsRegex = new RegExp(Object.keys(mapRandomStringsToParametrize).join('|'), 'g');
    console.log(parametrizeResults,paramsRegex);
    function replaceParams(content){
        return content.replace(paramsRegex, (match) => {
            const key = mapRandomStringsToParametrize[match].key;
            // const value = mapRandomStringsToParametrize[match].before[key];
            return `{{ .Values.${mapRandomStringsToParametrize[match].valuesProp}.${key} }}`
        });
    }

    // Process other overlays
    const kustomizeManifestsResults = await Promise.all(overlays.map(async overlay => {
        const overlayPath = path.join(overlaysDir, overlay).replace(tempFolder,'').replace(/^\//,'').replace(/^\\/,'');

        const kustomizeOverlayOutput = execSync(`kustomize build ${overlayPath} ${kustomizeCliOptions}`, {encoding:'utf-8' , cwd :tempFolder}).toString();
        console.log(`Calculated overlay ${overlay}`);

       return {
        overlay:`overlays/${overlay}`,
        content: replaceParams(kustomizeOverlayOutput)
       }
    }));
    // Process base overlay
    if (fs.existsSync(baseOverlayPath)) {
        const baseOverlayOutput = execSync(`kustomize build ${baseOverlayPath} ${kustomizeCliOptions}`, {encoding:'utf-8', cwd :kustomizeDir}).toString();
        kustomizeManifestsResults.push({
            overlay: 'base',
            content: replaceParams(baseOverlayOutput)
        });
    }
    deleteFolder(fs,tempFolder);

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
    // group by valuesProp
    const valuesYamlObj = {};
    [...groupBy(parametrizeResults, (o) => o.valuesProp).entries()].map(([valuesProp,parametrizeResults]) => {
        valuesYamlObj[valuesProp] = {};
        parametrizeResults.forEach((parametrizeResult) => {
            valuesYamlObj[valuesProp][parametrizeResult.key] = parametrizeResult.before[parametrizeResult.key];
        });
    });
    
    const values = yamlStringify(valuesYamlObj);
    fs.writeFileSync(path.join(targetChartFolder, 'values.yaml'),  trimIndent(
        values+
        `|# Few usage examples:
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

function getKustomizationFiles(fs,folder) {
    const result = [];

    function scanDirectory(directory) {
        const files = fs.readdirSync(directory);

        files.forEach(file => {
            const filePath = path.join(directory, file);
            const stat = fs.statSync(filePath);

            if (stat.isDirectory()) {
                scanDirectory(filePath);
            } else if (file === 'kustomization.yaml' || file === 'kustomization.yml') {
                const content = fs.readFileSync(filePath, 'utf8');
                result.push({
                    folder: path.relative(folder, directory),
                    filePath: path.relative(folder, filePath    ),
                    content: content
                });
            }
        });
    }

    scanDirectory(folder);
    return result;
}



/**
 * Recursively copies a folder from source to target with an optional filter.
 * @param {string} source - The source folder path.
 * @param {string} target - The target folder path.
 * @param {function} [filter] - Optional filter callback. Receives (sourcePath, targetPath). Should return `true` to include or `false` to exclude.
 */
function copyFolder(fs,source, target, filter = () => true) {
    // Check if source exists
    if (!fs.existsSync(source)) {
        throw new Error(`Source folder does not exist: ${source}`);
    }

    // Ensure the target directory exists
    if (!fs.existsSync(target)) {
        fs.mkdirSync(target, { recursive: true });
    }

    // Read the contents of the source directory
    const entries = fs.readdirSync(source);

    for (const entry of entries) {
        const sourcePath = path.join(source, entry);
        const targetPath = path.join(target, entry);

        // Apply the filter callback
        if (!filter(sourcePath, targetPath)) {
            continue;
        }

        const stats = fs.statSync(sourcePath);

        if (stats.isDirectory()) {
            // Recursively copy subdirectory
            copyFolder(fs,sourcePath, targetPath, filter);
        } else if (stats.isFile()) {
            // Copy file
            fs.copyFileSync(sourcePath, targetPath);
        }
    }
}


/**
 * Recursively deletes a folder and all its contents.
 * @param {string} folderPath - The path to the folder to delete.
 */
function deleteFolder(fs,folderPath) {
    // Check if the folder exists
    if (!fs.existsSync(folderPath)) {
        throw new Error(`Folder does not exist: ${folderPath}`);
    }

    // Read the contents of the folder
    const entries = fs.readdirSync(folderPath);

    for (const entry of entries) {
        const entryPath = path.join(folderPath, entry);
        const stats = fs.statSync(entryPath);

        if (stats.isDirectory()) {
            // Recursively delete subdirectory
            deleteFolder(fs,entryPath);
        } else {
            // Delete file
            fs.unlinkSync(entryPath);
        }
    }

    // Remove the now-empty folder
    fs.rmdirSync(folderPath);
}

function randomString() {
    return Math.random().toString(36).substring(2, 36);
}

/**
 * @description
 * Takes an Array<V>, and a grouping function,
 * and returns a Map of the array grouped by the grouping function.
 *
 * @param list An array of type V.
 * @param keyGetter A Function that takes the the Array type V as an input, and returns a value of type K.
 *                  K is generally intended to be a property key of V.
 *
 * @returns Map of the array grouped by the grouping function.
 */
//export function groupBy<K, V>(list: Array<V>, keyGetter: (input: V) => K): Map<K, Array<V>> {
//    const map = new Map<K, Array<V>>();
function groupBy(list, keyGetter) {
    const map = new Map();
    list.forEach((item) => {
         const key = keyGetter(item);
         const collection = map.get(key);
         if (!collection) {
             map.set(key, [item]);
         } else {
             collection.push(item);
         }
    });
    return map;
}
