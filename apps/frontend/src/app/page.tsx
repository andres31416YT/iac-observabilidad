'use client';

import { useState, useEffect } from 'react';
import Head from 'next/head';
import { usePathname, useRouter } from 'next/navigation';
import { Eye, EyeOff } from 'lucide-react';
import { generateKeyPair, signMessage, createVotePayload } from '@/lib/crypto';
import { api, Election, NewElection, Candidate, AuthResponse } from '@/lib/api';

interface KeyPair {
  publicKey: string;
  secretKey: string;
}

type Step = 'home' | 'auth' | 'vote' | 'admin' | 'cast' | 'confirm' | 'results';

interface UserSession {
  email: string;

  role: string;
  public_key: string | undefined;
  has_password: boolean;
  has_voted_election: string | undefined;
}

function ResultsView({ election, onBack }: { election: Election; onBack: () => void }) {
  const [results, setResults] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [candidates, setCandidates] = useState<Candidate[]>([]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, [election.id]);

  const loadData = async () => {
    const [resultsRes, candidatesRes] = await Promise.all([
      api.getResults(election.id),
      api.getCandidates(election.id),
    ]);

    if (resultsRes.success && resultsRes.data) {
      const resultsData = (resultsRes.data as any).results || resultsRes.data;
      setResults(resultsData);
    }
    if (candidatesRes.success && candidatesRes.data) {
      setCandidates(candidatesRes.data);
    }
    setLoading(false);
  };

  const blankVotes = results['blank'] || 0;
  const totalVotes = Object.values(results).reduce((a, b) => a + b, 0) - blankVotes;

  const chartData = Object.entries(results)
    .filter(([key]) => key !== 'blank')
    .map(([key, votes]) => {
      const candidate = candidates.find(c => c.code === key);
      return {
        code: candidate?.code || key,
        name: candidate?.name || key,
        votes,
        percentage: totalVotes > 0 ? (votes / totalVotes) * 100 : 0,
      };
    })
    .sort((a, b) => b.votes - a.votes);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-xl text-gray-600">Cargando resultados...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={onBack} className="text-gray-600 hover:underline flex items-center gap-2">
          ← Volver
        </button>
        <h2 className="text-2xl font-bold">{election.name}</h2>
        <span className={`text-xs px-2 py-1 rounded ${election.status === 'Terminado' ? 'bg-gray-100 text-gray-600' : 'bg-blue-100 text-blue-700'}`}>
          {election.status}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-lg shadow p-4 text-center">
          <p className="text-sm text-gray-500">Total de Votos</p>
          <p className="text-3xl font-bold text-blue-600">{totalVotes + blankVotes}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4 text-center">
          <p className="text-sm text-gray-500">Votos en Blanco</p>
          <p className="text-3xl font-bold text-gray-600">{blankVotes}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4 text-center">
          <p className="text-sm text-gray-500">Candidatos</p>
          <p className="text-3xl font-bold text-green-600">{candidates.length}</p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-lg font-semibold mb-4">Resultados por Candidato</h3>
        {candidates.length === 0 && blankVotes === 0 ? (
          <p className="text-gray-500 text-center py-8">No hay candidatos agregados</p>
        ) : (
          <div className="space-y-4">
            {candidates.map((candidate) => {
              const candVotes = results[candidate.code] || 0;
              const pct = (totalVotes + blankVotes) > 0 ? (candVotes / (totalVotes + blankVotes)) * 100 : 0;
              return (
                <div key={candidate.id} className="space-y-2">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-lg">{candidate.name}</span>
                      <span className="text-xs text-gray-400">{candidate.code}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-xl font-bold text-blue-600">{candVotes}</span>
                      <span className="text-sm text-gray-500 ml-2">({pct.toFixed(1)}%)</span>
                    </div>
                  </div>
                  <div className="h-6 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
            <div key="blank" className="space-y-2 pt-2 border-t">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-lg">Voto en Blanco</span>
                </div>
                <div className="text-right">
                  <span className="text-xl font-bold text-gray-600">{blankVotes}</span>
                  <span className="text-sm text-gray-500 ml-2">{totalVotes + blankVotes > 0 ? ((blankVotes / (totalVotes + blankVotes)) * 100).toFixed(1) : 0}%</span>
                </div>
              </div>
              <div className="h-6 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-gray-400 to-gray-500 rounded-full transition-all duration-500"
                  style={{ width: `${totalVotes + blankVotes > 0 ? (blankVotes / (totalVotes + blankVotes)) * 100 : 0}%` }}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function VotingPage() {
  const pathname = usePathname();
  const router = useRouter();
  const isAuthRoute = pathname === '/login' || pathname === '/register';
  const [step, setStep] = useState<Step>(isAuthRoute ? 'auth' : 'home');
  const [session, setSession] = useState<UserSession | null>(null);
  const [keyPair, setKeyPair] = useState<KeyPair | null>(null);

  const [elections, setElections] = useState<Election[]>([]);
  const [selectedElection, setSelectedElection] = useState<Election | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<number | null>(null);
  const [blankVote, setBlankVote] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [authMode, setAuthMode] = useState<'login' | 'register'>(pathname === '/register' ? 'register' : 'login');
  const [authData, setAuthData] = useState({
    email: '',

    password: '',
    confirmPassword: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [newElection, setNewElection] = useState<NewElection>({
    name: '',
    description: '',
    visibility: 'public',
    status: 'Borrador',
  });

  const [selectedElectionForEdit, setSelectedElectionForEdit] = useState<Election | null>(null);
  const [selectedElectionForResults, setSelectedElectionForResults] = useState<Election | null>(null);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [pendingElection, setPendingElection] = useState<Election | null>(null);
  const [electionPassword, setElectionPassword] = useState('');
  const [showCandidateForm, setShowCandidateForm] = useState(false);
  const [selectedElectionForCandidates, setSelectedElectionForCandidates] = useState<Election | null>(null);
  const [electionResults, setElectionResults] = useState<Record<string, number>>({});
  const [loadingResults, setLoadingResults] = useState(false);

  const [users, setUsers] = useState<{ email: string, role: string }[]>([]);
  const [activeTab, setActiveTab] = useState<'elections' | 'my_elections' | 'users' | 'results'>('elections');
  const [myElections, setMyElections] = useState<Election[]>([]);
  const [editElectionData, setEditElectionData] = useState<{
    name: string;
    description: string;
    visibility: 'public' | 'private';
    status: 'Borrador' | 'Publicado' | 'Terminado' | 'Eliminado';
    password: string;
  } | null>(null);

  const [roleData, setRoleData] = useState({
    target_email: '',
    new_role: 'user',
  });

  const [candidateFormData, setCandidateFormData] = useState({
    code: '',
    name: '',
  });
  const [candidateError, setCandidateError] = useState<string | null>(null);
  const [candidateLoading, setCandidateLoading] = useState(false);
  const [editingCandidate, setEditingCandidate] = useState<{ id: number, name: string } | null>(null);
  const [editPasswordVisible, setEditPasswordVisible] = useState(false);
  const [electionCandidates, setElectionCandidates] = useState<Candidate[]>([]);

  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  useEffect(() => {
    loadElections();
    const savedSession = localStorage.getItem('user_session');
    const savedSecretKey = localStorage.getItem('user_secret_key');
    if (savedSession) {
      try {
        const parsed = JSON.parse(savedSession);
        setSession(parsed);
        if (parsed.public_key) {
          if (savedSecretKey) {
            setKeyPair({ publicKey: parsed.public_key, secretKey: savedSecretKey });
          } else {
            const keys = generateKeyPair();
            localStorage.setItem('user_secret_key', keys.secretKey);
            setKeyPair({ publicKey: parsed.public_key, secretKey: keys.secretKey });
          }
        } else {
          const keys = generateKeyPair();
          localStorage.setItem('user_secret_key', keys.secretKey);
          setKeyPair({ publicKey: keys.publicKey, secretKey: keys.secretKey });
        }
      } catch (e) {
        localStorage.removeItem('user_session');
        localStorage.removeItem('user_secret_key');
      }
    }
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  // Navegar entre rutas cuando cambie el step o authMode
  useEffect(() => {
    if (step === 'auth') {
      if (authMode === 'register' && pathname !== '/register') {
        router.push('/register');
      } else if (authMode === 'login' && pathname !== '/login') {
        router.push('/login');
      }
    } else if (step === 'home' && pathname !== '/') {
      router.push('/');
    }
  }, [step, authMode, router, pathname]);

  const loadElections = async () => {
    const res = await api.listElections();
    if (res.success && res.data) {
      setElections(res.data);
    }
  };

  const filteredElections = elections.filter(e =>
    (e.status === 'Publicado' || e.status === 'Terminado') &&
    (searchTerm === '' ||
      e.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (e.description && e.description.toLowerCase().includes(searchTerm.toLowerCase())))
  );

  const paginatedElections = filteredElections.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const filteredUsers = users.filter(u =>
    searchTerm === '' ||
    u.email.includes(searchTerm) ||
    u.role.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const paginatedUsers = filteredUsers.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const loadCandidates = async (electionId: string) => {
    const res = await api.getCandidates(electionId);
    if (res.success && res.data) {
      setCandidates(res.data);
    }
  };

  const loadUsers = async () => {
    if (!session) return;
    const res = await api.listUsers(session.email, '');
    if (res.success && res.data) {
      setUsers(res.data);
    }
  };

  const loadMyElections = async () => {
    if (!session) return;
    const res = await api.listMyElections(session.email, searchTerm || undefined);
    if (res.success && res.data) {
      setMyElections(res.data);
    }
  };

  const loadResults = async (electionId: string) => {
    setLoadingResults(true);
    const res = await api.getResults(electionId);
    if (res.success && res.data) {
      setElectionResults(res.data);
    } else {
      setError(res.error || 'Error al cargar resultados');
    }
    setLoadingResults(false);
  };

  const loadElectionCandidates = async (electionId: string) => {
    const res = await api.getCandidates(electionId);
    if (res.success && res.data) {
      setElectionCandidates(res.data);
    }
  };

  const handleAddCandidate = async (electionId: string) => {
    if (!candidateFormData.name.trim()) {
      setCandidateError('El nombre es requerido');
      return;
    }
    setCandidateLoading(true);
    setCandidateError(null);

    const code = `CAND-${electionId.substring(0, 4).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;

    const res = await api.addCandidate({
      election_id: electionId,
      code: code,
      name: candidateFormData.name.trim(),
    });

    if (res.success) {
      setCandidateFormData({ code: '', name: '' });
      await loadElectionCandidates(electionId);
    } else {
      setCandidateError(res.error || 'Error al agregar candidato');
    }
    setCandidateLoading(false);
  };

  const handleDeleteCandidate = async (candidateId: number, electionId: string) => {
    if (!session || session.role !== 'sudo_admin') {
      setCandidateError('Solo sudo_admin puede eliminar candidatos');
      return;
    }

    if (!confirm('¿Estás seguro de eliminar este candidato?')) return;

    setCandidateLoading(true);
    setCandidateError(null);

    const res = await api.deleteCandidate({
      election_id: electionId,
      candidate_id: candidateId,
      admin_email: session.email,
    });

    if (res.success) {
      await loadElectionCandidates(electionId);
    } else {
      setCandidateError(res.error || 'Error al eliminar candidato');
    }
    setCandidateLoading(false);
  };

  const handleUpdateCandidate = async (candidateId: number) => {
    if (!session || !editingCandidate) return;
    if (!editingCandidate.name.trim()) {
      setCandidateError('El nombre es requerido');
      return;
    }
    setCandidateLoading(true);
    setCandidateError(null);

    const res = await api.updateCandidate(candidateId, editingCandidate.name.trim());

    if (res.success) {
      setEditingCandidate(null);
      await loadElectionCandidates(selectedElectionForCandidates!.id);
    } else {
      setCandidateError(res.error || 'Error al actualizar candidato');
    }
    setCandidateLoading(false);
  };

  const handleUpdateElection = async (electionId: string) => {
    if (!session || !editElectionData) return;

    const originalElection = myElections.find(e => e.id === electionId);
    const originalStatus = originalElection?.status || 'Borrador';

    if (editElectionData.status !== originalStatus) {
      const confirmMessage = `¿Seguro que quieres cambiar a "${editElectionData.status}"? Esta acción no tiene marcha atrás.`;
      if (!confirm(confirmMessage)) {
        return;
      }
    }

    setLoading(true);
    setError(null);

    const res = await api.updateElection({
      election_id: electionId,
      name: editElectionData.name || undefined,
      description: editElectionData.description || undefined,
      visibility: editElectionData.visibility,
      status: editElectionData.status,
      password: editElectionData.password || undefined,
      user_email: session.email,
    });

    if (res.success) {
      await loadMyElections();
      setShowCandidateForm(false);
      setSelectedElectionForCandidates(null);
      setEditElectionData(null);
    } else {
      setError(res.error || 'Error al actualizar elección');
    }
    setLoading(false);
  };

  const handleDeleteElection = async (electionId: string) => {
    if (!session) return;
    if (!confirm('¿Estás seguro de eliminar esta elección?')) return;

    setLoading(true);
    setError(null);

    const res = await api.deleteElection(electionId, session.email);
    if (res.success) {
      await loadElections();
      await loadMyElections();
    } else {
      setError(res.error || 'Error al eliminar elección');
    }
    setLoading(false);
  };

  const handleUpdateRole = async () => {
    if (!roleData.target_email) {
      setError('El email es requerido');
      return;
    }

    setLoading(true);
    setError(null);

    const res = await api.updateRole({
      target_email: roleData.target_email,
      new_role: roleData.new_role,
      admin_email: session!.email,
    });

    if (res.success) {
      await loadUsers();
      setRoleData({ target_email: '', new_role: 'user' });
    } else {
      setError(res.error || 'Error al actualizar rol');
    }
    setLoading(false);
  };

  useEffect(() => {
    if (step === 'admin' && isAdmin) {
      loadUsers();
      loadMyElections();
    }
  }, [step]);

  const handleAuth = async () => {
    if (!authData.email) {
      setError('El email es requerido');
      return;
    }
    if (authMode === 'register') {
      if (!authData.password || authData.password.length < 6) {
        setError('La contraseña debe tener al menos 6 caracteres');
        return;
      }
      if (authData.password !== authData.confirmPassword) {
        setError('Las contraseñas no coinciden');
        return;
      }
    }

    setLoading(true);
    setError(null);

    try {
      if (authMode === 'register') {
        const res = await api.register({
          email: authData.email,
          password: authData.password || undefined,
        });

        if (res.success) {
          setAuthMode('login');
          setAuthData({ ...authData, password: '', confirmPassword: '' });
          setShowPassword(false);
          setShowConfirmPassword(false);
          setError(null);
          alert('¡Registro exitoso! Ahora puedes iniciar sesión con tus credenciales.');
        } else {
          setError(res.error || 'No se pudo completar el registro. Inténtalo de nuevo.');
        }
      } else {
        const res = await api.authenticate({
          email: authData.email,
          password: authData.password || undefined,
        });

        if (res.success && res.data) {
          const authDataResponse = res.data;
          const newSession: UserSession = {
            email: authData.email,
            role: authDataResponse.role,
            public_key: authDataResponse.public_key,
            has_password: authDataResponse.has_password,
            has_voted_election: authDataResponse.has_voted_election,
          };
          setSession(newSession);
          localStorage.setItem('user_session', JSON.stringify(newSession));

          if (authDataResponse.public_key) {
            localStorage.setItem('user_secret_key', 'sk_session_active');
            setKeyPair({ publicKey: authDataResponse.public_key, secretKey: 'sk_session_active' });
          }

          setStep('home');
          setError(null);
        } else {
          setError(res.error || 'Correo o contraseña incorrectos. Por favor, verifica tus datos.');
        }
      }
    } catch (err: any) {
      if (authMode === 'login') {
        setError('Correo o contraseña incorrectos. Por favor, verifica tus datos.');
      } else {
        setError(err.message || 'Error en registro');
      }
    }
    setLoading(false);
  };

  const handleSelectElection = async (election: Election) => {
    if (election.visibility === 'private' && election.password) {
      setPendingElection(election);
      setShowPasswordModal(true);
      return;
    }
    setSelectedElection(election);
    await loadCandidates(election.id);
    setStep('vote');
  };

  const handleVerifyPassword = async () => {
    if (!pendingElection || !electionPassword) return;
    if (electionPassword === pendingElection.password) {
      setShowPasswordModal(false);
      setSelectedElection(pendingElection);
      await loadCandidates(pendingElection.id);
      setStep('vote');
      setElectionPassword('');
      setPendingElection(null);
    } else {
      setError('Contraseña incorrecta');
    }
  };

  const handleSubmitVote = async () => {
    if (!keyPair || !selectedElection) {
      if (!keyPair) {
        const keys = generateKeyPair();
        localStorage.setItem('user_secret_key', keys.secretKey);
        setKeyPair({ publicKey: keys.publicKey, secretKey: keys.secretKey });
        return;
      }
      return;
    }
    if (!blankVote && !selectedCandidate) {
      setError('Selecciona un candidato o marca voto en blanco');
      return;
    }

    setLoading(true);
    setError(null);

    const electionId = selectedElection.id;

    try {
      let candidateCode: string;
      if (blankVote) {
        candidateCode = "blank";
      } else {
        const candidate = candidates.find(c => c.id === selectedCandidate);
        candidateCode = candidate?.code || String(selectedCandidate ?? "");
      }

      const payload = createVotePayload(
        keyPair.publicKey,
        candidateCode,
        electionId
      );
      const signature = signMessage(payload, keyPair.secretKey);

      const res = await api.submitVote({
        voter_public_key: keyPair.publicKey,
        candidate_id: candidateCode,
        election_id: electionId,
        signature,
        is_blank_vote: blankVote,
      });

      if (res.success) {
        if (session) {
          session.has_voted_election = electionId;
          localStorage.setItem('user_session', JSON.stringify(session));
        }
        setStep('confirm');
      } else {
        setError(res.error || 'Error al enviar voto');
      }
    } catch (err: any) {
      setError(err.message || 'Error al firmar el voto');
    }
    setLoading(false);
  };

  const handleCreateElection = async () => {
    if (!newElection.name) {
      setError('El nombre es requerido');
      return;
    }
    setLoading(true);
    setError(null);

    const electionWithCreator = {
      ...newElection,
      created_by: session?.email,
    };

    const res = await api.createElection(electionWithCreator);
    if (res.success) {
      await loadElections();
      setStep('home');
    } else {
      setError(res.error || 'Error al crear elección');
    }
    setLoading(false);
  };

  const handleLogout = () => {
    localStorage.removeItem('user_session');
    localStorage.removeItem('user_secret_key');
    setSession(null);
    setKeyPair(null);
    setStep('home');
  };

  const isAdmin = session?.role === 'admin' || session?.role === 'sudo_admin';
  const canVote = session && session.public_key && (!session.has_voted_election || session.has_voted_election !== selectedElection?.id);

  const electionVoted = selectedElection ? session?.has_voted_election === selectedElection.id : false;

  // Construir URLs dinámicas para SEO
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  const canonicalUrl = `${baseUrl}${pathname}`;
  const ogImageUrl = `${baseUrl}/og-image.jpg`;

  // Meta tags dinámicos según el step actual
  const getMetaTags = () => {
    if (step === 'auth') {
      if (pathname === '/register') {
        return {
          title: 'Registrarse - TrueTally',
          description: 'Crea tu cuenta en TrueTally para votar de forma segura y participar en elecciones democráticas basadas en blockchain.',
          keywords: 'registro, crear cuenta, votación blockchain, democracia digital, TrueTally',
          ogTitle: 'Registrarse - TrueTally',
          ogDescription: 'Crea tu cuenta para votar de forma segura en TrueTally.',
          twitterTitle: 'Registrarse - TrueTally',
          twitterDescription: 'Crea tu cuenta para votar de forma segura en TrueTally.',
        };
      }
      return {
        title: 'Iniciar Sesión - TrueTally',
        description: 'Accede a tu cuenta en TrueTally para votar de forma segura y participar en elecciones democráticas basadas en blockchain.',
        keywords: 'login, iniciar sesión, autenticación, votación blockchain, TrueTally',
        ogTitle: 'Iniciar Sesión - TrueTally',
        ogDescription: 'Accede a tu cuenta para votar de forma segura en TrueTally.',
        twitterTitle: 'Iniciar Sesión - TrueTally',
        twitterDescription: 'Accede a tu cuenta para votar de forma segura en TrueTally.',
      };
    }
    return {
      title: 'TrueTally - Sistema de Votación Blockchain Seguro',
      description: 'Sistema de votación electrónica inmutable basado en blockchain. Vota de forma segura, transparente y verificable. Tecnología blockchain para elecciones democráticas.',
      keywords: 'votación blockchain, elecciones seguras, votación electrónica, democracia digital, TrueTally',
      ogTitle: 'TrueTally - Votación Blockchain Segura',
      ogDescription: 'Sistema de votación electrónica inmutable basado en blockchain. Tecnología blockchain para elecciones democráticas.',
      twitterTitle: 'TrueTally - Votación Blockchain Segura',
      twitterDescription: 'Sistema de votación electrónica inmutable basado en blockchain.',
    };
  };

  const meta = getMetaTags();

  return (
    <>
      <Head>
        <title>{meta.title}</title>
        <meta name="description" content={meta.description} />
        <meta name="keywords" content={meta.keywords} />
        <meta name="author" content="TrueTally Team" />
        <meta name="robots" content="index, follow" />

        {/* Open Graph */}
        <meta property="og:type" content="website" />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:title" content={meta.ogTitle} />
        <meta property="og:description" content={meta.ogDescription} />
        <meta property="og:image" content={ogImageUrl} />
        <meta property="og:site_name" content="TrueTally" />
        <meta property="og:locale" content="es_ES" />

        {/* Twitter */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={meta.twitterTitle} />
        <meta name="twitter:description" content={meta.twitterDescription} />
        <meta name="twitter:image" content={ogImageUrl} />

        <link rel="canonical" href={canonicalUrl} />
      </Head>
      <div className="min-h-screen bg-gray-50">
        <header className="bg-blue-800 text-white p-4 shadow-lg">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">TRUE TALLY</h1>
            <p className="text-sm">Sistema de Votación Blockchain</p>
          </div>
          {session ? (
            <div className="text-right">
              <p className="text-sm">Correo: {session.email}</p>
              <p className="text-xs">Rol: {session.role}</p>
              <button onClick={handleLogout} className="text-xs underline hover:text-gray-300">
                Cerrar sesión
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={() => router.push('/login')}
                className="bg-green-600 px-4 py-2 rounded-lg hover:bg-green-700 text-sm font-medium"
              >
                Iniciar Sesión
              </button>
              <button
                onClick={() => router.push('/register')}
                className="bg-white text-blue-800 px-4 py-2 rounded-lg hover:bg-gray-100 text-sm font-medium"
              >
                Registrarse
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-6">
        {step === 'home' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold">Votaciones</h2>
              {isAdmin && (
                <button
                  onClick={() => setStep('admin')}
                  className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700"
                >
                  Panel Admin
                </button>
              )}
            </div>

            {!session && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center mb-4">
                <p className="text-blue-700">
                  <button onClick={() => { setAuthMode('login'); setStep('auth'); }} className="underline font-medium">
                    Inicia sesión
                  </button> o
                  <button onClick={() => router.push('/register')} className="underline font-medium">
                    regístrate
                  </button> para poder votar
                </p>
              </div>
            )}

            {elections.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No hay votaciones activas</p>
            ) : (
              <div className="grid gap-4">
                {paginatedElections.map((election) => (
                  <div key={election.id} className="bg-white rounded-lg shadow-md p-4 border-l-4 border-blue-500">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-bold text-lg">{election.name}</h3>
                        <p className="text-gray-600 text-sm">{election.description}</p>
                        <div className="mt-2 flex gap-2">
                          <span className={`text-xs px-2 py-1 rounded ${election.status === 'Publicado' ? 'bg-blue-100 text-blue-700' :
                            election.status === 'Terminado' ? 'bg-gray-100 text-gray-600' :
                              'bg-yellow-100 text-yellow-700'
                            }`}>
                            {election.status === 'Publicado' ? 'Publicado' :
                              election.status === 'Terminado' ? 'Terminado' : 'Borrador'}
                          </span>
                          <span className={`text-xs px-2 py-1 rounded ${election.visibility === 'public' ? 'bg-green-100 text-green-700' :
                            'bg-orange-100 text-orange-700'
                            }`}>
                            {election.visibility === 'public' ? 'Público' : 'Privado'}
                          </span>
                          {election.is_official && (
                            <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">
                              Oficial
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {election.status === 'Terminado' ? (
                          <button
                            onClick={() => { setSelectedElectionForResults(election); setStep('results'); }}
                            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
                          >
                            Ver
                          </button>
                        ) : election.status === 'Publicado' ? (
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleSelectElection(election)}
                              className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700"
                            >
                              Votar
                            </button>
                            <button
                              onClick={() => { setSelectedElectionForResults(election); setStep('results'); }}
                              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
                            >
                              Ver
                            </button>
                          </div>
                        ) : election.status === 'Borrador' ? (
                          <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-1 rounded">Borrador</span>
                        ) : (
                          <span className="text-gray-400 text-sm">Espere...</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {step === 'auth' && (
          <div className="bg-white rounded-lg shadow-md p-6 max-w-md mx-auto">
            <h2 className="text-xl font-semibold mb-4 text-center">
              {authMode === 'login' ? 'Iniciar Sesión' : 'Registrarse'}
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Correo Electrónico</label>
                <input
                  type="email"
                  value={authData.email}
                  onChange={(e) => setAuthData({ ...authData, email: e.target.value })}
                  className="w-full p-2 border rounded"
                  placeholder="ejemplo@correo.com"
                />
              </div>

              {authMode === 'register' && (
                <div>
                  <label className="block text-sm font-medium mb-1">Crear Contraseña</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={authData.password}
                      onChange={(e) => setAuthData({ ...authData, password: e.target.value })}
                      className="w-full p-2 pr-10 border rounded"
                      placeholder="Mínimo 6 caracteres"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                    >
                      {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                    </button>
                  </div>
                  <div className="mt-4">
                    <label className="block text-sm font-medium mb-1">Confirmar Contraseña</label>
                    <div className="relative">
                      <input
                        type={showConfirmPassword ? 'text' : 'password'}
                        value={authData.confirmPassword}
                        onChange={(e) => setAuthData({ ...authData, confirmPassword: e.target.value })}
                        className="w-full p-2 pr-10 border rounded"
                        placeholder="Repite tu contraseña"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                      >
                        {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {authMode === 'login' && (
                <div>
                  <label className="block text-sm font-medium mb-1">Contraseña</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={authData.password}
                      onChange={(e) => setAuthData({ ...authData, password: e.target.value })}
                      className="w-full p-2 pr-10 border rounded"
                      placeholder="Tu contraseña"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                    >
                      {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                    </button>
                  </div>
                </div>
              )}

              {error && (
                <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
                  {error}
                </div>
              )}

              <button
                onClick={handleAuth}
                disabled={loading || !authData.email || (authMode === 'register' && (authData.password !== authData.confirmPassword || !authData.password))}
                className="w-full bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
              >
                {loading ? 'Procesando...' : authMode === 'login' ? 'Iniciar Sesión' : 'Registrarse'}
              </button>

              <div className="text-center text-sm text-gray-600">
                {authMode === 'login' ? (
                  <>
                    ¿No tienes cuenta?{' '}
                    <button onClick={() => router.push('/register')} className="underline text-blue-600">
                      Regístrate
                    </button>
                  </>
                ) : (
                  <>
                    ¿Ya tienes cuenta?{' '}
                    <button onClick={() => router.push('/login')} className="underline text-blue-600">
                      Inicia sesión
                    </button>
                  </>
                )}
              </div>

              <button
                onClick={() => setStep('home')}
                className="w-full text-gray-500 py-2 text-sm hover:text-gray-700"
              >
                ← Volver sin iniciar sesión
              </button>
            </div>
          </div>
        )}

        {step === 'vote' && selectedElection && (
          <div className="space-y-4">
            <button onClick={() => setStep('home')} className="text-gray-600 hover:underline">
              ← Volver a votaciones
            </button>

            <h2 className="text-xl font-semibold">{selectedElection.name}</h2>

            {electionVoted ? (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-center">
                <p className="text-yellow-700 font-medium">Ya has votado en esta elección</p>
              </div>
            ) : !session ? (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 text-center">
                <p className="text-blue-700 font-medium mb-4">Debes iniciar sesión para emitir tu voto</p>
                <button
                  onClick={() => setStep('auth')}
                  className="bg-blue-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-blue-700"
                >
                  Ir a Iniciar Sesión
                </button>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {candidates.map((candidate) => (
                    <div
                      key={candidate.id}
                      onClick={() => { setSelectedCandidate(candidate.id); setBlankVote(false); }}
                      className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${selectedCandidate === candidate.id
                        ? 'border-blue-500 bg-blue-50 shadow-lg'
                        : 'border-gray-200 hover:border-blue-300'
                        }`}
                    >
                      <div className="flex-1">
                        <h3 className="font-semibold text-lg">{candidate.name}</h3>
                        <p className="text-sm text-gray-500">Código: {candidate.code}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="p-4 border-2 border-gray-300 rounded-lg">
                  <label className="flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={blankVote}
                      onChange={() => { setBlankVote(!blankVote); setSelectedCandidate(null); }}
                      className="w-5 h-5 text-blue-600"
                    />
                    <span className="ml-2 font-medium">Voto en blanco</span>
                  </label>
                </div>

                {error && (
                  <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
                    {error}
                  </div>
                )}

                <button
                  onClick={handleSubmitVote}
                  disabled={loading || (!selectedCandidate && !blankVote)}
                  className="w-full bg-green-600 text-white px-6 py-4 rounded-lg text-lg font-semibold hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  {loading ? 'Enviando...' : (!selectedCandidate && !blankVote ? 'Selecciona un candidato o marca voto en blanco' : 'CONFIRMAR VOTO')}
                </button>
              </>
            )}
          </div>
        )}

        {step === 'admin' && isAdmin && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold">Panel de Administración</h2>
              <button onClick={() => setStep('home')} className="text-gray-600 hover:underline">
                ← Volver
              </button>
            </div>

            <div className="flex gap-2 border-b overflow-x-auto">
              <button
                onClick={() => { setActiveTab('elections'); setCurrentPage(1); setSearchTerm(''); }}
                className={`px-4 py-2 ${activeTab === 'elections' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-600'}`}
              >
                Crear Votación
              </button>
              <button
                onClick={() => { setActiveTab('my_elections'); setCurrentPage(1); setSearchTerm(''); }}
                className={`px-4 py-2 ${activeTab === 'my_elections' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-600'}`}
              >
                Mis Votaciones
              </button>
              {session?.role === 'sudo_admin' && (
                <button
                  onClick={() => { setActiveTab('users'); setCurrentPage(1); setSearchTerm(''); }}
                  className={`px-4 py-2 ${activeTab === 'users' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-600'}`}
                >
                  Gestión Usuarios
                </button>
              )}
            </div>

            {(activeTab === 'my_elections' || activeTab === 'users') && (
              <div className="mb-4">
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder={activeTab === 'my_elections' ? "Buscar mis votaciones..." : "Buscar usuarios..."}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { setCurrentPage(1); loadMyElections(); } }}
                    className="flex-1 p-2 border rounded"
                  />
                  <button
                    onClick={() => { setCurrentPage(1); if (activeTab === 'my_elections') { loadMyElections(); } }}
                    className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                  >
                    Buscar
                  </button>
                  <button
                    onClick={() => { setSearchTerm(''); setCurrentPage(1); if (activeTab === 'my_elections') { loadMyElections(); } }}
                    className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600"
                  >
                    Limpiar
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'elections' && (

              <div className="bg-white rounded-lg shadow-md p-6">

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Nombre</label>
                    <input
                      type="text"
                      value={newElection.name}
                      onChange={(e) => setNewElection({ ...newElection, name: e.target.value })}
                      className="w-full p-2 border rounded"
                      placeholder="Elecciones 2026"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">Descripción</label>
                    <textarea
                      value={newElection.description || ''}
                      onChange={(e) => setNewElection({ ...newElection, description: e.target.value })}
                      className="w-full p-2 border rounded"
                      placeholder="Descripción de la votación..."
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">Visibilidad</label>
                    <div className="w-full p-2 border rounded bg-gray-100 text-gray-600">
                      Público (por defecto)
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">Estado</label>
                    <div className="w-full p-2 border rounded bg-gray-100 text-gray-600">
                      Borrador (por defecto)
                    </div>
                  </div>

                  {newElection.visibility === 'private' && (
                    <div>
                      <label className="block text-sm font-medium mb-1">Contraseña del evento</label>
                      <input
                        type="password"
                        value={newElection.password || ''}
                        onChange={(e) => setNewElection({ ...newElection, password: e.target.value })}
                        className="w-full p-2 border rounded"
                        placeholder="Contraseña para acceder al evento"
                      />
                    </div>
                  )}

                  {error && (
                    <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
                      {error}
                    </div>
                  )}

                  <button
                    onClick={handleCreateElection}
                    disabled={loading}
                    className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
                  >
                    {loading ? 'Creando...' : 'Crear Votación'}
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'my_elections' && (
              <div className="space-y-4">
                {myElections.length === 0 ? (
                  <div className="bg-white rounded-lg shadow-md p-6 text-center text-gray-500">
                    No has creado ninguna votación todavía.
                  </div>
                ) : (
                  myElections.map((election) => (
                    <div key={election.id} className="bg-white rounded-lg shadow-md p-4 border-l-4 border-purple-500">
                      {selectedElectionForEdit?.id === election.id ? (
                        <div className="space-y-4">
                          <div>
                            <label className="block text-sm font-medium mb-1">Nombre</label>
                            <input
                              type="text"
                              value={editElectionData?.name || ''}
                              onChange={(e) => setEditElectionData({ ...editElectionData!, name: e.target.value })}
                              className="w-full p-2 border rounded"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium mb-1">Descripción</label>
                            <textarea
                              value={editElectionData?.description || ''}
                              onChange={(e) => setEditElectionData({ ...editElectionData!, description: e.target.value })}
                              className="w-full p-2 border rounded"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium mb-1">Visibilidad</label>
                            <select
                              value={editElectionData?.visibility || 'public'}
                              onChange={(e) => setEditElectionData({ ...editElectionData!, visibility: e.target.value as 'public' | 'private' })}
                              className="w-full p-2 border rounded"
                            >
                              <option value="public">Pública - Todos pueden ver</option>
                              <option value="private">Privada - Requiere contraseña</option>
                            </select>
                          </div>
                          {editElectionData?.visibility === 'private' && (
                            <div>
                              <label className="block text-sm font-medium mb-1">Contraseña</label>
                              <input
                                type="password"
                                value={editElectionData?.password || ''}
                                onChange={(e) => setEditElectionData({ ...editElectionData!, password: e.target.value })}
                                className="w-full p-2 border rounded"
                              />
                            </div>
                          )}
                          <div>
                            <label className="block text-sm font-medium mb-1">Estado</label>
                            <select
                              value={editElectionData?.status || 'Borrador'}
                              onChange={(e) => setEditElectionData({ ...editElectionData!, status: e.target.value as 'Borrador' | 'Publicado' | 'Terminado' | 'Eliminado' })}
                              className="w-full p-2 border rounded"
                              disabled={election.status === 'Publicado' || election.status === 'Terminado'}
                            >
                              <option value="Borrador">Borrador</option>
                              <option value="Publicado">Publicado</option>
                              <option value="Terminado">Terminado</option>
                            </select>
                          </div>
                          {election.status !== 'Publicado' && election.status !== 'Terminado' && (
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleUpdateElection(election.id)}
                                disabled={loading}
                                className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                              >
                                Guardar
                              </button>
                              <button
                                onClick={() => { setSelectedElectionForEdit(null); setEditElectionData(null); }}
                                className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600"
                              >
                                Cancelar
                              </button>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <h3 className="font-bold text-lg">{election.name}</h3>
                            <p className="text-gray-600 text-sm">{election.description}</p>
                            <div className="mt-2 flex gap-2 flex-wrap">
                              <span className={`text-xs px-2 py-1 rounded ${election.visibility === 'public' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                                {election.visibility === 'public' ? 'Público' : 'Privado'}
                              </span>
                              <span className={`text-xs px-2 py-1 rounded ${election.status === 'Publicado' ? 'bg-blue-100 text-blue-700' :
                                election.status === 'Terminado' ? 'bg-gray-100 text-gray-600' :
                                  'bg-yellow-100 text-yellow-700'
                                }`}>
                                {election.status === 'Publicado' ? 'Publicado' :
                                  election.status === 'Terminado' ? 'Terminado' : 'Borrador'}
                              </span>
                            </div>
                          </div>
                          <div className="flex gap-2 ml-4">
                            {election.status !== 'Terminado' && (
                              <button
                                onClick={() => {
                                  setSelectedElectionForCandidates(election);
                                  setEditElectionData({
                                    name: election.name || '',
                                    description: election.description || '',
                                    visibility: election.visibility || 'public',
                                    status: election.status || 'Borrador',
                                    password: election.password || '',
                                  });
                                  setShowCandidateForm(true);
                                  loadElectionCandidates(election.id);
                                }}
                                className="text-blue-600 hover:underline text-sm"
                              >
                                Modificar
                              </button>
                            )}
                            {election.status === 'Borrador' && (
                              <button
                                onClick={() => handleDeleteElection(election.id)}
                                disabled={loading}
                                className="text-red-600 hover:underline text-sm"
                              >
                                Eliminar
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}

            {activeTab === 'users' && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <h3 className="font-semibold mb-4">Gestionar Usuarios</h3>

                <div className="mb-6">
                  <h4 className="text-sm font-medium mb-2">Lista de Usuarios ({users.length})</h4>
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left">Correo</th>
                          <th className="px-4 py-2 text-left">Rol</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedUsers.map((user, i) => (
                          <tr key={i} className="border-t">
                            <td className="px-4 py-2">{user.email}</td>
                            <td className="px-4 py-2">
                              <span className={`px-2 py-1 rounded text-xs ${user.role === 'sudo_admin' ? 'bg-red-100 text-red-700' :
                                user.role === 'admin' ? 'bg-purple-100 text-purple-700' :
                                  'bg-gray-100 text-gray-700'
                                }`}>
                                {user.role}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {filteredUsers.length > ITEMS_PER_PAGE && (
                    <div className="flex justify-center gap-2 mt-4">
                      <button
                        onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                        disabled={currentPage === 1}
                        className="px-3 py-1 border rounded disabled:opacity-50"
                      >
                        Anterior
                      </button>
                      <span className="px-3 py-1">
                        Página {currentPage} de {Math.ceil(filteredUsers.length / ITEMS_PER_PAGE)}
                      </span>
                      <button
                        onClick={() => setCurrentPage(Math.min(Math.ceil(filteredUsers.length / ITEMS_PER_PAGE), currentPage + 1))}
                        disabled={currentPage >= Math.ceil(filteredUsers.length / ITEMS_PER_PAGE)}
                        className="px-3 py-1 border rounded disabled:opacity-50"
                      >
                        Siguiente
                      </button>
                    </div>
                  )}
                </div>

                {isAdmin && session?.role === 'sudo_admin' && (
                  <div className="border-t pt-4">
                    <h4 className="text-sm font-medium mb-2">Cambiar Rol de Usuario</h4>
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <label className="block text-xs mb-1">Correo Electrónico</label>
                        <input
                          type="email"
                          value={roleData.target_email}
                          onChange={(e) => setRoleData({ ...roleData, target_email: e.target.value })}
                          className="w-full p-2 border rounded"
                          placeholder="ejemplo@correo.com"
                        />
                      </div>
                      <div>
                        <label className="block text-xs mb-1">Nuevo Rol</label>
                        <select
                          value={roleData.new_role}
                          onChange={(e) => setRoleData({ ...roleData, new_role: e.target.value })}
                          className="w-full p-2 border rounded"
                        >
                          <option value="user">User</option>
                          <option value="admin">Admin</option>
                        </select>
                      </div>
                    </div>
                    <button
                      onClick={handleUpdateRole}
                      disabled={loading || !roleData.target_email}
                      className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
                    >
                      {loading ? 'Actualizando...' : 'Actualizar Rol'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {step === 'confirm' && (
          <div className="bg-white rounded-lg shadow-md p-6 text-center">
            <h2 className="text-2xl font-bold text-green-600 mb-4">✓ Voto Confirmado</h2>
            <p className="text-gray-600 mb-6">Tu voto ha sido registrado en la blockchain.</p>
            <button
              onClick={() => { setStep('home'); setBlankVote(false); setSelectedCandidate(null); }}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700"
            >
              Ver Votaciones
            </button>
          </div>
        )}

        {step === 'results' && selectedElectionForResults && (
          <ResultsView
            election={selectedElectionForResults}
            onBack={() => { setStep('home'); setSelectedElectionForResults(null); }}
          />
        )}

        {showCandidateForm && selectedElectionForCandidates && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-semibold">Modificar - {selectedElectionForCandidates.name}</h2>
                  <button
                    onClick={() => { setShowCandidateForm(false); setSelectedElectionForCandidates(null); }}
                    className="text-gray-500 hover:text-gray-700 text-2xl"
                  >
                    ×
                  </button>
                </div>

                <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                  <h3 className="font-medium mb-3">Configuración de la Votación</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Visibilidad</label>
                      <select
                        value={editElectionData?.visibility || 'public'}
                        onChange={(e) => setEditElectionData({ ...editElectionData!, visibility: e.target.value as 'public' | 'private' })}
                        disabled={selectedElectionForCandidates?.status === 'Publicado' || selectedElectionForCandidates?.status === 'Terminado'}
                        className="w-full p-2 border rounded disabled:bg-gray-200"
                      >
                        <option value="public">Pública - Todos pueden ver</option>
                        <option value="private">Privada - Requiere contraseña</option>
                      </select>
                    </div>
                    {editElectionData?.visibility === 'private' && (
                      <div>
                        <label className="block text-sm font-medium mb-1">Contraseña</label>
                        <div className="relative">
                          <input
                            type={editPasswordVisible ? 'text' : 'password'}
                            value={editElectionData?.password || ''}
                            onChange={(e) => setEditElectionData({ ...editElectionData!, password: e.target.value })}
                            className="w-full p-2 border rounded pr-10"
                            placeholder="Crear contraseña"
                          />
                          <button
                            type="button"
                            onClick={() => setEditPasswordVisible(!editPasswordVisible)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500"
                          >
                            {editPasswordVisible ? (
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0118 12c0 2.075-.63 4.05-1.125 5.725m-4.875-8.45a4 4 0 015.75 0M6 6h.008v.008H6V6z" />
                              </svg>
                            ) : (
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                              </svg>
                            )}
                          </button>
                        </div>
                      </div>
                    )}
                    <div>
                      <label className="block text-sm font-medium mb-1">Estado</label>
                      <select
                        value={editElectionData?.status || 'Borrador'}
                        onChange={(e) => setEditElectionData({ ...editElectionData!, status: e.target.value as 'Borrador' | 'Publicado' | 'Terminado' | 'Eliminado' })}
                        disabled={selectedElectionForCandidates?.status === 'Terminado'}
                        className="w-full p-2 border rounded disabled:bg-gray-200"
                      >
                        <option value="Borrador" disabled={selectedElectionForCandidates?.status !== 'Borrador'}>Borrador (no publicado)</option>
                        <option value="Publicado" disabled={selectedElectionForCandidates?.status === 'Terminado'}>Publicado</option>
                        <option value="Terminado">Terminado</option>
                      </select>
                    </div>
                  </div>
                  <div className="mt-4 flex justify-end">
                    <button
                      onClick={() => handleUpdateElection(selectedElectionForCandidates!.id)}
                      disabled={loading}
                      className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
                    >
                      {loading ? 'Guardando...' : 'Guardar Cambios'}
                    </button>
                  </div>
                </div>

                <div className="mb-6">
                  <h3 className="font-medium mb-3">Agregar Nuevo Candidato</h3>
                  <div className="mb-4">
                    <label className="block text-sm font-medium mb-1">Nombre del Candidato</label>
                    <input
                      type="text"
                      value={candidateFormData.name}
                      onChange={(e) => setCandidateFormData({ ...candidateFormData, name: e.target.value })}
                      className="w-full p-2 border rounded"
                      placeholder="Nombre completo"
                    />
                  </div>
                  {candidateError && (
                    <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-2 rounded mb-4">
                      {candidateError}
                    </div>
                  )}
                  <button
                    onClick={() => handleAddCandidate(selectedElectionForCandidates.id)}
                    disabled={candidateLoading || !candidateFormData.name.trim() || selectedElectionForCandidates.status === 'Publicado' || selectedElectionForCandidates.status === 'Terminado'}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
                  >
                    {candidateLoading ? 'Agregando...' : 'Agregar Candidato'}
                  </button>
                </div>

                <div>
                  <h3 className="font-medium mb-3">Candidatos Existentes ({electionCandidates.length})</h3>
                  {electionCandidates.length === 0 ? (
                    <p className="text-gray-500 text-center py-4">No hay candidatos aún</p>
                  ) : (
                    <div className="space-y-2">
                      {electionCandidates.map((candidate) => (
                        <div key={candidate.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          {editingCandidate?.id === candidate.id ? (
                            <div className="flex-1 flex gap-2">
                              <input
                                type="text"
                                value={editingCandidate.name}
                                onChange={(e) => setEditingCandidate({ ...editingCandidate, name: e.target.value })}
                                className="flex-1 p-2 border rounded"
                              />
                              <button
                                onClick={() => handleUpdateCandidate(candidate.id)}
                                disabled={candidateLoading}
                                className="bg-blue-600 text-white px-3 py-1 rounded"
                              >
                                Guardar
                              </button>
                              <button
                                onClick={() => setEditingCandidate(null)}
                                className="bg-gray-500 text-white px-3 py-1 rounded"
                              >
                                Cancelar
                              </button>
                            </div>
                          ) : (
                            <>
                              <div className="flex-1">
                                <p className="font-medium text-lg">{candidate.name}</p>
                                <p className="text-sm text-gray-500">Código: {candidate.code}</p>
                              </div>
                              {session?.role === 'sudo_admin' && selectedElectionForCandidates && selectedElectionForCandidates.status !== 'Publicado' && selectedElectionForCandidates.status !== 'Terminado' && (
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => setEditingCandidate({ id: candidate.id, name: candidate.name })}
                                    className="text-blue-600 hover:text-blue-800 p-2"
                                    title="Modificar candidato"
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2l8.828-8.828z" />
                                    </svg>
                                  </button>
                                  <button
                                    onClick={() => handleDeleteCandidate(candidate.id, selectedElectionForCandidates!.id)}
                                    disabled={candidateLoading}
                                    className="text-red-600 hover:text-red-800 p-2"
                                    title="Eliminar candidato"
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                  </button>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {showPasswordModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
              <h2 className="text-xl font-semibold mb-4">Elección Privada</h2>
              <p className="text-gray-600 mb-4">Ingresa la contraseña para acceder a esta votación:</p>
              <input
                type="password"
                value={electionPassword}
                onChange={(e) => setElectionPassword(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleVerifyPassword(); }}
                className="w-full p-2 border rounded mb-4"
                placeholder="Contraseña"
                autoFocus
              />
              {error && (
                <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-2 rounded mb-4">
                  {error}
                </div>
              )}
              <div className="flex gap-2">
                <button
                  onClick={handleVerifyPassword}
                  disabled={!electionPassword}
                  className="flex-1 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:bg-gray-400"
                >
                  Acceder
                </button>
                <button
                  onClick={() => { setShowPasswordModal(false); setPendingElection(null); setElectionPassword(''); setError(null); }}
                  className="flex-1 bg-gray-500 text-white px-4 py-2 rounded-lg hover:bg-gray-600"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
    </>
  );
}