'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Wifi, WifiOff, Loader2 } from 'lucide-react';

function ConnectionStatus() {
  const [status, setStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking');
  const [latency, setLatency] = useState<number | null>(null);

  useEffect(() => {
    const checkConnection = async () => {
      const start = Date.now();
      const result = await api.health();
      setLatency(Date.now() - start);
      setStatus(result.success ? 'connected' : 'disconnected');
    };

    checkConnection();
    const interval = setInterval(checkConnection, 10000);
    return () => clearInterval(interval);
  }, []);

  if (status === 'checking') {
    return <Loader2 className="w-4 h-4 animate-spin text-yellow-400" />;
  }

  if (status === 'connected') {
    return (
      <div className="flex items-center gap-1.5 text-green-400 text-xs">
        <Wifi className="w-3.5 h-3.5" />
        <span>{latency}ms</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 text-red-400 text-xs">
      <WifiOff className="w-3.5 h-3.5" />
      <span>Offline</span>
    </div>
  );
}

export default function Navbar() {
  const pathname = usePathname();

  const navItems = [
    { href: '/', label: 'Votar' },
    { href: '/blocks', label: 'Bloques' },
  ];

  return (
    <nav className="bg-primary-800 text-white shadow-lg">
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="text-xl font-bold flex items-center gap-3">
            TrueTally
            <ConnectionStatus />
          </Link>
          <div className="flex space-x-4">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  'px-3 py-2 rounded-md text-sm font-medium transition-colors',
                  pathname === item.href
                    ? 'bg-primary-900 text-white'
                    : 'text-primary-100 hover:bg-primary-700'
                )}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </nav>
  );
}