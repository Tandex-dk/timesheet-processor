'use client';

import { useState, useCallback, useRef } from 'react';

interface FileUploaderProps {
  isProcessing: boolean;
  setIsProcessing: (value: boolean) => void;
  setError: (error: string | null) => void;
}

const FileUploader = ({ isProcessing, setIsProcessing, setError }: FileUploaderProps) => {
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const processFile = async (file: File) => {
    if (!file.name.endsWith('.xlsx')) {
      setError('Upload venligst en Excel-fil (.xlsx)');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    try {
      setIsProcessing(true);
      setError(null);
      
      const response = await fetch('/api/process', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error || 'Behandling af filen mislykkedes');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const contentDisposition = response.headers.get('Content-Disposition');
      const fileNameMatch = contentDisposition?.match(/filename="([^"]+)"/);
      a.download = fileNameMatch?.[1] || 'loenoversigt.xlsx';
      document.body.appendChild(a);
      a.click();
      
      // Cleanup
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Der opstod en fejl');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  return (
    <div
      className={`relative p-8 border-2 border-dashed rounded-lg text-center
        ${dragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300'}`}
      onDragEnter={handleDrag}
      onDragLeave={handleDrag}
      onDragOver={handleDrag}
      onDrop={handleDrop}
    >
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept=".xlsx"
        onChange={handleChange}
        id="file-upload"
      />
      <label
        htmlFor="file-upload"
        className="cursor-pointer inline-flex flex-col items-center"
      >
        <div className="mb-4">
          <svg
            className="w-12 h-12 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            />
          </svg>
        </div>
        <span className="text-gray-600">
          {isProcessing
            ? 'Behandler...'
            : 'Slip din Excel-fil her, eller klik for at uploade'}
        </span>
      </label>
    </div>
  );
};

export default FileUploader;
