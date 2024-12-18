{{- define "kustomizeFiles" }}
manifests:
  - metadata:
      folder: base
      filePath: base/kustomization.yaml
    spec:
      apiVersion: kustomize.config.k8s.io/v1beta1
      kind: Kustomization
      configMapGenerator:
        - name: base-environment-values
          env: .env
      resources:
        - deployment.yaml
      replacements:
        - source:
            fieldPath: data.IMAGE_URL
            kind: ConfigMap
            name: base-environment-values
          targets:
            - fieldPaths:
                - spec.template.spec.containers.[name=nginx].image
              options:
                create: true
              select:
                kind: Deployment
                name: nginx-deployment
  - metadata:
      folder: overlays/dev
      filePath: overlays/dev/kustomization.yaml
    spec:
      apiVersion: kustomize.config.k8s.io/v1beta1
      kind: Kustomization
      resources:
        - ../../base
        - service.yaml
      configMapGenerator:
        - name: dev-environment-values
          env: .env
      replacements:
        - source:
            fieldPath: data.APP_NAME
            kind: ConfigMap
            name: dev-environment-values
          targets:
            - fieldPaths:
                - spec.selector.app
              select:
                kind: Service
                name: nginx-service
{{- end }}