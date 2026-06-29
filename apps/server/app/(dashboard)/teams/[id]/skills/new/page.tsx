import { NewSkillForm } from './new-skill-form';

export const dynamic = 'force-dynamic';

export default async function NewSkillPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <NewSkillForm teamId={id} />;
}
