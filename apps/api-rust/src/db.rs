use sqlx::{PgPool, Row};

pub async fn init_db(database_url: &str) -> Result<PgPool, sqlx::Error> {
    let pool = PgPool::connect(database_url).await?;
    
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS elections (
            id VARCHAR(50) PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            description TEXT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            is_active BOOLEAN DEFAULT TRUE,
            is_published BOOLEAN DEFAULT FALSE,
            visibility VARCHAR(20) DEFAULT 'public',
            election_type VARCHAR(50) DEFAULT 'general',
            election_category VARCHAR(50) DEFAULT 'general',
            password VARCHAR(255),
            is_official BOOLEAN DEFAULT FALSE,
            created_by VARCHAR(255),
            status VARCHAR(20) DEFAULT 'Borrador'
        )
        "#,
)
    .execute(&pool)
    .await?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS candidates (
            id BIGSERIAL PRIMARY KEY,
            election_id VARCHAR(50) NOT NULL REFERENCES elections(id),
            candidate_external_id VARCHAR(50),
            party_id VARCHAR(50),
            name VARCHAR(50) NOT NULL,
            party VARCHAR(50) NOT NULL,
            category VARCHAR(50) DEFAULT 'general',
            bio TEXT,
            photo_url TEXT,
            code VARCHAR(10)
        )
        "#,
    )
    .execute(&pool)
    .await?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS voters (
            id BIGSERIAL PRIMARY KEY,
            election_id VARCHAR(50) NOT NULL REFERENCES elections(id),
            email VARCHAR(255) NOT NULL,
            public_key VARCHAR(255) NOT NULL,
            password_hash VARCHAR(255),
            role VARCHAR(20) DEFAULT 'user',
            registered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            has_voted BOOLEAN DEFAULT FALSE,
            has_created_password BOOLEAN DEFAULT FALSE,
            UNIQUE(election_id, email),
            UNIQUE(election_id, public_key)
        )
        "#,
    )
    .execute(&pool)
    .await?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS users (
            id BIGSERIAL PRIMARY KEY,
            email VARCHAR(255) UNIQUE NOT NULL,
            public_key VARCHAR(255),
            password_hash VARCHAR(255),
            role VARCHAR(20) DEFAULT 'user',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
        "#,
    )
    .execute(&pool)
    .await?;

    seed_admins(&pool).await?;

    Ok(pool)
}

async fn seed_admins(pool: &PgPool) -> Result<(), sqlx::Error> {
    let sudo_email = std::env::var("SUDOADMIN_EMAIL").unwrap_or_else(|_| "sudoadmin@sudoadmin.com".to_string());
    let sudo_pass = std::env::var("SUDOADMIN_PASSWORD").unwrap_or_else(|_| "00000000".to_string());
    let admin_email = std::env::var("ADMIN_EMAIL").unwrap_or_else(|_| "admin@admin.com".to_string());
    let admin_pass = std::env::var("ADMIN_PASSWORD").unwrap_or_else(|_| "11111111".to_string());

    // Solo insertar si no existe ningún sudo_admin
    let sudo_exists = sqlx::query("SELECT 1 FROM users WHERE role = 'sudo_admin'")
        .fetch_optional(pool)
        .await?;

    if sudo_exists.is_none() {
        sqlx::query(
            r#"
            INSERT INTO users (email, password_hash, role) 
            VALUES ($1, $2, 'sudo_admin')
            ON CONFLICT (email) DO NOTHING
            "#,
        )
        .bind(&sudo_email)
        .bind(&sudo_pass)
        .execute(pool)
        .await?;
        tracing::info!(
            service = "api-gateway",
            event = "default_user_seeded",
            role = "sudo_admin",
            email = %sudo_email,
            "Sudo Admin seeded"
        );
    }

    // Solo insertar si no existe ningún admin
    let admin_exists = sqlx::query("SELECT 1 FROM users WHERE role = 'admin'")
        .fetch_optional(pool)
        .await?;

    if admin_exists.is_none() {
        sqlx::query(
            r#"
            INSERT INTO users (email, password_hash, role) 
            VALUES ($1, $2, 'admin')
            ON CONFLICT (email) DO NOTHING
            "#,
        )
        .bind(&admin_email)
        .bind(&admin_pass)
        .execute(pool)
        .await?;
        tracing::info!(
            service = "api-gateway",
            event = "default_user_seeded",
            role = "admin",
            email = %admin_email,
            "Admin seeded"
        );
    }

    Ok(())
}

pub async fn create_election(
    pool: &PgPool,
    id: &str,
    name: &str,
    description: Option<&str>,
    visibility: &str,
    status: &str,
    password: Option<&str>,
    created_by: Option<&str>,
) -> Result<(), sqlx::Error> {
    let is_official = matches!(created_by, Some("sudo_admin") | Some("admin"));
    
    sqlx::query(
        r#"
        INSERT INTO elections (id, name, description, visibility, status, password, is_official, created_by, is_active, is_published, election_type, election_category)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        "#,
    )
    .bind(id)
    .bind(name)
    .bind(description)
    .bind(visibility)
    .bind(status)
    .bind(password)
    .bind(is_official)
    .bind(created_by)
    .bind(true)
    .bind(false)
    .bind("general")
    .bind("general")
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn get_election(pool: &PgPool, id: &str) -> Result<Option<(String, String, Option<String>, bool)>, sqlx::Error> {
    let row = sqlx::query(
        r#"
        SELECT id, name, description, is_active FROM elections WHERE id = $1
        "#,
    )
    .bind(id)
    .fetch_optional(pool)
    .await?;

    Ok(row.map(|r| (
        r.get::<String, _>("id"),
        r.get::<String, _>("name"),
        r.get::<Option<String>, _>("description"),
        r.get::<bool, _>("is_active"),
    )))
}

pub async fn list_elections(pool: &PgPool) -> Result<Vec<(String, String, Option<String>, String, Option<String>, Option<String>)>, sqlx::Error> {
    let rows = sqlx::query(
        r#"
        SELECT id, name, description, status, visibility, password FROM elections WHERE is_active = TRUE AND status IN ('Borrador', 'Publicado', 'Terminado') ORDER BY created_at DESC
        "#,
    )
    .fetch_all(pool)
    .await?;

    Ok(rows.into_iter().map(|r| (
        r.get::<String, _>("id"),
        r.get::<String, _>("name"),
        r.get::<Option<String>, _>("description"),
        r.get::<String, _>("status"),
        r.get::<Option<String>, _>("visibility"),
        r.get::<Option<String>, _>("password"),
    )).collect())
}

pub async fn register_voter(
    pool: &PgPool,
    election_id: &str,
    email: &str,
    public_key: &str,
) -> Result<i64, sqlx::Error> {
    let row = sqlx::query(
        r#"
        INSERT INTO voters (election_id, email, public_key)
        VALUES ($1, $2, $3)
        RETURNING id
        "#,
    )
    .bind(election_id)
    .bind(email)
    .bind(public_key)
    .fetch_one(pool)
    .await?;

    Ok(row.get("id"))
}

pub async fn get_voter_by_public_key(
    pool: &PgPool,
    election_id: &str,
    public_key: &str,
) -> Result<Option<(String, bool)>, sqlx::Error> {
    let row = sqlx::query(
        r#"
        SELECT email, has_voted FROM voters WHERE election_id = $1 AND public_key = $2
        "#,
    )
    .bind(election_id)
    .bind(public_key)
    .fetch_optional(pool)
    .await?;

    Ok(row.map(|r| (r.get("email"), r.get("has_voted"))))
}

pub async fn check_voter_by_email(
    pool: &PgPool,
    election_id: &str,
    email: &str,
) -> Result<Option<(String, bool)>, sqlx::Error> {
    let row = sqlx::query(
        r#"
        SELECT email, has_voted FROM voters WHERE election_id = $1 AND email = $2
        "#,
    )
    .bind(election_id)
    .bind(email)
    .fetch_optional(pool)
    .await?;

    Ok(row.map(|r| (r.get("email"), r.get("has_voted"))))
}

pub async fn candidate_exists(
    pool: &PgPool,
    election_id: &str,
    name: &str,
) -> Result<bool, sqlx::Error> {
    let row = sqlx::query(
        r#"
        SELECT EXISTS(SELECT 1 FROM candidates WHERE election_id = $1 AND LOWER(name) = LOWER($2)) as exists
        "#,
    )
    .bind(election_id)
    .bind(name)
    .fetch_one(pool)
    .await?;

    Ok(row.get("exists"))
}

pub async fn mark_voter_voted(pool: &PgPool, election_id: &str, public_key: &str) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        UPDATE voters SET has_voted = TRUE WHERE election_id = $1 AND public_key = $2
        "#,
    )
    .bind(election_id)
    .bind(public_key)
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn list_candidates(pool: &PgPool, election_id: &str) -> Result<Vec<(i64, String, String)>, sqlx::Error> {
    let rows = sqlx::query(
        r#"
        SELECT id, code, name FROM candidates WHERE election_id = $1 ORDER BY id
        "#,
    )
    .bind(election_id)
    .fetch_all(pool)
    .await?;

    Ok(rows.into_iter().map(|r| (
        r.get::<i64, _>("id"),
        r.get::<String, _>("code"),
        r.get::<String, _>("name"),
    )).collect())
}

pub async fn add_candidate(
    pool: &PgPool,
    election_id: &str,
    code: &str,
    name: &str,
) -> Result<i64, sqlx::Error> {
    let row = sqlx::query(
        r#"
        INSERT INTO candidates (election_id, code, name, party)
        VALUES ($1, $2, $3, $4)
        RETURNING id
        "#,
    )
    .bind(election_id)
    .bind(code)
    .bind(name)
    .bind("Independiente")
    .fetch_one(pool)
    .await?;

    Ok(row.get("id"))
}

pub async fn update_candidate(pool: &PgPool, candidate_id: i64, name: &str) -> Result<(), sqlx::Error> {
    sqlx::query("UPDATE candidates SET name = $1 WHERE id = $2")
        .bind(name)
        .bind(candidate_id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn delete_candidate(pool: &PgPool, candidate_id: i64) -> Result<(), sqlx::Error> {
    sqlx::query("DELETE FROM candidates WHERE id = $1")
        .bind(candidate_id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn get_election_status(pool: &PgPool, election_id: &str) -> Result<Option<String>, sqlx::Error> {
    let row = sqlx::query("SELECT status FROM elections WHERE id = $1")
        .bind(election_id)
        .fetch_optional(pool)
        .await?;
    
    Ok(row.map(|r| r.get::<String, _>("status")))
}

pub async fn log_audit(pool: &PgPool, action: &str, details: &str) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        INSERT INTO audit_log (action, details) VALUES ($1, $2)
        "#,
    )
    .bind(action)
    .bind(details)
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn authenticate_user(
    pool: &PgPool,
    email: &str,
    password: Option<&str>,
) -> Result<Option<(String, Option<String>, bool)>, sqlx::Error> {
    let row = sqlx::query(
        r#"
        SELECT role, public_key, password_hash FROM users WHERE email = $1
        "#,
    )
    .bind(email)
    .fetch_optional(pool)
    .await?;

    match row {
        Some(r) => {
            let role: String = r.get("role");
            let public_key: Option<String> = r.get("public_key");
            let password_hash: Option<String> = r.get("password_hash");
            
            if let Some(pwd) = password {
                if password_hash.is_none() || password_hash.as_ref().map(|h| h == pwd).unwrap_or(false) {
                    Ok(Some((role, public_key, password_hash.is_some())))
                } else {
                    Ok(None)
                }
            } else {
                Ok(Some((role, public_key, password_hash.is_some())))
            }
        }
        None => Ok(None),
    }
}

pub async fn check_user_voted(pool: &PgPool, email: &str) -> Result<Option<String>, sqlx::Error> {
    let row = sqlx::query(
        r#"
        SELECT election_id FROM voters WHERE email = $1 AND has_voted = TRUE ORDER BY registered_at DESC LIMIT 1
        "#,
    )
    .bind(email)
    .fetch_optional(pool)
    .await?;

    Ok(row.map(|r| r.get("election_id")))
}

pub async fn create_user(
    pool: &PgPool,
    email: &str,
    public_key: Option<&str>,
    password: Option<&str>,
    role: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        INSERT INTO users (email, public_key, password_hash, role)
        VALUES ($1, $2, $3, $4)
        "#,
    )
    .bind(email)
    .bind(public_key)
    .bind(password)
    .bind(role)
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn update_user_role(
    pool: &PgPool,
    email: &str,
    new_role: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        UPDATE users SET role = $1 WHERE email = $2
        "#,
    )
    .bind(new_role)
    .bind(email)
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn list_users(
    pool: &PgPool,
) -> Result<Vec<(String, String)>, sqlx::Error> {
    let rows = sqlx::query(
        r#"
        SELECT email, role FROM users ORDER BY created_at DESC
        "#,
    )
    .fetch_all(pool)
    .await?;

    Ok(rows.into_iter().map(|r| (
        r.get::<String, _>("email"),
        r.get::<String, _>("role"),
    )).collect())
}

pub async fn get_election_creator(pool: &PgPool, election_id: &str) -> Result<Option<String>, sqlx::Error> {
    let row = sqlx::query(
        r#"
        SELECT created_by FROM elections WHERE id = $1
        "#,
    )
    .bind(election_id)
    .fetch_optional(pool)
    .await?;

    Ok(row.map(|r| r.get::<Option<String>, _>("created_by")).flatten())
}

pub async fn get_election_by_status(pool: &PgPool, election_id: &str) -> Result<Option<String>, sqlx::Error> {
    let row = sqlx::query(
        r#"
        SELECT status FROM elections WHERE id = $1
        "#,
    )
    .bind(election_id)
    .fetch_optional(pool)
    .await?;

    Ok(row.map(|r| r.get::<String, _>("status")))
}

pub async fn update_election(
    pool: &PgPool,
    election_id: &str,
    name: Option<&str>,
    description: Option<&str>,
    visibility: Option<&str>,
    status: Option<&str>,
    password: Option<&str>,
) -> Result<(), sqlx::Error> {
    let mut query = String::from("UPDATE elections SET ");
    let mut updates = Vec::new();
    let mut param_count = 1;

    if let Some(_n) = name {
        updates.push(format!("name = ${}", param_count));
        param_count += 1;
    }
    if let Some(_d) = description {
        updates.push(format!("description = ${}", param_count));
        param_count += 1;
    }
    if let Some(_v) = visibility {
        updates.push(format!("visibility = ${}", param_count));
        param_count += 1;
    }
    if let Some(_s) = status {
        updates.push(format!("status = ${}", param_count));
        param_count += 1;
    }
    if let Some(_pw) = password {
        updates.push(format!("password = ${}", param_count));
        param_count += 1;
    }

    if updates.is_empty() {
        return Ok(());
    }

    query.push_str(&updates.join(", "));
    query.push_str(&format!(" WHERE id = ${}", param_count));

    let mut builder = sqlx::query(&query);
    
    if let Some(n) = name {
        builder = builder.bind(n);
    }
    if let Some(d) = description {
        builder = builder.bind(d);
    }
    if let Some(v) = visibility {
        builder = builder.bind(v);
    }
    if let Some(s) = status {
        builder = builder.bind(s);
    }
    if let Some(pw) = password {
        builder = builder.bind(pw);
    }
    builder = builder.bind(election_id);

    builder.execute(pool).await?;
    Ok(())
}

pub async fn list_all_elections(pool: &PgPool) -> Result<Vec<(String, String, Option<String>, String, String, Option<String>)>, sqlx::Error> {
    let rows = sqlx::query(
        r#"
        SELECT id, name, description, status, visibility, password FROM elections WHERE status IN ('Borrador', 'Publicado', 'Terminado') ORDER BY created_at DESC
        "#,
    )
    .fetch_all(pool)
    .await?;

    Ok(rows.into_iter().map(|r| (
        r.get::<String, _>("id"),
        r.get::<String, _>("name"),
        r.get::<Option<String>, _>("description"),
        r.get::<String, _>("status"),
        r.get::<String, _>("visibility"),
        r.get::<Option<String>, _>("password"),
    )).collect())
}

pub async fn delete_election(pool: &PgPool, election_id: &str) -> Result<(), sqlx::Error> {
    sqlx::query("UPDATE elections SET is_active = FALSE, status = 'Eliminado' WHERE id = $1")
        .bind(election_id)
        .execute(pool)
        .await?;

    Ok(())
}

pub async fn hard_delete_election(pool: &PgPool, election_id: &str) -> Result<(), sqlx::Error> {
    sqlx::query("DELETE FROM candidates WHERE election_id = $1")
        .bind(election_id)
        .execute(pool)
        .await?;
    
    sqlx::query("DELETE FROM elections WHERE id = $1")
        .bind(election_id)
        .execute(pool)
        .await?;

    Ok(())
}

pub async fn list_elections_by_creator(pool: &PgPool, created_by: &str, search: Option<&str>) -> Result<Vec<(String, String, Option<String>, String, String, Option<String>)>, sqlx::Error> {
    let query = if search.map(|s| !s.is_empty()).unwrap_or(false) {
        sqlx::query(
            r#"
            SELECT id, name, description, status, visibility, password FROM elections 
            WHERE is_active = TRUE AND created_by = $1 AND (LOWER(name) LIKE LOWER($2) OR LOWER(description) LIKE LOWER($2))
            ORDER BY created_at DESC
            "#,
        )
    } else {
        sqlx::query(
            r#"
            SELECT id, name, description, status, visibility, password FROM elections WHERE is_active = TRUE AND created_by = $1 ORDER BY created_at DESC
            "#,
        )
    };
    
    let rows = if let Some(search) = search {
        let search_pattern = format!("%{}%", search);
        query.bind(created_by).bind(&search_pattern).fetch_all(pool).await?
    } else {
        query.bind(created_by).fetch_all(pool).await?
    };

    Ok(rows.into_iter().map(|r| (
        r.get::<String, _>("id"),
        r.get::<String, _>("name"),
        r.get::<Option<String>, _>("description"),
        r.get::<String, _>("status"),
        r.get::<String, _>("visibility"),
        r.get::<Option<String>, _>("password"),
    )).collect())
}
