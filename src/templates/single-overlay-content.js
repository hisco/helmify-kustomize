const { trimIndent,indentYaml } = require('../lang');

module.exports = {
    singleOverlay: (overlay , content)=>{
        const manifests = content.split('---').map((manifest) => manifest.trim()).filter((manifest) => manifest.length > 0);
        return trimIndent(`|{{- if eq .overlay "${overlay}" }}
        |manifests:
        |${
            manifests.map(
                (manifest) => 
                    trimIndent(`|  - spec: 
                    |${indentYaml(manifest,6)}`)
                    ).join('\n')}
        |{{- else}}
        |{{- end }}`)
    },
}
