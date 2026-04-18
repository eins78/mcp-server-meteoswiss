---
"meteoswiss-mcp": patch
---

Expose `meteoswiss_mcp_build_info{version, node_version}` Prometheus gauge for version observability. Enables the Grafana dashboard to show the deployed version of each environment (TEST and PROD) at a glance without querying MCP endpoints.
