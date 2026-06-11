use crate::block::Block;
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::Mutex;

pub struct P2PNode {
    pub port: u16,
    peers: Arc<Mutex<Vec<String>>>,
    blockchain: Arc<Mutex<Vec<Block>>>,
}

impl P2PNode {
    pub fn new(port: u16, blockchain: Arc<Mutex<Vec<Block>>>) -> Self {
        P2PNode {
            port,
            peers: Arc::new(Mutex::new(Vec::new())),
            blockchain,
        }
    }

    pub async fn start(&self) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let addr = format!("0.0.0.0:{}", self.port);
        let listener = TcpListener::bind(&addr).await?;
        
        println!("P2P Node listening on {}", addr);
        
        loop {
            let (stream, addr) = listener.accept().await?;
            let peers = self.peers.clone();
            let blockchain = self.blockchain.clone();
            
            tokio::spawn(async move {
                if let Err(e) = Self::handle_connection(stream, addr, peers, blockchain).await {
                    eprintln!("Connection error: {}", e);
                }
            });
        }
    }

    async fn handle_connection(
        mut stream: TcpStream,
        addr: SocketAddr,
        peers: Arc<Mutex<Vec<String>>>,
        blockchain: Arc<Mutex<Vec<Block>>>,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        {
            let mut peers_guard = peers.lock().await;
            let peer_addr = addr.to_string();
            if !peers_guard.contains(&peer_addr) {
                peers_guard.push(peer_addr);
            }
        }
        
        let mut buffer = [0u8; 65536];
        let n = stream.read(&mut buffer).await?;
        
        if n > 0 {
            let message = String::from_utf8_lossy(&buffer[..n]);
            
            if let Ok(request) = serde_json::from_str::<P2PMessage>(&message) {
                match request.message_type.as_str() {
                    "get_blocks" => {
                        let chain = blockchain.lock().await;
                        let response = serde_json::to_string(&*chain)?;
                        stream.write_all(response.as_bytes()).await?;
                    }
                    "sync" => {
                        if let Ok(blocks) = serde_json::from_str::<Vec<Block>>(&request.data) {
                            let mut chain = blockchain.lock().await;
                            if blocks.len() > chain.len() {
                                *chain = blocks;
                            }
                        }
                    }
                    "broadcast_block" => {
                        if let Ok(block) = serde_json::from_str::<Block>(&request.data) {
                            let mut chain = blockchain.lock().await;
                            if !chain.iter().any(|b| b.hash == block.hash) {
                                chain.push(block);
                            }
                        }
                    }
                    _ => {}
                }
            }
        }
        
        Ok(())
    }

    pub async fn connect_to_peer(&self, peer_addr: &str) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let stream = TcpStream::connect(peer_addr).await?;
        let peers = self.peers.clone();
        let peer_addr_owned = peer_addr.to_string();
        
        tokio::spawn(async move {
            let _ = Self::handle_connection(stream, peer_addr_owned.parse().unwrap(), peers, Arc::new(Mutex::new(Vec::new()))).await;
        });
        
        Ok(())
    }

    pub async fn broadcast_block(&self, block: &Block) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let peers = self.peers.lock().await;
        let block_json = serde_json::to_string(block)?;
        
        let message = P2PMessage {
            message_type: "broadcast_block".to_string(),
            data: block_json,
        };
        
        let message_json = serde_json::to_string(&message)?;
        
        for peer in peers.iter() {
            if let Ok(mut stream) = TcpStream::connect(peer).await {
                let _ = stream.write_all(message_json.as_bytes()).await;
            }
        }
        
        Ok(())
    }

    pub async fn get_peer_count(&self) -> usize {
        self.peers.lock().await.len()
    }
}

#[derive(serde::Serialize, serde::Deserialize)]
struct P2PMessage {
    message_type: String,
    data: String,
}