const { parse, stringify } = require('yaml');
const { trimIndent } = require('../lang');
module.exports = {
    kustomizeFiles: (files)=>{
        return trimIndent(`|{{- define "kustomizeFiles" }}
        |${
            stringify({
                manifests: (files.map(({folder,filePath , content}) => {
                    const manifest = parse(content);
                    return {
                        metadata: {
                            folder: folder,
                            filePath: filePath,
                        },
                        spec: manifest
                    }
                }))
        })}
        |{{- end }}`);
        
    },
}