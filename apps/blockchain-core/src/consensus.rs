use crate::block::{Block, Vote};
use std::sync::Arc;
use tokio::sync::Mutex;

pub struct Consensus {
    pub difficulty: u32,
    pub mining_enabled: bool,
}

impl Consensus {
    pub fn new(difficulty: u32, mining_enabled: bool) -> Self {
        Consensus {
            difficulty,
            mining_enabled,
        }
    }

    pub fn mine_block(&self, block: &mut Block) -> bool {
        if !self.mining_enabled {
            return true;
        }

        let target = "0".repeat(self.difficulty as usize);

        loop {
            if block.hash.starts_with(&target) {
                return true;
            }
            block.nonce += 1;
            block.hash = Block::calculate_hash_with_nonce(
                block.index,
                block.timestamp,
                &block.data,
                &block.previous_hash,
                block.nonce,
            );

            if block.nonce > 1_000_000 {
                return false;
            }
        }
    }

    pub fn validate_proof(&self, block: &Block) -> bool {
        if !self.mining_enabled {
            return true;
        }

        let target = "0".repeat(self.difficulty as usize);
        block.hash.starts_with(&target)
    }
}

pub struct VoteValidator;

#[derive(Clone, serde::Serialize, serde::Deserialize)]
pub struct ElectionResults {
    pub election_id: String,
    pub candidate_id: String,
    pub vote_count: u32,
}

impl VoteValidator {
    pub fn has_voted(voted_keys: &[String], public_key: &str) -> bool {
        voted_keys.contains(&public_key.to_string())
    }

    pub fn validate_vote(vote: &Vote) -> Result<(), String> {
        if vote.voter_public_key.is_empty() {
            return Err("Public key is empty".to_string());
        }
        if vote.candidate_id.is_empty() {
            return Err("Candidate ID is empty".to_string());
        }
        if vote.election_id.is_empty() {
            return Err("Election ID is empty".to_string());
        }
        if vote.signature.is_empty() {
            return Err("Signature is empty".to_string());
        }
        Ok(())
    }

    pub fn count_votes(chain: &[Block]) -> std::collections::HashMap<String, u32> {
        let mut counts = std::collections::HashMap::new();

        for block in chain.iter().skip(1) {
            let key = format!("{}:{}", block.data.election_id, block.data.candidate_id);
            *counts.entry(key).or_insert(0) += 1;
        }

        counts
    }

    pub fn get_results_for_election(
        chain: &[Block],
        election_id: &str,
    ) -> std::collections::HashMap<String, u32> {
        let mut counts = std::collections::HashMap::new();

        for block in chain.iter().skip(1) {
            if block.data.election_id == election_id {
                let candidate_id = block.data.candidate_id.clone();
                *counts.entry(candidate_id).or_insert(0) += 1;
            }
        }

        counts
    }
}

pub type SharedBlockchain = Arc<Mutex<Vec<Block>>>;
pub type SharedVotedKeys = Arc<Mutex<std::collections::HashSet<String>>>;
pub type SharedConsensus = Arc<Mutex<Consensus>>;

pub fn create_shared_blockchain() -> SharedBlockchain {
    Arc::new(Mutex::new(Vec::new()))
}

pub fn create_shared_voted_keys() -> SharedVotedKeys {
    Arc::new(Mutex::new(std::collections::HashSet::new()))
}

pub fn create_shared_consensus(difficulty: u32, mining_enabled: bool) -> SharedConsensus {
    Arc::new(Mutex::new(Consensus::new(difficulty, mining_enabled)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;

    #[test]
    fn test_consensus_creation() {
        let consensus = Consensus::new(2, true);
        assert_eq!(consensus.difficulty, 2);
        assert!(consensus.mining_enabled);
    }

    #[test]
    fn test_vote_validation() {
        let vote = Vote {
            voter_public_key: "test_pk".to_string(),
            candidate_id: "candidate_1".to_string(),
            signature: "signature".to_string(),
            timestamp: Utc::now(),
        };

        assert!(VoteValidator::validate_vote(&vote).is_ok());
    }

    #[test]
    fn test_vote_validation_empty_pk() {
        let vote = Vote {
            voter_public_key: "".to_string(),
            candidate_id: "candidate_1".to_string(),
            signature: "signature".to_string(),
            timestamp: Utc::now(),
        };

        assert!(VoteValidator::validate_vote(&vote).is_err());
    }

    #[test]
    fn test_double_vote_check() {
        let voted_keys = vec!["pk1".to_string(), "pk2".to_string()];

        assert!(VoteValidator::has_voted(&voted_keys, "pk1"));
        assert!(!VoteValidator::has_voted(&voted_keys, "pk3"));
    }
}
