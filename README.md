# Laboratorio de Observabilidad

Stack unificado: Blockchain Voting App + infraestructura de monitoreo (Prometheus, Loki, Grafana, Alloy, cAdvisor, node-exporter, blackbox-exporter).

## Levantar el stack
```bash
docker compose up -d --build
```

## Servicios y URLs
| Servicio           | URL externa                     | URL interna (scrape)        | Notas                                  |
|--------------------|----------------------------------|-----------------------------|----------------------------------------|
| Frontend (TrueTally) | http://localhost:8080           | lab-frontend:3000           | App de votación blockchain con botones de prueba |
| API Gateway        | http://localhost:3002          | host.docker.internal:3002   | `/saludar`, `/load`, `/alerts`, `/metrics` |
| Blockchain Node    | http://localhost:9944          | host.docker.internal:9944   | `/vote`, `/blocks`, `/health`          |
| Grafana            | http://localhost:3003          | lab-grafana:3000            | admin / admin                          |
| Prometheus         | http://localhost:9090           | host.docker.internal:9090   | datasource provisionado                 |
| Loki               | http://localhost:3100           | lab-loki:3100               | logs agregados por Alloy                 |
| Alloy (UI)         | http://localhost:12345          | lab-alloy:12345             | estado del recolector de logs            |
| Blackbox Exporter  | http://localhost:9115/probe     | host.docker.internal:9115   | health checks HTTP                       |
| cAdvisor           | http://localhost:8081/metrics   | host.docker.internal:8081   | métricas por contenedor                |
| node-exporter      | http://localhost:9100/metrics   | host.docker.internal:9100   | métricas del host                      |

## Endpoints nuevos (Laboratorio)
| Endpoint           | Descripción                      |
|--------------------|----------------------------------|
| `/saludar`         | Retorna saludo de prueba         |
| `/load?seconds=N`  | Genera carga CPU ~55% por N segundos (por defecto 35s) |
| `/alerts`          | Webhook para alertas de Grafana    |

## Alertas configuradas
- **HighCPULoad**: Dispara cuando CPU > 50% **durante 30 segundos continuos**

## Dashboards
- **Laboratorio API**: Panel con CPU usage y logs del backend

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
Formato JSON estructurado con campos obligatorios:
- `timestamp`: RFC3339
- `level`: INFO/WARN/ERROR  
- `service`: nombre del servicio
- `event`: tipo de evento (http_request, cpu_load_started, greet_requested, etc.)
- `method`, `path`, `status`: para requests HTTP

Los logs se envían a Loki vía Alloy y pueden visualizarse en Grafana.

## Reset
```bash
docker compose down -v   # borra también datos de Grafana
```

> Nota: node-exporter y cAdvisor requieren `--privileged` y mount de host filesystem.
> Blackbox exporter monitorea `/health` endpoints que no expongan Prometheus metrics.

## PREGUNTAS Y RESPUESTAS:
-Componentes:
-Prometheus: Recolecta las metricas.
-Grafana: Visualiza los datos usando dashboards. ← es el orquestador
-Loki: Almacena y busca logs.

Preguntas a responder

-¿Por qué necesitamos Loki además de Prometheus si ya tenemos /metrics?
-Prometheus mide estados numéricos mientras que Loki almacena registros de texto, 
permitiendo así correlacionar el cuándo sucede el error con el porqué detallado en los logs.
-¿Qué ventaja aporta que las fuentes de datos de Grafana estén aprovisionadas como código y 
no creadas a mano?
-Elimina la configuración manual, permite el versionado en Git y asegura que el entorno sea 
idéntico en desarrollo, pruebas y producción.
-¿Por qué CPU contenedor y CPU host difieren y cuál usar?
-El contenedor refleja límites de recursos asignados y el host mide la carga total de la 
máquina; debes usar CPU contenedor para alertar sobre una aplicación específica.
-¿Diferencia entre evaluation interval y pending period de una alarma?
-El intervalo define la frecuencia con la que se comprueba la regla, mientras que el periodo de 
espera es el tiempo mínimo que el fallo debe persistir antes de activar la alerta.