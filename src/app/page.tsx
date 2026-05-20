import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'

export default async function Page() {
  const session = await auth()
  redirect(session ? '/dashboard' : '/login')
}
