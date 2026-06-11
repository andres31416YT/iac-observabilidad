use axum::{routing::get, Router, response::Response};
use axum::body::Body;
use prometheus::{Encoder, IntCounter, IntCounterVec, Opts, TextEncoder};
use lazy_static::lazy_static;

lazy_static! {
    static ref REQUEST_COUNT: IntCounterVec = 
        prometheus::register_int_counter_vec!(Opts::new("http_requests_total", "Total HTTP requests"), &["method", "endpoint"]).unwrap();
}

pub async fn metrics_handler() -> Response {
    REQUEST_COUNT.with_label_values(&["GET", "/metrics"]).inc();
    let encoder = TextEncoder::new();
    let metric_families = prometheus::gather();
    let mut buffer = Vec::new();
    encoder.encode(&metric_families, &mut buffer).unwrap();
    Response::builder()
        .status(200)
        .header("Content-Type", "text/plain; version=0.0.4")
        .body(Body::from(buffer))
        .unwrap()
}
