import { CoachApp } from '@/components/coach-app';
export default async function Screen({
  params,
}: {
  params: Promise<{ path: string[] }>;
}) {
  const { path } = await params;
  return <CoachApp initialPath={'/' + path.join('/')} />;
}
