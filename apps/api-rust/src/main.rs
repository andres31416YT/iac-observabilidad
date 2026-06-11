use api_gateway::{handlers, init_db, AuthRequest};
use std::sync::Arc;
use tokio::sync::Mutex;
use tower_http::cors::{Any, CorsLayer};
use axum::{Router, serve};
use tracing::{error, info};
use crate::logging;

#[tokio::main]
async fn main() {
    logging::init_logging("api-gateway");

    let database_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://user:pass@localhost:5432/voting_db".to_string());
    
    let node_rpc_url = std::env::var("NODE_RPC_URL")
        .unwrap_or_else(|_| "http://blockchain-node:9944".to_string());
    
    let mut retries = 5;
    let db_pool = loop {
        match init_db(&database_url).await {
            Ok(pool) => {
                info!(
                    service = "api-gateway",
                    event = "db_connection_success",
                    "Database connected successfully"
                );
                break pool;
            }
            Err(e) if retries > 0 => {
                error!(
                    service = "api-gateway",
                    event = "db_connection_retry",
                    retries_left = retries,
                    error = %e,
                    "Failed to connect to database"
                );
                retries -= 1;
                tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
            }
            Err(e) => {
                error!(
                    service = "api-gateway",
                    event = "db_connection_failed",
                    error = %e,
                    "Database connection failed"
                );
                panic!("Database connection failed");
            }
        }
    };
    
    let state = Arc::new(Mutex::new(handlers::AppState {
        db_pool,
        http_client: reqwest::Client::new(),
        node_rpc_url,
    }));
    
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);
    
    let app = Router::new()
        .route("/health", axum::routing::get(handlers::health_check))
        .route("/auth", axum::routing::post(handlers::authenticate))
        .route("/register-user", axum::routing::post(handlers::register))
        .route("/update-role", axum::routing::post(handlers::update_user_role))
        .route("/users", axum::routing::post(handlers::list_users))
        .route("/elections", axum::routing::post(handlers::create_election))
        .route("/elections", axum::routing::get(handlers::list_elections))
        .route("/elections/all", axum::routing::get(handlers::list_all_elections))
        .route("/election", axum::routing::post(handlers::get_election))
        .route("/candidates", axum::routing::post(handlers::add_candidate))
        .route("/candidates", axum::routing::get(handlers::list_candidates_handler))
        .route("/candidates/delete", axum::routing::post(handlers::delete_candidate))
        .route("/candidates/update", axum::routing::post(handlers::update_candidate))
        .route("/register", axum::routing::post(handlers::register_voter))
        .route("/voter", axum::routing::post(handlers::get_voter))
        .route("/vote", axum::routing::post(handlers::submit_vote))
        .route("/results", axum::routing::post(handlers::get_results))
        .route("/blocks", axum::routing::get(handlers::get_blocks))
        .route("/update-election", axum::routing::post(handlers::update_election))
        .route("/delete-election", axum::routing::post(handlers::delete_election))
        .route("/my-elections", axum::routing::post(handlers::list_my_elections))
        .layer(cors)
        .with_state(state);
    
    let addr = std::net::SocketAddr::from(([0, 0, 0, 0], 8080));
    
    info!(
        service = "api-gateway",
        event = "server_start",
        address = %addr,
        "API Gateway running"
    );
    
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    serve(listener, app)
        .await
        .expect("Failed to start server");
}
