export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-dark flex items-center justify-center">
      {children}
    </div>
  );
}
