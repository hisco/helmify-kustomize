{{- define "yamls" }}
{{- if .overlay }}
{{- if eq .overlay "overlays/dev" }}
manifests:
  - spec: 
      apiVersion: v1
      data:
        IMAGE_URL: {{ .Values.baseEnv.IMAGE_URL }}
        TEST: {{ .Values.baseEnv.TEST }}
      kind: ConfigMap
      metadata:
        name: base-environment-values-cm829g8h9k
  - spec: 
      apiVersion: v1
      data:
        APP_NAME: {{ .Values.devEnv.APP_NAME }}
      kind: ConfigMap
      metadata:
        name: dev-environment-values-9hk8b8kd62
  - spec: 
      apiVersion: v1
      kind: Service
      metadata:
        name: nginx-service
      spec:
        ports:
        - port: 80
          protocol: TCP
          targetPort: 80
        selector:
          app: {{ .Values.devEnv.APP_NAME }}
  - spec: 
      apiVersion: apps/v1
      kind: Deployment
      metadata:
        labels:
          app: nginx
        name: nginx-deployment
      spec:
        replicas: 3
        selector:
          matchLabels:
            app: nginx
        template:
          metadata:
            labels:
              app: nginx
          spec:
            containers:
            - image: {{ .Values.baseEnv.IMAGE_URL }}
              name: nginx
              ports:
              - containerPort: 80
{{- else}}
{{- end }}
{{- if eq .overlay "base" }}
manifests:
  - spec: 
      apiVersion: v1
      data:
        IMAGE_URL: nginx:1.14.2
        TEST: ""
      kind: ConfigMap
      metadata:
        name: base-environment-values-h8t7g7d6th
  - spec: 
      apiVersion: apps/v1
      kind: Deployment
      metadata:
        labels:
          app: nginx
        name: nginx-deployment
      spec:
        replicas: 3
        selector:
          matchLabels:
            app: nginx
        template:
          metadata:
            labels:
              app: nginx
          spec:
            containers:
            - image: nginx:1.14.2
              name: nginx
              ports:
              - containerPort: 80
{{- else}}
{{- end }}
{{- else }}
manifests: []
{{- end }}{{- end }}