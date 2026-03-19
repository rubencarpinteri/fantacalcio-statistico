import { redirect } from 'next/navigation'

// Root route: redirect to dashboard (middleware handles unauthenticated users)
export default function RootPage() {
  redirect('/dashboard')
}
