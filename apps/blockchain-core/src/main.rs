use blockchain_core::{Blockchain, Block, Vote};
use chrono::Utc;
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::Mutex;
use std::net::SocketAddr;
use std::path::PathBuf;
use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use tracing::{info, warn};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

const CHAIN_DATA_PATH: &str = "/data/db/chain.json";

static BLOCKCHAIN: Lazy<Arc<Mutex<Blockchain>>> = Lazy::new(|| {
    let chain_path = PathBuf::from(CHAIN_DATA_PATH);
    if chain_path.exists() {
        info!("Loading blockchain from {}", CHAIN_DATA_PATH);
        Arc::new(Mutex::new(Blockchain::load_from_file(&chain_path, 2, false)))
    } else {
        info!("Creating new blockchain");
        Arc::new(Mutex::new(Blockchain::new(2, false)))
    }
});

#[derive(Serialize)]
struct ApiResponse<T> {
    success: bool,
    data: Option<T>,
    error: Option<String>,
}

impl<T> ApiResponse<T> {
    fn success(data: T) -> Self {
        ApiResponse {
            success: true,
            data: Some(data),
            error: None,
        }
    }

    fn error(msg: String) -> Self {
        ApiResponse {
            success: false,
            data: None,
            error: Some(msg),
        }
    }
}

#[derive(Deserialize)]
pub struct VoteRequest {
    pub voter_public_key: String,
    pub candidate_id: String,
    pub election_id: String,
    pub signature: String,
}

#[derive(Serialize)]
struct BlockResponse {
    index: u64,
    timestamp: String,
    data: Vote,
    previous_hash: String,
    nonce: u64,
    hash: String,
}

impl From<Block> for BlockResponse {
    fn from(block: Block) -> Self {
        BlockResponse {
            index: block.index,
            timestamp: block.timestamp.to_rfc3339(),
            data: block.data,
            previous_hash: block.previous_hash,
            nonce: block.nonce,
            hash: block.hash,
        }
    }
}

#[derive(Serialize)]
struct VoteResult {
    index: u64,
    hash: String,
    timestamp: String,
}

async fn add_vote(
    State(blockchain): State<Arc<Mutex<Blockchain>>>,
    Json(payload): Json<VoteRequest>,
) -> Response {
    info!("Received vote: election={}, candidate={}, voter={}", 
        payload.election_id, payload.candidate_id, payload.voter_public_key);

    let vote = Vote {
        voter_public_key: payload.voter_public_key.clone(),
        candidate_id: payload.candidate_id,
        election_id: payload.election_id,
        signature: payload.signature,
        timestamp: Utc::now(),
    };

    let mut chain = blockchain.lock().await;
    
    match chain.add_block(vote) {
        Ok(block) => {
            let _ = chain.save_to_file(CHAIN_DATA_PATH);
            info!("Block added: index={}, hash={}", block.index, block.hash);
            (
                StatusCode::CREATED,
                Json(ApiResponse::success(VoteResult {
                    index: block.index,
                    hash: block.hash,
                    timestamp: block.timestamp.to_rfc3339(),
                })),
            ).into_response()
        }
        Err(e) => {
            warn!("Vote rejected: {}", e);
            (
                StatusCode::BAD_REQUEST,
                Json(ApiResponse::<VoteResult>::error(e)),
            ).into_response()
        }
    }
}

async fn get_blocks(
    State(blockchain): State<Arc<Mutex<Blockchain>>>,
) -> Response {
    let chain = blockchain.lock().await;
    let blocks: Vec<BlockResponse> = chain.chain.iter().map(|b| BlockResponse::from(b.clone())).collect();
    
    (StatusCode::OK, Json(ApiResponse::success(blocks))).into_response()
}

async fn get_block(
    State(blockchain): State<Arc<Mutex<Blockchain>>>,
    Path(index): Path<u64>,
) -> Response {
    let chain = blockchain.lock().await;
    
    match chain.chain.get(index as usize) {
        Some(block) => (
            StatusCode::OK,
            Json(ApiResponse::success(BlockResponse::from(block.clone()))),
        ).into_response(),
        None => (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::<BlockResponse>::error("Block not found".to_string())),
        ).into_response(),
    }
}

async fn get_results(
    State(state): State<Arc<Mutex<Blockchain>>>,
    Path(election_id): Path<String>,
) -> Response {
    let chain = state.lock().await;
    let results = chain.get_results_for_election(&election_id);
    
    (StatusCode::OK, Json(ApiResponse::success(results))).into_response()
}

async fn validate_chain(
    State(state): State<Arc<Mutex<Blockchain>>>,
) -> Response {
    let chain = state.lock().await;
    
    match chain.validate_chain() {
        Ok(_) => (
            StatusCode::OK,
            Json(ApiResponse::success("Chain is valid".to_string())),
        ).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::<String>::error(e)),
        ).into_response(),
    }
}

async fn health_check() -> &'static str {
    "OK"
}

async fn shutdown_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("failed to install signal handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {
            info!("Received Ctrl+C, shutting down");
        }
        _ = terminate => {
            info!("Received terminate signal, shutting down");
        }
    }
}

#[tokio::main]
async fn main() {
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::try_from_default_env()
            .unwrap_or_else(|_| "blockchain_core=info".into()))
        .with(tracing_subscriber::fmt::layer())
        .init();

    let port = std::env::var("PORT")
        .unwrap_or_else(|_| "9944".to_string())
        .parse::<u16>()
        .expect("PORT must be a valid u16");
    
    info!("Starting blockchain core on port {}", port);
    
    let blockchain = Arc::clone(&*BLOCKCHAIN);
    
    let app = Router::new()
        .route("/health", get(health_check))
        .route("/vote", post(add_vote))
        .route("/blocks", get(get_blocks))
        .route("/blocks/{index}", get(get_block))
        .route("/results/:election_id", get(get_results))
        .route("/validate", get(validate_chain))
        .with_state(blockchain);
    
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    info!("Blockchain node running on http://{}", addr);
    
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("Failed to bind to port");
    
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await
        .expect("Failed to start server");
}