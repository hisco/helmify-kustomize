const { trimIndent } = require('../lang');
const { singleOverlay } = require('./single-overlay-content');

module.exports = {
    overlaysResults: (overlayResults)=>{
        return trimIndent(`|{{- define "yamls" }}
        |{{- if .overlay }}
        |${overlayResults.map(({overlay,content}) => singleOverlay(overlay,content)).join('\n')}
        |{{- else }}
        |manifests: []
        |{{- end }}{{- end }}`)
    },
}