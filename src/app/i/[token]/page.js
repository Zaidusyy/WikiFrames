import DeleteMyImage from '@/components/DeleteMyImage';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Delete my image',
  robots: { index: false, follow: false },
};

// RET-7: the participant's self-service deletion path. The token in the URL is
// the only credential — there is no account to log into, and deliberately
// nothing here that links the image back to a person.
export default async function DeleteImagePage({ params }) {
  const { token } = await params;
  return <DeleteMyImage token={token} />;
}
