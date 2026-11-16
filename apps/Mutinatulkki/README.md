# Mutinatulkki deployment

This Compose stack is isolated from ArcticAI, ComfyUI, and Portainer.

- Only the web service publishes a host port: `127.0.0.1:5500`.
- Persistent data and model files are bind-mounted from
  `/srv/TKI-hankkeet/Mutinatulkki`.
- Runtime source is deployed to `/opt/mutinatulkki/src` without secrets,
  Git metadata, editor configuration, or local development logs.

Deploy with `docker compose -f compose.yaml up -d --build` from
`/opt/mutinatulkki`.
