node ../../bin/helmify-kustomize.js build . --chart-name example-service --target ./helm-output --parametrize devEnv=overlays/dev/.env --parametrize baseEnv=base/.env
