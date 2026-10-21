# @astlide/server

An HTTP render service for [Astlide](https://github.com/r-hashi01/astlide): Markdown → editable PowerPoint / PDF / PNG, PowerPoint import, template layouts — with an OpenAPI 3.1 spec (`GET /openapi.json`) for Dify, n8n and other tools. Nothing is stored.

```bash
# From the repository root
docker build -f packages/server/Dockerfile -t astlide-server .
docker run --rm -p 8787:8787 -e ASTLIDE_API_KEY="$(openssl rand -hex 24)" astlide-server
```

Guide: https://astlide.dev/guides/server/
