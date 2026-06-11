import dynamic from 'next/dynamic'

// Importar el componente principal dinámicamente
const VotingPage = dynamic(() => import('../page'), {
  ssr: false
})

export default function LoginPage() {
  return <VotingPage />
}