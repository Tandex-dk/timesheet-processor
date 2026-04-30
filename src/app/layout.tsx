import type { Metadata } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import './globals.css';

export const metadata: Metadata = {
  title: 'Timesheet Processor',
  description: 'Process and adjust working hours from Excel timesheets',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gray-100 text-slate-900">
        <ClerkProvider>{children}</ClerkProvider>
      </body>
    </html>
  );
}
