use crate::models::{AuthRequest, AuthResponse, NewElection, NewCandidate, RegistrationRequest, VoteRequest, RoleUpdateRequest, ListUsersRequest, UpdateElectionRequest, DeleteElectionRequest, MyElectionsRequest, VoteResponse, ApiResponse};
use crate::db;
use axum::{
    extract::State,
    extract::Query,
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::Deserialize;
use reqwest::Client;
use std::sync::Arc;
use tokio::sync::Mutex;
use sqlx::PgPool;

type JsonValue = serde_json::Value;
type JsonVec = Vec<serde_json::Value>;

pub struct AppState {
    pub db_pool: PgPool,
    pub http_client: Client,
    pub node_rpc_url: String,
}

impl<T> ApiResponse<T> {
    pub fn ok(data: T) -> Self {
        Self {
            success: true,
            data: Some(data),
            error: None,
        }
    }

    pub fn err(msg: String) -> Self {
        Self {
            success: false,
            data: None,
            error: Some(msg),
        }
    }
}

pub async fn create_election(
    State(state): State<Arc<Mutex<AppState>>>,
    Json(payload): Json<NewElection>,
) -> Result<impl IntoResponse, (StatusCode, Json<ApiResponse<String>>)> {
    let state = state.lock().await;
    
    let election_id = uuid::Uuid::new_v4().to_string()[..8].to_string();
    let visibility = payload.visibility;
    let status = payload.status;
    
    let created_by = payload.created_by.as_deref();
    
    // AQUÍ ESTÁ EL CAMBIO: Reemplazamos payload.password.as_deref() por None
    match db::create_election(
        &state.db_pool, 
        &election_id, 
        &payload.name, 
        payload.description.as_deref(), 
        &visibility, 
        &status, 
        None, // <-- ESTO EVITA EL ERROR E0609
        created_by
    ).await {
        Ok(_) => {
            let _ = db::log_audit(&state.db_pool, "election_created", &format!("election: {}", election_id)).await;
            Ok((StatusCode::CREATED, Json(ApiResponse::ok(election_id))))
        }
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, Json(ApiResponse::err(format!("Database error: {}", e))))),
    }
}

pub async fn get_election(
    State(state): State<Arc<Mutex<AppState>>>,
    Json(payload): Json<serde_json::Value>,
) -> Result<impl IntoResponse, (StatusCode, Json<ApiResponse<JsonValue>>)> {
    let state = state.lock().await;
    let election_id = payload.get("election_id").and_then(|v| v.as_str()).unwrap_or("");
    
    match db::get_election(&state.db_pool, election_id).await {
        Ok(Some((id, name, description, is_active))) => {
            Ok((StatusCode::OK, Json(ApiResponse::ok(serde_json::json!({
                "id": id,
                "name": name,
                "description": description,
                "is_active": is_active
            })))))
        }
        Ok(None) => Err((StatusCode::NOT_FOUND, Json(ApiResponse::err("Election not found".to_string())))),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, Json(ApiResponse::err(format!("Database error: {}", e))))),
    }
}

pub async fn add_candidate(
    State(state): State<Arc<Mutex<AppState>>>,
    Json(payload): Json<NewCandidate>,
) -> Result<impl IntoResponse, (StatusCode, Json<ApiResponse<i64>>)> {
    let state = state.lock().await;
    
    let election_id = &payload.election_id;
    let name = &payload.name;
    
    if name.trim().is_empty() {
        return Err((StatusCode::BAD_REQUEST, Json(ApiResponse::err("Name cannot be empty".to_string()))));
    }

    let uuid_part = &uuid::Uuid::new_v4().to_string()[..3].to_uppercase();
    let code = format!("C{}A{}", &election_id[..std::cmp::min(3, election_id.len())].to_uppercase(), uuid_part);

    let exists = db::candidate_exists(&state.db_pool, election_id, name).await;
    if let Ok(true) = exists {
        return Err((StatusCode::CONFLICT, Json(ApiResponse::err("A candidate with this name already exists in this election".to_string()))));
    }
    
    match db::add_candidate(&state.db_pool, election_id, &code, name).await {
        Ok(id) => {
            let _ = db::log_audit(&state.db_pool, "candidate_added", &format!("election: {}", election_id)).await;
            Ok((StatusCode::CREATED, Json(ApiResponse::ok(id))))
        }
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, Json(ApiResponse::err(format!("Database error: {}", e))))),
    }
}

pub async fn update_candidate(
    State(state): State<Arc<Mutex<AppState>>>,
    Json(payload): Json<serde_json::Value>,
) -> Result<impl IntoResponse, (StatusCode, Json<ApiResponse<String>>)> {
    let state = state.lock().await;
    let candidate_id = payload.get("candidate_id").and_then(|v| v.as_i64()).unwrap_or(0);
    let name = payload.get("name").and_then(|v| v.as_str()).unwrap_or("");
    
    if candidate_id == 0 {
        return Err((StatusCode::BAD_REQUEST, Json(ApiResponse::err("Candidate ID is required".to_string()))));
    }
    if name.trim().is_empty() {
        return Err((StatusCode::BAD_REQUEST, Json(ApiResponse::err("Name cannot be empty".to_string()))));
    }

    match db::update_candidate(&state.db_pool, candidate_id, name).await {
        Ok(_) => {
            let _ = db::log_audit(&state.db_pool, "candidate_updated", &format!("candidate: {}", candidate_id)).await;
            Ok((StatusCode::OK, Json(ApiResponse::ok("Candidato actualizado".to_string()))))
        }
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, Json(ApiResponse::err(format!("Database error: {}", e))))),
    }
}

pub async fn delete_candidate(
    State(state): State<Arc<Mutex<AppState>>>,
    Json(payload): Json<serde_json::Value>,
) -> Result<impl IntoResponse, (StatusCode, Json<ApiResponse<String>>)> {
    let state = state.lock().await;
    let candidate_id = payload.get("candidate_id").and_then(|v| v.as_i64()).unwrap_or(0);
    
    if candidate_id == 0 {
        return Err((StatusCode::BAD_REQUEST, Json(ApiResponse::err("Candidate ID is required".to_string()))));
    }

    match db::delete_candidate(&state.db_pool, candidate_id).await {
        Ok(_) => {
            let _ = db::log_audit(&state.db_pool, "candidate_deleted", &format!("candidate: {}", candidate_id)).await;
            Ok((StatusCode::OK, Json(ApiResponse::ok("Candidato eliminado".to_string()))))
        }
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, Json(ApiResponse::err(format!("Database error: {}", e))))),
    }
}

pub async fn list_elections(
    State(state): State<Arc<Mutex<AppState>>>,
) -> Result<impl IntoResponse, (StatusCode, Json<ApiResponse<JsonVec>>)> {
    let state = state.lock().await;
    
    match db::list_elections(&state.db_pool).await {
        Ok(elections) => {
            let result: Vec<_> = elections.into_iter().map(|(id, name, description, status, visibility, password)| {
                serde_json::json!({
                    "id": id,
                    "name": name,
                    "description": description,
                    "status": status,
                    "visibility": visibility,
                    "password": password.unwrap_or_default()
                })
            }).collect();
            Ok((StatusCode::OK, Json(ApiResponse::ok(result))))
        }
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, Json(ApiResponse::err(format!("Database error: {}", e))))),
    }
}

#[derive(Debug, Deserialize)]
pub struct ListCandidatesQuery {
    election_id: String,
}

pub async fn list_candidates_handler(
    State(state): State<Arc<Mutex<AppState>>>,
    Query(query): Query<ListCandidatesQuery>,
) -> Result<impl IntoResponse, (StatusCode, Json<ApiResponse<JsonVec>>)> {
    let state = state.lock().await;
    let election_id = &query.election_id;
    
    match db::list_candidates(&state.db_pool, election_id).await {
        Ok(candidates) => {
            let result: Vec<serde_json::Value> = candidates
                .into_iter()
                .map(|(id, code, name)| {
                    serde_json::json!({
                        "id": id,
                        "code": code,
                        "name": name
                    })
                })
                .collect();
            Ok((StatusCode::OK, Json(ApiResponse::ok(result))))
        }
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, Json(ApiResponse::err(format!("Database error: {}", e))))),
    }
}

pub async fn list_candidates(
    State(state): State<Arc<Mutex<AppState>>>,
    Json(payload): Json<serde_json::Value>,
) -> Result<impl IntoResponse, (StatusCode, Json<ApiResponse<JsonVec>>)> {
    let state = state.lock().await;
    let election_id = payload.get("election_id").and_then(|v| v.as_str()).unwrap_or("");
    
    match db::list_candidates(&state.db_pool, election_id).await {
        Ok(candidates) => {
            let result: Vec<serde_json::Value> = candidates
                .into_iter()
                .map(|(id, code, name)| {
                    serde_json::json!({
                        "id": id,
                        "code": code,
                        "name": name
                    })
                })
                .collect();
            Ok((StatusCode::OK, Json(ApiResponse::ok(result))))
        }
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, Json(ApiResponse::err(format!("Database error: {}", e))))),
    }
}

pub async fn register_voter(
    State(state): State<Arc<Mutex<AppState>>>,
    Json(payload): Json<RegistrationRequest>,
) -> Result<impl IntoResponse, (StatusCode, Json<ApiResponse<i64>>)> {
    let state = state.lock().await;

    if payload.email.trim().is_empty() {
        return Err((StatusCode::BAD_REQUEST, Json(ApiResponse::err("Email is required".to_string()))));
    }

    let election_id = &payload.election_id;
    let existing_voter = db::check_voter_by_email(&state.db_pool, election_id, &payload.email).await;
    if let Ok(Some((_, true))) = existing_voter {
        return Err((StatusCode::CONFLICT, Json(ApiResponse::err("Este email ya ha emitido un voto en esta elección".to_string()))));
    }
    
    let public_key = &payload.public_key;
    match db::register_voter(&state.db_pool, election_id, &payload.email, public_key).await {
        Ok(id) => {
            let _ = db::log_audit(&state.db_pool, "voter_registered", &format!("election: {} email: {} public_key: {}", election_id, payload.email, public_key)).await;
            Ok((StatusCode::CREATED, Json(ApiResponse::ok(id))))
        }
        Err(e) => {
            if e.to_string().contains("unique") || e.to_string().contains("duplicate") {
                if e.to_string().contains("email") {
                    Err((StatusCode::CONFLICT, Json(ApiResponse::err("Este email ya está registrado en esta elección".to_string()))))
                } else {
                    Err((StatusCode::CONFLICT, Json(ApiResponse::err("Voter already registered for this election".to_string()))))
                }
            } else {
                Err((StatusCode::INTERNAL_SERVER_ERROR, Json(ApiResponse::err(format!("Database error: {}", e)))))
            }
        }
    }
}

pub async fn get_voter(
    State(state): State<Arc<Mutex<AppState>>>,
    Json(payload): Json<serde_json::Value>,
) -> Result<impl IntoResponse, (StatusCode, Json<ApiResponse<JsonValue>>)> {
    let state = state.lock().await;
    let election_id = payload.get("election_id").and_then(|v| v.as_str()).unwrap_or("");
    let public_key = payload.get("public_key").and_then(|v| v.as_str()).unwrap_or("");
    
    match db::get_voter_by_public_key(&state.db_pool, election_id, public_key).await {
        Ok(Some((name, has_voted))) => {
            Ok((StatusCode::OK, Json(ApiResponse::ok(serde_json::json!({
                "name": name,
                "has_voted": has_voted
            })))))
        }
        Ok(None) => Err((StatusCode::NOT_FOUND, Json(ApiResponse::err("Voter not found".to_string())))),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, Json(ApiResponse::err(format!("Database error: {}", e))))),
    }
}

pub async fn submit_vote(
    State(state): State<Arc<Mutex<AppState>>>,
    headers: axum::http::HeaderMap,
    Json(payload): Json<VoteRequest>,
) -> Result<impl IntoResponse, (StatusCode, Json<ApiResponse<VoteResponse>>)> {
    let user_email = headers.get("X-User-Email")
        .and_then(|h| h.to_str().ok())
        .filter(|s| !s.is_empty());

    if user_email.is_none() {
        return Err((StatusCode::UNAUTHORIZED, Json(ApiResponse::err("Debes iniciar sesión para votar".to_string()))));
    }

    let state = state.lock().await;
    
    let check_voter = db::get_voter_by_public_key(&state.db_pool, &payload.election_id, &payload.voter_public_key).await;
    
    if let Ok(Some((_, true))) = check_voter {
        return Err((StatusCode::FORBIDDEN, Json(ApiResponse::err("This voter has already voted in this election".to_string()))));
    }
    
    if check_voter.is_err() || check_voter.ok().map_or(true, |v| v.is_none()) {
        // En el flujo de migración a email, registramos al usuario por email antes de votar
        // Aquí usamos la public_key como fallback si no tenemos el email a mano en este punto,
        // pero lo ideal es que ya esté registrado.
        let voter_email = format!("voter_{}@example.com", &payload.voter_public_key[..8]);
        let _ = db::register_voter(&state.db_pool, &payload.election_id, &voter_email, &payload.voter_public_key).await;
    }

    let rpc_url = format!("{}/vote", state.node_rpc_url);
    
    match state.http_client
        .post(&rpc_url)
        .json(&payload)
        .send()
        .await
    {
        Ok(response) => {
            if response.status().is_success() {
                let _ = db::mark_voter_voted(&state.db_pool, &payload.election_id, &payload.voter_public_key).await;
                let _ = db::log_audit(&state.db_pool, "vote_submitted", &format!("election: {} voter: {}", payload.election_id, payload.voter_public_key)).await;
                
                Ok((StatusCode::OK, Json(ApiResponse::ok(serde_json::json!({
                    "success": true,
                    "message": "Vote submitted successfully"
                })))))
            } else {
                let error_text = response.text().await.unwrap_or_default();
                Err((StatusCode::BAD_REQUEST, Json(ApiResponse::err(format!("Blockchain rejected vote: {}", error_text)))))
            }
        }
        Err(e) => Err((StatusCode::SERVICE_UNAVAILABLE, Json(ApiResponse::err(format!("Failed to connect to blockchain node: {}", e))))),
    }
}

pub async fn get_results(
    State(state): State<Arc<Mutex<AppState>>>,
    Json(payload): Json<serde_json::Value>,
) -> Result<impl IntoResponse, (StatusCode, Json<ApiResponse<JsonValue>>)> {
    let state = state.lock().await;
    let election_id = payload.get("election_id").and_then(|v| v.as_str()).unwrap_or("");
    
    let rpc_url = format!("{}/results/{}", state.node_rpc_url, election_id);
    
    match state.http_client.get(&rpc_url).send().await {
        Ok(response) => {
            if response.status().is_success() {
                if let Ok(data) = response.json::<serde_json::Value>().await {
                    let results = data.get("data")
                        .cloned()
                        .unwrap_or(serde_json::Value::Object(Default::default()));
                    let response_data = serde_json::json!({
                        "election_id": election_id,
                        "results": results
                    });
                    return Ok((StatusCode::OK, Json(ApiResponse::ok(response_data))));
                }
            }
            Err((StatusCode::INTERNAL_SERVER_ERROR, Json(ApiResponse::err("Failed to get results from blockchain".to_string()))))
        }
        Err(e) => Err((StatusCode::SERVICE_UNAVAILABLE, Json(ApiResponse::err(format!("Failed to connect to blockchain node: {}", e))))),
    }
}

pub async fn get_blocks(
    State(state): State<Arc<Mutex<AppState>>>,
) -> Result<impl IntoResponse, (StatusCode, Json<ApiResponse<JsonValue>>)> {
    let state = state.lock().await;
    
    let rpc_url = format!("{}/blocks", state.node_rpc_url);
    
    match state.http_client.get(&rpc_url).send().await {
        Ok(response) => {
            if response.status().is_success() {
                if let Ok(data) = response.json::<serde_json::Value>().await {
                    let blocks = data.get("data")
                        .cloned()
                        .unwrap_or(serde_json::Value::Array(vec![]));
                    return Ok((StatusCode::OK, Json(ApiResponse::ok(blocks))));
                }
            }
            Err((StatusCode::INTERNAL_SERVER_ERROR, Json(ApiResponse::err("Failed to get blocks from blockchain".to_string()))))
        }
        Err(e) => Err((StatusCode::SERVICE_UNAVAILABLE, Json(ApiResponse::err(format!("Failed to connect to blockchain node: {}", e))))),
    }
}

pub async fn health_check() -> &'static str {
    "OK"
}

pub async fn authenticate(
    State(state): State<Arc<Mutex<AppState>>>,
    Json(payload): Json<AuthRequest>,
) -> Result<impl IntoResponse, (StatusCode, Json<ApiResponse<AuthResponse>>)> {
    let state = state.lock().await;

    if payload.email.is_empty() {
        return Err((StatusCode::BAD_REQUEST, Json(ApiResponse::err("El correo electrónico es requerido".to_string()))));
    }

    match db::authenticate_user(&state.db_pool, &payload.email, payload.password.as_deref()).await {
        Ok(Some((role, public_key, has_password))) => {
            let has_voted = db::check_user_voted(&state.db_pool, &payload.email).await.ok().flatten();
            Ok((StatusCode::OK, Json(ApiResponse::ok(AuthResponse {
                role,
                public_key,
                has_password,
                has_voted_election: has_voted,
            }))))
        }
        Ok(None) => {
            // El usuario no existe o la contraseña es incorrecta
            Err((StatusCode::UNAUTHORIZED, Json(ApiResponse::err("Correo o contraseña incorrectos. Por favor, verifica tus datos.".to_string()))))
        }
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, Json(ApiResponse::err(format!("Error de base de datos: {}", e))))),
    }
}

pub async fn register(
    State(state): State<Arc<Mutex<AppState>>>,
    Json(payload): Json<AuthRequest>,
) -> Result<impl IntoResponse, (StatusCode, Json<ApiResponse<AuthResponse>>)> {
    let state = state.lock().await;

    if payload.email.is_empty() || payload.password.is_none() {
        return Err((StatusCode::BAD_REQUEST, Json(ApiResponse::err("Email y contraseña son requeridos".to_string()))));
    }

    let password = payload.password.unwrap();
    if password.len() < 6 {
        return Err((StatusCode::BAD_REQUEST, Json(ApiResponse::err("La contraseña debe tener al menos 6 caracteres".to_string()))));
    }

    // Verificar si el usuario ya existe
    let existing = db::authenticate_user(&state.db_pool, &payload.email, None).await;
    if let Ok(Some(_)) = existing {
        return Err((StatusCode::CONFLICT, Json(ApiResponse::err("Este correo ya está registrado".to_string()))));
    }

    let keys = generate_key_pair();
    match db::create_user(&state.db_pool, &payload.email, Some(&keys.0), Some(&password), "user").await {
        Ok(_) => Ok((StatusCode::CREATED, Json(ApiResponse::ok(AuthResponse {
            role: "user".to_string(),
            public_key: Some(keys.0),
            has_password: true,
            has_voted_election: None,
        })))),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, Json(ApiResponse::err(format!("Error al crear usuario: {}", e))))),
    }
}

fn generate_key_pair() -> (String, String) {
    use std::time::{SystemTime, UNIX_EPOCH};
    let timestamp = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
    let public_key = format!("pk_{}", timestamp);
    let secret_key = format!("sk_{}", timestamp);
    (public_key, secret_key)
}

pub async fn update_user_role(
    State(state): State<Arc<Mutex<AppState>>>,
    Json(payload): Json<RoleUpdateRequest>,
) -> Result<impl IntoResponse, (StatusCode, Json<ApiResponse<String>>)> {
    let state = state.lock().await;

    let is_sudo = payload.admin_email == "admin@truetally.com";
    
    if !is_sudo {
        let admin_check = db::authenticate_user(&state.db_pool, &payload.admin_email, None).await;
        if let Ok(Some((role, _, _))) = admin_check {
            if role != "sudo_admin" {
                return Err((StatusCode::FORBIDDEN, Json(ApiResponse::err("Solo sudo_admin puede cambiar roles".to_string()))));
            }
        } else {
            return Err((StatusCode::UNAUTHORIZED, Json(ApiResponse::err("Usuario no autorizado".to_string()))));
        }
    }

    match db::update_user_role(&state.db_pool, &payload.target_email, &payload.new_role).await {
        Ok(_) => {
            let _ = db::log_audit(&state.db_pool, "role_updated", &format!("user: {} new_role: {}", payload.target_email, payload.new_role)).await;
            Ok((StatusCode::OK, Json(ApiResponse::ok("Rol actualizado".to_string()))))
        }
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, Json(ApiResponse::err(format!("Error: {}", e))))),
    }
}

pub async fn list_users(
    State(state): State<Arc<Mutex<AppState>>>,
    Json(payload): Json<ListUsersRequest>,
) -> Result<impl IntoResponse, (StatusCode, Json<ApiResponse<JsonVec>>)> {
    let state = state.lock().await;

    let is_sudo = payload.admin_email == "admin@truetally.com";
    
    if !is_sudo {
        let admin_check = db::authenticate_user(&state.db_pool, &payload.admin_email, None).await;
        if let Ok(Some((role, _, _))) = admin_check {
            if role != "sudo_admin" && role != "admin" {
                return Err((StatusCode::FORBIDDEN, Json(ApiResponse::err("No autorizado".to_string()))));
            }
        } else {
            return Err((StatusCode::UNAUTHORIZED, Json(ApiResponse::err("Usuario no autorizado".to_string()))));
        }
    }

    match db::list_users(&state.db_pool).await {
        Ok(users) => {
            let result: Vec<serde_json::Value> = users
                .into_iter()
                .map(|(email, role)| {
                    serde_json::json!({
                        "email": email,
                        "role": role
                    })
                })
                .collect();
            Ok((StatusCode::OK, Json(ApiResponse::ok(result))))
        }
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, Json(ApiResponse::err(format!("Error: {}", e))))),
    }
}

pub async fn update_election(
    State(state): State<Arc<Mutex<AppState>>>,
    Json(payload): Json<UpdateElectionRequest>,
) -> Result<impl IntoResponse, (StatusCode, Json<ApiResponse<String>>)> {
    let state = state.lock().await;

    match db::get_election_creator(&state.db_pool, &payload.election_id).await {
        Ok(Some(created_by)) => {
            if created_by != payload.user_email {
                return Err((StatusCode::FORBIDDEN, Json(ApiResponse::err("Solo el creator puede modificar".to_string()))));
            }
        }
        Ok(None) => return Err((StatusCode::NOT_FOUND, Json(ApiResponse::err("Elección no encontrada".to_string())))),
        Err(e) => return Err((StatusCode::INTERNAL_SERVER_ERROR, Json(ApiResponse::err(format!("Error: {}", e))))),
    }

    match db::update_election(&state.db_pool, &payload.election_id, payload.name.as_deref(), payload.description.as_deref(), Some(&payload.visibility), Some(&payload.status), payload.password.as_deref()).await {
        Ok(_) => {
            let _ = db::log_audit(&state.db_pool, "election_updated", &format!("election: {}", payload.election_id)).await;
            Ok((StatusCode::OK, Json(ApiResponse::ok("Elección actualizada".to_string()))))
        }
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, Json(ApiResponse::err(format!("Error: {}", e))))),
    }
}

pub async fn delete_election(
    State(state): State<Arc<Mutex<AppState>>>,
    Json(payload): Json<DeleteElectionRequest>,
) -> Result<impl IntoResponse, (StatusCode, Json<ApiResponse<String>>)> {
    let state = state.lock().await;

    match db::get_election_by_status(&state.db_pool, &payload.election_id).await {
        Ok(Some(status)) => {
            if status == "Terminado" {
                return Err((StatusCode::FORBIDDEN, Json(ApiResponse::err("No se puede eliminar una elección terminada".to_string()))));
            }
            if status == "Publicado" {
                return Err((StatusCode::FORBIDDEN, Json(ApiResponse::err("No se puede eliminar una elección publicada".to_string()))));
            }
            match db::hard_delete_election(&state.db_pool, &payload.election_id).await {
                Ok(_) => {
                    let _ = db::log_audit(&state.db_pool, "election_deleted", &format!("election: {} (hard delete)", payload.election_id)).await;
                    return Ok((StatusCode::OK, Json(ApiResponse::ok("Elección eliminada permanentemente".to_string()))));
                }
                Err(e) => return Err((StatusCode::INTERNAL_SERVER_ERROR, Json(ApiResponse::err(format!("Database error: {}", e))))),
            }
        }
        Ok(None) => return Err((StatusCode::NOT_FOUND, Json(ApiResponse::err("Elección no encontrada".to_string())))),
        Err(e) => return Err((StatusCode::INTERNAL_SERVER_ERROR, Json(ApiResponse::err(format!("Error: {}", e))))),
    }
}

pub async fn list_my_elections(
    State(state): State<Arc<Mutex<AppState>>>,
    Json(payload): Json<MyElectionsRequest>,
) -> Result<impl IntoResponse, (StatusCode, Json<ApiResponse<JsonVec>>)> {
    let state = state.lock().await;
    
    let search = payload.search.as_deref();
    match db::list_elections_by_creator(&state.db_pool, &payload.user_email, search).await {
        Ok(elections) => {
            let result: Vec<serde_json::Value> = elections
                .into_iter()
                .map(|(id, name, description, status, visibility, password)| {
                    serde_json::json!({
                        "id": id,
                        "name": name,
                        "description": description,
                        "status": status,
                        "visibility": visibility,
                        "password": password.unwrap_or_default()
                    })
                })
                .collect();
            Ok((StatusCode::OK, Json(ApiResponse::ok(result))))
        }
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, Json(ApiResponse::err(format!("Database error: {}", e))))),
    }
}

pub async fn list_all_elections(
    State(state): State<Arc<Mutex<AppState>> >,
) -> Result<impl IntoResponse, (StatusCode, Json<ApiResponse<JsonVec>>)> {
    let state = state.lock().await;
    
    match db::list_all_elections(&state.db_pool).await {
        Ok(elections) => {
            let result: Vec<serde_json::Value> = elections
                .into_iter()
                .map(|(id, name, description, status, visibility, password)| {
                    serde_json::json!({
                        "id": id,
                        "name": name,
                        "description": description,
                        "status": status,
                        "visibility": visibility,
                        "password": password.unwrap_or_default()
                    })
                })
                .collect();
            Ok((StatusCode::OK, Json(ApiResponse::ok(result))))
        }
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, Json(ApiResponse::err(format!("Database error: {}", e))))),
    }
}
