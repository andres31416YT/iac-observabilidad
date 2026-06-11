use tracing_subscriber::{EnvFilter, layer::SubscriberExt, util::SubscriberInitExt};
use tracing::{span, Level};

pub fn init_logging(service_name: &str) {
    let filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("info"));

    tracing_subscriber::registry()
        .with(filter)
        .with(
            tracing_subscriber::fmt::layer()
                .json()
                .with_current_span(true)
                .with_file(true)
                .with_line_number(true)
                .with_span_list(true),
        )
        .init();

    tracing::info!(
        service = %service_name,
        event = "logging_initialized",
        "Logging initialized with structured JSON format"
    );
}

pub fn log_request(method: &str, path: &str, status: u16) {
    let span = span!(Level::INFO, "request", method = method, path = path, status = status);
    let _enter = span.enter();
    tracing::info!(
        event = "http_request",
        method = method,
        path = path,
        status = status,
    );
}
