use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Vote {
    pub voter_public_key: String,
    pub candidate_id: String,
    pub election_id: String,
    pub signature: String,
    pub timestamp: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Block {
    pub index: u64,
    pub timestamp: DateTime<Utc>,
    pub data: Vote,
    pub previous_hash: String,
    pub nonce: u64,
    pub hash: String,
}

impl Block {
    pub fn new(index: u64, data: Vote, previous_hash: String) -> Self {
        let timestamp = Utc::now();
        let nonce = 0;
        let hash = Self::calculate_hash(index, timestamp, &data, &previous_hash, nonce);

        Block {
            index,
            timestamp,
            data,
            previous_hash,
            nonce,
            hash,
        }
    }

    pub fn calculate_hash(
        index: u64,
        timestamp: DateTime<Utc>,
        data: &Vote,
        previous_hash: &str,
        nonce: u64,
    ) -> String {
        let vote_string = format!(
            "{}{}{}{}{}",
            index,
            timestamp.to_rfc3339(),
            data.voter_public_key,
            data.candidate_id,
            previous_hash
        );

        let payload = format!("{}{}", vote_string, nonce);
        let mut hasher = Sha256::new();
        hasher.update(payload.as_bytes());
        hex::encode(hasher.finalize())
    }

    pub fn calculate_hash_with_nonce(
        index: u64,
        timestamp: DateTime<Utc>,
        data: &Vote,
        previous_hash: &str,
        nonce: u64,
    ) -> String {
        Self::calculate_hash(index, timestamp, data, previous_hash, nonce)
    }
}

pub fn create_genesis_block() -> Block {
    let genesis_vote = Vote {
        voter_public_key: "genesis".to_string(),
        candidate_id: "genesis".to_string(),
        election_id: "genesis".to_string(),
        signature: "genesis".to_string(),
        timestamp: Utc::now(),
    };

    Block::new(0, genesis_vote, "0".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_block_creation() {
        let vote = Vote {
            voter_public_key: "test_pk".to_string(),
            candidate_id: "candidate_1".to_string(),
            signature: "test_sig".to_string(),
            timestamp: Utc::now(),
        };

        let block = Block::new(1, vote, "previous_hash".to_string());

        assert_eq!(block.index, 1);
        assert_eq!(block.previous_hash, "previous_hash".to_string());
        assert!(!block.hash.is_empty());
    }

    #[test]
    fn test_genesis_block() {
        let block = create_genesis_block();

        assert_eq!(block.index, 0);
        assert_eq!(block.previous_hash, "0");
    }
}
