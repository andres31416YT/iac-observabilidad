use crate::block::{create_genesis_block, Block, Vote};
use crate::consensus::{Consensus, VoteValidator};
use chrono::Utc;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::Path;

pub struct Blockchain {
    pub chain: Vec<Block>,
    pub voted_keys: HashMap<String, HashSet<String>>, // election_id -> set of public_keys
    consensus: Consensus,
}

impl Blockchain {
    pub fn new(difficulty: u32, mining_enabled: bool) -> Self {
        let consensus = Consensus::new(difficulty, mining_enabled);
        let chain = vec![create_genesis_block()];

        Blockchain {
            chain,
            voted_keys: HashMap::new(),
            consensus,
        }
    }

    pub fn load_from_file<P: AsRef<Path>>(path: P, difficulty: u32, mining_enabled: bool) -> Self {
        if let Ok(content) = fs::read_to_string(path) {
            if let Ok(chain) = serde_json::from_str::<Vec<Block>>(&content) {
                if !chain.is_empty() {
                    let mut voted_keys: HashMap<String, HashSet<String>> = HashMap::new();
                    for block in chain.iter() {
                        if block.data.voter_public_key != "genesis" {
                            voted_keys
                                .entry(block.data.election_id.clone())
                                .or_insert_with(HashSet::new)
                                .insert(block.data.voter_public_key.clone());
                        }
                    }

                    return Blockchain {
                        chain,
                        voted_keys,
                        consensus: Consensus::new(difficulty, mining_enabled),
                    };
                }
            }
        }

        Self::new(difficulty, mining_enabled)
    }

    pub fn save_to_file<P: AsRef<Path>>(&self, path: P) -> Result<(), String> {
        let json = serde_json::to_string_pretty(&self.chain)
            .map_err(|e| format!("Serialization error: {}", e))?;

        fs::write(path, json).map_err(|e| format!("File write error: {}", e))
    }

    pub fn add_block(&mut self, vote: Vote) -> Result<Block, String> {
        VoteValidator::validate_vote(&vote)?;

        if let Some(keys) = self.voted_keys.get(&vote.election_id) {
            if keys.contains(&vote.voter_public_key) {
                return Err("Double vote detected".to_string());
            }
        }

        let previous_block = self.chain.last().ok_or("Chain is empty")?;

        let new_block = Block::new(
            self.chain.len() as u64,
            vote.clone(),
            previous_block.hash.clone(),
        );

        if self.consensus.mining_enabled {
            let mut block_to_mine = new_block;
            if !self.consensus.mine_block(&mut block_to_mine) {
                return Err("Mining failed".to_string());
            }

            if !self.consensus.validate_proof(&block_to_mine) {
                return Err("Invalid proof".to_string());
            }

            self.chain.push(block_to_mine);
        } else {
            self.chain.push(new_block);
        }

        self.voted_keys
            .entry(vote.election_id.clone())
            .or_insert_with(HashSet::new)
            .insert(vote.voter_public_key);

        Ok(self.chain.last().unwrap().clone())
    }

    pub fn validate_chain(&self) -> Result<bool, String> {
        if self.chain.is_empty() {
            return Err("Chain is empty".to_string());
        }

        for i in 1..self.chain.len() {
            let current_block = &self.chain[i];
            let previous_block = &self.chain[i - 1];

            if current_block.previous_hash != previous_block.hash {
                return Err(format!(
                    "Invalid chain at block {}: previous_hash mismatch",
                    current_block.index
                ));
            }

            let recalculated_hash = Block::calculate_hash_with_nonce(
                current_block.index,
                current_block.timestamp,
                &current_block.data,
                &current_block.previous_hash,
                current_block.nonce,
            );

            if current_block.hash != recalculated_hash {
                return Err(format!(
                    "Invalid chain at block {}: hash mismatch",
                    current_block.index
                ));
            }

            if self.consensus.mining_enabled {
                if !self.consensus.validate_proof(current_block) {
                    return Err(format!(
                        "Invalid proof of work at block {}",
                        current_block.index
                    ));
                }
            }
        }

        Ok(true)
    }

    pub fn get_results(&self) -> std::collections::HashMap<String, u32> {
        VoteValidator::count_votes(&self.chain)
    }

    pub fn get_results_for_election(
        &self,
        election_id: &str,
    ) -> std::collections::HashMap<String, u32> {
        VoteValidator::get_results_for_election(&self.chain, election_id)
    }

    pub fn get_block_count(&self) -> usize {
        self.chain.len()
    }

    pub fn get_latest_block(&self) -> Option<Block> {
        self.chain.last().cloned()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_blockchain_creation() {
        let blockchain = Blockchain::new(2, false);
        assert_eq!(blockchain.chain.len(), 1);
        assert!(blockchain.validate_chain().is_ok());
    }

    #[test]
    fn test_add_block() {
        let mut blockchain = Blockchain::new(2, false);

        let vote = Vote {
            voter_public_key: "test_pk".to_string(),
            candidate_id: "candidate_1".to_string(),
            signature: "test_sig".to_string(),
            timestamp: Utc::now(),
        };

        let result = blockchain.add_block(vote);
        assert!(result.is_ok());
        assert_eq!(blockchain.chain.len(), 2);
    }

    #[test]
    fn test_double_vote_prevention() {
        let mut blockchain = Blockchain::new(2, false);

        let vote = Vote {
            voter_public_key: "test_pk".to_string(),
            candidate_id: "candidate_1".to_string(),
            signature: "test_sig".to_string(),
            timestamp: Utc::now(),
        };

        let _ = blockchain.add_block(vote.clone());
        let result = blockchain.add_block(vote);

        assert!(result.is_err());
    }

    #[test]
    fn test_chain_validation() {
        let mut blockchain = Blockchain::new(2, false);

        let vote = Vote {
            voter_public_key: "test_pk".to_string(),
            candidate_id: "candidate_1".to_string(),
            signature: "test_sig".to_string(),
            timestamp: Utc::now(),
        };

        let _ = blockchain.add_block(vote);
        assert!(blockchain.validate_chain().is_ok());
    }
}
