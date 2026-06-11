# Laboratorio de Observabilidad

Stack unificado: Blockchain Voting App + infraestructura de monitoreo (Prometheus, Loki, Grafana, Alloy, cAdvisor, node-exporter, blackbox-exporter).

## Levantar el stack
```bash
docker compose up -d --build
```

## Servicios y URLs
| Servicio           | URL                              | Notas                                  |
|--------------------|----------------------------------|----------------------------------------|
| Frontend (TrueTally) | http://localhost:3000           | App de votación blockchain             |
| API Gateway        | http://localhost:8080            | `/auth`, `/elections`, `/metrics`       |
| Blockchain Node    | http://localhost:9944            | `/vote`, `/blocks`, `/health`          |
| Grafana            | http://localhost:3001            | admin / admin                          |
| Prometheus         | http://localhost:9090            | datasource provisionado                 |
| Loki               | http://localhost:3100            | logs agregados por Alloy                 |
| Alloy (UI)         | http://localhost:12345           | estado del recolector de logs            |
| Blackbox Exporter  | http://localhost:9115/probe      | health checks HTTP                       |
| cAdvisor           | http://localhost:8081/metrics    | métricas por contenedor                |
| node-exporter      | http://localhost:9100/metrics    | métricas del host                      |

## Endpoints de métricas
| Servicio           | Endpoint                 | Tipo        |
|--------------------|--------------------------|-------------|
| Prometheus         | `/metrics`               | auto-métricas |
| API Gateway        | `/metrics`               | http_requests_total |
| Frontend           | `/api/metrics`           | prom-client (Node.js) |
| Blockchain Node    | `probe` (blackbox)       | HTTP health check |
| node-exporter      | `/metrics`               | métricas del host |
| cAdvisor           | `/metrics`               | métricas de contenedor |

## Estandar de logs
Formato JSON estructurado con campos:
- `timestamp`: RFC3339
- `level`: INFO/WARN/ERROR
- `service`: nombre del servicio
- `event`: tipo de evento (http_request, db_connection_success, etc.)
- `path`, `method`, `status`: para requests HTTP

Los logs se envían a Loki vía Alloy y pueden visualizarse en Grafana.

## Reset
```bash
docker compose down -v   # borra también datos de Grafana
```

> Nota: node-exporter y cAdvisor requieren `--privileged` y mount de host filesystem.
> Blackbox exporter monitorea `/health` endpoints que no expongan Prometheus metrics.
