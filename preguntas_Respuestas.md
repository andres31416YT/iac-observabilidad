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