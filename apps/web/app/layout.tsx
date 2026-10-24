import type { Metadata } from 'next';
import '../styles/globals.css';

export const metadata: Metadata = {
  title: 'Code Workbench',
  description:
    'Explore Apple binary formats with a reusable Rust analysis engine.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <a className="skip" href="#workbench">
          Skip to workbench
        </a>
        <div className="root">{children}</div>
      </body>
    </html>
  );
}
