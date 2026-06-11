'use client';

import { useState, useEffect } from 'react';
import Head from 'next/head';
import { usePathname } from 'next/navigation';
import { api, Block } from '@/lib/api';

export default function BlocksPage() {
  const pathname = usePathname();
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Construir URLs dinámicas para SEO
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  const canonicalUrl = `${baseUrl}${pathname}`;
  const ogImageUrl = `${baseUrl}/og-image.jpg`;

  useEffect(() => {
    const fetchBlocks = async () => {
      const result = await api.getBlocks();
      if (result.success && result.data) {
        setBlocks(result.data);
      } else {
        setError(result.error || 'Failed to fetch blocks');
      }
      setLoading(false);
    };

    fetchBlocks();
    const interval = setInterval(fetchBlocks, 5000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-xl text-gray-600">Cargando bloques...</div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Bloques Blockchain - TrueTally</title>
        <meta name="description" content="Explora todos los bloques de la cadena de bloques de TrueTally. Cada bloque contiene votos verificados y transacciones inmutables del sistema de votación." />
        <meta name="keywords" content="bloques blockchain, cadena de bloques, votación blockchain, explorador bloques, TrueTally" />

        <meta property="og:title" content="Bloques Blockchain - TrueTally" />
        <meta property="og:description" content="Explora todos los bloques de la cadena de bloques de TrueTally." />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:type" content="website" />

        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content="Bloques Blockchain - TrueTally" />
        <meta name="twitter:description" content="Explora todos los bloques de la cadena de bloques de TrueTally." />

        <link rel="canonical" href={canonicalUrl} />
      </Head>
      <div className="min-h-screen bg-gray-50">
        <header className="bg-primary-700 text-white p-4 shadow-lg">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-2xl font-bold">TrueTally - Explorador de Bloques</h1>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-6">
        <div className="mb-4 flex justify-between items-center">
          <h2 className="text-xl font-semibold">Cadena de Bloques</h2>
          <div className="text-sm text-gray-600">
            Total de bloques: {blocks.length}
          </div>
        </div>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        <div className="space-y-4">
          {blocks.map((block, index) => (
            <div
              key={block.index}
              className="bg-white rounded-lg shadow-md p-4 border-l-4 border-primary-500"
            >
              <div className="flex justify-between items-start mb-2">
                <div>
                  <span className="text-lg font-bold">Bloque #{block.index}</span>
                  {index === 0 && (
                    <span className="ml-2 text-xs bg-yellow-200 text-yellow-800 px-2 py-1 rounded">
                      Genesis
                    </span>
                  )}
                </div>
                <div className="text-sm text-gray-500">
                  {new Date(block.timestamp).toLocaleString('es-ES')}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-500">Hash:</p>
                  <p className="font-mono text-xs bg-gray-100 p-2 rounded break-all">
                    {block.hash}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500">Hash Anterior:</p>
                  <p className="font-mono text-xs bg-gray-100 p-2 rounded break-all">
                    {block.previous_hash}
                  </p>
                </div>
              </div>

              {index > 0 && (
                <div className="mt-4 pt-4 border-t">
                  <h4 className="text-sm font-semibold mb-2">Datos del Voto:</h4>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-2 text-sm">
                    <div>
                      <span className="text-gray-500">Votante:</span>
                      <p className="font-mono text-xs">{block.data.voter_public_key?.slice(0, 20) || 'N/A'}...</p>
                    </div>
                    <div>
                      <span className="text-gray-500">ID Candidato:</span>
                      <p className="font-medium">{block.data.candidate_id || 'N/A'}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">ID Partido:</span>
                      <p className="font-medium">{block.data.party_id || 'N/A'}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">ID Evento:</span>
                      <p className="font-medium">{block.data.election_id || 'N/A'}</p>
                    </div>
                  </div>
                  {block.data.candidate_id === 'blank' && (
                    <div className="mt-2 p-2 bg-gray-100 rounded text-sm">
                      <span className="text-gray-500">Tipo de voto:</span>
                      <span className="ml-2 font-medium">Voto en blanco</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {blocks.length === 0 && !error && (
          <div className="text-center text-gray-500 py-12">
            No hay bloques en la cadena
          </div>
        )}
      </main>
    </div>
    </>
  );
}