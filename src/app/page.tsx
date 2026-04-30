'use client';

import { useState } from 'react';
import { SignedIn, SignedOut, SignInButton, UserButton } from '@clerk/nextjs';
import FileUploader from '@/components/FileUploader';

export default function Home() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-2xl mx-auto space-y-8">
        <div className="flex justify-end">
          <SignedIn>
            <UserButton afterSignOutUrl="/login" />
          </SignedIn>
        </div>

        <div>
          <h1 className="text-3xl font-bold text-center mb-2">Timesheet Processor</h1>
          <p className="text-gray-600 text-center">
            Upload your timesheet Excel file to process
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border-l-4 border-red-400 p-4">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <SignedOut>
          <div className="text-center space-y-4">
            <p className="text-gray-700">You must sign in to process timesheets.</p>
            <SignInButton mode="redirect" forceRedirectUrl="/">
              <button className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">
                Sign in
              </button>
            </SignInButton>
          </div>
        </SignedOut>

        <SignedIn>
          <FileUploader
            isProcessing={isProcessing}
            setIsProcessing={setIsProcessing}
            setError={setError}
          />

          {isProcessing && (
            <div className="text-center text-gray-600">Processing your file...</div>
          )}
        </SignedIn>
      </div>
    </main>
  );
}
