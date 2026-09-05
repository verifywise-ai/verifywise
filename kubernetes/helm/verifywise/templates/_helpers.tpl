{{/*
Common labels applied to every resource.
*/}}
{{- define "verifywise.labels" -}}
app: verifywise
app.kubernetes.io/name: verifywise
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version | replace "+" "_" }}
{{- end -}}

{{/*
Selector labels — a stable subset used in matchLabels / service selectors.
Must NOT include anything that can change on upgrade.
*/}}
{{- define "verifywise.selectorLabels" -}}
app: verifywise
app.kubernetes.io/name: verifywise
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{/*
Name of the Secret pods should reference — either the one the chart creates,
or the caller-provided existingSecret.
*/}}
{{- define "verifywise.secretName" -}}
{{- if .Values.secrets.existingSecret -}}
{{ .Values.secrets.existingSecret }}
{{- else -}}
verifywise-secrets
{{- end -}}
{{- end -}}

{{/*
Image tag applied to the app services (backend/worker/frontend/aiGateway/evalServer).
Precedence: explicit .Values.images.tag > Chart.AppVersion.
Leaving tag empty in values.yaml is the recommended default — upgrading the
chart then automatically upgrades the images, no --set required.
*/}}
{{- define "verifywise.imageTag" -}}
{{- default .Chart.AppVersion .Values.images.tag -}}
{{- end -}}
