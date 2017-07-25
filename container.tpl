{{ range $hosts, $containers }}

{{ if trim $hosts }}

{{ range $container := $containers }}
{{ $container }}
{{ end }}

{{ end }}

{{ end }}
